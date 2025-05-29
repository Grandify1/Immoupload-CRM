import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Dynamic CORS headers based on request origin
function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  console.log('🔍 CORS Debug - Request origin:', origin);
  
  const allowedOrigins = [
    'https://immoupload.com',
    'https://crm.immoupload.com',
    /^https:\/\/.*\.replit\.dev$/,
    /^https:\/\/.*\.pike\.replit\.dev$/,
    /^https:\/\/.*\.repl\.co$/,
    /^https:\/\/[a-f0-9-]+\.pike\.replit\.dev$/
  ];

  // TEMPORARY FIX: Allow all origins during development
  let allowOrigin = '*';

  if (origin) {
    console.log(`🔍 Request from origin: ${origin}`);
    // Always allow the requesting origin for now
    allowOrigin = origin;
    console.log('✅ Origin allowed (development mode):', origin);
  }

  const headers = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true'
  };

  console.log('🔧 CORS Headers generated:', headers);
  return headers;
}

interface MappingType {
  csvHeader: string;
  fieldName: string | null;
  createCustomField: boolean;
  customFieldType: 'text' | 'number' | 'date' | 'select';
}

interface DuplicateHandlingConfig {
  duplicateDetectionField: 'name' | 'email' | 'phone' | 'none';
  duplicateAction: 'skip' | 'update' | 'create_new';
}

interface ImportRequest {
  csvData: string[][];
  mappings: MappingType[];
  duplicateConfig: DuplicateHandlingConfig;
  teamId: string;
  userId: string;
  jobId: string;
  startRow?: number;
  isInitialRequest?: boolean;
  resumeFromError?: boolean;
  lastProcessedRow?: number;
}

const BATCH_SIZE = 25; // Optimiert für Stabilität
const MAX_ROWS_PER_FUNCTION_CALL = 20000; // Erhöht um alle Daten in einem Call zu verarbeiten

