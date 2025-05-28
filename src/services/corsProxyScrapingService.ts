
import { ScrapingProgress, BusinessData } from '../types/scraping';

export interface CorsProxyScrapingConfig {
  searchQuery: string;
  location: string;
  resultLimit: number;
  onProgress?: (progress: ScrapingProgress) => void;
}

export class CorsProxyScrapingService {
  private static isRunning = false;
  private static abortController?: AbortController;
  private static currentConfig: CorsProxyScrapingConfig | null = null;

  static async startScraping(
    searchQuery: string,
    location: string,
    resultLimit: number,
    onProgress?: (progress: ScrapingProgress) => void
  ): Promise<BusinessData[]> {
    if (this.isRunning) {
      throw new Error('Scraping bereits aktiv');
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    this.currentConfig = { searchQuery, location, resultLimit, onProgress };
    
    try {
      this.sendProgress({
        type: 'scraping_started',
        message: 'CORS-Proxy Scraping gestartet...',
        progress: 0
      });

      const businesses = await this.scrapeWithCorsProxy();
      
      this.sendProgress({
        type: 'scraping_completed',
        message: `Scraping abgeschlossen: ${businesses.length} Unternehmen gefunden`,
        progress: 100,
        data: businesses
      });

      return businesses;
    } catch (error) {
      this.sendProgress({
        type: 'scraping_error',
        error: error instanceof Error ? error.message : 'Unbekannter Fehler beim Scraping'
      });
      throw error;
    } finally {
      this.isRunning = false;
      this.abortController = undefined;
      this.currentConfig = null;
    }
  }

  private static async scrapeWithCorsProxy(): Promise<BusinessData[]> {
    if (!this.currentConfig) throw new Error('No config available');
    
    this.sendProgress({
      type: 'scraping_update',
      message: 'Starte echtes Scraping über Supabase Edge Function...',
      progress: 20
    });

    try {
      const results = await this.callSupabaseEdgeFunction();
      
      if (results && results.length > 0) {
        this.sendProgress({
          type: 'scraping_update',
          message: `${results.length} echte Unternehmen gefunden!`,
          progress: 90
        });
        return results.slice(0, this.currentConfig.resultLimit);
      } else {
        throw new Error('Keine Ergebnisse von Edge Function erhalten');
      }
    } catch (error) {
      console.error('Edge Function Scraping failed:', error);
      this.sendProgress({
        type: 'scraping_error',
        error: `Scraping fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      });
      throw error;
    }
  }

  private static async callSupabaseEdgeFunction(): Promise<BusinessData[]> {
    if (!this.currentConfig) throw new Error('No config available');
    
    this.sendProgress({
      type: 'scraping_update',
      message: 'Rufe Supabase Edge Function auf...',
      progress: 30
    });

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase Konfiguration fehlt');
    }

    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/google-maps-scraper`;
    
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        searchQuery: this.currentConfig.searchQuery,
        location: this.currentConfig.location,
        resultLimit: this.currentConfig.resultLimit,
        userId: 'cors-proxy-scraper'
      }),
      signal: this.abortController?.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge Function Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Edge Function returned no success');
    }

    this.sendProgress({
      type: 'scraping_update',
      message: `Edge Function erfolgreich: ${data.results?.length || 0} Ergebnisse`,
      progress: 80
    });

    return data.results || [];
  }

  

  

  

  private static sendProgress(progress: ScrapingProgress): void {
    if (this.currentConfig?.onProgress) {
      this.currentConfig.onProgress(progress);
    }
  }

  static stopScraping(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isRunning = false;
    this.currentConfig = null;
  }

  static isScrapingActive(): boolean {
    return this.isRunning;
  }
}
