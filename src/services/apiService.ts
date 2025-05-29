
import { supabase } from '@/integrations/supabase/client';

export interface ImportJobProgress {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'completed_with_errors' | 'failed' | 'paused';
  processed_records: number;
  total_records: number;
  failed_records: number;
  error_details?: any;
  file_name: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface ImportResult {
  success: boolean;
  processedRecords: number;
  newRecords: number;
  updatedRecords: number;
  failedRecords: number;
  jobId: string;
  message?: string;
}

export class APIService {
  
  static async importCSVData(
    csvData: string[][],
    mappings: any[],
    duplicateConfig: any,
    teamId: string,
    userId: string,
    fileName: string
  ): Promise<{ success: boolean; jobId: string; message?: string }> {
    try {
      console.log('🚀 Starting CSV import via backend API...');
      
      // Create import job first
      const { data: job, error: jobError } = await supabase
        .from('import_jobs')
        .insert({
          team_id: teamId,
          created_by: userId,
          file_name: fileName,
          total_records: csvData.length,
          status: 'pending'
        })
        .select()
        .single();

      if (jobError) {
        console.error('❌ Failed to create import job:', jobError);
        throw new Error(`Failed to create import job: ${jobError.message}`);
      }

      console.log(`✅ Import job created: ${job.id}`);

      // Call Supabase Edge Function via supabase client (handles CORS automatically)
      const { data: result, error: invokeError } = await supabase.functions.invoke('csv-import', {
        body: {
          csvData,
          mappings,
          duplicateConfig,
          teamId,
          userId,
          jobId: job.id,
          startRow: 0,
          isInitialRequest: true
        }
      });

      if (invokeError) {
        console.error('❌ Edge function invoke error:', invokeError);
        
        // Update job status to failed
        await supabase
          .from('import_jobs')
          .update({
            status: 'failed',
            error_details: {
              summary: 'Import request failed',
              error: invokeError.message,
              details: invokeError
            },
            completed_at: new Date().toISOString()
          })
          .eq('id', job.id);
          
        throw new Error(`Import failed: ${invokeError.message}`);
      }

      console.log('✅ CSV import response:', result);

      if (result?.success) {
        return {
          success: true,
          jobId: job.id,
          message: `Import started successfully. Processing ${csvData.length} records.`
        };
      } else {
        // Update job status to failed
        await supabase
          .from('import_jobs')
          .update({
            status: 'failed',
            error_details: {
              summary: 'Import processing failed',
              error: result?.error || 'Unknown error',
              details: result
            },
            completed_at: new Date().toISOString()
          })
          .eq('id', job.id);
          
        throw new Error(`Import failed: ${result?.error || 'Unknown error'}`);
      }

    } catch (error) {
      console.error('❌ CSV Import API Service Error:', error);
      throw new Error(`Import failed: ${error.message}`);
    }
  }

  static async getImportJobStatus(jobId: string): Promise<ImportJobProgress | null> {
    try {
      const { data, error } = await supabase
        .from('import_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) {
        console.error('❌ Failed to fetch import job status:', error);
        return null;
      }

      return data as ImportJobProgress;
    } catch (error) {
      console.error('❌ Error fetching import job status:', error);
      return null;
    }
  }

  static async getImportJobs(teamId: string, limit: number = 20): Promise<ImportJobProgress[]> {
    try {
      const { data, error } = await supabase
        .from('import_jobs')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('❌ Failed to fetch import jobs:', error);
        return [];
      }

      return data as ImportJobProgress[];
    } catch (error) {
      console.error('❌ Error fetching import jobs:', error);
      return [];
    }
  }

  static async resumeFailedImport(jobId: string, lastProcessedRow?: number): Promise<{ success: boolean; message?: string }> {
    try {
      console.log(`🔄 Resuming failed import: ${jobId}`);

      // Get the original job data
      const { data: job, error: jobError } = await supabase
        .from('import_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (jobError || !job) {
        throw new Error('Import job not found');
      }

      if (!job.error_details?.original_data) {
        throw new Error('Original import data not found - cannot resume');
      }

      const originalData = job.error_details.original_data;
      
      // Call Supabase Edge Function via supabase client
      const { data: result, error: invokeError } = await supabase.functions.invoke('csv-import', {
        body: {
          ...originalData,
          jobId: jobId,
          startRow: lastProcessedRow || job.processed_records || 0,
          isInitialRequest: false,
          resumeFromError: true,
          lastProcessedRow: lastProcessedRow || job.processed_records || 0
        }
      });

      if (invokeError) {
        throw new Error(`Resume request failed: ${invokeError.message}`);
      }

      console.log('✅ Resume import response:', result);

      if (result?.success) {
        return {
          success: true,
          message: `Import resumed successfully from row ${lastProcessedRow || job.processed_records || 0}.`
        };
      } else {
        throw new Error(`Resume failed: ${result?.error || 'Unknown error'}`);
      }

    } catch (error) {
      console.error('❌ Resume import error:', error);
      throw new Error(`Resume failed: ${error.message}`);
    }
  }
}
