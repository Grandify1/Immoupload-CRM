import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { create } from 'zustand';
import { Search, Download, Play, Square, Trash2, MapPin, Phone, Globe, Star, Clock, Bug, Eye, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { iframeScrapingService } from '@/services/iframeScrapingService';

// Zod Schema für Form Validation
const scraperFormSchema = z.object({
  searchQuery: z.string().min(1, 'Suchbegriff ist erforderlich'),
  location: z.string().min(1, 'Standort ist erforderlich'),
  resultLimit: z.number().min(1).max(1000, 'Maximal 1000 Ergebnisse erlaubt')
});

type ScraperFormData = z.infer<typeof scraperFormSchema>;

// Business Data Interface
interface BusinessData {
  id: string;
  name: string;
  category: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  openingHours?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

// Job Interface
interface ScrapingJob {
  id: string;
  searchQuery: string;
  location: string;
  resultLimit: number;
  status: 'idle' | 'running' | 'completed' | 'error';
  progress: number;
  totalFound: number;
  currentCount: number;
  results: BusinessData[];
  startTime?: Date;
  endTime?: Date;
  errorMessage?: string;
}

// Debug State Interface
interface DebugInfo {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

// Zustand Store
interface ScraperStore {
  currentJob: ScrapingJob | null;
  jobHistory: ScrapingJob[];
  isRunning: boolean;
  showIframeModal: boolean;
  debugLogs: DebugInfo[];
  iframeUrl: string;
  startJob: (formData: ScraperFormData) => void;
  stopJob: () => void;
  clearResults: () => void;
  exportToCsv: (results: BusinessData[]) => void;
  setShowIframeModal: (show: boolean) => void;
  addDebugLog: (log: DebugInfo) => void;
  clearDebugLogs: () => void;
  setIframeUrl: (url: string) => void;
}

const useScraperStore = create<ScraperStore>((set, get) => ({
  currentJob: null,
  jobHistory: [],
  isRunning: false,
  showIframeModal: false,
  debugLogs: [],
  iframeUrl: '',

  addDebugLog: (log: DebugInfo) => {
    set(state => ({
      debugLogs: [log, ...state.debugLogs.slice(0, 99)] // Keep last 100 logs
    }));
  },

  clearDebugLogs: () => {
    set({ debugLogs: [] });
  },

  setShowIframeModal: (show: boolean) => {
    set({ showIframeModal: show });
  },

  setIframeUrl: (url: string) => {
    set({ iframeUrl: url });
  },

  startJob: async (formData: ScraperFormData) => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      toast.error('Benutzer nicht authentifiziert');
      return;
    }

    const store = get();
    store.clearDebugLogs();
    
    store.addDebugLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: '🚀 Starte iframe-basiertes Scraping',
      data: formData
    });

    const jobId = Date.now().toString();
    const newJob: ScrapingJob = {
      id: jobId,
      searchQuery: formData.searchQuery,
      location: formData.location,
      resultLimit: formData.resultLimit,
      status: 'running',
      progress: 0,
      totalFound: 0,
      currentCount: 0,
      results: [],
      startTime: new Date()
    };

    const googleMapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(formData.searchQuery + ' ' + formData.location)}/`;
    
    set({ 
      currentJob: newJob, 
      isRunning: true, 
      showIframeModal: true,
      iframeUrl: googleMapsUrl
    });

    store.addDebugLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: '📍 Google Maps URL erstellt',
      data: { url: googleMapsUrl }
    });

    try {
      // Use iframe scraping service
      const results = await iframeScrapingService.startScraping(
        formData.searchQuery,
        formData.location,
        formData.resultLimit,
        (progress) => {
          store.addDebugLog({
            timestamp: new Date().toISOString(),
            level: 'debug',
            message: `📊 Progress Update: ${progress.type}`,
            data: progress
          });

          const currentState = get();
          if (currentState.currentJob) {
            set({
              currentJob: {
                ...currentState.currentJob,
                progress: progress.progress || 0,
                currentCount: progress.businesses?.length || 0,
                results: progress.businesses || currentState.currentJob.results
              }
            });
          }
        }
      );

      store.addDebugLog({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `✅ Scraping abgeschlossen: ${results.length} Ergebnisse`,
        data: { resultCount: results.length, results: results.slice(0, 3) }
      });

      const completedJob: ScrapingJob = {
        ...newJob,
        status: 'completed',
        progress: 100,
        totalFound: results.length,
        currentCount: results.length,
        results: results,
        endTime: new Date()
      };

      set(state => ({
        currentJob: completedJob,
        isRunning: false,
        jobHistory: [completedJob, ...state.jobHistory.slice(0, 9)]
      }));

      toast.success(`Iframe-Scraping abgeschlossen! ${results.length} Unternehmen gefunden.`);

    } catch (error: any) {
      console.error('❌ Iframe scraping failed:', error);

      store.addDebugLog({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: '❌ Iframe-Scraping fehlgeschlagen',
        data: { error: error.message, stack: error.stack }
      });

      const failedJob: ScrapingJob = {
        ...newJob,
        status: 'error',
        progress: 0,
        errorMessage: error.message || 'Iframe-Scraping fehlgeschlagen',
        endTime: new Date()
      };

      set({ currentJob: failedJob, isRunning: false });
      toast.error('Iframe-Scraping fehlgeschlagen: ' + (error.message || 'Iframe-Scraping Fehler'));
    }
  },

  stopJob: () => {
    const store = get();
    store.addDebugLog({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message: '⏹️ Scraping gestoppt durch Benutzer'
    });
    
    // Stop the iframe scraping if it's running
    iframeScrapingService.stopScraping();
    set({ 
      currentJob: null, 
      isRunning: false,
      showIframeModal: false
    });
  },

  clearResults: () => {
    set({ currentJob: null, isRunning: false });
  },

  exportToCsv: (results: BusinessData[]) => {
    const headers = ['Name', 'Kategorie', 'Adresse', 'Telefon', 'Website', 'Bewertung', 'Bewertungen', 'Öffnungszeiten'];
    const csvContent = [
      headers.join(','),
      ...results.map(item => [
        `"${item.name}"`,
        `"${item.category}"`,
        `"${item.address}"`,
        `"${item.phone || ''}"`,
        `"${item.website || ''}"`,
        item.rating || '',
        item.reviewCount || '',
        `"${item.openingHours || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `google-maps-scraper-${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('CSV-Export erfolgreich!');
  }
}));



