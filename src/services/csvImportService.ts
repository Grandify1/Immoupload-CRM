import { APIService } from './apiService';

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

export class CSVImportService {

  static async importCSVData(
    csvData: string[][],
    mappings: any[],
    duplicateConfig: any,
    teamId: string,
    userId: string,
    fileName: string
  ): Promise<{ success: boolean; jobId: string; message?: string }> {
    return APIService.importCSVData(csvData, mappings, duplicateConfig, teamId, userId, fileName);
  }

  static async getImportJobStatus(jobId: string): Promise<ImportJobProgress | null> {
    return APIService.getImportJobStatus(jobId);
  }

  static async getImportJobs(teamId: string, limit: number = 20): Promise<ImportJobProgress[]> {
    return APIService.getImportJobs(teamId, limit);
  }

  static async resumeFailedImport(jobId: string, lastProcessedRow?: number): Promise<{ success: boolean; message?: string }> {
    return APIService.resumeFailedImport(jobId, lastProcessedRow);
  }
}

// Export als SimpleCSVImportService für Kompatibilität
export class SimpleCSVImportService {
  static async processCSVImport(
    csvData: string[][],
    mappings: any[],
    duplicateConfig: any,
    teamId: string,
    userId: string,
    progressCallback?: (progress: number, message: string) => void
  ): Promise<ImportResult> {
    try {
      console.log('🚀 Starting SimpleCSVImportService.processCSVImport via backend API...');

      // Fortschritt-Callback initial aufrufen
      if (progressCallback) {
        progressCallback(0, 'Import wird gestartet...');
      }

      // Erstelle einen temporären Dateinamen
      const fileName = `import_${Date.now()}.csv`;

      // Rufe den APIService auf (verwendet supabase.functions.invoke statt fetch)
      const result = await APIService.importCSVData(
        csvData,
        mappings,
        duplicateConfig,
        teamId,
        userId,
        fileName
      );

      if (progressCallback) {
        progressCallback(50, 'Import-Job wurde erstellt, verarbeite Daten...');
      }

      // Enhanced progress tracking for large imports
      let currentProgress = 10;
      let statusCheckCount = 0;
      const maxStatusChecks = 300; // 10 minutes at 2-second intervals

      const statusCheckInterval = setInterval(async () => {
        try {
          statusCheckCount++;
          const jobStatus = await APIService.getImportJobStatus(result.jobId);

          if (jobStatus) {
            const progressPercent = jobStatus.total_records > 0 
              ? Math.round((jobStatus.processed_records / jobStatus.total_records) * 100)
              : currentProgress;
            
            currentProgress = Math.max(currentProgress, Math.min(progressPercent, 95));

            if (progressCallback) {
              let statusMessage = '';
              
              if (jobStatus.status === 'processing') {
                const rate = statusCheckCount > 0 ? jobStatus.processed_records / (statusCheckCount * 2) : 0;
                const remaining = jobStatus.total_records - jobStatus.processed_records;
                const estimatedMinutes = rate > 0 ? Math.ceil((remaining / rate) / 60) : 0;
                
                statusMessage = `Verarbeite ${jobStatus.processed_records}/${jobStatus.total_records} Leads`;
                if (estimatedMinutes > 0 && estimatedMinutes < 60) {
                  statusMessage += ` (≈${estimatedMinutes}min verbleibend)`;
                }
                
                if (jobStatus.failed_records > 0) {
                  statusMessage += ` • ${jobStatus.failed_records} Fehler`;
                }
              } else {
                statusMessage = `Status: ${jobStatus.status}`;
              }
              
              progressCallback(currentProgress, statusMessage);
            }

            // Stop monitoring when completed
            if (jobStatus.status === 'completed' || 
                jobStatus.status === 'completed_with_errors' || 
                jobStatus.status === 'failed') {
              clearInterval(statusCheckInterval);

              if (progressCallback) {
                const finalMessage = jobStatus.status === 'completed' 
                  ? `✅ Import abgeschlossen! ${jobStatus.processed_records} Leads importiert`
                  : jobStatus.status === 'completed_with_errors'
                  ? `⚠️ Import mit ${jobStatus.failed_records} Fehlern abgeschlossen`
                  : `❌ Import fehlgeschlagen`;
                
                progressCallback(100, finalMessage);
              }
            }
          }

          // Stop after max attempts
          if (statusCheckCount >= maxStatusChecks) {
            clearInterval(statusCheckInterval);
            if (progressCallback) {
              progressCallback(95, 'Import läuft noch... Prüfen Sie später den Status.');
            }
          }

        } catch (error) {
          console.warn('Status check error:', error);
          statusCheckCount++;
        }
      }, 1000); // Check every second instead of every 2 seconds

      // Return das erwartete Format
      return {
        success: result.success,
        processedRecords: csvData.length,
        newRecords: 0, // Wird durch Status-Updates aktualisiert
        updatedRecords: 0, // Wird durch Status-Updates aktualisiert
        failedRecords: 0, // Wird durch Status-Updates aktualisiert
        jobId: result.jobId,
        message: result.message
      };

    } catch (error) {
      console.error('❌ SimpleCSVImportService.processCSVImport Error:', error);
      throw new Error(`Import failed: ${error.message}`);
    }
  }

  // Delegiere andere Methoden an APIService
  static async getImportJobStatus(jobId: string): Promise<ImportJobProgress | null> {
    return APIService.getImportJobStatus(jobId);
  }

  static async getImportJobs(teamId: string, limit: number = 20): Promise<ImportJobProgress[]> {
    return APIService.getImportJobs(teamId, limit);
  }

  static async resumeFailedImport(jobId: string, lastProcessedRow?: number): Promise<{ success: boolean; message?: string }> {
    return APIService.resumeFailedImport(jobId, lastProcessedRow);
  }
}