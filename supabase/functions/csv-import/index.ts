
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  console.log('🚀 CSV Import Edge Function called');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers present:', Object.keys(Object.fromEntries(req.headers.entries())));

  // CORS preflight handling
  if (req.method === 'OPTIONS') {
    console.log('✅ Handling CORS preflight request');
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
    console.log('📋 Starting CSV import processing...');

    if (req.method !== 'POST') {
      console.log('❌ Invalid method:', req.method);
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: responseHeaders }
      );
    }

    // Environment variables check
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    console.log('Environment check:');
    console.log('- SUPABASE_URL:', supabaseUrl ? 'Present' : 'Missing');
    console.log('- SERVICE_KEY:', supabaseServiceKey ? 'Present' : 'Missing');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing Supabase environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error - Missing environment variables' }),
        { status: 500, headers: responseHeaders }
      );
    }

    // Request body parsing with error handling
    let body;
    try {
      const rawBody = await req.text();
      console.log('📄 Request body length:', rawBody.length, 'bytes');
      
      if (rawBody.length === 0) {
        throw new Error('Empty request body');
      }

      body = JSON.parse(rawBody);
      console.log('✅ Request body parsed successfully');
      console.log('- csvData rows:', body.csvData?.length || 'undefined');
      console.log('- mappings:', body.mappings?.length || 'undefined');
      console.log('- teamId:', body.teamId ? 'Present' : 'Missing');
      console.log('- userId:', body.userId ? 'Present' : 'Missing');
    } catch (parseError) {
      console.error('❌ Failed to parse request body:', parseError.message);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid request body', 
          details: parseError.message 
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Validate required fields
    const { csvData, mappings, duplicateConfig, teamId, userId, jobId } = body;

    if (!csvData || !mappings || !teamId || !userId) {
      console.error('❌ Missing required fields');
      console.log('Missing fields:', {
        csvData: !csvData,
        mappings: !mappings,
        teamId: !teamId,
        userId: !userId
      });
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields', 
          required: ['csvData', 'mappings', 'teamId', 'userId'] 
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    console.log('✅ All required fields present');

    // Initialize Supabase client
    console.log('🔌 Creating Supabase client...');
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Test database connection
    console.log('🔍 Testing database connection...');
    const { data: testData, error: testError } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('team_id', teamId)
      .limit(1);

    if (testError) {
      console.error('❌ Database connection test failed:', testError);
      return new Response(
        JSON.stringify({ 
          error: 'Database connection failed', 
          details: testError.message 
        }),
        { status: 500, headers: responseHeaders }
      );
    }

    console.log('✅ Database connection successful');

    // Process CSV import
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
    } else {
      console.log(`✅ Loaded ${existingCustomFields?.length || 0} existing custom fields`);
    }

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

    console.log('Custom fields map size:', customFieldsMap.size);

    // Standard lead fields
    const standardFields = ['name', 'email', 'phone', 'website', 'address', 'description', 'status', 'owner_id'];

    // Initialize counters
    let processedRecords = 0;
    let failedRecords = 0;
    let updatedRecords = 0;
    let duplicateRecords = 0;
    let newRecords = 0;

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
    console.log('🔄 Processing CSV rows...');
    const leads = [];
    
    for (let rowIndex = 0; rowIndex < csvData.length; rowIndex++) {
      const row = csvData[rowIndex];
      
      try {
        const lead = {
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
              // Handle custom fields
              lead.custom_fields[mapping.fieldName] = value;
            }
          }
        });

        // Ensure we have at least a name to create the lead
        if (!lead.name || !lead.name.trim()) {
          console.warn(`Skipping row ${rowIndex + 1} without name`);
          failedRecords++;
          continue;
        }

        // Handle duplicates
        let existingLead = null;
        if (duplicateConfig && duplicateConfig.duplicateDetectionField !== 'none') {
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

            const updateData = { ...lead };
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
        leads.push(lead);

      } catch (error) {
        console.error(`Error processing row ${rowIndex + 1}:`, error);
        failedRecords++;
      }

      // Log progress every 100 rows
      if ((rowIndex + 1) % 100 === 0) {
        console.log(`Progress: ${rowIndex + 1}/${csvData.length} rows processed`);
      }
    }

    // Batch insert new leads
    if (leads.length > 0) {
      console.log(`🔄 Inserting ${leads.length} new leads...`);
      
      // Insert in batches of 1000
      const batchSize = 1000;
      for (let i = 0; i < leads.length; i += batchSize) {
        const batch = leads.slice(i, i + batchSize);
        
        const { data: insertedLeads, error: insertError } = await supabaseAdmin
          .from('leads')
          .insert(batch)
          .select('id');

        if (insertError) {
          console.error(`Failed to insert batch ${i / batchSize + 1}:`, insertError);
          failedRecords += batch.length;
        } else {
          const insertedCount = insertedLeads?.length || 0;
          newRecords += insertedCount;
          processedRecords += insertedCount;
          console.log(`✅ Inserted batch ${i / batchSize + 1}: ${insertedCount} leads`);
        }
      }
    }

    // Update job status if provided
    if (jobId) {
      console.log('📝 Updating import job status...');
      try {
        const finalStatus = failedRecords === 0 ? 'completed' : 'completed_with_errors';
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
        console.log('✅ Job status updated');
      } catch (updateError) {
        console.warn('Could not update job status:', updateError);
      }
    }

    // Final verification
    const { data: verificationLeads, error: verificationError } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('team_id', teamId);

    const actualLeadCount = verificationLeads?.length || 0;

    console.log('=== FINAL IMPORT RESULTS ===');
    console.log(`✅ Import completed successfully!`);
    console.log(`📊 Total leads processed: ${processedRecords}`);
    console.log(`🆕 New records: ${newRecords}`);
    console.log(`🔄 Updated records: ${updatedRecords}`);
    console.log(`⏭️ Duplicate records skipped: ${duplicateRecords}`);
    console.log(`❌ Failed records: ${failedRecords}`);
    console.log(`📈 Total leads in database: ${actualLeadCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        processedRecords: processedRecords,
        newRecords: newRecords,
        updatedRecords: updatedRecords,
        duplicateRecords: duplicateRecords,
        failedRecords: failedRecords,
        actualLeadCount: actualLeadCount,
        message: `Successfully imported ${processedRecords} leads (${newRecords} new, ${updatedRecords} updated). Database now contains ${actualLeadCount} total leads.`
      }),
      { status: 200, headers: responseHeaders }
    );

  } catch (error) {
    console.error('❌ Critical Edge Function error:', error);
    console.error('Error stack:', error.stack);
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
