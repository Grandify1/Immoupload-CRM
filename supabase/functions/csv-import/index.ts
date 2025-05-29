import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true'
};

serve(async (req) => {
  console.log('🚀 CSV Import Edge Function - Request method:', req.method);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ CORS preflight request handled');
    return new Response('OK', {
      status: 200,
      headers: corsHeaders,
    });
  }

  const responseHeaders = {
    ...corsHeaders,
    'Content-Type': 'application/json',
  };

  try {
    console.log('🔧 Environment check:');
    console.log('SUPABASE_URL exists:', !!Deno.env.get('SUPABASE_URL'));
    console.log('SUPABASE_SERVICE_ROLE_KEY exists:', !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing environment variables');
      return new Response(
        JSON.stringify({ 
          error: 'Missing environment variables',
          supabase_url_exists: !!supabaseUrl,
          supabase_key_exists: !!supabaseKey
        }),
        { status: 500, headers: responseHeaders }
      );
    }

    // Initialize Supabase client
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client created');

    // Parse request body
    let body;
    try {
      const rawBody = await req.text();
      console.log('📝 Raw body length:', rawBody.length);
      body = JSON.parse(rawBody);
      console.log('✅ JSON parsed successfully');
      console.log('📊 Body keys:', Object.keys(body));
    } catch (error) {
      console.error('❌ JSON parsing failed:', error);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid JSON',
          details: error.message
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    // DIRECT TEST - Vereinfacht für Debugging
    if (body.userId === '4467ca04-af24-4c9e-b26b-f3152a00f429') {
      console.log('🧪 DIRECT TEST detected');

      // Test database connection first
      console.log('🔗 Testing database connection...');
      try {
        const { data: testConnection, error: connError } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('id', body.userId)
          .limit(1);

        if (connError) {
          console.error('❌ Database connection failed:', connError);
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Database connection failed',
              details: connError
            }),
            { status: 500, headers: responseHeaders }
          );
        }

        console.log('✅ Database connection successful:', testConnection);
      } catch (dbError) {
        console.error('❌ Database test failed:', dbError);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Database test failed',
            details: dbError.message
          }),
          { status: 500, headers: responseHeaders }
        );
      }

      // Vereinfachter Job-Creation Test
      const jobId = `test-job-${Date.now()}`;
      console.log('🏗️ Creating simplified test job:', jobId);

      try {
        // Prüfe erst ob import_jobs Tabelle existiert
        const { data: tableCheck, error: tableError } = await supabaseAdmin
          .from('import_jobs')
          .select('id')
          .limit(1);

        if (tableError) {
          console.error('❌ import_jobs table check failed:', tableError);
          return new Response(
            JSON.stringify({
              success: false,
              error: 'import_jobs table not accessible',
              details: tableError
            }),
            { status: 500, headers: responseHeaders }
          );
        }

        console.log('✅ import_jobs table accessible');

        // Erstelle Job mit minimalen Daten
        const { data: testJob, error: jobError } = await supabaseAdmin
          .from('import_jobs')
          .insert({
            id: jobId,
            team_id: body.teamId,
            created_by: body.userId,
            file_name: 'dashboard-test.csv',
            total_records: 2,
            status: 'processing',
            processed_records: 0,
            failed_records: 0
          })
          .select()
          .single();

        if (jobError) {
          console.error('❌ Job creation failed:', jobError);
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Job creation failed',
              details: jobError,
              attempted_data: {
                id: jobId,
                team_id: body.teamId,
                created_by: body.userId
              }
            }),
            { status: 500, headers: responseHeaders }
          );
        }

        console.log('✅ Test job created:', testJob);

        // Einfacher Lead-Insert Test
        console.log('🔄 Testing lead insertion...');
        const testLeadData = {
          team_id: body.teamId,
          name: 'Test Lead Dashboard',
          email: 'test@dashboard.com',
          status: 'potential',
          import_job_id: jobId
        };

        const { data: insertedLead, error: leadError } = await supabaseAdmin
          .from('leads')
          .insert([testLeadData])
          .select('id, name, email')
          .single();

        if (leadError) {
          console.error('❌ Lead insertion failed:', leadError);

          // Update job status
          await supabaseAdmin
            .from('import_jobs')
            .update({
              status: 'failed',
              failed_records: 1,
              error_details: { error: leadError.message }
            })
            .eq('id', jobId);

          return new Response(
            JSON.stringify({
              success: false,
              error: 'Lead insertion failed',
              details: leadError,
              job_created: true,
              job_id: jobId
            }),
            { status: 500, headers: responseHeaders }
          );
        }

        console.log('✅ Lead inserted successfully:', insertedLead);

        // Update job to completed
        await supabaseAdmin
          .from('import_jobs')
          .update({
            status: 'completed',
            processed_records: 1,
            completed_at: new Date().toISOString()
          })
          .eq('id', jobId);

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Dashboard test completed successfully!',
            results: {
              job_id: jobId,
              lead_created: insertedLead,
              test_passed: true
            }
          }),
          { status: 200, headers: responseHeaders }
        );

      } catch (testError) {
        console.error('❌ Test execution failed:', testError);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Test execution failed',
            details: testError.message,
            stack: testError.stack
          }),
          { status: 500, headers: responseHeaders }
        );
      }
    }

    // Für andere Benutzer
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Only test user supported in debug mode'
      }),
      { status: 400, headers: responseHeaders }
    );

  } catch (error) {
    console.error('❌ Critical error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Critical error',
        message: error.message,
        stack: error.stack
      }),
      { status: 500, headers: responseHeaders }
    );
  }
});