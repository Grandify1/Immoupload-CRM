
import React, { useState, useEffect } from 'react';
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
  error_details?: any;
}

const ImportStatusBar: React.FC = () => {
  const [activeImports, setActiveImports] = useState<ImportJob[]>([]);
  const [completedImports, setCompletedImports] = useState<Set<string>>(new Set());
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    // Listen for import completion events from CSVImport component
    const handleImportCompleted = (event: CustomEvent) => {
      const { importJobId } = event.detail;
      console.log(`Marking import job ${importJobId} as completed to prevent duplicate toast`);
      setCompletedImports(prev => new Set([...prev, importJobId]));
      
      // CRITICAL FIX: Force immediate refresh to remove the job from active list
      setTimeout(() => {
        console.log('🔄 Force refreshing import jobs after completion event...');
        fetchActiveImports();
      }, 1000);
    };

    const fetchActiveImports = async () => {
      try {
        console.log('🔄 Fetching import jobs...');
        const { data } = await supabase
          .from('import_jobs')
          .select('*')
          .in('status', ['pending', 'processing', 'completed', 'completed_with_errors', 'failed'])
          .order('created_at', { ascending: false });

        if (data) {
          console.log(`📋 Found ${data.length} import jobs total`);
          
          // On initial load, mark all imports as already seen to prevent duplicate toasts
          if (initialLoad) {
            const allJobIds = data.map(job => job.id);
            console.log('Initial load: marking all existing jobs as seen:', allJobIds);
            setCompletedImports(new Set(allJobIds));
            setInitialLoad(false);
          } else {
            // Check for newly completed imports (only show toast for new completions)
            data.forEach(job => {
              if ((job.status === 'completed' || job.status === 'completed_with_errors' || job.status === 'failed') && !completedImports.has(job.id)) {
                
                // Check if this is a very recent import (completed within last 30 seconds)
                // If so, skip the automatic toast as the CSVImport component already showed one
                const jobCompletedAt = new Date(job.completed_at || job.updated_at);
                const now = new Date();
                const timeDiffInSeconds = (now.getTime() - jobCompletedAt.getTime()) / 1000;
                
                // Skip automatic toast for very recent imports (likely from current session)
                if (timeDiffInSeconds < 30) {
                  console.log(`Skipping automatic toast for recent import job ${job.id} (completed ${timeDiffInSeconds}s ago)`);
                  setCompletedImports(prev => new Set([...prev, job.id]));
                  return;
                }

                // Show completion toast for older imports (from page refresh or background jobs)
                const newRecords = job.error_details?.new_records || job.processed_records;
                const updatedRecords = job.error_details?.updated_records || 0;
                const failedRecords = job.failed_records || 0;

                if (job.status === 'completed' && failedRecords === 0) {
                  toast.success('Import erfolgreich abgeschlossen! 🎉', {
                    description: `${newRecords} neue Leads erstellt${updatedRecords > 0 ? `, ${updatedRecords} aktualisiert` : ''}`,
                    duration: 6000,
                    className: 'bg-green-50 border-green-200',
                    style: {
                      background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                      borderColor: '#22c55e',
                    },
                    icon: <CheckCircle className="h-5 w-5 text-green-600" />
                  });
                } else if (job.status === 'completed_with_errors') {
                  toast.warning('Import mit Warnungen abgeschlossen', {
                    description: `${newRecords} erstellt, ${updatedRecords} aktualisiert, ${failedRecords} fehlgeschlagen`,
                    duration: 8000,
                    className: 'bg-yellow-50 border-yellow-200',
                    style: {
                      background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                      borderColor: '#f59e0b',
                    },
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

          // Only show active imports in the status bar (pending or processing)
          // CRITICAL FIX: Add completed_at check to ensure truly completed jobs are not shown
          const activeJobs = data.filter(job => {
            const isActive = (job.status === 'pending' || job.status === 'processing') && !job.completed_at;
            console.log(`Job ${job.id}: status=${job.status}, completed_at=${job.completed_at}, isActive=${isActive}`);
            return isActive;
          });
          
          console.log(`🟢 Active import jobs: ${activeJobs.length}`);
          if (activeJobs.length > 0) {
            console.log('Active jobs details:', activeJobs.map(job => ({
              id: job.id,
              status: job.status,
              fileName: job.file_name,
              processed: job.processed_records,
              total: job.total_records,
              completed_at: job.completed_at
            })));
          } else {
            console.log('No active jobs - all imports completed or failed');
          }
          
          setActiveImports(activeJobs);
        }
      } catch (error) {
        console.error('Error fetching import jobs:', error);
      }
    };

    window.addEventListener('importCompleted', handleImportCompleted as EventListener);
    
    return () => {
      window.removeEventListener('importCompleted', handleImportCompleted as EventListener);
    };
  }, []);

  useEffect(() => {
    const fetchActiveImports = async () => {
      try {
        console.log('🔄 Fetching import jobs...');
        const { data } = await supabase
          .from('import_jobs')
          .select('*')
          .in('status', ['pending', 'processing', 'completed', 'completed_with_errors', 'failed'])
          .order('created_at', { ascending: false });

        if (data) {
          console.log(`📋 Found ${data.length} import jobs total`);
          
          // On initial load, mark all imports as already seen to prevent duplicate toasts
          if (initialLoad) {
            const allJobIds = data.map(job => job.id);
            console.log('Initial load: marking all existing jobs as seen:', allJobIds);
            setCompletedImports(new Set(allJobIds));
            setInitialLoad(false);
          } else {
            // Check for newly completed imports (only show toast for new completions)
            data.forEach(job => {
              if ((job.status === 'completed' || job.status === 'completed_with_errors' || job.status === 'failed') && !completedImports.has(job.id)) {
                
                // Check if this is a very recent import (completed within last 30 seconds)
                // If so, skip the automatic toast as the CSVImport component already showed one
                const jobCompletedAt = new Date(job.completed_at || job.updated_at);
                const now = new Date();
                const timeDiffInSeconds = (now.getTime() - jobCompletedAt.getTime()) / 1000;
                
                // Skip automatic toast for very recent imports (likely from current session)
                if (timeDiffInSeconds < 30) {
                  console.log(`Skipping automatic toast for recent import job ${job.id} (completed ${timeDiffInSeconds}s ago)`);
                  setCompletedImports(prev => new Set([...prev, job.id]));
                  return;
                }

                // Show completion toast for older imports (from page refresh or background jobs)
                const newRecords = job.error_details?.new_records || job.processed_records;
                const updatedRecords = job.error_details?.updated_records || 0;
                const failedRecords = job.failed_records || 0;

                if (job.status === 'completed' && failedRecords === 0) {
                  toast.success('Import erfolgreich abgeschlossen! 🎉', {
                    description: `${newRecords} neue Leads erstellt${updatedRecords > 0 ? `, ${updatedRecords} aktualisiert` : ''}`,
                    duration: 6000,
                    className: 'bg-green-50 border-green-200',
                    style: {
                      background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                      borderColor: '#22c55e',
                    },
                    icon: <CheckCircle className="h-5 w-5 text-green-600" />
                  });
                } else if (job.status === 'completed_with_errors') {
                  toast.warning('Import mit Warnungen abgeschlossen', {
                    description: `${newRecords} erstellt, ${updatedRecords} aktualisiert, ${failedRecords} fehlgeschlagen`,
                    duration: 8000,
                    className: 'bg-yellow-50 border-yellow-200',
                    style: {
                      background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                      borderColor: '#f59e0b',
                    },
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

          // Only show active imports in the status bar (pending or processing)
          // CRITICAL FIX: Add completed_at check to ensure truly completed jobs are not shown
          const activeJobs = data.filter(job => {
            const isActive = (job.status === 'pending' || job.status === 'processing') && !job.completed_at;
            console.log(`Job ${job.id}: status=${job.status}, completed_at=${job.completed_at}, isActive=${isActive}`);
            return isActive;
          });
          
          console.log(`🟢 Active import jobs: ${activeJobs.length}`);
          if (activeJobs.length > 0) {
            console.log('Active jobs details:', activeJobs.map(job => ({
              id: job.id,
              status: job.status,
              fileName: job.file_name,
              processed: job.processed_records,
              total: job.total_records,
              completed_at: job.completed_at
            })));
          } else {
            console.log('No active jobs - all imports completed or failed');
          }
          
          setActiveImports(activeJobs);
        }
      } catch (error) {
        console.error('Error fetching import jobs:', error);
      }
    };

    fetchActiveImports();

    // Poll every 2 seconds for more responsive updates
    const interval = setInterval(fetchActiveImports, 2000);

    return () => clearInterval(interval);
  }, [completedImports, initialLoad]);

  const dismissImport = (importId: string) => {
    setActiveImports(prev => prev.filter(imp => imp.id !== importId));
  };

  const getStatusIcon = (status: string) => {
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
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Warteschlange...';
      case 'processing':
        return 'Importiere...';
      case 'completed':
        return 'Abgeschlossen';
      case 'failed':
        return 'Fehlgeschlagen';
      default:
        return status;
    }
  };

  if (activeImports.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-3">
      {activeImports.map((importJob) => {
        const progress = importJob.total_records > 0 
          ? Math.round((importJob.processed_records / importJob.total_records) * 100)
          : 0;

        return (
          <Card key={importJob.id} className="w-80 shadow-xl border-0 bg-white/95 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(importJob.status)}
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
                    {getStatusText(importJob.status)}
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
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default ImportStatusBar;
