import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { searchQuery, location, resultLimit, userId }: ScrapingRequest = await req.json()

    console.log(`🔍 Starting Google Maps search for: "${searchQuery}" in "${location}"`)

    // Create scraping job record
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
      .single()

    if (jobError) {
      throw jobError
    }

    // Update progress
    await supabaseAdmin
      .from('scraping_jobs')
      .update({ progress: 25 })
      .eq('id', job.id)

    // Simulate Google Places API search (you would use real API here)
    const results: BusinessData[] = await simulateGooglePlacesAPI(
      searchQuery, 
      location, 
      resultLimit,
      async (progress: number) => {
        await supabaseAdmin
          .from('scraping_jobs')
          .update({ progress })
          .eq('id', job.id)
      }
    )

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
      .eq('id', job.id)

    if (updateError) {
      throw updateError
    }

    console.log(`✅ Successfully found ${results.length} businesses`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        jobId: job.id,
        results: results,
        totalFound: results.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Google Maps search error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})

async function simulateGooglePlacesAPI(
  searchQuery: string, 
  location: string, 
  resultLimit: number,
  progressCallback: (progress: number) => Promise<void>
): Promise<BusinessData[]> {

  console.log(`🔍 Searching for "${searchQuery}" in "${location}"`)

  await progressCallback(50)

  // Generate realistic business data based on search query
  const businesses: BusinessData[] = []
  const categories = getBusinessCategories(searchQuery)
  const baseNames = getBusinessNames(searchQuery)

  for (let i = 0; i < Math.min(resultLimit, 20); i++) {
    await progressCallback(50 + (i / resultLimit) * 40)

    const business: BusinessData = {
      id: `business_${Date.now()}_${i}`,
      name: `${baseNames[i % baseNames.length]} ${location}`,
      category: categories[i % categories.length],
      address: `${Math.floor(Math.random() * 999) + 1} ${getStreetName()}, ${location}`,
      phone: `+49 ${Math.floor(Math.random() * 9000000000) + 1000000000}`,
      website: `https://www.${baseNames[i % baseNames.length].toLowerCase().replace(/\s+/g, '')}.de`,
      rating: Math.round((Math.random() * 2 + 3) * 10) / 10, // 3.0 - 5.0
      reviewCount: Math.floor(Math.random() * 500) + 10,
      openingHours: "Mo-Fr: 9:00-18:00, Sa: 10:00-16:00",
      coordinates: {
        lat: 52.5200 + (Math.random() - 0.5) * 0.1, // Berlin area
        lng: 13.4050 + (Math.random() - 0.5) * 0.1
      }
    }

    businesses.push(business)
  }

  await progressCallback(90)

  return businesses
}

function getBusinessCategories(searchQuery: string): string[] {
  const query = searchQuery.toLowerCase()

  if (query.includes('restaurant') || query.includes('essen')) {
    return ['Restaurant', 'Pizzeria', 'Café', 'Bistro', 'Gaststätte']
  }
  if (query.includes('friseur') || query.includes('salon')) {
    return ['Friseursalon', 'Beautysalon', 'Nagelstudio', 'Kosmetikstudio']
  }
  if (query.includes('apotheke')) {
    return ['Apotheke', 'Sanitätshaus', 'Drogerie']
  }
  if (query.includes('arzt') || query.includes('praxis')) {
    return ['Arztpraxis', 'Zahnarztpraxis', 'Physiotherapie', 'Tierarztpraxis']
  }
  if (query.includes('auto') || query.includes('werkstatt')) {
    return ['Autowerkstatt', 'Autohaus', 'Reifenservice', 'Tankstelle']
  }

  return ['Dienstleistung', 'Einzelhandel', 'Beratung', 'Service', 'Handel']
}

function getBusinessNames(searchQuery: string): string[] {
  const query = searchQuery.toLowerCase()

  if (query.includes('restaurant')) {
    return ['Zur Goldenen Gans', 'Bella Vista', 'Gasthaus Schmidt', 'Ristorante Milano', 'Bräustübl']
  }
  if (query.includes('friseur')) {
    return ['Haarstudio Müller', 'Salon Chic', 'Schnipp & Schnapp', 'Hair Design', 'Coiffeur Elite']
  }
  if (query.includes('apotheke')) {
    return ['Stadt-Apotheke', 'Rosen-Apotheke', 'Apotheke am Markt', 'Neue Apotheke', 'Hirsch-Apotheke']
  }

  return ['Firma Schmidt', 'Meisterbetrieb Wagner', 'Service Center', 'Fachgeschäft Weber', 'Experten Team']
}

function getStreetName(): string {
  const streets = [
    'Hauptstraße', 'Bahnhofstraße', 'Kirchgasse', 'Marktplatz', 'Bergstraße',
    'Mühlenweg', 'Gartenstraße', 'Schulstraße', 'Poststraße', 'Lindenallee'
  ]
  return streets[Math.floor(Math.random() * streets.length)]
}