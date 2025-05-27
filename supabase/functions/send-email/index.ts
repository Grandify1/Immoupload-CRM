
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { to, subject, body, account_id, user_id } = await req.json()

    // Get email account
    const { data: account, error: accountError } = await supabaseAdmin
      .from('email_accounts')
      .select('*')
      .eq('id', account_id)
      .eq('team_id', user_id)
      .single()

    if (accountError || !account) {
      throw new Error('Email account not found')
    }

    console.log('Sending email via SMTP:', { to, subject, from: account.email })

    // Send email via SMTP using denomailer
    try {
      const client = new SMTPClient({
        connection: {
          hostname: account.smtp_host,
          port: account.smtp_port,
          tls: account.smtp_port === 465,
          auth: {
            username: account.smtp_username,
            password: account.smtp_password,
          },
        },
      });

      await client.send({
        from: account.email,
        to: to,
        subject: subject,
        content: body,
        html: body.replace(/\n/g, '<br>'), // Convert line breaks to HTML
      });

      await client.close();
      
      console.log('✅ Email sent successfully via SMTP');

    } catch (smtpError) {
      console.error('❌ SMTP Error:', smtpError);
      throw new Error(`SMTP Fehler: ${smtpError.message}`);
    }

    // Store sent email in database
    const { error: insertError } = await supabaseAdmin
      .from('emails')
      .insert({
        subject,
        sender: account.email,
        recipient: to,
        body,
        received_at: new Date().toISOString(),
        is_read: true, // Sent emails are considered "read"
        account_id,
        team_id: user_id,
        message_id: `sent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      })

    if (insertError) {
      console.error('Database insert error:', insertError)
      // Don't throw here - email was sent successfully, just log the DB error
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Email sent successfully via SMTP' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Send email error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
