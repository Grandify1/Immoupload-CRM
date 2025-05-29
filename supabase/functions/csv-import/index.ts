
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true'
};

interface CSVImportRequest {
  userId: string;
  teamId: string;
  csvData: string[][];
  mappings: any[];
  duplicateConfig: any;
  jobId: string;
  startRow?: number;
  batchSize?: number;
  isInitialRequest?: boolean;
  resumeFromError?: boolean;
  lastProcessedRow?: number;
}

const BATCH_SIZE = 500; // Process 500 leads at a time for better performance
const MAX_EXECUTION_TIME = 45000; // 45 seconds (safer margin before 60s timeout)

serve(async (req) => {
  console.log('🚀 CSV Import Edge Function - Request method:', req.method);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ CORS preflight request handled');
    return new Response('OK', {
      status: 200,
      headers: corsHeaders,
    });
  }

  const responseHeaders = {
    ...corsHeaders,
    'Content-Type': 'application/json',
  };

  const startTime = Date.now();

  try {
    console.log('🔧 Environment check:');
    console.log('SUPABASE_URL exists:', !!Deno.env.get('SUPABASE_URL'));
    console.log('SUPABASE_SERVICE_ROLE_KEY exists:', !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing environment variables');
      return new Response(
        JSON.stringify({ 
          error: 'Missing environment variables',
          supabase_url_exists: !!supabaseUrl,
          supabase_key_exists: !!supabaseKey
        }),
        { status: 500, headers: responseHeaders }
      );
    }

    // Initialize Supabase client
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client created');

    // Parse request body
    let body: CSVImportRequest;
    try {
      const rawBody = await req.text();
      console.log('📝 Raw body length:', rawBody.length);
      body = JSON.parse(rawBody);
      console.log('✅ JSON parsed successfully');
      console.log('📊 Body keys:', Object.keys(body));
    } catch (error) {
      console.error('❌ JSON parsing failed:', error);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid JSON',
          details: error.message
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Validate required fields
    if (!body.userId || !body.teamId || !body.jobId) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields',
          required: ['userId', 'teamId', 'jobId']
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    console.log(`🚀 Processing import for job: ${body.jobId}`);
    console.log(`📊 CSV Data: ${body.csvData?.length || 0} rows`);
    console.log(`🎯 Start row: ${body.startRow || 0}`);
    console.log(`📦 Batch size: ${body.batchSize || BATCH_SIZE}`);

    // Get existing job
    const { data: job, error: jobFetchError } = await supabaseAdmin
      .from('import_jobs')
      .select('*')
      .eq('id', body.jobId)
      .single();

    if (jobFetchError) {
      console.error('❌ Failed to fetch job:', jobFetchError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Job not found',
          details: jobFetchError.message
        }),
        { status: 404, headers: responseHeaders }
      );
    }

    console.log(`✅ Job found: ${job.status} (${job.processed_records}/${job.total_records})`);

    // Update job status to processing if not already
    if (job.status === 'pending') {
      await supabaseAdmin
        .from('import_jobs')
        .update({ status: 'processing' })
        .eq('id', body.jobId);
    }

    // Calculate batch parameters
    const startRow = body.startRow || job.processed_records || 0;
    const batchSize = body.batchSize || BATCH_SIZE;
    const endRow = Math.min(startRow + batchSize, body.csvData.length);
    const batchData = body.csvData.slice(startRow, endRow);

    console.log(`📦 Processing batch: rows ${startRow}-${endRow} (${batchData.length} leads)`);

    let processedCount = 0;
    let failedCount = 0;
    let newCount = 0;
    let updatedCount = 0;
    const errors: any[] = [];

    // Process leads in optimized batches
    const leadsToInsert: any[] = [];
    const leadsToUpdate: any[] = [];
    const duplicateChecks = new Map();

    // Pre-process all rows in the batch
    for (let i = 0; i < batchData.length; i++) {
      const rowIndex = startRow + i;
      const row = batchData[i];

      // Check execution time limit
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        console.log('⏰ Approaching time limit, saving progress and scheduling next batch');
        break;
      }

      try {
        // Convert CSV row to lead object
        const leadData = await convertRowToLead(row, body.mappings, body.teamId, body.userId, body.jobId);
        
        if (!leadData) {
          console.log(`⚠️ Skipping row ${rowIndex}: no valid lead data`);
          continue;
        }

        // Handle duplicates more efficiently
        const detectionField = body.duplicateConfig.duplicateDetectionField;
        const detectionValue = leadData[detectionField];

        if (body.duplicateConfig.duplicateDetectionField === 'none' || !detectionValue) {
          leadsToInsert.push(leadData);
          processedCount++;
        } else {
          // Use a map to avoid duplicate database queries
          const cacheKey = `${detectionField}:${detectionValue}`;
          
          if (!duplicateChecks.has(cacheKey)) {
            const { data: existingLeads } = await supabaseAdmin
              .from('leads')
              .select('id')
              .eq('team_id', body.teamId)
              .eq(detectionField, detectionValue)
              .limit(1);

            duplicateChecks.set(cacheKey, existingLeads && existingLeads.length > 0);
          }

          const isDuplicate = duplicateChecks.get(cacheKey);

          if (isDuplicate) {
            if (body.duplicateConfig.duplicateAction === 'skip') {
              console.log(`⏭️ Skipping duplicate: ${leadData.name}`);
              processedCount++;
              continue;
            } else if (body.duplicateConfig.duplicateAction === 'update') {
              leadsToUpdate.push(leadData);
              processedCount++;
            }
          } else {
            leadsToInsert.push(leadData);
            processedCount++;
          }
        }

      } catch (rowError) {
        console.error(`❌ Row processing failed for row ${rowIndex}:`, rowError);
        errors.push({ row: rowIndex, error: rowError.message, data: row });
        failedCount++;
      }
    }

    // Bulk insert new leads (much faster)
    if (leadsToInsert.length > 0) {
      console.log(`🚀 Bulk inserting ${leadsToInsert.length} new leads...`);
      const { error: bulkInsertError } = await supabaseAdmin
        .from('leads')
        .insert(leadsToInsert);

      if (bulkInsertError) {
        console.error(`❌ Bulk insert failed:`, bulkInsertError);
        failedCount += leadsToInsert.length;
        errors.push({ 
          row: 'bulk_insert', 
          error: bulkInsertError.message, 
          data: `${leadsToInsert.length} leads` 
        });
      } else {
        newCount += leadsToInsert.length;
        console.log(`✅ Successfully inserted ${leadsToInsert.length} new leads`);
      }
    }

    // Handle updates individually (still needed for precise targeting)
    for (const leadData of leadsToUpdate) {
      try {
        const { error: updateError } = await supabaseAdmin
          .from('leads')
          .update(leadData)
          .eq('team_id', body.teamId)
          .eq(body.duplicateConfig.duplicateDetectionField, leadData[body.duplicateConfig.duplicateDetectionField]);

        if (updateError) {
          console.error(`❌ Update failed:`, updateError);
          errors.push({ row: 'update', error: updateError.message, data: leadData });
          failedCount++;
        } else {
          updatedCount++;
        }
      } catch (updateRowError) {
        console.error(`❌ Update row processing failed:`, updateRowError);
        errors.push({ row: 'update', error: updateRowError.message, data: leadData });
        failedCount++;
      }
    }

    // Update job progress
    const totalProcessedSoFar = startRow + processedCount;
    const isCompleted = totalProcessedSoFar >= body.csvData.length;
    
    console.log(`📊 Batch completed: ${processedCount} processed, ${failedCount} failed`);
    console.log(`📈 Total progress: ${totalProcessedSoFar}/${body.csvData.length}`);

    const updateData: any = {
      processed_records: totalProcessedSoFar,
      failed_records: (job.failed_records || 0) + failedCount,
      updated_at: new Date().toISOString()
    };

    if (errors.length > 0) {
      updateData.error_details = {
        batch_errors: errors,
        last_batch: { startRow, endRow, processedCount, failedCount }
      };
    }

    if (isCompleted) {
      updateData.status = failedCount > 0 ? 'completed_with_errors' : 'completed';
      updateData.completed_at = new Date().toISOString();
      console.log('✅ Import completed!');
    } else {
      // Schedule next batch immediately for faster processing
      console.log('🔄 Scheduling next batch immediately...');
      
      // Fire and forget - don't wait for response to avoid timeout
      supabaseAdmin.functions.invoke('csv-import', {
        body: {
          ...body,
          startRow: totalProcessedSoFar,
          isInitialRequest: false
        }
      }).catch(error => {
        console.error('❌ Failed to schedule next batch:', error);
      });
    }

    await supabaseAdmin
      .from('import_jobs')
      .update(updateData)
      .eq('id', body.jobId);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Batch processed: ${processedCount} leads`,
        batch_results: {
          processed: processedCount,
          failed: failedCount,
          new: newCount,
          updated: updatedCount,
          total_processed: totalProcessedSoFar,
          total_records: body.csvData.length,
          is_completed: isCompleted,
          next_start_row: isCompleted ? null : totalProcessedSoFar
        },
        job_id: body.jobId
      }),
      { status: 200, headers: responseHeaders }
    );

  } catch (error) {
    console.error('❌ Critical error:', error);
    console.error('❌ Critical error stack:', error.stack);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Critical error',
        message: error.message,
        stack: error.stack
      }),
      { status: 500, headers: responseHeaders }
    );
  }
});


// Helper function to convert CSV row to lead object
async function convertRowToLead(row: string[], mappings: any[], teamId: string, userId: string, jobId: string): Promise<any | null> {
  const leadData: any = {
    team_id: teamId,
    status: 'potential',
    import_job_id: jobId
  };

  let hasRequiredData = false;

  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    if (!mapping.fieldName || mapping.fieldName === '__skip__') continue;

    const cellValue = row[i]?.trim();
    if (!cellValue) continue;

    // Standard fields
    if (['name', 'email', 'phone', 'website', 'address', 'description', 'status'].includes(mapping.fieldName)) {
      leadData[mapping.fieldName] = cellValue;
      if (mapping.fieldName === 'name') hasRequiredData = true;
    }
    // Custom fields
    else if (mapping.createCustomField) {
      if (!leadData.custom_fields) leadData.custom_fields = {};
      leadData.custom_fields[mapping.fieldName] = cellValue;
    }
    // Also handle fields that were mapped to existing custom fields
    else {
      // Check if this is a custom field by looking for it in available fields
      if (!leadData.custom_fields) leadData.custom_fields = {};
      leadData.custom_fields[mapping.fieldName] = cellValue;
    }
  }

  // Must have at least a name
  if (!hasRequiredData || !leadData.name) {
    return null;
  }

  return leadData;
}

// Helper function to handle duplicate detection
async function handleDuplicates(supabaseAdmin: any, leadData: any, duplicateConfig: any, teamId: string): Promise<'skip' | 'update' | 'insert'> {
  if (duplicateConfig.duplicateDetectionField === 'none') {
    return 'insert';
  }

  const detectionField = duplicateConfig.duplicateDetectionField;
  const detectionValue = leadData[detectionField];

  if (!detectionValue) {
    return 'insert';
  }

  // Check for existing lead
  const { data: existingLeads, error } = await supabaseAdmin
    .from('leads')
    .select('id')
    .eq('team_id', teamId)
    .eq(detectionField, detectionValue)
    .limit(1);

  if (error) {
    console.error('❌ Duplicate check failed:', error);
    return 'insert'; // Default to insert on error
  }

  if (existingLeads && existingLeads.length > 0) {
    return duplicateConfig.duplicateAction;
  }

  return 'insert';
}
