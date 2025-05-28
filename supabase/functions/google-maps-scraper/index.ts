
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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
  // CORS preflight handling
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Add CORS headers to all responses
  const responseHeaders = {
    ...corsHeaders,
    'Content-Type': 'application/json',
  };

  try {
    console.log('🚀 Google Maps Scraper Edge Function started');

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: responseHeaders }
      );
    }

    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch (error) {
      console.error('❌ Invalid JSON in request body:', error);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: responseHeaders }
      );
    }

    const { searchQuery, location, resultLimit, userId }: ScrapingRequest = body;

    // Validate required fields
    if (!searchQuery || !location || !resultLimit || !userId) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields', 
          required: ['searchQuery', 'location', 'resultLimit', 'userId'] 
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    console.log(`🔍 Processing: "${searchQuery}" in "${location}" for user ${userId}`);

    // Initialize Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (!Deno.env.get('SUPABASE_URL') || !Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      console.error('❌ Missing Supabase environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: responseHeaders }
      );
    }

    // Create job record with error handling
    let job;
    try {
      const { data: jobData, error: jobError } = await supabaseAdmin
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
          JSON.stringify({ 
            error: 'Failed to create scraping job', 
            details: jobError.message 
          }),
          { status: 500, headers: responseHeaders }
        );
      }

      job = jobData;
      console.log(`✅ Job created: ${job.id}`);
    } catch (error) {
      console.error('❌ Unexpected error during job creation:', error);
      return new Response(
        JSON.stringify({ 
          error: 'Unexpected error during job creation', 
          details: error.message 
        }),
        { status: 500, headers: responseHeaders }
      );
    }

    // Generate business data (mock implementation)
    try {
      const results = generateBusinessData(searchQuery, location, resultLimit);
      console.log(`✅ Generated ${results.length} business results`);

      // Update job with results
      const { error: updateError } = await supabaseAdmin
        .from('scraping_jobs')
        .update({
          status: 'completed',
          progress: 100,
          total_found: results.length,
          results: results,
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id);

      if (updateError) {
        console.error('❌ Failed to update job:', updateError);
        // Don't return error here, as we still have results
      }

      console.log(`✅ Scraping completed with ${results.length} results`);

      return new Response(
        JSON.stringify({
          success: true,
          jobId: job.id,
          results: results,
          totalFound: results.length
        }),
        { status: 200, headers: responseHeaders }
      );

    } catch (error) {
      console.error('❌ Error generating business data:', error);
      
      // Update job with error status
      try {
        await supabaseAdmin
          .from('scraping_jobs')
          .update({
            status: 'failed',
            error_message: error.message,
            completed_at: new Date().toISOString()
          })
          .eq('id', job.id);
      } catch (updateError) {
        console.error('❌ Failed to update job with error status:', updateError);
      }

      return new Response(
        JSON.stringify({ 
          error: 'Failed to generate business data', 
          details: error.message 
        }),
        { status: 500, headers: responseHeaders }
      );
    }

  } catch (error) {
    console.error('❌ Critical Edge Function error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        stack: error.stack
      }),
      { status: 500, headers: responseHeaders }
    );
  }
});

function generateBusinessData(searchQuery: string, location: string, resultLimit: number): BusinessData[] {
  const businesses: BusinessData[] = [];
  const categories = getBusinessCategories(searchQuery);
  const baseNames = getBusinessNames(searchQuery);
  const cityCoords = getCityCoordinates(location);

  const limit = Math.min(resultLimit, 100); // Cap at 100 for performance

  for (let i = 0; i < limit; i++) {
    const businessName = `${baseNames[i % baseNames.length]} ${i > baseNames.length ? i : ''}`.trim();
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
    return ['Zur Goldenen Gans', 'Bella Vista', 'Gasthaus Schmidt', 'Ristorante Milano', 'Zum Adler', 'La Piazza'];
  }
  if (query.includes('friseur')) {
    return ['Haarstudio Müller', 'Salon Chic', 'Hair Design', 'Coiffeur Elite', 'Schere & Kamm', 'Beauty Point'];
  }
  if (query.includes('apotheke')) {
    return ['Stadt-Apotheke', 'Rosen-Apotheke', 'Apotheke am Markt', 'Neue Apotheke', 'Zentral-Apotheke'];
  }

  return ['Meisterbetrieb Wagner', 'Service Center', 'Fachgeschäft Weber', 'Profi Service', 'Expert Lösung'];
}

function getStreetName(): string {
  const streets = [
    'Hauptstraße', 'Bahnhofstraße', 'Kirchgasse', 'Marktplatz', 'Bergstraße',
    'Königstraße', 'Schulstraße', 'Gartenstraße', 'Friedhofstraße', 'Mühlenweg'
  ];
  return streets[Math.floor(Math.random() * streets.length)];
}

function generatePhoneNumber(): string {
  const areaCodes = ['030', '089', '040', '0221', '0711', '0511'];
  const areaCode = areaCodes[Math.floor(Math.random() * areaCodes.length)];
  const number = Math.floor(Math.random() * 90000000) + 10000000;
  const numberStr = number.toString();
  return `${areaCode} ${numberStr.substring(0, 3)} ${numberStr.substring(3, 6)}`;
}

function generateWebsite(businessName: string): string {
  const cleanName = businessName.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[äöü]/g, (match) => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue' }[match] || match))
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');

  return `https://www.${cleanName}.de`;
}

function generateOpeningHours(): string {
  const options = [
    'Mo-Fr: 9:00-18:00',
    'Mo-Fr: 8:00-19:00, Sa: 10:00-16:00',
    'Mo-Sa: 9:00-20:00',
    'Mo-Fr: 7:30-18:30, Sa: 9:00-14:00',
    'Mo-Do: 9:00-18:00, Fr: 9:00-19:00, Sa: 10:00-16:00'
  ];
  return options[Math.floor(Math.random() * options.length)];
}

function getCityCoordinates(location: string): { lat: number; lng: number } {
  const coordinates: { [key: string]: { lat: number; lng: number } } = {
    'münchen': { lat: 48.1351, lng: 11.5820 },
    'munich': { lat: 48.1351, lng: 11.5820 },
    'berlin': { lat: 52.5200, lng: 13.4050 },
    'hamburg': { lat: 53.5511, lng: 9.9937 },
    'köln': { lat: 50.9375, lng: 6.9603 },
    'cologne': { lat: 50.9375, lng: 6.9603 },
    'frankfurt': { lat: 50.1109, lng: 8.6821 },
    'stuttgart': { lat: 48.7758, lng: 9.1829 },
    'düsseldorf': { lat: 51.2277, lng: 6.7735 },
    'dortmund': { lat: 51.5136, lng: 7.4653 }
  };

  const cityKey = location.toLowerCase();
  return coordinates[cityKey] || { lat: 52.5200, lng: 13.4050 }; // Default to Berlin
}
