
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  console.log('🚀 CSV Import Edge Function started');
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
    
    console.log('🔧 Environment check:');
    console.log('- SUPABASE_URL:', supabaseUrl ? 'Present' : 'Missing');
    console.log('- SERVICE_ROLE_KEY:', supabaseServiceKey ? 'Present' : 'Missing');

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
      console.log('📊 Received data:', {
        csvDataRows: body.csvData?.length || 'undefined',
        mappingsCount: body.mappings?.length || 'undefined',
        teamId: body.teamId ? 'Present' : 'Missing',
        userId: body.userId ? 'Present' : 'Missing'
      });
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
      console.log('Missing fields validation:', {
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
    console.log('👤 User ID:', userId);
    console.log('🏢 Team ID:', teamId);

    // Initialize Supabase client with SERVICE_ROLE_KEY
    console.log('🔌 Creating Supabase client with SERVICE_ROLE_KEY...');
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Test database connection and permissions
    console.log('🔍 Testing database connection and permissions...');
    try {
      const { data: testData, error: testError } = await supabaseAdmin
        .from('leads')
        .select('id, name, team_id')
        .eq('team_id', teamId)
        .limit(1);

      if (testError) {
        console.error('❌ Database connection test failed:', testError);
        console.error('Test error details:', {
          code: testError.code,
          message: testError.message,
          details: testError.details,
          hint: testError.hint
        });
        return new Response(
          JSON.stringify({ 
            error: 'Database connection failed', 
            details: testError.message,
            code: testError.code
          }),
          { status: 500, headers: responseHeaders }
        );
      }

      console.log('✅ Database connection successful');
      console.log('📋 Existing leads count for team:', testData?.length || 0);
    } catch (connectionError) {
      console.error('❌ Database connection exception:', connectionError);
      return new Response(
        JSON.stringify({ 
          error: 'Database connection exception', 
          details: connectionError.message 
        }),
        { status: 500, headers: responseHeaders }
      );
    }

    // Process CSV import
    console.log('=== STARTING CSV IMPORT PROCESSING ===');
    console.log(`📊 Processing ${csvData.length} rows with ${mappings.length} mappings`);
    console.log('🔄 Duplicate config:', duplicateConfig);

    // Load existing custom fields for the team
    console.log('📋 Loading existing custom fields...');
    console.log('🔍 Team ID for custom fields lookup:', teamId);
    
    const { data: existingCustomFields, error: customFieldsError } = await supabaseAdmin
      .from('custom_fields')
      .select('*')
      .eq('entity_type', 'lead')
      .eq('team_id', teamId);

    if (customFieldsError) {
      console.error('❌ Error loading custom fields:', customFieldsError);
      console.error('Custom fields error details:', {
        code: customFieldsError.code,
        message: customFieldsError.message,
        details: customFieldsError.details,
        hint: customFieldsError.hint
      });
    } else {
      console.log(`✅ Loaded ${existingCustomFields?.length || 0} existing custom fields`);
      if (existingCustomFields && existingCustomFields.length > 0) {
        console.log('📋 Existing custom fields details:');
        existingCustomFields.forEach((field, index) => {
          console.log(`  ${index + 1}. "${field.name}" (${field.field_type}) - ID: ${field.id}`);
        });
      }
    }

    // Enhanced Custom Field Matching Function
    function findCustomField(customFields, fieldName) {
      console.log(`🔍 Finding custom field for: "${fieldName}"`);
      console.log(`Available custom fields:`, customFields.map(f => f.name));
      
      // 1. Exact match (case-sensitive)
      let field = customFields.find(f => f.name === fieldName);
      if (field) {
        console.log(`✅ Exact match found: "${field.name}"`);
        return field;
      }
      
      // 2. Case-insensitive exact match
      field = customFields.find(f => f.name.toLowerCase() === fieldName.toLowerCase());
      if (field) {
        console.log(`✅ Case-insensitive match found: "${field.name}"`);
        return field;
      }
      
      // 3. Normalized search (frontend sends normalized names)
      const normalizedFieldName = fieldName.toLowerCase().replace(/\s+/g, '_');
      field = customFields.find(f => {
        const normalized = f.name.toLowerCase().replace(/\s+/g, '_');
        return normalized === normalizedFieldName;
      });
      if (field) {
        console.log(`✅ Normalized match found: "${fieldName}" -> "${field.name}"`);
        return field;
      }
      
      // 4. Reverse normalization (denormalize the fieldName to find original)
      const denormalizedFieldName = fieldName.replace(/_/g, ' ');
      field = customFields.find(f => f.name === denormalizedFieldName);
      if (field) {
        console.log(`✅ Denormalized match found: "${fieldName}" -> "${field.name}"`);
        return field;
      }
      
      // 5. Advanced normalization with special characters
      const advancedNormalized = fieldName
        .toLowerCase()
        .replace(/[äöüßÄÖÜ]/g, (match) => {
          const replacements = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss', 'Ä': 'ae', 'Ö': 'oe', 'Ü': 'ue' };
          return replacements[match] || match;
        })
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
      
      field = customFields.find(f => {
        const fieldAdvancedNormalized = f.name
          .toLowerCase()
          .replace(/[äöüßÄÖÜ]/g, (match) => {
            const replacements = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss', 'Ä': 'ae', 'Ö': 'oe', 'Ü': 'ue' };
            return replacements[match] || match;
          })
          .replace(/[^a-z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '');
        return fieldAdvancedNormalized === advancedNormalized;
      });
      
      if (field) {
        console.log(`✅ Advanced normalized match found: "${fieldName}" -> "${field.name}"`);
        return field;
      }
      
      console.warn(`❌ No custom field match found for: "${fieldName}"`);
      return null;
    }

    console.log('📋 Custom field finder function initialized');

    // Standard lead fields
    const standardFields = ['name', 'email', 'phone', 'website', 'address', 'description', 'status', 'owner_id'];

    // Initialize counters
    let processedRecords = 0;
    let failedRecords = 0;
    let updatedRecords = 0;
    let duplicateRecords = 0;
    let newRecords = 0;
    const detailedErrors = [];

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
          console.log(`🆕 Creating custom field: ${mapping.fieldName}`);
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
            console.warn(`⚠️ Failed to create custom field ${mapping.fieldName}:`, createError);
            detailedErrors.push(`Custom field creation failed: ${mapping.fieldName} - ${createError.message}`);
          } else {
            console.log(`✅ Created custom field: ${mapping.fieldName}`);
            customFieldsMap.set(mapping.fieldName, newField);
          }
        } catch (error) {
          console.warn(`⚠️ Exception creating custom field ${mapping.fieldName}:`, error);
          detailedErrors.push(`Custom field exception: ${mapping.fieldName} - ${error.message}`);
        }
      }
    }

    // Process each row individually with detailed error handling
    console.log('🔄 Processing CSV rows individually...');
    
    for (let rowIndex = 0; rowIndex < csvData.length; rowIndex++) {
      const row = csvData[rowIndex];
      
      try {
        console.log(`📝 Processing row ${rowIndex + 1}/${csvData.length}`);
        
        const lead = {
          team_id: teamId,
          status: 'potential',
          custom_fields: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        // Map CSV columns to lead fields with enhanced custom field handling
        console.log(`🗺️ Processing ${mappings.length} mappings for row ${rowIndex + 1}`);
        console.log(`🗂️ Available custom fields:`, existingCustomFields?.map(cf => cf.name) || []);
        
        mappings.forEach((mapping, index) => {
          if (mapping.fieldName && index < row.length) {
            const value = row[index]?.toString().trim();
            if (!value || value === '') return;

            console.log(`📋 Processing mapping: "${mapping.csvHeader}" -> "${mapping.fieldName}" = "${value}"`);

            // Check if it's a standard field
            if (standardFields.includes(mapping.fieldName)) {
              if (mapping.fieldName === 'status' && !['potential', 'contacted', 'qualified', 'closed'].includes(value)) {
                lead[mapping.fieldName] = 'potential';
                console.log(`🔄 Normalized status from "${value}" to "potential"`);
              } else {
                lead[mapping.fieldName] = value;
                console.log(`✅ Standard field: ${mapping.fieldName} = ${value}`);
              }
            } else {
              // Enhanced custom field handling using the findCustomField function
              console.log(`🔍 Searching for custom field: "${mapping.fieldName}"`);
              
              const customField = findCustomField(existingCustomFields || [], mapping.fieldName);
              
              if (customField) {
                console.log(`✅ Found existing custom field: "${customField.name}" (ID: ${customField.id})`);
                console.log(`   Mapping: "${mapping.fieldName}" -> "${customField.name}"`);
                // CRITICAL: Use the actual custom field name from database, NOT the mapping fieldName
                lead.custom_fields[customField.name] = value;
                console.log(`   Stored as: custom_fields["${customField.name}"] = "${value}"`);
              } else if (mapping.createCustomField) {
                console.log(`➕ Will create new custom field: "${mapping.fieldName}"`);
                lead.custom_fields[mapping.fieldName] = value;
                console.log(`   Stored as: custom_fields["${mapping.fieldName}"] = "${value}"`);
              } else {
                console.log(`⚠️ Custom field not found and not creating new: "${mapping.fieldName}"`);
                console.log(`   Available fields: ${existingCustomFields?.map(cf => `"${cf.name}"`).join(', ') || 'none'}`);
                // Still store it, but with a warning
                lead.custom_fields[mapping.fieldName] = value;
                console.log(`   Stored anyway as: custom_fields["${mapping.fieldName}"] = "${value}"`);
              }
            }
          }
        });

        // Ensure we have at least a name to create the lead
        if (!lead.name || !lead.name.trim()) {
          console.warn(`⚠️ Skipping row ${rowIndex + 1} - no name provided`);
          console.log('Row data:', row);
          failedRecords++;
          detailedErrors.push(`Row ${rowIndex + 1}: Missing required name field`);
          continue;
        }

        console.log(`💾 Prepared lead data for "${lead.name}":`, {
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          team_id: lead.team_id,
          status: lead.status,
          custom_fields_count: Object.keys(lead.custom_fields).length,
          custom_fields_keys: Object.keys(lead.custom_fields),
          custom_fields_preview: Object.entries(lead.custom_fields).slice(0, 3).map(([k, v]) => `${k}=${v}`)
        });

        // Handle duplicates
        let existingLead = null;
        if (duplicateConfig && duplicateConfig.duplicateDetectionField !== 'none') {
          const searchField = duplicateConfig.duplicateDetectionField;
          const searchValue = lead[searchField];
          
          console.log(`🔍 Checking for duplicates using field "${searchField}" = "${searchValue}"`);
          
          if (searchValue) {
            try {
              const { data: duplicateCheck, error: duplicateError } = await supabaseAdmin
                .from('leads')
                .select('id, name, custom_fields')
                .eq('team_id', teamId)
                .eq(searchField, searchValue)
                .maybeSingle();

              if (duplicateError) {
                console.warn(`⚠️ Duplicate check failed for ${searchField}:`, duplicateError);
              } else {
                existingLead = duplicateCheck;
                if (existingLead) {
                  console.log(`🔍 Found duplicate lead: ${existingLead.name} (ID: ${existingLead.id})`);
                }
              }
            } catch (duplicateException) {
              console.warn(`⚠️ Duplicate check exception:`, duplicateException);
            }
          }
        }

        if (existingLead) {
          duplicateRecords++;
          
          if (duplicateConfig.duplicateAction === 'skip') {
            console.log(`⏭️ Skipping duplicate lead: ${lead.name}`);
            continue;
          } else if (duplicateConfig.duplicateAction === 'update') {
            console.log(`🔄 Updating existing lead: ${lead.name}`);
            
            try {
              // Merge custom fields
              const mergedCustomFields = {
                ...(existingLead.custom_fields || {}),
                ...lead.custom_fields
              };

              const updateData = { ...lead };
              updateData.custom_fields = mergedCustomFields;
              delete updateData.team_id; // Don't update team_id
              delete updateData.created_at; // Don't update created_at

              console.log(`💾 Updating lead with data:`, {
                id: existingLead.id,
                name: updateData.name,
                fieldsToUpdate: Object.keys(updateData).filter(k => k !== 'custom_fields'),
                customFieldsToUpdate: Object.keys(updateData.custom_fields)
              });

              const { data: updateResult, error: updateError } = await supabaseAdmin
                .from('leads')
                .update(updateData)
                .eq('id', existingLead.id)
                .select('id, name');

              if (updateError) {
                console.error(`❌ Failed to update lead ${lead.name}:`, updateError);
                console.error('Update error details:', {
                  code: updateError.code,
                  message: updateError.message,
                  details: updateError.details,
                  hint: updateError.hint
                });
                failedRecords++;
                detailedErrors.push(`Row ${rowIndex + 1}: Update failed - ${updateError.message}`);
              } else {
                console.log(`✅ Successfully updated lead:`, updateResult);
                updatedRecords++;
                processedRecords++;
              }
            } catch (updateException) {
              console.error(`❌ Update exception for lead ${lead.name}:`, updateException);
              failedRecords++;
              detailedErrors.push(`Row ${rowIndex + 1}: Update exception - ${updateException.message}`);
            }
            continue;
          }
          // For 'create_new', continue with normal creation
          console.log(`➕ Creating new lead despite duplicate: ${lead.name}`);
        }

        // Create new lead with enhanced error handling and validation
        console.log(`💾 Attempting to insert new lead: ${lead.name}`);
        console.log(`📊 Lead data summary:`, {
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          team_id: lead.team_id,
          status: lead.status,
          custom_fields_count: Object.keys(lead.custom_fields).length,
          custom_field_keys: Object.keys(lead.custom_fields)
        });
        
        // Validate required fields before insert
        if (!lead.name || !lead.team_id) {
          console.error(`❌ Missing required fields for lead:`, { name: lead.name, team_id: lead.team_id });
          failedRecords++;
          detailedErrors.push(`Row ${rowIndex + 1}: Missing required fields (name or team_id)`);
          continue;
        }
        
        // Validate custom_fields is proper JSON
        try {
          JSON.stringify(lead.custom_fields);
        } catch (jsonError) {
          console.error(`❌ Invalid custom_fields JSON for lead ${lead.name}:`, jsonError);
          lead.custom_fields = {};
        }
        
        try {
          // Validate and sanitize custom_fields before insert
          const sanitizedCustomFields = {};
          if (lead.custom_fields && typeof lead.custom_fields === 'object') {
            for (const [key, value] of Object.entries(lead.custom_fields)) {
              if (key && value !== null && value !== undefined) {
                sanitizedCustomFields[key] = String(value);
              }
            }
          }
          
          // Prepare final lead data with sanitized custom fields
          const finalLeadData = {
            ...lead,
            custom_fields: sanitizedCustomFields
          };
          
          console.log(`💾 Final lead data being inserted:`, {
            name: finalLeadData.name,
            team_id: finalLeadData.team_id,
            status: finalLeadData.status,
            custom_fields_count: Object.keys(sanitizedCustomFields).length,
            custom_fields_keys: Object.keys(sanitizedCustomFields),
            custom_fields_sample: Object.entries(sanitizedCustomFields).slice(0, 2)
          });
          
          // Atomic insert with transaction-like behavior
          const { data: insertResult, error: insertError } = await supabaseAdmin
            .from('leads')
            .insert([finalLeadData])
            .select('id, name, team_id, created_at, custom_fields');

          if (insertError) {
            console.error(`❌ Insert failed for lead ${lead.name}:`, insertError);
            console.error('Insert error details:', {
              code: insertError.code,
              message: insertError.message,
              details: insertError.details,
              hint: insertError.hint,
              custom_fields_attempted: Object.keys(sanitizedCustomFields)
            });
            failedRecords++;
            detailedErrors.push(`Row ${rowIndex + 1}: Insert failed - ${insertError.message}`);
          } else if (!insertResult || insertResult.length === 0) {
            console.error(`❌ Insert returned no data for lead ${lead.name}`);
            failedRecords++;
            detailedErrors.push(`Row ${rowIndex + 1}: Insert returned no data`);
          } else {
            console.log(`✅ Successfully inserted lead:`, {
              id: insertResult[0].id,
              name: insertResult[0].name,
              team_id: insertResult[0].team_id,
              custom_fields_saved: Object.keys(insertResult[0].custom_fields || {}).length
            });
            
            // Immediate verification with detailed custom fields analysis
            console.log(`🔍 Custom Fields Verification for Lead ${insertResult[0].id}:`);
            console.log(`   Expected custom fields:`, Object.keys(sanitizedCustomFields));
            console.log(`   Saved custom fields:`, Object.keys(insertResult[0].custom_fields || {}));
            console.log(`   Custom fields match:`, JSON.stringify(insertResult[0].custom_fields) === JSON.stringify(sanitizedCustomFields));
            
            if (insertResult[0].custom_fields) {
              for (const [key, value] of Object.entries(insertResult[0].custom_fields)) {
                console.log(`   ✓ "${key}" = "${value}"`);
              }
            }
            
            // Additional database verification
            try {
              const { data: verifyLead, error: verifyError } = await supabaseAdmin
                .from('leads')
                .select('id, name, custom_fields')
                .eq('id', insertResult[0].id)
                .single();
                
              if (verifyError) {
                console.error(`❌ Verification failed for lead ${insertResult[0].id}:`, verifyError);
              } else {
                console.log(`🔍 Double-verification from database:`);
                console.log(`   Lead exists: ${verifyLead ? 'YES' : 'NO'}`);
                console.log(`   Custom fields count: ${Object.keys(verifyLead.custom_fields || {}).length}`);
                
                // Check if all expected custom fields are present
                const expectedKeys = Object.keys(sanitizedCustomFields);
                const actualKeys = Object.keys(verifyLead.custom_fields || {});
                const missingKeys = expectedKeys.filter(k => !actualKeys.includes(k));
                const extraKeys = actualKeys.filter(k => !expectedKeys.includes(k));
                
                if (missingKeys.length > 0) {
                  console.warn(`⚠️ Missing custom fields: ${missingKeys.join(', ')}`);
                }
                if (extraKeys.length > 0) {
                  console.log(`ℹ️ Extra custom fields: ${extraKeys.join(', ')}`);
                }
              }
            } catch (verifyException) {
              console.warn(`⚠️ Verification exception:`, verifyException);
            }
            
            newRecords++;
            processedRecords++;
          }
        } catch (insertException) {
          console.error(`❌ Insert exception for lead ${lead.name}:`, insertException);
          console.error('Exception stack:', insertException.stack);
          console.error('Exception details:', {
            name: insertException.name,
            message: insertException.message,
            cause: insertException.cause,
            custom_fields_attempted: Object.keys(lead.custom_fields || {})
          });
          failedRecords++;
          detailedErrors.push(`Row ${rowIndex + 1}: Insert exception - ${insertException.message}`);
        }

      } catch (rowError) {
        console.error(`❌ Error processing row ${rowIndex + 1}:`, rowError);
        console.error('Row error stack:', rowError.stack);
        console.log('Problematic row data:', row);
        failedRecords++;
        detailedErrors.push(`Row ${rowIndex + 1}: Processing error - ${rowError.message}`);
      }

      // Log progress every 10 rows
      if ((rowIndex + 1) % 10 === 0) {
        console.log(`📊 Progress: ${rowIndex + 1}/${csvData.length} rows processed (${newRecords} new, ${updatedRecords} updated, ${failedRecords} failed)`);
      }
    }

    // Final verification - check if leads actually exist in database
    console.log('🔍 FINAL VERIFICATION - Checking database for imported leads...');
    try {
      const { data: verificationLeads, error: verificationError } = await supabaseAdmin
        .from('leads')
        .select('id, name, created_at')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (verificationError) {
        console.error('❌ Verification query failed:', verificationError);
      } else {
        const recentLeads = verificationLeads?.filter(lead => {
          const createdTime = new Date(lead.created_at).getTime();
          const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
          return createdTime > fiveMinutesAgo;
        }) || [];

        console.log('✅ Database verification completed');
        console.log(`📊 Total leads in database for team: ${verificationLeads?.length || 0}`);
        console.log(`🕐 Recently created leads (last 5 min): ${recentLeads.length}`);
        console.log('Recent leads:', recentLeads.map(l => ({ id: l.id, name: l.name, created_at: l.created_at })));
      }
    } catch (verificationException) {
      console.error('❌ Verification exception:', verificationException);
    }

    // Update job status if provided
    if (jobId) {
      console.log('📝 Updating import job status...');
      try {
        const finalStatus = failedRecords === 0 ? 'completed' : 'completed_with_errors';
        const { error: jobUpdateError } = await supabaseAdmin
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
              detailed_errors: detailedErrors.slice(0, 10), // Limit error details
              summary: `Import completed: ${newRecords} new, ${updatedRecords} updated, ${duplicateRecords} duplicates, ${failedRecords} failed`
            },
            completed_at: new Date().toISOString()
          })
          .eq('id', jobId);

        if (jobUpdateError) {
          console.warn('⚠️ Could not update job status:', jobUpdateError);
        } else {
          console.log('✅ Job status updated successfully');
        }
      } catch (updateError) {
        console.warn('⚠️ Job update exception:', updateError);
      }
    }

    console.log('=== FINAL IMPORT RESULTS ===');
    console.log(`📊 Total CSV rows processed: ${csvData.length}`);
    console.log(`✅ Successfully processed: ${processedRecords}`);
    console.log(`🆕 New records created: ${newRecords}`);
    console.log(`🔄 Existing records updated: ${updatedRecords}`);
    console.log(`⏭️ Duplicate records skipped: ${duplicateRecords}`);
    console.log(`❌ Failed records: ${failedRecords}`);
    
    if (detailedErrors.length > 0) {
      console.log('❌ Detailed errors:');
      detailedErrors.slice(0, 10).forEach(error => console.log(`  - ${error}`));
      if (detailedErrors.length > 10) {
        console.log(`  ... and ${detailedErrors.length - 10} more errors`);
      }
    }

    const finalResponse = {
      success: true,
      processedRecords: processedRecords,
      newRecords: newRecords,
      updatedRecords: updatedRecords,
      duplicateRecords: duplicateRecords,
      failedRecords: failedRecords,
      totalRows: csvData.length,
      detailedErrors: detailedErrors.slice(0, 5), // Include some errors in response
      message: `Import completed: ${processedRecords}/${csvData.length} leads processed successfully (${newRecords} new, ${updatedRecords} updated)`
    };

    console.log('📤 Sending final response:', finalResponse);

    return new Response(
      JSON.stringify(finalResponse),
      { status: 200, headers: responseHeaders }
    );

  } catch (error) {
    console.error('❌ CRITICAL Edge Function error:', error);
    console.error('Critical error stack:', error.stack);
    console.error('Critical error details:', {
      name: error.name,
      message: error.message,
      cause: error.cause
    });
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        stack: error.stack,
        details: 'Check Edge Function logs for detailed debugging information'
      }),
      { status: 500, headers: responseHeaders }
    );
  }
});
