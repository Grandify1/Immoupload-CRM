
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

interface CSVMapping {
  csvHeader: string;
  fieldName: string | null;
  createCustomField: boolean;
  customFieldType: 'text' | 'number' | 'date' | 'select';
}

interface DuplicateConfig {
  duplicateDetectionField: 'name' | 'email' | 'phone' | 'none';
  duplicateAction: 'skip' | 'update' | 'create_new';
}

interface RequestBody {
  csvData: string[][];
  mappings: CSVMapping[];
  duplicateConfig: DuplicateConfig;
  teamId: string;
  userId: string;
  jobId?: string;
}

serve(async (req) => {
  console.log('🚀 CSV Import Edge Function started');

  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  const responseHeaders = {
    ...corsHeaders,
    'Content-Type': 'application/json',
  };

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: responseHeaders }
      );
    }

    const body: RequestBody = await req.json();
    console.log('📥 Request received with data:', {
      csvDataLength: body.csvData?.length,
      mappingsLength: body.mappings?.length,
      teamId: body.teamId,
      userId: body.userId,
      jobId: body.jobId
    });

    const { csvData, mappings, duplicateConfig, teamId, userId, jobId } = body;

    if (!csvData || !mappings || !teamId || !userId) {
      console.error('❌ Missing required fields');
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields', 
          required: ['csvData', 'mappings', 'teamId', 'userId'] 
        }),
        { status: 400, headers: responseHeaders }
      );
    }

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

    console.log('=== STARTING CSV IMPORT PROCESSING ===');
    console.log(`Processing ${csvData.length} rows with ${mappings.length} mappings`);
    console.log('Duplicate config:', duplicateConfig);

    // Load existing custom fields for the team
    console.log('📋 Loading existing custom fields...');
    const { data: existingCustomFields, error: customFieldsError } = await supabaseAdmin
      .from('custom_fields')
      .select('*')
      .eq('entity_type', 'lead')
      .eq('team_id', teamId);

    if (customFieldsError) {
      console.error('❌ Error loading custom fields:', customFieldsError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to load custom fields', 
          details: customFieldsError.message 
        }),
        { status: 500, headers: responseHeaders }
      );
    }

    console.log(`✅ Loaded ${existingCustomFields?.length || 0} existing custom fields`);

    // Create a map for easy lookup of custom fields
    const customFieldsMap = new Map();
    if (existingCustomFields) {
      existingCustomFields.forEach(field => {
        const normalizedName = field.name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '');
        customFieldsMap.set(normalizedName, field);
        customFieldsMap.set(field.name, field);
      });
    }

    console.log('Custom fields map keys:', Array.from(customFieldsMap.keys()));

    // Standard lead fields
    const standardFields = ['name', 'email', 'phone', 'website', 'address', 'description', 'status', 'owner_id'];

    // Process CSV data into leads
    console.log('🔄 Processing CSV data into leads...');
    const leads: any[] = [];
    let processedRecords = 0;
    let failedRecords = 0;
    let updatedRecords = 0;
    let duplicateRecords = 0;
    let rowsProcessed = 0;

    // Create custom fields that don't exist yet
    console.log('➕ Creating new custom fields...');
    const customFieldsToCreate = mappings.filter(m => 
      m.createCustomField && 
      m.fieldName && 
      !customFieldsMap.has(m.fieldName)
    );

    for (const mapping of customFieldsToCreate) {
      if (mapping.fieldName) {
        try {
          console.log(`Creating custom field: ${mapping.fieldName}`);
          const { data: newField, error: createError } = await supabaseAdmin
            .from('custom_fields')
            .insert({
              name: mapping.fieldName,
              entity_type: 'lead',
              field_type: mapping.customFieldType,
              team_id: teamId,
              sort_order: 999
            })
            .select()
            .single();

          if (createError) {
            console.warn(`Failed to create custom field ${mapping.fieldName}:`, createError);
          } else {
            console.log(`✅ Created custom field: ${mapping.fieldName}`);
            customFieldsMap.set(mapping.fieldName, newField);
          }
        } catch (error) {
          console.warn(`Error creating custom field ${mapping.fieldName}:`, error);
        }
      }
    }

    // Process each row
    for (const row of csvData) {
      try {
        const lead: any = {
          team_id: teamId,
          status: 'potential',
          custom_fields: {}
        };

        // Map CSV columns to lead fields
        mappings.forEach((mapping, index) => {
          if (mapping.fieldName && index < row.length) {
            const value = row[index]?.toString().trim();
            if (!value || value === '') return;

            // Check if it's a standard field
            if (standardFields.includes(mapping.fieldName)) {
              if (mapping.fieldName === 'status' && !['potential', 'contacted', 'qualified', 'closed'].includes(value)) {
                lead[mapping.fieldName] = 'potential';
              } else {
                lead[mapping.fieldName] = value;
              }
            } else {
              // Handle custom fields - always store in custom_fields object
              lead.custom_fields[mapping.fieldName] = value;
            }
          }
        });

        // Ensure we have at least a name to create the lead
        if (!lead.name || !lead.name.trim()) {
          console.warn('Skipping row without name:', row.slice(0, 3));
          failedRecords++;
          continue;
        }

        // Handle duplicates
        let existingLead = null;
        if (duplicateConfig.duplicateDetectionField !== 'none') {
          const searchField = duplicateConfig.duplicateDetectionField;
          const searchValue = lead[searchField];
          
          if (searchValue) {
            const { data: duplicateCheck } = await supabaseAdmin
              .from('leads')
              .select('id, custom_fields')
              .eq('team_id', teamId)
              .eq(searchField, searchValue)
              .maybeSingle();

            existingLead = duplicateCheck;
          }
        }

        if (existingLead) {
          duplicateRecords++;
          
          if (duplicateConfig.duplicateAction === 'skip') {
            console.log(`Skipping duplicate lead: ${lead.name}`);
            continue;
          } else if (duplicateConfig.duplicateAction === 'update') {
            console.log(`Updating existing lead: ${lead.name}`);
            
            // Merge custom fields
            const mergedCustomFields = {
              ...(existingLead.custom_fields || {}),
              ...lead.custom_fields
            };

            const updateData: any = { ...lead };
            updateData.custom_fields = mergedCustomFields;
            delete updateData.team_id; // Don't update team_id

            const { error: updateError } = await supabaseAdmin
              .from('leads')
              .update(updateData)
              .eq('id', existingLead.id);

            if (updateError) {
              console.error(`Failed to update lead ${lead.name}:`, updateError);
              failedRecords++;
            } else {
              updatedRecords++;
              processedRecords++;
            }
            continue;
          }
          // For 'create_new', continue with normal creation
        }

        // Create new lead
        const { error: insertError } = await supabaseAdmin
          .from('leads')
          .insert([lead]);

        if (insertError) {
          console.error(`Failed to insert lead ${lead.name}:`, insertError);
          failedRecords++;
        } else {
          processedRecords++;
        }

      } catch (error) {
        console.error('Error processing row:', error);
        failedRecords++;
      }

      rowsProcessed++;
      
      // Update job progress every 1000 records
      if (jobId && rowsProcessed % 1000 === 0) {
        const progress = Math.round((rowsProcessed / csvData.length) * 100);
        try {
          await supabaseAdmin
            .from('import_jobs')
            .update({
              processed_records: processedRecords,
              failed_records: failedRecords,
              progress: progress
            })
            .eq('id', jobId);
        } catch (updateError) {
          console.warn('Could not update job progress:', updateError);
        }
      }
    }

    // Final status update
    const finalStatus = failedRecords === 0 ? 'completed' : 'completed_with_errors';
    const newRecords = processedRecords - updatedRecords;
    
    console.log('=== FINAL IMPORT RESULTS ===');
    console.log(`✅ Import completed successfully!`);
    console.log(`📊 Total leads processed: ${processedRecords}`);
    console.log(`🆕 New records: ${newRecords}`);
    console.log(`🔄 Updated records: ${updatedRecords}`);
    console.log(`⏭️ Duplicate records skipped: ${duplicateRecords}`);
    console.log(`❌ Failed records: ${failedRecords}`);
    console.log(`📈 Final status: ${finalStatus}`);
    
    // Final job update
    if (jobId) {
      try {
        await supabaseAdmin
          .from('import_jobs')
          .update({
            status: finalStatus,
            processed_records: processedRecords,
            failed_records: failedRecords,
            error_details: {
              new_records: newRecords,
              updated_records: updatedRecords,
              duplicate_records: duplicateRecords,
              failed_records: failedRecords,
              summary: `Import completed: ${newRecords} new, ${updatedRecords} updated, ${duplicateRecords} skipped, ${failedRecords} failed`
            },
            completed_at: new Date().toISOString()
          })
          .eq('id', jobId);
      } catch (finalUpdateError) {
        console.warn('Could not update final job status:', finalUpdateError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processedRecords: processedRecords,
        newRecords: newRecords,
        updatedRecords: updatedRecords,
        duplicateRecords: duplicateRecords,
        failedRecords: failedRecords,
        status: finalStatus,
        message: `Successfully imported ${processedRecords} leads (${newRecords} new, ${updatedRecords} updated)`
      }),
      { status: 200, headers: responseHeaders }
    );

  } catch (error) {
    console.error('❌ Critical Edge Function error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        stack: error.stack
      }),
      { status: 500, headers: responseHeaders }
    );
  }
});
