import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { X, CheckCircle, AlertCircle, Clock, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ImportJob {
  id: string;
  file_name: string;
  status: string;
  total_records: number;
  processed_records: number;
  failed_records: number;
  created_at: string;
  completed_at?: string;
  error_details?: any;
}

const ImportStatusBar: React.FC = React.memo(() => {
  const [activeImports, setActiveImports] = useState<ImportJob[]>([]);
  const [completedImports, setCompletedImports] = useState<Set<string>>(new Set());
  const [initialLoad, setInitialLoad] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);

  // Optimized: Längere Polling-Intervalle für bessere Performance
  const POLLING_INTERVAL = 5000; // 5 Sekunden statt 2
  const CACHE_DURATION = 3000; // 3 Sekunden Cache

  // Optimized: Memoized status utilities
  const statusUtils = useMemo(() => ({
    getStatusIcon: (status: string) => {
      switch (status) {
        case 'completed':
          return <CheckCircle className="h-4 w-4 text-green-500" />;
        case 'failed':
          return <AlertCircle className="h-4 w-4 text-red-500" />;
        case 'pending':
          return <Clock className="h-4 w-4 text-blue-500" />;
        default:
          return <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
      }
    },
    getStatusText: (status: string) => {
      switch (status) {
        case 'pending': return 'Warteschlange...';
        case 'processing': return 'Importiere...';
        case 'completed': return 'Abgeschlossen';
        case 'failed': return 'Fehlgeschlagen';
        default: return status;
      }
    }
  }), []);

  // Optimized: Cached fetch function with debouncing
  const fetchActiveImports = useCallback(async (forceRefresh = false) => {
    const now = Date.now();

    // Cache check - nur bei Force Refresh oder abgelaufenem Cache laden
    if (!forceRefresh && (now - lastFetchTime) < CACHE_DURATION) {
      console.log('📦 Using cached import jobs data');
      return;
    }

    // Network check
    if (!isOnline) {
      console.log('🚫 Offline - skipping import jobs fetch');
      return;
    }

    try {
      console.log('🔄 Fetching import jobs...');
      setLastFetchTime(now);

      // Optimized: Limit und gezielte Abfrage nur für aktive Jobs
      const { data, error } = await supabase
        .from('import_jobs')
        .select('id, file_name, status, total_records, processed_records, failed_records, created_at, completed_at, error_details')
        .in('status', ['pending', 'processing', 'completed', 'completed_with_errors', 'failed'])
        .order('created_at', { ascending: false })
        .limit(20); // Limit für bessere Performance

      if (error) {
        console.error('Import jobs fetch error:', error);
        return;
      }

      if (!data) {
        console.warn('No data received from import jobs query');
        return;
      }

      console.log(`📋 Found ${data.length} import jobs`);

      // Initial load handling
      if (initialLoad) {
        const allJobIds = data.map(job => job.id);
        console.log('Initial load: marking all existing jobs as seen');
        setCompletedImports(new Set(allJobIds));
        setInitialLoad(false);
      } else {
        // Check for newly completed imports
        data.forEach(job => {
          if ((job.status === 'completed' || job.status === 'completed_with_errors' || job.status === 'failed') 
              && !completedImports.has(job.id)) {

            const jobCompletedAt = new Date(job.completed_at || job.updated_at);
            const timeDiffInSeconds = (now - jobCompletedAt.getTime()) / 1000;

            // Skip sehr neue Imports (innerhalb 30 Sekunden)
            if (timeDiffInSeconds < 30) {
              console.log(`Skipping recent import toast for job ${job.id}`);
              setCompletedImports(prev => new Set([...prev, job.id]));
              return;
            }

            // Show completion toast
            const newRecords = job.error_details?.new_records || job.processed_records;
            const updatedRecords = job.error_details?.updated_records || 0;
            const failedRecords = job.failed_records || 0;

            if (job.status === 'completed' && failedRecords === 0) {
              toast.success('Import erfolgreich abgeschlossen! 🎉', {
                description: `${newRecords} neue Leads erstellt${updatedRecords > 0 ? `, ${updatedRecords} aktualisiert` : ''}`,
                duration: 6000,
                icon: <CheckCircle className="h-5 w-5 text-green-600" />
              });
            } else if (job.status === 'completed_with_errors') {
              toast.warning('Import mit Warnungen abgeschlossen', {
                description: `${newRecords} erstellt, ${updatedRecords} aktualisiert, ${failedRecords} fehlgeschlagen`,
                duration: 8000,
                icon: <AlertCircle className="h-5 w-5 text-yellow-600" />
              });
            } else if (job.status === 'failed') {
              toast.error('Import fehlgeschlagen', {
                description: `Import von ${job.file_name} ist fehlgeschlagen.`,
                duration: 8000,
                icon: <AlertCircle className="h-5 w-5 text-red-600" />
              });
            }

            setCompletedImports(prev => new Set([...prev, job.id]));
          }
        });
      }

      // Optimized: Nur aktive Jobs anzeigen
      const activeJobs = data.filter(job => {
        const isActive = (job.status === 'pending' || job.status === 'processing') && !job.completed_at;
        return isActive;
      });

      console.log(`🟢 Active import jobs: ${activeJobs.length}`);
      setActiveImports(activeJobs);

    } catch (error) {
      console.error('Critical error fetching import jobs:', error);
    }
  }, [completedImports, initialLoad, isOnline, lastFetchTime]);

  // Optimized: Import completion event handler
  const handleImportCompleted = useCallback((event: CustomEvent) => {
    const { importJobId } = event.detail;
    console.log(`Marking import job ${importJobId} as completed`);
    setCompletedImports(prev => new Set([...prev, importJobId]));

    // Optimized: Längeres Timeout für Force Refresh
    setTimeout(() => {
      console.log('🔄 Force refreshing after completion event...');
      fetchActiveImports(true);
    }, 2000);
  }, [fetchActiveImports]);

  // Optimized: Dismiss handler
  const dismissImport = useCallback((importId: string) => {
    setActiveImports(prev => prev.filter(imp => imp.id !== importId));
  }, []);

  // Optimized: Online/Offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log('🌐 Back online - refreshing import jobs');
      fetchActiveImports(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
      console.log('🚫 Gone offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchActiveImports]);

  // Optimized: Event listeners
  useEffect(() => {
    window.addEventListener('importCompleted', handleImportCompleted as EventListener);
    return () => {
      window.removeEventListener('importCompleted', handleImportCompleted as EventListener);
    };
  }, [handleImportCompleted]);

  // Optimized: Main effect mit verbessertem Polling
  useEffect(() => {
    fetchActiveImports(true);

    // Optimized: Längeres Polling-Intervall
    const interval = setInterval(() => {
      if (isOnline) {
        fetchActiveImports();
      }
    }, POLLING_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchActiveImports, isOnline]);

  // Optimized: Memoized render für bessere Performance
  const renderedImports = useMemo(() => {
    return activeImports.map((importJob) => {
      const progress = importJob.total_records > 0 
        ? Math.round((importJob.processed_records / importJob.total_records) * 100)
        : 0;

      return (
        <Card key={importJob.id} className="w-80 shadow-xl border-0 bg-white/95 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                {statusUtils.getStatusIcon(importJob.status)}
                <div className="flex items-center space-x-2">
                  <FileText className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-900 truncate max-w-40" title={importJob.file_name}>
                    {importJob.file_name}
                  </span>
                </div>
              </div>
              <button
                onClick={() => dismissImport(importJob.id)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-gray-700">
                  {statusUtils.getStatusText(importJob.status)}
                </span>
                <span className="text-xs text-gray-500">
                  {progress}%
                </span>
              </div>

              <Progress 
                value={progress} 
                className="h-2 bg-gray-100"
              />

              <div className="flex justify-between text-xs text-gray-600">
                <span>
                  {importJob.processed_records || 0} von {importJob.total_records || 0}
                </span>
                {(importJob.failed_records || 0) > 0 && (
                  <span className="text-red-600 font-medium">
                    {importJob.failed_records} Fehler
                  </span>
                )}
              </div>

              {/* Batch progress für große Imports */}
              {importJob.status === 'processing' && (
                <div className="text-xs text-gray-500 text-center space-y-1">
                  {importJob.error_details?.total_batches && (
                    <div>
                      Batch {importJob.error_details.current_batch || 1} von {importJob.error_details.total_batches}
                    </div>
                  )}
                  {importJob.error_details?.is_multi_batch_import && (
                    <div className="text-blue-600 font-medium">
                      Multi-Batch Import läuft...
                    </div>
                  )}
                  {importJob.error_details?.current_function_call_rows && (
                    <div>
                      Zeilen: {importJob.error_details.current_function_call_rows}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      );
    });
  }, [activeImports, statusUtils, dismissImport]);

  if (activeImports.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-3">
      {renderedImports}
    </div>
  );
});

ImportStatusBar.displayName = 'ImportStatusBar';

export default ImportStatusBar;