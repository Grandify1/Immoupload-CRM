
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    // Here you would implement actual SMTP sending
    // For now, we'll just log the email and store it in the database
    console.log('Sending email:', { to, subject, body, from: account.email })

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
        team_id: user_id
      })

    if (insertError) {
      throw insertError
    }

    // TODO: Implement actual SMTP sending using nodemailer or similar
    // const nodemailer = require('nodemailer');
    // const transporter = nodemailer.createTransporter({
    //   host: account.smtp_host,
    //   port: account.smtp_port,
    //   secure: account.smtp_port === 465,
    //   auth: {
    //     user: account.smtp_username,
    //     pass: account.smtp_password,
    //   },
    // });
    // 
    // await transporter.sendMail({
    //   from: account.email,
    //   to,
    //   subject,
    //   text: body,
    // });

    return new Response(
      JSON.stringify({ success: true, message: 'Email sent successfully' }),
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
