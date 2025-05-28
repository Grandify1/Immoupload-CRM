
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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { csvData, mappings, duplicateConfig, teamId, userId, jobId } = await req.json()

    console.log(`Starting background import: ${csvData.length} rows, job ${jobId}`)
    console.log('Team ID:', teamId)
    console.log('User ID:', userId)
    console.log('Duplicate config:', duplicateConfig)
    console.log('Mappings received:', mappings.length)
    console.log('Sample mapping:', mappings[0])

    // Update job status to processing
    if (jobId) {
      await supabaseAdmin
        .from('import_jobs')
        .update({ status: 'processing' })
        .eq('id', jobId)
    }

    let processedRecords = 0
    let failedRecords = 0
    let duplicateRecords = 0
    let updatedRecords = 0

    // Standard fields mapping
    const standardFields = ['name', 'email', 'phone', 'website', 'address', 'description', 'status', 'owner_id']

    // Convert CSV data to leads
    const leads = []
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

          console.log(`Processing field: ${mapping.fieldName} = ${value}`)

          // Check if it's a standard field
          if (standardFields.includes(mapping.fieldName)) {
            if (mapping.fieldName === 'status' && !['potential', 'contacted', 'qualified', 'closed'].includes(value)) {
              lead[mapping.fieldName] = 'potential'
            } else {
              lead[mapping.fieldName] = value
            }
            console.log(`Mapped standard field: ${mapping.fieldName} = ${value}`)
          } else {
            // All non-standard fields go to custom_fields
            lead.custom_fields[mapping.fieldName] = value
            console.log(`Mapped custom field: ${mapping.fieldName} = ${value}`)
          }
        }
      })

      // Ensure we have at least a name to create the lead
      if (lead.name && lead.name.trim()) {
        leads.push(lead)
        console.log(`Added lead: ${lead.name} with ${Object.keys(lead.custom_fields).length} custom fields`)
      } else {
        console.log('Skipped lead without name:', lead)
      }
    }

    console.log(`Converted ${leads.length} leads with proper field mapping`)
    if (leads.length > 0) {
      console.log('Sample converted lead:', JSON.stringify(leads[0], null, 2))
    }

    console.log(`Processed ${leads.length} valid leads from CSV data`)

    // Process leads with duplicate handling
    const batchSize = 50
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize)
      
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
              if (!error || error.code !== 'PGRST116') {
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
              // Update existing lead
              const updateData = {
                updated_at: new Date().toISOString()
              }

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
              // Insert new lead anyway
              console.log(`Creating new lead despite duplicate: ${lead.name}`)
              const { error: insertError, data: insertedData } = await supabaseAdmin
                .from('leads')
                .insert([lead])
                .select()

              if (insertError) {
                console.error('Insert error for duplicate handling:', lead.name, insertError)
                if (insertError.code === '23505') {
                  duplicateRecords++
                } else {
                  failedRecords++
                }
              } else {
                console.log(`Successfully created new lead: ${lead.name}`)
                processedRecords++
              }
            }
          } else {
            // Insert new lead
            console.log(`Inserting lead: ${lead.name}`)
            console.log('Lead data to insert:', JSON.stringify(lead, null, 2))
            
            const { error: insertError, data: insertedData } = await supabaseAdmin
              .from('leads')
              .insert([lead])
              .select()

            if (insertError) {
              console.error('Insert error for lead:', lead.name, insertError)
              console.error('Full insert error details:', insertError)
              if (insertError.code === '23505') {
                duplicateRecords++
              } else {
                failedRecords++
              }
            } else {
              console.log(`Successfully inserted lead: ${lead.name}`)
              console.log('Inserted data:', insertedData)
              processedRecords++
            }
          }

        } catch (error) {
          console.error('Processing error:', error)
          failedRecords++
        }
      }

      // Update progress periodically
      if (jobId && (i % 100 === 0 || i + batchSize >= leads.length)) {
        await supabaseAdmin
          .from('import_jobs')
          .update({ 
            processed_records: processedRecords,
            failed_records: failedRecords 
          })
          .eq('id', jobId)
      }
    }

    // Final update
    const finalStatus = failedRecords === 0 ? 'completed' : 'completed_with_errors'
    const newRecords = processedRecords - updatedRecords
    
    if (jobId) {
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
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId)
    }

    console.log(`Import completed: ${processedRecords} processed, ${failedRecords} failed`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        processedRecords, 
        failedRecords, 
        duplicateRecords, 
        updatedRecords,
        newRecords 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge Function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
