
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

    console.log(`Starting Google Maps scraping for: ${searchQuery} in ${location}`)

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

    // Real Google Maps scraping logic would go here
    // For now, we'll simulate the process and return mock data
    const results: BusinessData[] = await performGoogleMapsScraping(searchQuery, location, resultLimit)

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
    console.error('Google Maps scraping error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})

async function performGoogleMapsScraping(
  searchQuery: string, 
  location: string, 
  resultLimit: number
): Promise<BusinessData[]> {
  // In production, this would use Puppeteer/Playwright or Google Places API
  // For now, return enhanced mock data based on the search parameters
  
  console.log(`Scraping ${searchQuery} in ${location} (limit: ${resultLimit})`)
  
  const categories = ['Restaurant', 'Friseur', 'Zahnarzt', 'Apotheke', 'Supermarkt', 'Café', 'Bank', 'Tankstelle']
  const actualCategory = categories.find(cat => 
    searchQuery.toLowerCase().includes(cat.toLowerCase())
  ) || searchQuery

  const mockBusinesses: BusinessData[] = []
  
  for (let i = 0; i < Math.min(resultLimit, 50); i++) {
    const businessName = generateBusinessName(actualCategory, i)
    
    mockBusinesses.push({
      id: `business_${Date.now()}_${i}`,
      name: businessName,
      category: actualCategory,
      address: `${businessName} Straße ${i + 1}, ${Math.floor(Math.random() * 99999)} ${location}`,
      phone: Math.random() > 0.3 ? `+49 ${Math.floor(Math.random() * 89) + 10} ${Math.floor(Math.random() * 900000) + 100000}` : undefined,
      website: Math.random() > 0.4 ? `www.${businessName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.de` : undefined,
      rating: Math.random() > 0.2 ? Math.round((Math.random() * 2 + 3) * 10) / 10 : undefined,
      reviewCount: Math.random() > 0.2 ? Math.floor(Math.random() * 500) + 10 : undefined,
      openingHours: Math.random() > 0.3 ? generateOpeningHours() : undefined,
      coordinates: {
        lat: 48.1351 + (Math.random() - 0.5) * 0.2,
        lng: 11.5820 + (Math.random() - 0.5) * 0.2
      }
    })
  }
  
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  return mockBusinesses
}

function generateBusinessName(category: string, index: number): string {
  const prefixes = ['Premium', 'Royal', 'Modern', 'Classic', 'Elite', 'Best', 'Top', 'Quality']
  const suffixes = ['Center', 'Studio', 'Shop', 'Store', 'Service', 'House', 'Place', 'Point']
  
  const businessNames = {
    'Friseur': ['Salon Schmidt', 'Haar & Style', 'Cut & Color', 'Beauty Lounge', 'Trend Friseure'],
    'Restaurant': ['Bella Vista', 'Gasthaus zur Post', 'Zum Goldenen Löwen', 'La Piazza', 'Bräustüberl'],
    'Zahnarzt': ['Praxis Dr. Müller', 'Dental Care', 'Zahnklinik', 'Smile Center', 'Dentalhygiene Plus']
  }
  
  const baseNames = businessNames[category] || [`${category} ${index + 1}`]
  const baseName = baseNames[index % baseNames.length] || `${category} ${index + 1}`
  
  if (Math.random() > 0.7) {
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
    return `${prefix} ${baseName}`
  }
  
  if (Math.random() > 0.7) {
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)]
    return `${baseName} ${suffix}`
  }
  
  return baseName
}

function generateOpeningHours(): string {
  const options = [
    'Mo-Fr: 9:00-18:00, Sa: 9:00-16:00',
    'Mo-Fr: 8:00-17:00, Sa: 9:00-14:00',
    'Mo-Sa: 10:00-19:00',
    'Täglich: 11:00-22:00',
    'Mo-Fr: 7:00-20:00, Sa-So: 8:00-18:00'
  ]
  
  return options[Math.floor(Math.random() * options.length)]
}
