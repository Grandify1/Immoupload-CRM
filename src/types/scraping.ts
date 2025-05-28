
export interface ScrapingProgress {
  type: 'scraping_started' | 'business_found' | 'scraping_progress' | 'scraping_completed' | 'scraping_error';
  data?: any;
  progress?: number;
  businesses?: BusinessData[];
  error?: string;
}

export interface BusinessData {
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
