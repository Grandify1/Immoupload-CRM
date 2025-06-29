
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

    // Get all active email accounts for the user
    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from('email_accounts')
      .select('*')
      .eq('team_id', user_id)
      .eq('is_active', true)

    if (accountsError) {
      throw accountsError
    }

    let totalSynced = 0

    for (const account of accounts) {
      try {
        console.log(`Syncing emails for account: ${account.email}`)

        // For Gmail, we need to use IMAP with specific settings
        let imapConfig = {
          hostname: account.imap_host || account.smtp_host.replace('smtp', 'imap'),
          port: account.imap_port || 993,
          username: account.smtp_username,
          password: account.smtp_password,
          useSSL: true
        }

        // Determine IMAP settings based on common providers
        if (account.smtp_host.includes('gmail')) {
          imapConfig = {
            hostname: 'imap.gmail.com',
            port: 993,
            username: account.smtp_username,
            password: account.smtp_password,
            useSSL: true
          }
        } else if (account.smtp_host.includes('outlook') || account.smtp_host.includes('hotmail')) {
          imapConfig = {
            hostname: 'outlook.office365.com',
            port: 993,
            username: account.smtp_username,
            password: account.smtp_password,
            useSSL: true
          }
        }

        console.log(`Using IMAP config for ${account.email}:`, { 
          hostname: imapConfig.hostname, 
          port: imapConfig.port,
          username: imapConfig.username 
        })

        // Stattdessen: Keine neuen Mock-Emails generieren
        // Das System soll nur echte Emails aus IMAP laden
        console.log(`⚠️ IMAP-Synchronisation für ${account.email} übersprungen - nur echte Emails laden`)

        // TODO: Implement real IMAP fetching
        // For production use, you would implement something like this:
        /*
        const imap = new IMAPClient({
          host: imapConfig.hostname,
          port: imapConfig.port,
          secure: imapConfig.useSSL,
          auth: {
            user: imapConfig.username,
            pass: imapConfig.password
          }
        });

        await imap.connect();
        await imap.selectMailbox('INBOX');
        
        const messages = await imap.search(['UNSEEN']);
        for (const uid of messages) {
          const message = await imap.fetchMessage(uid, {
            bodies: ['HEADER', 'TEXT'],
            markSeen: false
          });
          
          // Parse and insert message into database
        }
        
        await imap.end();
        */
        
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
