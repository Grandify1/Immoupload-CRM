
import { supabase } from '@/integrations/supabase/client';

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

export class SimpleCSVImportService {
  
  static async processCSVImport(
    csvData: string[][],
    mappings: MappingType[],
    duplicateConfig: DuplicateHandlingConfig,
    teamId: string,
    userId: string,
    onProgress?: (progress: number, message: string) => void
  ) {
    try {
      onProgress?.(10, 'Starting import...');

      const BATCH_SIZE = 50;
      const totalRows = csvData.length;
      let processedRows = 0;
      let newRecords = 0;
      let updatedRecords = 0;
      let failedRecords = 0;
      const errors: string[] = [];

      // Create import job
      const { data: importJob, error: jobError } = await supabase
        .from('import_jobs')
        .insert({
          file_name: 'csv_import.csv',
          total_records: totalRows,
          processed_records: 0,
          failed_records: 0,
          status: 'processing',
          team_id: teamId,
          created_by: userId,
          undo_status: 'active'
        })
        .select()
        .single();

      if (jobError) {
        console.warn('Could not create import job, continuing without tracking:', jobError);
      }

      onProgress?.(20, 'Processing data...');

      // Process in batches
      for (let batchStart = 0; batchStart < totalRows; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, totalRows);
        const currentBatch = csvData.slice(batchStart, batchEnd);

        for (let i = 0; i < currentBatch.length; i++) {
          try {
            const row = currentBatch[i];
            const rowNumber = batchStart + i + 1;

            // Build lead object
            const leadData: any = {
              team_id: teamId,
              custom_fields: {}
            };

            // Apply mappings
            mappings.forEach((mapping, mappingIndex) => {
              if (mapping.fieldName && mappingIndex < row.length) {
                const value = row[mappingIndex]?.trim();
                if (!value) return;

                const standardFields = ['name', 'email', 'phone', 'website', 'address', 'description', 'status', 'owner_id'];
                
                if (standardFields.includes(mapping.fieldName)) {
                  if (mapping.fieldName === 'status') {
                    const validStatuses = ['potential', 'contacted', 'qualified', 'closed'];
                    leadData[mapping.fieldName] = validStatuses.includes(value.toLowerCase()) ? value.toLowerCase() : 'potential';
                  } else {
                    leadData[mapping.fieldName] = value;
                  }
                } else {
                  leadData.custom_fields[mapping.fieldName] = value;
                }
              }
            });

            // Validate required fields
            if (!leadData.name?.trim()) {
              errors.push(`Row ${rowNumber}: Missing required 'name' field`);
              failedRecords++;
              continue;
            }

            if (!leadData.status) leadData.status = 'potential';

            // Handle duplicates
            let existingLead = null;
            if (duplicateConfig.duplicateDetectionField !== 'none' && leadData[duplicateConfig.duplicateDetectionField]) {
              const { data: duplicate } = await supabase
                .from('leads')
                .select('id, custom_fields')
                .eq('team_id', teamId)
                .eq(duplicateConfig.duplicateDetectionField, leadData[duplicateConfig.duplicateDetectionField])
                .single();

              if (duplicate) existingLead = duplicate;
            }

            // Process duplicate action
            if (existingLead) {
              if (duplicateConfig.duplicateAction === 'skip') {
                processedRows++;
                continue;
              } else if (duplicateConfig.duplicateAction === 'update') {
                const mergedCustomFields = {
                  ...(existingLead.custom_fields || {}),
                  ...leadData.custom_fields
                };

                const { error: updateError } = await supabase
                  .from('leads')
                  .update({
                    ...leadData,
                    custom_fields: mergedCustomFields,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', existingLead.id);

                if (updateError) {
                  errors.push(`Row ${rowNumber}: Update failed - ${updateError.message}`);
                  failedRecords++;
                } else {
                  updatedRecords++;
                  processedRows++;
                }
                continue;
              }
            }

            // Insert new lead
            const { error: insertError } = await supabase
              .from('leads')
              .insert([{
                ...leadData,
                import_job_id: importJob?.id || null
              }]);

            if (insertError) {
              errors.push(`Row ${rowNumber}: Insert failed - ${insertError.message}`);
              failedRecords++;
            } else {
              newRecords++;
              processedRows++;
            }

          } catch (error) {
            const rowNumber = batchStart + i + 1;
            errors.push(`Row ${rowNumber}: Unexpected error - ${error.message}`);
            failedRecords++;
          }
        }

        // Update progress
        const progress = Math.round(20 + (processedRows / totalRows) * 70);
        onProgress?.(progress, `Processed ${processedRows}/${totalRows} rows...`);

        // Update job status
        if (importJob) {
          await supabase
            .from('import_jobs')
            .update({
              processed_records: processedRows,
              failed_records: failedRecords,
              error_details: {
                new_records: newRecords,
                updated_records: updatedRecords,
                failed_records: failedRecords,
                errors: errors.slice(-20) // Only keep last 20 errors
              }
            })
            .eq('id', importJob.id);
        }
      }

      // Final update
      if (importJob) {
        await supabase
          .from('import_jobs')
          .update({
            status: failedRecords === 0 ? 'completed' : 'completed_with_errors',
            processed_records: processedRows,
            failed_records: failedRecords,
            completed_at: new Date().toISOString(),
            error_details: {
              new_records: newRecords,
              updated_records: updatedRecords,
              failed_records: failedRecords,
              errors: errors.slice(-50)
            }
          })
          .eq('id', importJob.id);
      }

      onProgress?.(100, 'Import completed!');

      return {
        success: true,
        processedRecords: processedRows,
        newRecords,
        updatedRecords,
        failedRecords,
        errors: errors.slice(-20),
        jobId: importJob?.id
      };

    } catch (error) {
      console.error('CSV Import Service Error:', error);
      throw new Error(`Import failed: ${error.message}`);
    }
  }
}
