
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Play, Square, Download, Eye, MapPin, Phone, Globe, Star, Clock } from 'lucide-react';

const scraperFormSchema = z.object({
  query: z.string().min(1, 'Suchbegriff ist erforderlich'),
  location: z.string().min(1, 'Standort ist erforderlich'),
  limit: z.number().min(10).max(1000),
});

type ScraperFormData = z.infer<typeof scraperFormSchema>;

interface ScrapedBusiness {
  id: string;
  name: string;
  category: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  openingHours?: string;
  coordinates?: { lat: number; lng: number };
}

interface ScrapingJob {
  id: string;
  query: string;
  location: string;
  limit: number;
  status: 'idle' | 'running' | 'completed' | 'error' | 'stopped';
  progress: number;
  scrapedCount: number;
  startTime?: Date;
  endTime?: Date;
  results: ScrapedBusiness[];
}

export const ScraperView: React.FC = () => {
  const { toast } = useToast();
  const [currentJob, setCurrentJob] = useState<ScrapingJob | null>(null);
  const [jobHistory, setJobHistory] = useState<ScrapingJob[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<ScrapedBusiness | null>(null);

  const form = useForm<ScraperFormData>({
    resolver: zodResolver(scraperFormSchema),
    defaultValues: {
      query: '',
      location: '',
      limit: 100,
    },
  });

  // Simulated scraping function (in real app, this would use Playwright via Electron)
  const simulateScraping = async (formData: ScraperFormData) => {
    const jobId = `job_${Date.now()}`;
    const job: ScrapingJob = {
      id: jobId,
      query: formData.query,
      location: formData.location,
      limit: formData.limit,
      status: 'running',
      progress: 0,
      scrapedCount: 0,
      startTime: new Date(),
      results: [],
    };

    setCurrentJob(job);

    // Simulate scraping progress
    for (let i = 0; i < formData.limit; i++) {
      if (job.status === 'stopped') break;

      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

      // Generate mock business data
      const business: ScrapedBusiness = {
        id: `business_${i}`,
        name: `${formData.query} Business ${i + 1}`,
        category: getRandomCategory(formData.query),
        address: `${formData.location}, Musterstraße ${i + 1}, 80331 München`,
        phone: Math.random() > 0.3 ? `+49 89 ${Math.floor(Math.random() * 9000000) + 1000000}` : undefined,
        website: Math.random() > 0.4 ? `https://www.business${i + 1}.de` : undefined,
        rating: Math.random() > 0.2 ? Math.round((3 + Math.random() * 2) * 10) / 10 : undefined,
        reviewCount: Math.random() > 0.2 ? Math.floor(Math.random() * 500) + 1 : undefined,
        openingHours: Math.random() > 0.3 ? 'Mo-Fr: 9:00-18:00, Sa: 9:00-14:00' : undefined,
        coordinates: {
          lat: 48.1351 + (Math.random() - 0.5) * 0.1,
          lng: 11.5820 + (Math.random() - 0.5) * 0.1,
        },
      };

      job.results.push(business);
      job.scrapedCount = i + 1;
      job.progress = Math.round((i + 1) / formData.limit * 100);

      setCurrentJob({ ...job });
    }

    job.status = 'completed';
    job.endTime = new Date();
    setCurrentJob({ ...job });
    setJobHistory(prev => [job, ...prev]);

    toast({
      title: "Scraping abgeschlossen",
      description: `${job.scrapedCount} Unternehmen erfolgreich extrahiert`,
    });
  };

  const getRandomCategory = (query: string) => {
    const categories = [
      'Restaurant', 'Dienstleistung', 'Einzelhandel', 'Gesundheit', 
      'Bildung', 'Unterhaltung', 'Technologie', 'Beratung'
    ];
    return categories[Math.floor(Math.random() * categories.length)];
  };

  const onSubmit = (data: ScraperFormData) => {
    if (currentJob?.status === 'running') {
      toast({
        title: "Scraping läuft bereits",
        description: "Bitte warten Sie, bis der aktuelle Job abgeschlossen ist.",
        variant: "destructive",
      });
      return;
    }

    simulateScraping(data);
  };

  const stopScraping = () => {
    if (currentJob) {
      setCurrentJob({ ...currentJob, status: 'stopped' });
      toast({
        title: "Scraping gestoppt",
        description: "Der Scraping-Vorgang wurde vom Benutzer gestoppt.",
      });
    }
  };

  const exportToCsv = () => {
    if (!currentJob?.results.length) return;

    const headers = ['Name', 'Kategorie', 'Adresse', 'Telefon', 'Website', 'Bewertung', 'Bewertungen', 'Öffnungszeiten'];
    const csvContent = [
      headers.join(','),
      ...currentJob.results.map(business => [
        `"${business.name}"`,
        `"${business.category}"`,
        `"${business.address}"`,
        `"${business.phone || ''}"`,
        `"${business.website || ''}"`,
        business.rating || '',
        business.reviewCount || '',
        `"${business.openingHours || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `google_maps_scraping_${currentJob.query.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="flex-1 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Google Maps Scraper</h1>
          <p className="text-gray-600">Extrahieren Sie Unternehmensdaten aus Google Maps</p>
        </div>

        {/* Scraping Form */}
        <Card>
          <CardHeader>
            <CardTitle>Neuen Scraping-Job erstellen</CardTitle>
            <CardDescription>
              Geben Sie Ihre Suchkriterien ein, um Unternehmensdaten zu extrahieren
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="query">Suchbegriff</Label>
                  <Input
                    id="query"
                    placeholder="z.B. Friseur, Restaurant, Zahnarzt"
                    {...form.register('query')}
                  />
                  {form.formState.errors.query && (
                    <p className="text-sm text-red-600">{form.formState.errors.query.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Standort</Label>
                  <Input
                    id="location"
                    placeholder="z.B. München, Berlin, Hamburg"
                    {...form.register('location')}
                  />
                  {form.formState.errors.location && (
                    <p className="text-sm text-red-600">{form.formState.errors.location.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="limit">Anzahl Ergebnisse</Label>
                  <Select onValueChange={(value) => form.setValue('limit', parseInt(value))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wählen Sie die Anzahl" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="200">200</SelectItem>
                      <SelectItem value="500">500</SelectItem>
                      <SelectItem value="1000">1000</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2">
                <Button 
                  type="submit" 
                  disabled={currentJob?.status === 'running'}
                  className="flex items-center gap-2"
                >
                  <Play className="h-4 w-4" />
                  Scraping starten
                </Button>
                
                {currentJob?.status === 'running' && (
                  <Button 
                    type="button" 
                    variant="destructive" 
                    onClick={stopScraping}
                    className="flex items-center gap-2"
                  >
                    <Square className="h-4 w-4" />
                    Stoppen
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Current Job Status */}
        {currentJob && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Aktueller Job</span>
                <Badge variant={
                  currentJob.status === 'running' ? 'default' :
                  currentJob.status === 'completed' ? 'secondary' :
                  currentJob.status === 'error' ? 'destructive' : 'outline'
                }>
                  {currentJob.status === 'running' ? 'Läuft' :
                   currentJob.status === 'completed' ? 'Abgeschlossen' :
                   currentJob.status === 'error' ? 'Fehler' :
                   currentJob.status === 'stopped' ? 'Gestoppt' : 'Bereit'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="font-medium">Suchbegriff</p>
                  <p className="text-gray-600">{currentJob.query}</p>
                </div>
                <div>
                  <p className="font-medium">Standort</p>
                  <p className="text-gray-600">{currentJob.location}</p>
                </div>
                <div>
                  <p className="font-medium">Fortschritt</p>
                  <p className="text-gray-600">{currentJob.scrapedCount} / {currentJob.limit}</p>
                </div>
                <div>
                  <p className="font-medium">Status</p>
                  <p className="text-gray-600">{currentJob.progress}% abgeschlossen</p>
                </div>
              </div>
              
              <Progress value={currentJob.progress} className="w-full" />
              
              {currentJob.status === 'completed' && (
                <div className="flex gap-2">
                  <Button onClick={exportToCsv} variant="outline" className="flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Als CSV exportieren
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Results Table */}
        {currentJob?.results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Extrahierte Unternehmen ({currentJob.results.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Kategorie</TableHead>
                      <TableHead>Adresse</TableHead>
                      <TableHead>Bewertung</TableHead>
                      <TableHead>Kontakt</TableHead>
                      <TableHead>Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentJob.results.slice(0, 20).map((business) => (
                      <TableRow key={business.id}>
                        <TableCell className="font-medium">{business.name}</TableCell>
                        <TableCell>{business.category}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{business.address}</TableCell>
                        <TableCell>
                          {business.rating && (
                            <div className="flex items-center gap-1">
                              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                              <span>{business.rating}</span>
                              {business.reviewCount && (
                                <span className="text-gray-500">({business.reviewCount})</span>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {business.phone && (
                              <Badge variant="outline" className="text-xs">
                                <Phone className="h-3 w-3 mr-1" />
                                Tel
                              </Badge>
                            )}
                            {business.website && (
                              <Badge variant="outline" className="text-xs">
                                <Globe className="h-3 w-3 mr-1" />
                                Web
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => setSelectedBusiness(business)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>{business.name}</DialogTitle>
                                <DialogDescription>{business.category}</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-3">
                                    <div className="flex items-start gap-2">
                                      <MapPin className="h-4 w-4 mt-1 text-gray-500" />
                                      <div>
                                        <p className="font-medium">Adresse</p>
                                        <p className="text-sm text-gray-600">{business.address}</p>
                                      </div>
                                    </div>
                                    
                                    {business.phone && (
                                      <div className="flex items-start gap-2">
                                        <Phone className="h-4 w-4 mt-1 text-gray-500" />
                                        <div>
                                          <p className="font-medium">Telefon</p>
                                          <p className="text-sm text-gray-600">{business.phone}</p>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {business.website && (
                                      <div className="flex items-start gap-2">
                                        <Globe className="h-4 w-4 mt-1 text-gray-500" />
                                        <div>
                                          <p className="font-medium">Website</p>
                                          <a 
                                            href={business.website} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-sm text-blue-600 hover:underline"
                                          >
                                            {business.website}
                                          </a>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  
                                  <div className="space-y-3">
                                    {business.rating && (
                                      <div className="flex items-start gap-2">
                                        <Star className="h-4 w-4 mt-1 text-yellow-500" />
                                        <div>
                                          <p className="font-medium">Bewertung</p>
                                          <p className="text-sm text-gray-600">
                                            {business.rating} Sterne 
                                            {business.reviewCount && ` (${business.reviewCount} Bewertungen)`}
                                          </p>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {business.openingHours && (
                                      <div className="flex items-start gap-2">
                                        <Clock className="h-4 w-4 mt-1 text-gray-500" />
                                        <div>
                                          <p className="font-medium">Öffnungszeiten</p>
                                          <p className="text-sm text-gray-600">{business.openingHours}</p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                
                {currentJob.results.length > 20 && (
                  <div className="p-4 text-center text-sm text-gray-600">
                    Zeige 20 von {currentJob.results.length} Ergebnissen. 
                    Exportieren Sie als CSV, um alle Daten zu sehen.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Job History */}
        {jobHistory.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Job-Historie</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {jobHistory.slice(0, 5).map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{job.query} in {job.location}</p>
                      <p className="text-sm text-gray-600">
                        {job.startTime?.toLocaleDateString()} - {job.scrapedCount} Ergebnisse
                      </p>
                    </div>
                    <Badge variant={job.status === 'completed' ? 'secondary' : 'outline'}>
                      {job.status === 'completed' ? 'Abgeschlossen' : job.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
