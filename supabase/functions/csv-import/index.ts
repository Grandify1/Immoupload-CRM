
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
}

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

    const { csvData, mappings, duplicateConfig, teamId, userId, jobId } = body;

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

    console.log(`📊 Processing ${csvData.length} rows for team ${teamId}`);
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

    let processedRecords = 0;
    let newRecords = 0;
    let updatedRecords = 0;
    let failedRecords = 0;
    const errors: string[] = [];

    // Process each CSV row
    for (let i = 0; i < csvData.length; i++) {
      try {
        const row = csvData[i];
        console.log(`📝 Processing row ${i + 1}/${csvData.length}`);

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
                // Ensure status is valid, default to 'potential'
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
          errors.push(`Row ${i + 1}: Missing required 'name' field`);
          failedRecords++;
          continue;
        }

        // ALWAYS set default status to 'potential' if not provided or invalid
        if (!leadData.status || !['potential', 'contacted', 'qualified', 'closed'].includes(leadData.status)) {
          leadData.status = 'potential';
        }

        console.log(`📋 Lead data for row ${i + 1}:`, {
          name: leadData.name,
          status: leadData.status,
          team_id: leadData.team_id,
          customFieldsCount: Object.keys(leadData.custom_fields).length,
          hasRequiredFields: !!(leadData.name && leadData.team_id && leadData.status)
        });

        // Validate required fields before proceeding
        if (!leadData.team_id) {
          console.error(`❌ Missing team_id for row ${i + 1}`);
          errors.push(`Row ${i + 1}: Missing team_id`);
          failedRecords++;
          continue;
        }

        // Handle duplicate detection
        let existingLead = null;
        if (duplicateConfig.duplicateDetectionField !== 'none' && leadData[duplicateConfig.duplicateDetectionField]) {
          console.log(`🔍 Checking for duplicates by ${duplicateConfig.duplicateDetectionField}: ${leadData[duplicateConfig.duplicateDetectionField]}`);

          const { data: duplicateCheck, error: duplicateError } = await supabaseAdmin
            .from('leads')
            .select('id, name, email, phone, custom_fields')
            .eq('team_id', teamId)
            .eq(duplicateConfig.duplicateDetectionField, leadData[duplicateConfig.duplicateDetectionField])
            .single();

          if (duplicateError && duplicateError.code !== 'PGRST116') {
            console.error(`❌ Error checking duplicates for row ${i + 1}:`, duplicateError);
            errors.push(`Row ${i + 1}: Duplicate check failed - ${duplicateError.message}`);
            failedRecords++;
            continue;
          }

          if (duplicateCheck) {
            existingLead = duplicateCheck;
            console.log(`🔄 Found duplicate lead: ${existingLead.name} (ID: ${existingLead.id})`);
          }
        }

        // Handle duplicate action
        if (existingLead) {
          if (duplicateConfig.duplicateAction === 'skip') {
            console.log(`⏭️ Skipping duplicate: ${leadData.name}`);
            processedRecords++;
            continue;
          } else if (duplicateConfig.duplicateAction === 'update') {
            console.log(`🔄 Updating existing lead: ${existingLead.id}`);

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
              console.error(`❌ Error updating lead ${existingLead.id}:`, updateError);
              errors.push(`Row ${i + 1}: Update failed - ${updateError.message}`);
              failedRecords++;
            } else {
              console.log(`✅ Updated lead: ${leadData.name}`);
              updatedRecords++;
              processedRecords++;
            }
            continue;
          }
          // For 'create_new', we continue with normal insert
        }

        // Insert new lead
        console.log(`➕ Creating new lead: ${leadData.name}`);
        console.log(`📊 Final lead data being inserted:`, JSON.stringify(leadData, null, 2));

        // Add import job reference if available
        if (jobId) {
          leadData.import_job_id = jobId;
        }

        try {
          // Validate lead data before insert
          if (!leadData.name || !leadData.team_id || !leadData.status) {
            console.error(`❌ Invalid lead data - missing required fields:`, {
              hasName: !!leadData.name,
              hasTeamId: !!leadData.team_id,
              hasStatus: !!leadData.status
            });
            errors.push(`Row ${i + 1}: Missing required fields (name, team_id, or status)`);
            failedRecords++;
            continue;
          }

          // CRITICAL FIX: Ensure custom_fields is valid JSON
          if (!leadData.custom_fields || typeof leadData.custom_fields !== 'object') {
            leadData.custom_fields = {};
          }

          // CRITICAL FIX: Validate and sanitize all field values
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

          // Log exactly what we're trying to insert
          console.log(`🔍 Attempting to insert lead for row ${i + 1}:`);
          console.log(`   Name: "${sanitizedLeadData.name}"`);
          console.log(`   Team ID: "${sanitizedLeadData.team_id}"`);
          console.log(`   Status: "${sanitizedLeadData.status}"`);
          console.log(`   Custom fields count: ${Object.keys(sanitizedLeadData.custom_fields || {}).length}`);
          console.log(`   Sanitized data:`, JSON.stringify(sanitizedLeadData, null, 2));

          const { data: insertedLead, error: insertError } = await supabaseAdmin
            .from('leads')
            .insert([sanitizedLeadData])
            .select('id, name, status, team_id')
            .single();

          if (insertError) {
            console.error(`❌ Error inserting lead for row ${i + 1}:`, insertError);
            console.error('📄 Lead data that failed:', JSON.stringify(leadData, null, 2));
            console.error('🔍 Error details:', {
              code: insertError.code,
              message: insertError.message,
              details: insertError.details,
              hint: insertError.hint
            });

            // Try fallback: Insert without custom_fields if that's the issue
            if (insertError.code === '23502' || insertError.message?.includes('custom_fields')) {
              console.log(`🔄 Attempting fallback: Insert without custom_fields for row ${i + 1}`);
              const fallbackData = { ...leadData };
              delete fallbackData.custom_fields;
              
              const { data: fallbackLead, error: fallbackError } = await supabaseAdmin
                .from('leads')
                .insert([fallbackData])
                .select('id, name, status, team_id')
                .single();

              if (fallbackError) {
                console.error(`❌ Fallback also failed for row ${i + 1}:`, fallbackError);
                errors.push(`Row ${i + 1}: Insert failed - ${insertError.message} (Code: ${insertError.code})`);
                failedRecords++;
              } else {
                console.log(`✅ Fallback success for row ${i + 1}: ${fallbackLead.name} (ID: ${fallbackLead.id})`);
                newRecords++;
                processedRecords++;
              }
            } else {
              errors.push(`Row ${i + 1}: Insert failed - ${insertError.message} (Code: ${insertError.code})`);
              failedRecords++;
            }
          } else {
            console.log(`✅ Created new lead: ${insertedLead.name} (ID: ${insertedLead.id}, Status: ${insertedLead.status}, Team: ${insertedLead.team_id})`);
            newRecords++;
            processedRecords++;
          }
        } catch (error) {
          console.error(`❌ Unexpected error inserting lead for row ${i + 1}:`, error);
          console.error('📄 Lead data that failed:', JSON.stringify(leadData, null, 2));
          errors.push(`Row ${i + 1}: Unexpected insert error - ${error.message}`);
          failedRecords++;
        }

      } catch (error) {
        console.error(`❌ Unexpected error processing row ${i + 1}:`, error);
        errors.push(`Row ${i + 1}: Unexpected error - ${error.message}`);
        failedRecords++;
      }
    }

    // Update import job status
    if (jobId) {
      try {
        const jobStatus = failedRecords === 0 ? 'completed' : 'completed_with_errors';
        const errorDetails = {
          summary: `Import completed: ${processedRecords} processed, ${newRecords} new, ${updatedRecords} updated, ${failedRecords} failed`,
          new_records: newRecords,
          updated_records: updatedRecords,
          failed_records: failedRecords,
          errors: errors.length > 0 ? errors : undefined
        };

        console.log(`🔄 Updating import job ${jobId} with status: ${jobStatus}`);
        console.log(`📊 Job update data:`, {
          status: jobStatus,
          processed_records: processedRecords,
          failed_records: failedRecords,
          error_details: errorDetails,
          total_records: csvData.length
        });

        // Force the update with all required fields - CRITICAL FIX
        const updateData = {
          status: jobStatus,
          processed_records: processedRecords,
          failed_records: failedRecords,
          total_records: csvData.length,
          error_details: errorDetails,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        console.log(`🔍 Final update data being sent:`, updateData);

        // CRITICAL: Use upsert to ensure the update happens
        const { data: updatedJob, error: jobUpdateError } = await supabaseAdmin
          .from('import_jobs')
          .upsert(updateData, { 
            onConflict: 'id',
            ignoreDuplicates: false 
          })
          .eq('id', jobId)
          .select()
          .single();

        if (jobUpdateError) {
          console.error('❌ Failed to update import job:', jobUpdateError);
          console.error('❌ Job update error details:', {
            code: jobUpdateError.code,
            message: jobUpdateError.message,
            details: jobUpdateError.details,
            hint: jobUpdateError.hint
          });
        } else {
          console.log(`✅ Import job ${jobId} updated successfully with status: ${jobStatus}`);
          console.log(`✅ Updated job data:`, updatedJob);
        }
      } catch (error) {
        console.error('❌ Error updating import job:', error);
        console.error('❌ Error stack:', error.stack);
      }
    }

    // Prepare response
    const response = {
      success: true,
      processedRecords,
      newRecords,
      updatedRecords,
      failedRecords,
      totalRows: csvData.length,
      jobId: jobId,
      errors: errors.length > 0 ? errors : undefined
    };

    console.log('📊 Final Import Summary:', response);
    console.log(`✅ Import completed successfully: ${newRecords} new leads, ${updatedRecords} updated leads, ${failedRecords} failed`);

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
            error_details: { summary: 'Import failed due to critical error', error: error.message },
            completed_at: new Date().toISOString()
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
