
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

    const { user_id } = await req.json()

    // Get active email accounts
    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from('email_accounts')
      .select('*')
      .eq('team_id', user_id)
      .eq('is_active', true)

    if (accountsError) {
      throw accountsError
    }

    let totalSynced = 0

    for (const account of accounts || []) {
      try {
        // TODO: Implement actual IMAP email fetching
        // For now, we'll create some mock emails for demonstration
        console.log(`Syncing emails for account: ${account.email}`)

        // Mock email data - replace with actual IMAP implementation
        const mockEmails = [
          {
            subject: `Test Email ${new Date().getTime()}`,
            sender: 'test@example.com',
            recipient: account.email,
            body: 'This is a test email from the sync function.',
            received_at: new Date().toISOString(),
            is_read: false,
            account_id: account.id,
            team_id: user_id,
            message_id: `mock-${Date.now()}`
          }
        ]

        // Insert emails (check for duplicates by message_id)
        for (const email of mockEmails) {
          const { data: existing } = await supabaseAdmin
            .from('emails')
            .select('id')
            .eq('message_id', email.message_id)
            .single()

          if (!existing) {
            const { error: insertError } = await supabaseAdmin
              .from('emails')
              .insert(email)

            if (!insertError) {
              totalSynced++
            }
          }
        }

        // TODO: Implement real IMAP fetching using imap library
        // const Imap = require('imap');
        // const imap = new Imap({
        //   user: account.smtp_username,
        //   password: account.smtp_password,
        //   host: account.imap_host,
        //   port: account.imap_port,
        //   tls: true
        // });
        
      } catch (error) {
        console.error(`Error syncing account ${account.email}:`, error)
      }
    }

    return new Response(
      JSON.stringify({ success: true, synced: totalSynced }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Sync emails error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