serve(async (req) => {
  console.log('🚀 CSV Import Edge Function - Request method:', req.method);
  console.log('🚀 CSV Import Edge Function - Request URL:', req.url);
  console.log('🚀 CSV Import Edge Function - Request headers:', Object.fromEntries(req.headers.entries()));
  
  const corsHeaders = getCorsHeaders(req);

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

  try {
    console.log('🚀 CSV Import Edge Function started');

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: responseHeaders }
      );
    }

    // Parse request body
    let body: ImportRequest;
    try {
      const rawBody = await req.text();
      console.log('📝 Raw request body length:', rawBody.length);
      console.log('📝 Raw request body preview:', rawBody.substring(0, 500));
      
      if (!rawBody || rawBody.trim() === '') {
        console.error('❌ Empty request body');
        return new Response(
          JSON.stringify({ 
            error: 'Empty request body',
            details: 'No data provided'
          }),
          { status: 400, headers: responseHeaders }
        );
      }
      
      body = JSON.parse(rawBody);
      console.log('✅ JSON parsed successfully');
      console.log('📊 Body keys:', Object.keys(body));
      console.log('📊 Body structure:', {
        csvData: Array.isArray(body.csvData) ? `Array with ${body.csvData?.length} rows` : typeof body.csvData,
        mappings: Array.isArray(body.mappings) ? `Array with ${body.mappings?.length} items` : typeof body.mappings,
        teamId: body.teamId,
        userId: body.userId,
        jobId: body.jobId
      });
    } catch (error) {
      console.error('❌ Invalid JSON in request body:', error);
      console.error('❌ JSON parsing error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      return new Response(
        JSON.stringify({ 
          error: 'Invalid JSON in request body',
          details: error.message,
          error_type: error.name
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    // DEBUGGING: If this is a test request, return early with success
    if (body.userId === 'test-user-id' && body.isInitialRequest === true) {
      console.log('🧪 TEST REQUEST DETECTED - Returning mock success response');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Test request successful',
          processedRecords: 0,
          newRecords: 0,
          updatedRecords: 0,
          failedRecords: 0,
          jobId: 'test-job-id',
          debug: {
            receivedBody: body,
            bodyKeys: Object.keys(body),
            functionWorking: true
          }
        }),
        { status: 200, headers: responseHeaders }
      );
    }

    const { csvData, mappings, duplicateConfig, teamId, userId, jobId, startRow = 0, isInitialRequest = true, resumeFromError = false, lastProcessedRow = 0 } = body;

    // Validate required fields
    if (!csvData || !mappings || !teamId || !userId) {
      console.error('❌ Missing required fields:', { 
        csvData: !!csvData, 
        mappings: !!mappings, 
        teamId: !!teamId, 
        userId: !!userId 
      });
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields', 
          required: ['csvData', 'mappings', 'teamId', 'userId'],
          received: {
            csvData: !!csvData,
            mappings: !!mappings, 
            teamId: !!teamId,
            userId: !!userId
          }
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Additional validation for array types
    if (!Array.isArray(csvData)) {
      console.error('❌ csvData is not an array:', typeof csvData);
      return new Response(
        JSON.stringify({ 
          error: 'csvData must be an array',
          received: typeof csvData
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    if (!Array.isArray(mappings)) {
      console.error('❌ mappings is not an array:', typeof mappings);
      return new Response(
        JSON.stringify({ 
          error: 'mappings must be an array',
          received: typeof mappings
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    console.log(`📦 Processing ${csvData.length} total rows, starting from row ${startRow} for team ${teamId}`);
    console.log(`🔄 Duplicate config: ${duplicateConfig.duplicateDetectionField} -> ${duplicateConfig.duplicateAction}`);
    console.log(`🔗 Function Call Details: isInitialRequest=${isInitialRequest}, jobId=${jobId}`);
    console.log(`📊 Batch Configuration: BATCH_SIZE=${BATCH_SIZE}, MAX_ROWS=${MAX_ROWS_PER_FUNCTION_CALL}`);

    // Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (!Deno.env.get('SUPABASE_URL') || !Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      console.error('❌ Missing Supabase environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: responseHeaders }
      );
    }

    // Standard field names that map directly to database columns
    const standardFields = ['name', 'email', 'phone', 'website', 'address', 'description', 'status', 'owner_id'];

    // Bestimme den Arbeitsbereich für diese Function Call
    const endRow = Math.min(startRow + MAX_ROWS_PER_FUNCTION_CALL, csvData.length);
    const currentBatchData = csvData.slice(startRow, endRow);
    const isLastBatch = endRow >= csvData.length;

    console.log(`📦 Processing rows ${startRow + 1}-${endRow} (${currentBatchData.length} rows) - Last batch: ${isLastBatch}`);

    let totalProcessed = 0;
    let totalNewRecords = 0;
    let totalUpdatedRecords = 0;
    let totalFailedRecords = 0;
    const allErrors: string[] = [];

    const startTime = Date.now();

    // Lade aktuelle Statistiken wenn dies eine Fortsetzung ist
    if (!isInitialRequest && jobId) {
      try {
        const { data: currentJob } = await supabaseAdmin
          .from('import_jobs')
          .select('processed_records, failed_records, error_details, status')
          .eq('id', jobId)
          .single();

        if (currentJob) {
          totalProcessed = currentJob.processed_records || 0;
          totalFailedRecords = currentJob.failed_records || 0;
          totalNewRecords = currentJob.error_details?.new_records || 0;
          totalUpdatedRecords = currentJob.error_details?.updated_records || 0;

          // Resume from error logic
          if (resumeFromError && currentJob.status === 'failed') {
            console.log(`🔄 RESUMING FAILED IMPORT from row ${lastProcessedRow || totalProcessed}`);

            // Update job status to processing again
            await supabaseAdmin
              .from('import_jobs')
              .update({
                status: 'processing',
                error_details: {
                  ...currentJob.error_details,
                  resume_attempt: (currentJob.error_details?.resume_attempt || 0) + 1,
                  resumed_at: new Date().toISOString(),
                  resume_from_row: lastProcessedRow || totalProcessed
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', jobId);
          }

          console.log(`📊 Continuing import: ${totalProcessed} already processed, ${totalFailedRecords} failed`);
        }
      } catch (error) {
        console.warn('⚠️ Could not load current job stats:', error);
      }
    }

    // Process data in batches
    const totalBatches = Math.ceil(currentBatchData.length / BATCH_SIZE);
    console.log(`📦 Processing ${currentBatchData.length} leads in ${totalBatches} batches of ${BATCH_SIZE}`);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, currentBatchData.length);
      const currentBatch = currentBatchData.slice(batchStart, batchEnd);

      console.log(`📦 Processing batch ${batchIndex + 1}/${totalBatches}: rows ${batchStart + 1}-${batchEnd}`);

      let batchProcessed = 0;
      let batchNewRecords = 0;
      let batchUpdatedRecords = 0;
      let batchFailedRecords = 0;
      const batchErrors: string[] = [];

      // Process rows sequentially for better memory management with large imports
      for (let i = 0; i < currentBatch.length; i++) {
        try {
          const row = currentBatch[i];
          const absoluteRowNumber = startRow + batchStart + i + 1;

          // Build lead object from mappings
          const leadData: any = {
            team_id: teamId,
            custom_fields: {}
          };

          // Process each mapping
          mappings.forEach((mapping, mappingIndex) => {
            if (mapping.fieldName && mappingIndex < row.length) {
              const value = row[mappingIndex]?.trim();
              if (!value) return; // Skip empty values

              if (standardFields.includes(mapping.fieldName)) {
                // Handle standard database fields
                if (mapping.fieldName === 'status') {
                  const validStatuses = ['potential', 'contacted', 'qualified', 'closed'];
                  if (validStatuses.includes(value.toLowerCase())) {
                    leadData[mapping.fieldName] = value.toLowerCase();
                  } else {
                    leadData[mapping.fieldName] = 'potential';
                  }
                } else {
                  leadData[mapping.fieldName] = value;
                }
              } else {
                // Handle custom fields
                leadData.custom_fields[mapping.fieldName] = value;
              }
            }
          });

          // Ensure required fields and set defaults
          if (!leadData.name || !leadData.name.trim()) {
            batchErrors.push(`Row ${absoluteRowNumber}: Missing required 'name' field`);
            batchFailedRecords++;
            return;
          }

          if (!leadData.status || !['potential', 'contacted', 'qualified', 'closed'].includes(leadData.status)) {
            leadData.status = 'potential';
          }

          if (!leadData.team_id) {
            batchErrors.push(`Row ${absoluteRowNumber}: Missing team_id`);
            batchFailedRecords++;
            return;
          }

          // Handle duplicate detection
          let existingLead = null;
          if (duplicateConfig.duplicateDetectionField !== 'none' && leadData[duplicateConfig.duplicateDetectionField]) {
            const { data: duplicateCheck, error: duplicateError } = await supabaseAdmin
              .from('leads')
              .select('id, name, email, phone, custom_fields')
              .eq('team_id', teamId)
              .eq(duplicateConfig.duplicateDetectionField, leadData[duplicateConfig.duplicateDetectionField])
              .single();

            if (duplicateError && duplicateError.code !== 'PGRST116') {
              batchErrors.push(`Row ${absoluteRowNumber}: Duplicate check failed - ${duplicateError.message}`);
              batchFailedRecords++;
              return;
            }

            if (duplicateCheck) {
              existingLead = duplicateCheck;
            }
          }

          // Handle duplicate action
          if (existingLead) {
            if (duplicateConfig.duplicateAction === 'skip') {
              batchProcessed++;
              return;
            } else if (duplicateConfig.duplicateAction === 'update') {
              // Merge custom fields
              const mergedCustomFields = {
                ...(existingLead.custom_fields || {}),
                ...leadData.custom_fields
              };

              const updateData = {
                ...leadData,
                custom_fields: mergedCustomFields,
                updated_at: new Date().toISOString()
              };

              delete updateData.team_id; // Don't update team_id

              const { error: updateError } = await supabaseAdmin
                .from('leads')
                .update(updateData)
                .eq('id', existingLead.id);

              if (updateError) {
                batchErrors.push(`Row ${absoluteRowNumber}: Update failed - ${updateError.message}`);
                batchFailedRecords++;
              } else {
                batchUpdatedRecords++;
                batchProcessed++;
              }
              return;
            }
            // For 'create_new', continue with normal insert
          }

          // Insert new lead
          if (!leadData.custom_fields || typeof leadData.custom_fields !== 'object') {
            leadData.custom_fields = {};
          }

          // Sanitize all field values
          const sanitizedLeadData = {
            team_id: leadData.team_id,
            name: String(leadData.name).trim(),
            email: leadData.email ? String(leadData.email).trim() : null,
            phone: leadData.phone ? String(leadData.phone).trim() : null,
            website: leadData.website ? String(leadData.website).trim() : null,
            address: leadData.address ? String(leadData.address).trim() : null,
            description: leadData.description ? String(leadData.description).trim() : null,
            status: leadData.status || 'potential',
            owner_id: leadData.owner_id || null,
            custom_fields: leadData.custom_fields,
            import_job_id: jobId || null
          };

          const { data: insertedLead, error: insertError } = await supabaseAdmin
            .from('leads')
            .insert([sanitizedLeadData])
            .select('id, name, status, team_id')
            .single();

          if (insertError) {
            // Try fallback: Insert without custom_fields if that's the issue
            if (insertError.code === '23502' || insertError.message?.includes('custom_fields')) {
              const fallbackData = { ...sanitizedLeadData };
              delete fallbackData.custom_fields;

              const { data: fallbackLead, error: fallbackError } = await supabaseAdmin
                .from('leads')
                .insert([fallbackData])
                .select('id, name, status, team_id')
                .single();

              if (fallbackError) {
                batchErrors.push(`Row ${absoluteRowNumber}: Insert failed - ${insertError.message} (Code: ${insertError.code})`);
                batchFailedRecords++;
              } else {
                batchNewRecords++;
                batchProcessed++;
              }
            } else {
              batchErrors.push(`Row ${absoluteRowNumber}: Insert failed - ${insertError.message} (Code: ${insertError.code})`);
              batchFailedRecords++;
            }
          } else {
            batchNewRecords++;
            batchProcessed++;
          }

        } catch (error) {
          const absoluteRowNumber = startRow + batchStart + i + 1;
          batchErrors.push(`Row ${absoluteRowNumber}: Unexpected error - ${error.message}`);
          batchFailedRecords++;
        }

        // Memory cleanup and progress feedback for large imports
        if (i % 50 === 0) {
          // Allow garbage collection and brief pause every 50 records
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Update totals
      totalProcessed += batchProcessed;
      totalNewRecords += batchNewRecords;
      totalUpdatedRecords += batchUpdatedRecords;
      totalFailedRecords += batchFailedRecords;
      allErrors.push(...batchErrors);

      // Update progress in database after each batch
      if (jobId) {
        try {
          const progressPercent = Math.round((totalProcessed / csvData.length) * 100);

          const progressUpdate = {
            processed_records: totalProcessed,
            failed_records: totalFailedRecords,
            status: totalProcessed >= csvData.length ? 
              (totalFailedRecords === 0 ? 'completed' : 'completed_with_errors') : 
              'processing',
            error_details: {
              summary: `Batch ${batchIndex + 1}/${totalBatches} completed: ${totalProcessed}/${csvData.length} processed`,
              new_records: totalNewRecords,
              updated_records: totalUpdatedRecords,
              failed_records: totalFailedRecords,
              progress_percent: progressPercent,
              current_batch: batchIndex + 1,
              total_batches: totalBatches,
              current_function_call_rows: `${startRow + 1}-${endRow}`,
              is_multi_batch_import: csvData.length > MAX_ROWS_PER_FUNCTION_CALL,
              errors: allErrors.length > 0 ? allErrors.slice(-50) : undefined,
              // Store original data for resume (only on first batch)
              original_data: isInitialRequest ? {
                csvData: csvData,
                mappings: mappings,
                duplicateConfig: duplicateConfig,
                teamId: teamId,
                userId: userId
              } : undefined
            },
            updated_at: new Date().toISOString()
          };

          // Add completed_at if finished
          if (totalProcessed >= csvData.length) {
            progressUpdate.completed_at = new Date().toISOString();
          }

          await supabaseAdmin
            .from('import_jobs')
            .update(progressUpdate)
            .eq('id', jobId);

          console.log(`✅ Progress updated: ${progressPercent}% (${totalProcessed}/${csvData.length})`);
        } catch (updateError) {
          console.error('❌ Failed to update progress:', updateError);
        }
      }

      const batchTime = Date.now() - startTime;
      const avgTimePerRecord = batchTime / Math.max(batchProcessed, 1);
      const estimatedTotalTime = (avgTimePerRecord * csvData.length) / 1000;

      console.log(`✅ Batch ${batchIndex + 1}/${totalBatches} completed: +${batchNewRecords} new, +${batchUpdatedRecords} updated, +${batchFailedRecords} failed`);
      console.log(`⏱️ Performance: ${avgTimePerRecord.toFixed(0)}ms/record, estimated total: ${estimatedTotalTime.toFixed(0)}s`);
    }

    // Process all data in single function call - no continuation needed
    console.log(`✅ Processing complete: ${totalProcessed}/${csvData.length} records processed in single call`);

    // Final status update for this function call
    if (jobId && isLastBatch) {
      try {
        const finalStatus = totalFailedRecords === 0 ? 'completed' : 'completed_with_errors';
        const finalErrorDetails = {
          summary: `Import completed: ${totalProcessed} processed, ${totalNewRecords} new, ${totalUpdatedRecords} updated, ${totalFailedRecords} failed`,
          new_records: totalNewRecords,
          updated_records: totalUpdatedRecords,
          failed_records: totalFailedRecords,
          progress_percent: 100,
          total_batches: totalBatches,
          multi_batch_import_completed: csvData.length > MAX_ROWS_PER_FUNCTION_CALL,
          errors: allErrors.length > 0 ? allErrors : undefined
        };

        const finalUpdate = {
          status: finalStatus,
          processed_records: totalProcessed,
          failed_records: totalFailedRecords,
          total_records: csvData.length,
          error_details: finalErrorDetails,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await supabaseAdmin
          .from('import_jobs')
          .update(finalUpdate)
          .eq('id', jobId);

        console.log(`✅ Import job ${jobId} final update completed with status: ${finalStatus}`);
      } catch (error) {
        console.error('❌ Failed to update final import job status:', error);
      }
    }

    // Prepare response
    const response = {
      success: true,
      processedRecords: totalProcessed,
      newRecords: totalNewRecords,
      updatedRecords: totalUpdatedRecords,
      failedRecords: totalFailedRecords,
      totalRows: csvData.length,
      jobId: jobId,
      batchesProcessed: Math.ceil(totalProcessed / BATCH_SIZE),
      executionTime: Date.now() - startTime,
      currentBatchRows: `${startRow + 1}-${endRow}`,
      isLastBatch: true,
      needsContinuation: false,
      continuation: null,
      errors: allErrors.length > 0 ? allErrors.slice(-20) : undefined
    };

    console.log('📊 Function Call Summary:', response);

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: responseHeaders }
    );

  } catch (error) {
    console.error('❌ Critical Edge Function error:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Request body received:', body);

    // Try to update import job with error status
    if (body?.jobId) {
      try {
        const supabaseAdmin = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        await supabaseAdmin
          .from('import_jobs')
          .update({
            status: 'failed',
            error_details: { 
              summary: 'Import failed due to critical error', 
              error: error.message,
              stack: error.stack,
              function_call_range: body.startRow ? `${body.startRow + 1}-${Math.min(body.startRow + MAX_ROWS_PER_FUNCTION_CALL, body.csvData?.length || 0)}` : 'unknown',
              raw_body: body
            },
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', body.jobId);
      } catch (jobError) {
        console.error('❌ Failed to update job with error status:', jobError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error',
        message: error.message,
        stack: error.stack,
        details: {
          body_received: !!body,
          body_type: typeof body,
          error_name: error.name,
          error_constructor: error.constructor.name
        }
      }),
      { status: 500, headers: responseHeaders }
    );
  }
});