export default function ScraperView() {
  const { user } = useAuth();
  const { 
    currentJob, 
    jobHistory, 
    isRunning, 
    showIframeModal,
    debugLogs,
    iframeUrl,
    startJob, 
    stopJob, 
    clearResults, 
    exportToCsv,
    setShowIframeModal,
    addDebugLog,
    clearDebugLogs
  } = useScraperStore();
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessData | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const form = useForm<ScraperFormData>({
    resolver: zodResolver(scraperFormSchema),
    defaultValues: {
      searchQuery: '',
      location: '',
      resultLimit: 50
    }
  });

  const onSubmit = (data: ScraperFormData) => {
    startJob(data);
    toast.success('Scraping gestartet...');
  };

  const handleStop = () => {
    stopJob();
    toast.info('Scraping gestoppt');
  };

  const formatDuration = (start?: Date, end?: Date) => {
    if (!start) return '';
    const endTime = end || new Date();
    const duration = Math.round((endTime.getTime() - start.getTime()) / 1000);
    return `${duration}s`;
  };

  return (
    <div className="h-full flex flex-col space-y-6 overflow-hidden">
      <div className="flex items-center justify-between flex-shrink-0">
        <h1 className="text-2xl font-bold">Google Maps Scraper</h1>
        <Badge variant={isRunning ? "default" : "secondary"}>
          {isRunning ? 'Läuft' : 'Bereit'}
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pr-2">

      {/* Scraping Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Neuen Scraping-Job starten
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="searchQuery">Suchbegriff</Label>
                <Input
                  id="searchQuery"
                  placeholder="z.B. Friseur, Restaurant, Zahnarzt..."
                  {...form.register('searchQuery')}
                  disabled={isRunning}
                />
                {form.formState.errors.searchQuery && (
                  <p className="text-sm text-red-500">{form.formState.errors.searchQuery.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Standort</Label>
                <Input
                  id="location"
                  placeholder="z.B. München, Berlin, Hamburg..."
                  {...form.register('location')}
                  disabled={isRunning}
                />
                {form.formState.errors.location && (
                  <p className="text-sm text-red-500">{form.formState.errors.location.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resultLimit">Anzahl Ergebnisse</Label>
              <Select
                value={form.watch('resultLimit')?.toString()}
                onValueChange={(value) => form.setValue('resultLimit', parseInt(value))}
                disabled={isRunning}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wähle die Anzahl..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50 Ergebnisse</SelectItem>
                  <SelectItem value="100">100 Ergebnisse</SelectItem>
                  <SelectItem value="200">200 Ergebnisse</SelectItem>
                  <SelectItem value="500">500 Ergebnisse</SelectItem>
                  <SelectItem value="1000">1000 Ergebnisse</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              {!isRunning ? (
                <Button type="submit" className="flex items-center gap-2">
                  <Play className="w-4 h-4" />
                  Scraping starten
                </Button>
              ) : (
                <Button type="button" variant="destructive" onClick={handleStop} className="flex items-center gap-2">
                  <Square className="w-4 h-4" />
                  Stoppen
                </Button>
              )}

              {currentJob && !isRunning && (
                <Button type="button" variant="outline" onClick={clearResults} className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Ergebnisse löschen
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Job Status */}
      {currentJob && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Aktueller Job</span>
              <Badge variant={currentJob.status === 'completed' ? 'default' : 'secondary'}>
                {currentJob.status === 'running' ? 'Läuft' : 
                 currentJob.status === 'completed' ? 'Abgeschlossen' : 
                 currentJob.status === 'error' ? 'Fehler' : 'Bereit'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Suche:</strong> {currentJob.searchQuery} in {currentJob.location}
              </div>
              <div>
                <strong>Fortschritt:</strong> {currentJob.currentCount} / {currentJob.resultLimit}
              </div>
              <div>
                <strong>Gefunden:</strong> {currentJob.totalFound} Unternehmen
              </div>
              <div>
                <strong>Dauer:</strong> {formatDuration(currentJob.startTime, currentJob.endTime)}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Fortschritt</span>
                <span>{Math.round(currentJob.progress)}%</span>
              </div>
              <Progress value={currentJob.progress} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debug Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bug className="w-5 h-5" />
              Debug Panel
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={() => setShowDebugPanel(!showDebugPanel)} 
                variant="outline" 
                size="sm"
                className="flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                {showDebugPanel ? 'Verbergen' : 'Anzeigen'}
              </Button>
              <Button 
                onClick={clearDebugLogs} 
                variant="outline" 
                size="sm"
                className="flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Logs löschen
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        {showDebugPanel && (
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {debugLogs.length === 0 ? (
                <p className="text-gray-500 italic">Keine Debug-Logs verfügbar</p>
              ) : (
                debugLogs.map((log, index) => (
                  <div 
                    key={index} 
                    className={`p-2 rounded text-sm border-l-4 ${
                      log.level === 'error' ? 'border-red-500 bg-red-50' :
                      log.level === 'warn' ? 'border-yellow-500 bg-yellow-50' :
                      log.level === 'info' ? 'border-blue-500 bg-blue-50' :
                      'border-gray-500 bg-gray-50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-xs text-gray-600">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`text-xs px-1 rounded ${
                        log.level === 'error' ? 'bg-red-200 text-red-800' :
                        log.level === 'warn' ? 'bg-yellow-200 text-yellow-800' :
                        log.level === 'info' ? 'bg-blue-200 text-blue-800' :
                        'bg-gray-200 text-gray-800'
                      }`}>
                        {log.level.toUpperCase()}
                      </span>
                    </div>
                    <div className="mt-1">{log.message}</div>
                    {log.data && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-gray-600">Data anzeigen</summary>
                        <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                          {JSON.stringify(log.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Results Table */}
      {currentJob?.results && currentJob.results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Ergebnisse ({currentJob.results.length})</span>
              <Button 
                onClick={() => exportToCsv(currentJob.results)} 
                variant="outline" 
                size="sm"
                className="flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                CSV Export
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Kategorie</TableHead>
                    <TableHead>Adresse</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Bewertung</TableHead>
                    <TableHead>Website</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentJob.results.map((business) => (
                    <TableRow 
                      key={business.id} 
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => setSelectedBusiness(business)}
                    >
                      <TableCell className="font-medium">{business.name}</TableCell>
                      <TableCell>{business.category}</TableCell>
                      <TableCell className="max-w-xs truncate">{business.address}</TableCell>
                      <TableCell>
                        {business.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {business.phone}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {business.rating && (
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                            {business.rating} ({business.reviewCount})
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {business.website && (
                          <div className="flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            <span className="truncate max-w-xs">{business.website}</span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job History */}
      {jobHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Job-Verlauf</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {jobHistory.map((job) => (
                <div key={job.id} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex-1">
                    <div className="font-medium">{job.searchQuery} in {job.location}</div>
                    <div className="text-sm text-gray-500">
                      {job.results.length} Ergebnisse • {formatDuration(job.startTime, job.endTime)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={job.status === 'completed' ? 'default' : 'secondary'}>
                      {job.status}
                    </Badge>
                    {job.results.length > 0 && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => exportToCsv(job.results)}
                      >
                        Export
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Business Detail Modal */}
      {selectedBusiness && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{selectedBusiness.name}</span>
                <Button variant="ghost" size="sm" onClick={() => setSelectedBusiness(null)}>
                  ✕
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Kategorie</Label>
                  <p>{selectedBusiness.category}</p>
                </div>
                <div>
                  <Label>Bewertung</Label>
                  {selectedBusiness.rating && (
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      {selectedBusiness.rating} ({selectedBusiness.reviewCount} Bewertungen)
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label>Adresse</Label>
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-1" />
                  <p>{selectedBusiness.address}</p>
                </div>
              </div>

              {selectedBusiness.phone && (
                <div>
                  <Label>Telefon</Label>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    <a href={`tel:${selectedBusiness.phone}`} className="text-blue-600 hover:underline">
                      {selectedBusiness.phone}
                    </a>
                  </div>
                </div>
              )}

              {selectedBusiness.website && (
                <div>
                  <Label>Website</Label>
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    <a 
                      href={`https://${selectedBusiness.website}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {selectedBusiness.website}
                    </a>
                  </div>
                </div>
              )}

              {selectedBusiness.openingHours && (
                <div>
                  <Label>Öffnungszeiten</Label>
                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 mt-1" />
                    <p>{selectedBusiness.openingHours}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Iframe Debug Modal */}
      {showIframeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-6xl h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Google Maps Iframe Debug</h2>
              <div className="flex items-center gap-2">
                <Badge variant={isRunning ? "default" : "secondary"}>
                  {isRunning ? 'Scraping läuft...' : 'Bereit'}
                </Badge>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowIframeModal(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div className="flex-1 p-4">
              <div className="mb-4">
                <Label>Aktuelle URL:</Label>
                <Input value={iframeUrl} readOnly className="mt-1" />
              </div>
              
              <div className="border rounded-lg h-full">
                <iframe
                  ref={iframeRef}
                  src={iframeUrl}
                  className="w-full h-full rounded-lg"
                  sandbox="allow-scripts allow-same-origin allow-top-navigation allow-forms"
                  onLoad={() => {
                    addDebugLog({
                      timestamp: new Date().toISOString(),
                      level: 'info',
                      message: '📱 Iframe geladen',
                      data: { url: iframeUrl }
                    });
                  }}
                  onError={(e) => {
                    addDebugLog({
                      timestamp: new Date().toISOString(),
                      level: 'error',
                      message: '❌ Iframe Ladefehler',
                      data: { error: e }
                    });
                  }}
                />
              </div>
            </div>
            
            <div className="p-4 border-t bg-gray-50">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  Status: {currentJob?.status || 'Unbekannt'} | 
                  Fortschritt: {Math.round(currentJob?.progress || 0)}% | 
                  Gefunden: {currentJob?.currentCount || 0} Unternehmen
                </div>
                <div className="flex gap-2">
                  {isRunning ? (
                    <Button variant="destructive" onClick={stopJob}>
                      <Square className="w-4 h-4 mr-2" />
                      Stoppen
                    </Button>
                  ) : (
                    <Button onClick={() => setShowIframeModal(false)}>
                      Schließen
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}