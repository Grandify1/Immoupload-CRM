import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

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
}

const BATCH_SIZE = 100; // Kleinere Batches für bessere Stabilität
const MAX_ROWS_PER_FUNCTION_CALL = 500; // Reduziert für bessere Performance

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
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
      body = await req.json();
    } catch (error) {
      console.error('❌ Invalid JSON in request body:', error);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: responseHeaders }
      );
    }

    const { csvData, mappings, duplicateConfig, teamId, userId, jobId, startRow = 0, isInitialRequest = true } = body;

    // Validate required fields
    if (!csvData || !mappings || !teamId || !userId) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields', 
          required: ['csvData', 'mappings', 'teamId', 'userId'] 
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    console.log(`📊 Processing ${csvData.length} total rows, starting from row ${startRow} for team ${teamId}`);
    console.log(`🔄 Duplicate config: ${duplicateConfig.duplicateDetectionField} -> ${duplicateConfig.duplicateAction}`);

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
          .select('processed_records, failed_records, error_details')
          .eq('id', jobId)
          .single();

        if (currentJob) {
          totalProcessed = currentJob.processed_records || 0;
          totalFailedRecords = currentJob.failed_records || 0;
          totalNewRecords = currentJob.error_details?.new_records || 0;
          totalUpdatedRecords = currentJob.error_details?.updated_records || 0;
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

      // Process rows in parallel for better performance
      const batchPromises = currentBatch.map(async (row, i) => {
        const absoluteRowNumber = startRow + batchStart + i + 1;

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
      });

      const batchResults = await Promise.all(batchPromises);

      batchResults.forEach(() => {
        // Update totals (already updated inside the promises)
      });

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
              errors: allErrors.length > 0 ? allErrors.slice(-50) : undefined
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

      console.log(`✅ Batch ${batchIndex + 1}/${totalBatches} completed: +${batchNewRecords} new, +${batchUpdatedRecords} updated, +${batchFailedRecords} failed`);
    }

    // Bestimme ob wir weitere Function Calls brauchen
    const needsContinuation = !isLastBatch;
    let continuationResponse = null;

    if (needsContinuation) {
      console.log(`🔄 Import needs continuation. Next batch starts at row ${endRow}`);

      // Trigger next batch asynchronously
      try {
        const nextBatchPayload = {
          csvData: csvData,
          mappings: mappings,
          duplicateConfig: duplicateConfig,
          teamId: teamId,
          userId: userId,
          jobId: jobId,
          startRow: endRow,
          isInitialRequest: false
        };

        console.log(`📤 Triggering next batch: rows ${endRow + 1}-${Math.min(endRow + MAX_ROWS_PER_FUNCTION_CALL, csvData.length)}`);

        // Fire-and-forget next batch
        const { error: continuationError } = await supabaseAdmin.functions.invoke('csv-import', {
          body: nextBatchPayload
        });

        if (continuationError) {
          console.error('❌ Failed to trigger continuation:', continuationError);
          // Update job status to indicate continuation failed
          if (jobId) {
            await supabaseAdmin
              .from('import_jobs')
              .update({
                status: 'completed_with_errors',
                error_details: {
                  summary: `Import paused after ${totalProcessed} records - continuation failed`,
                  new_records: totalNewRecords,
                  updated_records: totalUpdatedRecords,
                  failed_records: totalFailedRecords,
                  continuation_error: continuationError.message,
                  processed_rows: `${startRow + 1}-${endRow}`,
                  errors: allErrors.length > 0 ? allErrors.slice(-20) : undefined
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', jobId);
          }
        } else {
          console.log(`✅ Next batch triggered successfully`);
          continuationResponse = {
            continuation_triggered: true,
            next_start_row: endRow,
            remaining_rows: csvData.length - endRow
          };
        }
      } catch (error) {
        console.error('❌ Critical error triggering continuation:', error);
      }
    }

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
      isLastBatch: isLastBatch,
      needsContinuation: needsContinuation,
      continuation: continuationResponse,
      errors: allErrors.length > 0 ? allErrors.slice(-20) : undefined
    };

    console.log('📊 Function Call Summary:', response);

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: responseHeaders }
    );

  } catch (error) {
    console.error('❌ Critical Edge Function error:', error);

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
              function_call_range: body.startRow ? `${body.startRow + 1}-${Math.min(body.startRow + MAX_ROWS_PER_FUNCTION_CALL, body.csvData?.length || 0)}` : 'unknown'
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
        message: error.message
      }),
      { status: 500, headers: responseHeaders }
    );
  }
});