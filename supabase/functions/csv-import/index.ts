
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🚀 Starting CSV import Edge Function')
    
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let requestBody
    try {
      requestBody = await req.json()
    } catch (error) {
      console.error('❌ Invalid JSON in request:', error)
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const { csvData, mappings, duplicateConfig, teamId, userId, jobId } = requestBody

    if (!csvData || !mappings || !teamId || !userId) {
      console.error('❌ Missing required parameters')
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log(`✅ Request validated: ${csvData.length} rows, ${mappings.length} mappings`)
    console.log('Team ID:', teamId)
    console.log('User ID:', userId)
    console.log('Job ID:', jobId)

    // Update job status to processing
    if (jobId) {
      const { error: jobUpdateError } = await supabaseAdmin
        .from('import_jobs')
        .update({ status: 'processing' })
        .eq('id', jobId)
      
      if (jobUpdateError) {
        console.warn('⚠️ Could not update job status:', jobUpdateError)
      } else {
        console.log('✅ Job status updated to processing')
      }
    }

    let processedRecords = 0
    let failedRecords = 0
    let duplicateRecords = 0
    let updatedRecords = 0

    // Standard fields mapping
    const standardFields = ['name', 'email', 'phone', 'website', 'address', 'description', 'status', 'owner_id']

    // Load all custom fields for the team
    console.log('📋 Loading custom fields for team:', teamId)
    const { data: customFields, error: customFieldsError } = await supabaseAdmin
      .from('custom_fields')
      .select('*')
      .eq('entity_type', 'lead')

    if (customFieldsError) {
      console.error('❌ Error loading custom fields:', customFieldsError)
    } else {
      console.log(`✅ Loaded ${customFields?.length || 0} custom fields`)
    }

    const customFieldsMap = new Map()
    if (customFields) {
      customFields.forEach(field => {
        const normalizedName = field.name.toLowerCase().replace(/\s+/g, '_')
        customFieldsMap.set(field.name, field)
        customFieldsMap.set(normalizedName, field)
        customFieldsMap.set(field.id, field)
      })
      console.log('Custom fields map created with', customFieldsMap.size, 'entries')
    }

    // Convert CSV data to leads
    console.log('🔄 Converting CSV data to leads...')
    const leads = []
    let rowsProcessed = 0

    for (const row of csvData) {
      const lead = {
        custom_fields: {},
        team_id: teamId,
        status: 'potential'
      }

      mappings.forEach((mapping, index) => {
        if (mapping.fieldName && index < row.length) {
          const value = row[index]?.trim()
          if (!value) return

          // Check if it's a standard field
          if (standardFields.includes(mapping.fieldName)) {
            if (mapping.fieldName === 'status' && !['potential', 'contacted', 'qualified', 'closed'].includes(value)) {
              lead[mapping.fieldName] = 'potential'
            } else {
              lead[mapping.fieldName] = value
            }
          } else {
            // Handle custom fields
            if (mapping.createCustomField) {
              lead.custom_fields[mapping.fieldName] = value
            } else {
              const customField = customFieldsMap.get(mapping.fieldName) ||
                                customFieldsMap.get(mapping.fieldName.toLowerCase()) ||
                                customFieldsMap.get(mapping.fieldName.toLowerCase().replace(/\s+/g, '_'))

              if (customField) {
                lead.custom_fields[customField.name] = value
              } else {
                lead.custom_fields[mapping.fieldName] = value
              }
            }
          }
        }
      })

      // Ensure we have at least a name to create the lead
      if (lead.name && lead.name.trim()) {
        leads.push(lead)
      } else {
        failedRecords++
      }
      
      rowsProcessed++
      if (rowsProcessed % 1000 === 0) {
        console.log(`Processed ${rowsProcessed}/${csvData.length} rows`)
      }
    }

    console.log(`✅ Converted ${leads.length} valid leads from ${csvData.length} CSV rows`)

    // Process leads with duplicate handling
    console.log('💾 Starting database inserts...')
    const batchSize = 100
    let batchNumber = 0
    
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize)
      batchNumber++
      
      console.log(`Processing batch ${batchNumber} (${batch.length} leads)`)
      
      for (const lead of batch) {
        try {
          let existingLead = null
          
          // Check for duplicates based on configuration
          if (duplicateConfig.duplicateDetectionField !== 'none') {
            const detectionField = duplicateConfig.duplicateDetectionField
            const detectionValue = lead[detectionField]

            if (detectionValue && detectionValue.trim()) {
              let query = supabaseAdmin
                .from('leads')
                .select('id, name, email, phone, website, address, description, status, custom_fields')
                .eq('team_id', teamId)

              if (detectionField === 'name') {
                query = query.eq('name', detectionValue.trim())
              } else if (detectionField === 'email') {
                query = query.eq('email', detectionValue.trim())
              } else if (detectionField === 'phone') {
                query = query.eq('phone', detectionValue.trim())
              }

              const { data, error } = await query.single()
              if (!error && data) {
                existingLead = data
              }
            }
          }

          if (existingLead) {
            // Handle duplicate
            if (duplicateConfig.duplicateAction === 'skip') {
              duplicateRecords++
              continue
            } else if (duplicateConfig.duplicateAction === 'update') {
              const updateData = { updated_at: new Date().toISOString() }

              if (lead.name && lead.name !== existingLead.name) updateData.name = lead.name
              if (lead.email && lead.email !== existingLead.email) updateData.email = lead.email
              if (lead.phone && lead.phone !== existingLead.phone) updateData.phone = lead.phone
              if (lead.website && lead.website !== existingLead.website) updateData.website = lead.website
              if (lead.address && lead.address !== existingLead.address) updateData.address = lead.address
              if (lead.description && lead.description !== existingLead.description) updateData.description = lead.description
              if (lead.status && lead.status !== existingLead.status) updateData.status = lead.status

              if (lead.custom_fields && Object.keys(lead.custom_fields).length > 0) {
                updateData.custom_fields = {
                  ...(existingLead.custom_fields || {}),
                  ...lead.custom_fields
                }
              }

              const { error: updateError } = await supabaseAdmin
                .from('leads')
                .update(updateData)
                .eq('id', existingLead.id)

              if (updateError) {
                console.error('Update error:', updateError)
                failedRecords++
              } else {
                updatedRecords++
                processedRecords++
              }
            } else if (duplicateConfig.duplicateAction === 'create_new') {
              const { error: insertError } = await supabaseAdmin
                .from('leads')
                .insert([lead])

              if (insertError) {
                console.error('Insert error for duplicate handling:', insertError)
                if (insertError.code === '23505') {
                  duplicateRecords++
                } else {
                  failedRecords++
                }
              } else {
                processedRecords++
              }
            }
          } else {
            // Insert new lead
            const { error: insertError } = await supabaseAdmin
              .from('leads')
              .insert([lead])

            if (insertError) {
              console.error('Insert error:', insertError)
              if (insertError.code === '23505') {
                duplicateRecords++
              } else {
                failedRecords++
              }
            } else {
              processedRecords++
            }
          }

        } catch (error) {
          console.error('Processing error for lead:', error)
          failedRecords++
        }
      }

      // Update progress periodically
      if (jobId && batchNumber % 5 === 0) {
        const currentProgress = Math.round(((i + batchSize) / leads.length) * 100)
        console.log(`Progress: ${currentProgress}%`)
        
        try {
          await supabaseAdmin
            .from('import_jobs')
            .update({ 
              processed_records: processedRecords,
              failed_records: failedRecords 
            })
            .eq('id', jobId)
        } catch (progressError) {
          console.warn('Could not update progress:', progressError)
        }
      }
    }

    // Final update
    const finalStatus = failedRecords === 0 ? 'completed' : 'completed_with_errors'
    const newRecords = processedRecords - updatedRecords
    
    console.log('=== FINAL IMPORT RESULTS ===')
    console.log(`✅ Import completed successfully!`)
    console.log(`📊 Total leads processed: ${processedRecords}`)
    console.log(`🆕 New records: ${newRecords}`)
    console.log(`🔄 Updated records: ${updatedRecords}`)
    console.log(`⏭️ Duplicate records skipped: ${duplicateRecords}`)
    console.log(`❌ Failed records: ${failedRecords}`)
    console.log(`📈 Final status: ${finalStatus}`)
    
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
              summary: `Import completed successfully: ${newRecords} new, ${updatedRecords} updated, ${duplicateRecords} skipped, ${failedRecords} failed`
            },
            completed_at: new Date().toISOString()
          })
          .eq('id', jobId)
      } catch (finalUpdateError) {
        console.warn('Could not update final job status:', finalUpdateError)
      }
    }

    console.log(`🎉 CSV Import completed successfully!`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Import completed successfully',
        processedRecords, 
        failedRecords, 
        duplicateRecords, 
        updatedRecords,
        newRecords,
        status: finalStatus
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('❌ Critical Edge Function error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        details: error.stack
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      }
    )
  }
})
