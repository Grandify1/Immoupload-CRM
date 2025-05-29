
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

      // Check import_jobs table structure first
      console.log('🔍 Checking import_jobs table structure...');
      try {
        const { data: tableStructure, error: structureError } = await supabaseAdmin
          .rpc('get_table_columns', { table_name: 'import_jobs' });

        if (structureError) {
          console.log('⚠️ Could not get table structure, proceeding anyway:', structureError);
        } else {
          console.log('📋 Table structure:', tableStructure);
        }
      } catch (err) {
        console.log('⚠️ Table structure check failed, continuing:', err);
      }

      // Vereinfachter Job-Creation Test mit minimalsten Daten
      const jobId = `test-${Date.now()}`;
      console.log('🏗️ Creating minimal test job:', jobId);

      try {
        // Erstelle Job mit nur absolut notwendigen Feldern
        const jobData = {
          id: jobId,
          team_id: body.teamId,
          created_by: body.userId,
          file_name: 'dashboard-test.csv',
          total_records: 2,
          status: 'processing'
        };

        console.log('📝 Attempting to insert job data:', jobData);

        const { data: testJob, error: jobError } = await supabaseAdmin
          .from('import_jobs')
          .insert(jobData)
          .select()
          .single();

        if (jobError) {
          console.error('❌ Job creation failed:', jobError);
          console.error('❌ Job error details:', JSON.stringify(jobError, null, 2));
          
          // Try alternative approach - create without ID
          console.log('🔄 Trying job creation without explicit ID...');
          const { data: altJob, error: altError } = await supabaseAdmin
            .from('import_jobs')
            .insert({
              team_id: body.teamId,
              created_by: body.userId,
              file_name: 'dashboard-test.csv',
              total_records: 2,
              status: 'processing'
            })
            .select()
            .single();

          if (altError) {
            console.error('❌ Alternative job creation also failed:', altError);
            return new Response(
              JSON.stringify({
                success: false,
                error: 'Job creation failed',
                primary_error: jobError,
                alternative_error: altError,
                attempted_data: jobData
              }),
              { status: 500, headers: responseHeaders }
            );
          }

          console.log('✅ Alternative job created:', altJob);
          const finalJob = altJob;
          
          // Continue with lead test using alternative job
          console.log('🔄 Testing lead insertion with alternative job...');
          const testLeadData = {
            team_id: body.teamId,
            name: 'Test Lead Dashboard Alt',
            email: 'test-alt@dashboard.com',
            status: 'potential',
            import_job_id: finalJob.id
          };

          const { data: insertedLead, error: leadError } = await supabaseAdmin
            .from('leads')
            .insert([testLeadData])
            .select('id, name, email')
            .single();

          if (leadError) {
            console.error('❌ Lead insertion failed:', leadError);
            return new Response(
              JSON.stringify({
                success: false,
                error: 'Lead insertion failed with alternative job',
                details: leadError,
                job_created: true,
                job_id: finalJob.id
              }),
              { status: 500, headers: responseHeaders }
            );
          }

          // Update job to completed
          await supabaseAdmin
            .from('import_jobs')
            .update({
              status: 'completed',
              processed_records: 1,
              completed_at: new Date().toISOString()
            })
            .eq('id', finalJob.id);

          return new Response(
            JSON.stringify({
              success: true,
              message: 'Dashboard test completed with alternative approach!',
              results: {
                job_id: finalJob.id,
                lead_created: insertedLead,
                test_passed: true,
                note: 'Used alternative job creation method'
              }
            }),
            { status: 200, headers: responseHeaders }
          );
        }

        console.log('✅ Primary job creation successful:', testJob);

        // Einfacher Lead-Insert Test
        console.log('🔄 Testing lead insertion...');
        const testLeadData = {
          team_id: body.teamId,
          name: 'Test Lead Dashboard',
          email: 'test@dashboard.com',
          status: 'potential',
          import_job_id: testJob.id
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
            .eq('id', testJob.id);

          return new Response(
            JSON.stringify({
              success: false,
              error: 'Lead insertion failed',
              details: leadError,
              job_created: true,
              job_id: testJob.id
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
          .eq('id', testJob.id);

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Dashboard test completed successfully!',
            results: {
              job_id: testJob.id,
              lead_created: insertedLead,
              test_passed: true
            }
          }),
          { status: 200, headers: responseHeaders }
        );

      } catch (testError) {
        console.error('❌ Test execution failed:', testError);
        console.error('❌ Test error stack:', testError.stack);
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
    console.error('❌ Critical error stack:', error.stack);
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
