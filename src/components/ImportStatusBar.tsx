import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, FileText, CheckCircle, AlertCircle, Clock, Loader2, Undo2, RotateCcw } from 'lucide-react';

interface ImportJob {
  id: string;
  file_name: string;
  total_records: number;
  processed_records: number;
  failed_records: number;
  status: 'processing' | 'completed' | 'completed_with_errors' | 'failed';
  error_details?: {
    progress_percent?: number;
    summary?: string;
    new_records?: number;
    updated_records?: number;
    errors?: string[];
  };
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

const ImportStatusBar: React.FC = React.memo(() => {
  const { team } = useProfile();
  const { toast } = useToast();
  const [activeJobs, setActiveJobs] = useState<ImportJob[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(0);

  // Optimierte Fetch-Funktion mit Caching
  const fetchActiveJobs = useCallback(async () => {
    if (!team?.id) return;

    // Rate Limiting: Max alle 5 Sekunden
    const now = Date.now();
    if (now - lastFetchTime < 5000) return;
    setLastFetchTime(now);

    try {
      const { data, error } = await supabase
        .from('import_jobs')
        .select(`
          id, file_name, total_records, processed_records, 
          failed_records, status, error_details, created_at, 
          updated_at, completed_at
        `)
        .eq('team_id', team.id)
        .in('status', ['processing'])
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('Error fetching import jobs:', error);
        return;
      }

      setActiveJobs(data || []);
    } catch (error) {
      console.error('Failed to fetch import jobs:', error);
    }
  }, [team?.id, lastFetchTime]);

  // Optimierter useEffect mit intelligenter Intervall-Anpassung
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    if (team?.id) {
      // Sofortiger fetch
      fetchActiveJobs();

      // Adaptive Intervalle basierend auf aktiven Jobs
      const setupInterval = () => {
        if (activeJobs.length > 0) {
          // Häufigere Updates bei aktiven Jobs (alle 10 Sekunden)
          intervalId = setInterval(fetchActiveJobs, 10000);
        } else {
          // Seltenere Updates wenn keine aktiven Jobs (alle 30 Sekunden)
          intervalId = setInterval(fetchActiveJobs, 30000);
        }
      };

      timeoutId = setTimeout(setupInterval, 1000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [team?.id, activeJobs.length, fetchActiveJobs]);

  // Real-time Updates mit optimierter Subscription
  useEffect(() => {
    if (!team?.id) return;

    const subscription = supabase
      .channel(`import_jobs_${team.id}`)
      .on('postgres_changes', 
        {
          event: '*',
          schema: 'public',
          table: 'import_jobs',
          filter: `team_id=eq.${team.id}`
        },
        (payload) => {
          console.log('Real-time import job update:', payload);

          // Throttled update - nicht öfter als alle 2 Sekunden
          const now = Date.now();
          if (now - lastFetchTime < 2000) return;

          fetchActiveJobs();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [team?.id, fetchActiveJobs, lastFetchTime]);

  // Memoized visibility logic
  const shouldShowBar = useMemo(() => {
    return activeJobs.length > 0;
  }, [activeJobs.length]);

  useEffect(() => {
    setIsVisible(shouldShowBar);
  }, [shouldShowBar]);

  // Memoized job calculations
  const jobStats = useMemo(() => {
    return activeJobs.map(job => {
      const progressPercent = job.error_details?.progress_percent || 
        (job.total_records > 0 ? Math.round((job.processed_records / job.total_records) * 100) : 0);

      const isCompleted = ['completed', 'completed_with_errors', 'failed'].includes(job.status);

      return {
        ...job,
        progressPercent,
        isCompleted,
        statusIcon: getStatusIcon(job.status),
        statusColor: getStatusColor(job.status)
      };
    });
  }, [activeJobs]);

  const handleDismissJob = useCallback((jobId: string) => {
    setActiveJobs(prev => prev.filter(job => job.id !== jobId));
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md w-full">
      <Card className="shadow-lg border-l-4 border-l-blue-500 bg-white">
        <CardContent className="p-4">
          {jobStats.map((job) => (
            <div key={job.id} className="mb-4 last:mb-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {job.statusIcon}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" title={job.file_name}>
                      {job.file_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {job.processed_records} / {job.total_records} verarbeitet
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <Badge variant="outline" className={job.statusColor}>
                    {getStatusText(job.status)}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDismissJob(job.id)}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Fortschritt</span>
                  <span>{job.progressPercent}%</span>
                </div>
                <Progress value={job.progressPercent} className="h-2" />

                {job.error_details?.summary && (
                  <p className="text-xs text-gray-500 truncate" title={job.error_details.summary}>
                    {job.error_details.summary}
                  </p>
                )}

                {job.failed_records > 0 && (
                  <p className="text-xs text-orange-600">
                    {job.failed_records} Fehler aufgetreten
                  </p>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
});

ImportStatusBar.displayName = 'ImportStatusBar';

// Helper functions für bessere Performance
function getStatusIcon(status: string) {
  switch (status) {
    case 'processing':
      return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'completed_with_errors':
      return <AlertCircle className="h-4 w-4 text-orange-500" />;
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <FileText className="h-4 w-4 text-gray-500" />;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'processing':
      return 'text-blue-600 border-blue-200';
    case 'completed':
      return 'text-green-600 border-green-200';
    case 'completed_with_errors':
      return 'text-orange-600 border-orange-200';
    case 'failed':
      return 'text-red-600 border-red-200';
    default:
      return 'text-gray-600 border-gray-200';
  }
}

function getStatusText(status: string): string {
  switch (status) {
    case 'processing':
      return 'Läuft...';
    case 'completed':
      return 'Fertig';
    case 'completed_with_errors':
      return 'Mit Fehlern';
    case 'failed':
      return 'Fehler';
    default:
      return status;
  }
}

export default ImportStatusBar;