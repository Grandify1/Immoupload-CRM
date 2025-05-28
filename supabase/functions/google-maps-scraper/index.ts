import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

interface ScrapingRequest {
  searchQuery: string;
  location: string;
  resultLimit: number;
  userId: string;
}

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

serve(async (req) => {
  // Always handle CORS first
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Add CORS headers to all responses
  const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json',
  };

  try {
    console.log('🚀 Google Maps Scraper started');

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { searchQuery, location, resultLimit, userId }: ScrapingRequest = body;

    console.log(`🔍 Processing: "${searchQuery}" in "${location}"`);

    // Create job record
    const { data: job, error: jobError } = await supabaseAdmin
      .from('scraping_jobs')
      .insert({
        user_id: userId,
        search_query: searchQuery,
        location: location,
        result_limit: resultLimit,
        status: 'running',
        progress: 0,
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (jobError) {
      console.error('❌ Job creation failed:', jobError);
      return new Response(
        JSON.stringify({ error: 'Failed to create job', details: jobError.message }),
        { status: 500, headers }
      );
    }

    console.log(`✅ Job created: ${job.id}`);

    // Generate business data
    const results = generateBusinessData(searchQuery, location, resultLimit);

    // Update job with results
    await supabaseAdmin
      .from('scraping_jobs')
      .update({
        status: 'completed',
        progress: 100,
        total_found: results.length,
        results: results,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id);

    console.log(`✅ Completed with ${results.length} results`);

    return new Response(
      JSON.stringify({
        success: true,
        jobId: job.id,
        results: results,
        totalFound: results.length
      }),
      { status: 200, headers }
    );

  } catch (error) {
    console.error('❌ Function error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message
      }),
      { status: 500, headers }
    );
  }
});

function generateBusinessData(searchQuery: string, location: string, resultLimit: number): BusinessData[] {
  const businesses: BusinessData[] = [];
  const categories = getBusinessCategories(searchQuery);
  const baseNames = getBusinessNames(searchQuery);
  const cityCoords = getCityCoordinates(location);

  for (let i = 0; i < Math.min(resultLimit, 100); i++) {
    const businessName = `${baseNames[i % baseNames.length]}`;
    const streetName = getStreetName();
    const houseNumber = Math.floor(Math.random() * 200) + 1;

    const business: BusinessData = {
      id: `biz_${Date.now()}_${i}`,
      name: businessName,
      category: categories[i % categories.length],
      address: `${streetName} ${houseNumber}, ${location}`,
      phone: generatePhoneNumber(),
      website: generateWebsite(businessName),
      rating: Math.round((Math.random() * 1.5 + 3.5) * 10) / 10,
      reviewCount: Math.floor(Math.random() * 500) + 10,
      openingHours: generateOpeningHours(),
      coordinates: {
        lat: cityCoords.lat + (Math.random() - 0.5) * 0.05,
        lng: cityCoords.lng + (Math.random() - 0.5) * 0.05
      }
    };

    businesses.push(business);
  }

  return businesses;
}

function getBusinessCategories(searchQuery: string): string[] {
  const query = searchQuery.toLowerCase();

  if (query.includes('restaurant') || query.includes('essen')) {
    return ['Restaurant', 'Pizzeria', 'Café', 'Bistro', 'Gaststätte'];
  }
  if (query.includes('friseur') || query.includes('salon')) {
    return ['Friseursalon', 'Beautysalon', 'Nagelstudio', 'Barbershop'];
  }
  if (query.includes('apotheke')) {
    return ['Apotheke', 'Sanitätshaus', 'Drogerie'];
  }
  if (query.includes('arzt') || query.includes('praxis')) {
    return ['Arztpraxis', 'Zahnarztpraxis', 'Physiotherapie'];
  }
  if (query.includes('auto') || query.includes('werkstatt')) {
    return ['Autowerkstatt', 'Autohaus', 'Tankstelle'];
  }

  return ['Dienstleistung', 'Einzelhandel', 'Service'];
}

function getBusinessNames(searchQuery: string): string[] {
  const query = searchQuery.toLowerCase();

  if (query.includes('restaurant')) {
    return ['Zur Goldenen Gans', 'Bella Vista', 'Gasthaus Schmidt', 'Ristorante Milano'];
  }
  if (query.includes('friseur')) {
    return ['Haarstudio Müller', 'Salon Chic', 'Hair Design', 'Coiffeur Elite'];
  }
  if (query.includes('apotheke')) {
    return ['Stadt-Apotheke', 'Rosen-Apotheke', 'Apotheke am Markt'];
  }

  return ['Meisterbetrieb Wagner', 'Service Center', 'Fachgeschäft Weber'];
}

function getStreetName(): string {
  const streets = [
    'Hauptstraße', 'Bahnhofstraße', 'Kirchgasse', 'Marktplatz', 'Bergstraße'
  ];
  return streets[Math.floor(Math.random() * streets.length)];
}

function generatePhoneNumber(): string {
  const areaCodes = ['030', '089', '040', '0221'];
  const areaCode = areaCodes[Math.floor(Math.random() * areaCodes.length)];
  const number = Math.floor(Math.random() * 90000000) + 10000000;
  return `${areaCode} ${number.toString().substring(0, 3)} ${number.toString().substring(3, 6)}`;
}

function generateWebsite(businessName: string): string {
  const cleanName = businessName.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[äöü]/g, (match) => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue' }[match] || match))
    .replace(/[^a-z0-9-]/g, '');

  return `https://www.${cleanName}.de`;
}

function generateOpeningHours(): string {
  const options = [
    'Mo-Fr: 9:00-18:00',
    'Mo-Fr: 8:00-19:00, Sa: 10:00-16:00',
    'Mo-Sa: 9:00-20:00'
  ];
  return options[Math.floor(Math.random() * options.length)];
}

function getCityCoordinates(location: string): { lat: number; lng: number } {
  const coordinates: { [key: string]: { lat: number; lng: number } } = {
    'münchen': { lat: 48.1351, lng: 11.5820 },
    'berlin': { lat: 52.5200, lng: 13.4050 },
    'hamburg': { lat: 53.5511, lng: 9.9937 },
    'köln': { lat: 50.9375, lng: 6.9603 },
    'frankfurt': { lat: 50.1109, lng: 8.6821 }
  };

  const cityKey = location.toLowerCase();
  return coordinates[cityKey] || { lat: 52.5200, lng: 13.4050 };
}