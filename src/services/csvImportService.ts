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

      // Überwache den Import-Status
      let currentProgress = 50;
      const statusCheckInterval = setInterval(async () => {
        try {
          const jobStatus = await APIService.getImportJobStatus(result.jobId);

          if (jobStatus) {
            const progressPercent = Math.round((jobStatus.processed_records / jobStatus.total_records) * 100);
            currentProgress = Math.max(currentProgress, progressPercent);

            if (progressCallback) {
              const statusMessage = jobStatus.status === 'processing' 
                ? `Verarbeite... ${jobStatus.processed_records}/${jobStatus.total_records} Leads`
                : `Status: ${jobStatus.status}`;
              progressCallback(currentProgress, statusMessage);
            }

            // Stoppe Überwachung wenn abgeschlossen
            if (jobStatus.status === 'completed' || 
                jobStatus.status === 'completed_with_errors' || 
                jobStatus.status === 'failed') {
              clearInterval(statusCheckInterval);

              if (progressCallback) {
                progressCallback(100, 'Import abgeschlossen!');
              }
            }
          }
        } catch (error) {
          console.warn('Status check error:', error);
        }
      }, 2000); // Prüfe alle 2 Sekunden

      // Stoppe Status-Überwachung nach 5 Minuten
      setTimeout(() => {
        clearInterval(statusCheckInterval);
      }, 300000);

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