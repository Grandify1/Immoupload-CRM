
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { X, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ImportJob {
  id: string;
  file_name: string;
  status: string;
  total_records: number;
  processed_records: number;
  failed_records: number;
  created_at: string;
}

const ImportStatusBar: React.FC = () => {
  const [activeImports, setActiveImports] = useState<ImportJob[]>([]);

  useEffect(() => {
    const fetchActiveImports = async () => {
      const { data } = await supabase
        .from('import_jobs')
        .select('*')
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false });

      setActiveImports(data || []);
    };

    fetchActiveImports();

    // Poll every 2 seconds for updates
    const interval = setInterval(fetchActiveImports, 2000);

    return () => clearInterval(interval);
  }, []);

  const dismissImport = (importId: string) => {
    setActiveImports(prev => prev.filter(imp => imp.id !== importId));
  };

  if (activeImports.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {activeImports.map((importJob) => {
        const progress = importJob.total_records > 0 
          ? Math.round((importJob.processed_records / importJob.total_records) * 100)
          : 0;

        return (
          <Card key={importJob.id} className="w-80 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  {importJob.status === 'completed' ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : importJob.status === 'failed' ? (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  )}
                  <span className="text-sm font-medium">{importJob.file_name}</span>
                </div>
                <button
                  onClick={() => dismissImport(importJob.id)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              
              <Progress value={progress} className="mb-2" />
              
              <div className="text-xs text-gray-600">
                {importJob.processed_records} von {importJob.total_records} verarbeitet
                {importJob.failed_records > 0 && (
                  <span className="text-red-600 ml-2">
                    ({importJob.failed_records} fehlgeschlagen)
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default ImportStatusBar;
