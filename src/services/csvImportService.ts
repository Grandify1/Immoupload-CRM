
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

export class CSVImportService {
  
  static async importCSVData(
    csvData: string[][],
    mappings: any[],
    duplicateConfig: any,
    teamId: string,
    userId: string,
    fileName: string
  ): Promise<{ success: boolean; jobId: string; message?: string }> {
    try {
      console.log('🚀 Starting CSV import with cURL approach...');
      
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

      // Prepare the payload for cURL command
      const payload = {
        csvData,
        mappings,
        duplicateConfig,
        teamId,
        userId,
        jobId: job.id,
        startRow: 0,
        isInitialRequest: true
      };

      // Execute cURL command
      const curlCommand = `curl -L -X POST 'https://eycydigvwfqapjxssvqc.supabase.co/functions/v1/csv-import' \\
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5Y3lkaWd2d2ZxYXBqeHNzdnFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxODMxOTUsImV4cCI6MjA2Mzc1OTE5NX0.YbPnhnt0qLAVhffOU5yGBRt-2hMjsc9NEGyeIViwQac' \\
  -H 'Content-Type: application/json' \\
  --data '${JSON.stringify(payload).replace(/'/g, "\\'")}'`;

      console.log('📤 Executing cURL command for CSV import...');
      
      // Execute the cURL command using fetch as fallback (since we can't execute shell commands directly in browser)
      // But we'll structure it to be more reliable
      const response = await fetch('https://eycydigvwfqapjxssvqc.supabase.co/functions/v1/csv-import', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5Y3lkaWd2d2ZxYXBqeHNzdnFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxODMxOTUsImV4cCI6MjA2Mzc1OTE5NX0.YbPnhnt0qLAVhffOU5yGBRt-2hMjsc9NEGyeIViwQac',
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ cURL-style request failed:', response.status, errorText);
        
        // Update job status to failed
        await supabase
          .from('import_jobs')
          .update({
            status: 'failed',
            error_details: {
              summary: 'Import request failed',
              error: errorText,
              status_code: response.status
            },
            completed_at: new Date().toISOString()
          })
          .eq('id', job.id);
          
        throw new Error(`Import request failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ cURL-style CSV import response:', result);

      if (result.success) {
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
              error: result.error || 'Unknown error',
              details: result
            },
            completed_at: new Date().toISOString()
          })
          .eq('id', job.id);
          
        throw new Error(`Import failed: ${result.error || 'Unknown error'}`);
      }

    } catch (error) {
      console.error('❌ CSV Import Service Error:', error);
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
      const resumePayload = {
        ...originalData,
        jobId: jobId,
        startRow: lastProcessedRow || job.processed_records || 0,
        isInitialRequest: false,
        resumeFromError: true,
        lastProcessedRow: lastProcessedRow || job.processed_records || 0
      };

      // Execute resume request with cURL approach
      const response = await fetch('https://eycydigvwfqapjxssvqc.supabase.co/functions/v1/csv-import', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5Y3lkaWd2d2ZxYXBqeHNzdnFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxODMxOTUsImV4cCI6MjA2Mzc1OTE5NX0.YbPnhnt0qLAVhffOU5yGBRt-2hMjsc9NEGyeIViwQac',
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(resumePayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Resume request failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ Resume import response:', result);

      if (result.success) {
        return {
          success: true,
          message: `Import resumed successfully from row ${lastProcessedRow || job.processed_records || 0}.`
        };
      } else {
        throw new Error(`Resume failed: ${result.error || 'Unknown error'}`);
      }

    } catch (error) {
      console.error('❌ Resume import error:', error);
      throw new Error(`Resume failed: ${error.message}`);
    }
  }

  static logCurlCommand(payload: any): void {
    const curlCommand = `curl -L -X POST 'https://eycydigvwfqapjxssvqc.supabase.co/functions/v1/csv-import' \\
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5Y3lkaWd2d2ZxYXBqeHNzdnFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxODMxOTUsImV4cCI6MjA2Mzc1OTE5NX0.YbPnhnt0qLAVhffOU5yGBRt-2hMjsc9NEGyeIViwQac' \\
  -H 'Content-Type: application/json' \\
  --data '${JSON.stringify(payload).replace(/'/g, "\\'")}'`;
    
    console.log('📋 Equivalent cURL command:');
    console.log(curlCommand);
  }
}
