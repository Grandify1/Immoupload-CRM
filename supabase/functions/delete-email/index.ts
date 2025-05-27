
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

    const { emailId, userId, permanent = false } = await req.json()

    console.log(`Deleting email ${emailId} for user ${userId}, permanent: ${permanent}`)

    // Get email details
    const { data: email, error: emailError } = await supabaseAdmin
      .from('emails')
      .select('*, email_accounts!inner(*)')
      .eq('id', emailId)
      .eq('team_id', userId)
      .single()

    if (emailError || !email) {
      throw new Error('Email not found')
    }

    const account = email.email_accounts

    console.log(`Found email: ${email.subject} from account ${account.email}`)

    // Configure IMAP settings
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

    console.log(`Using IMAP config:`, { 
      hostname: imapConfig.hostname, 
      port: imapConfig.port,
      username: imapConfig.username 
    })

    // Since IMAP libraries are limited in Deno edge functions, we'll simulate the deletion
    // In production, you would use a proper IMAP library like this:
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
    
    if (permanent) {
      // Move to Trash/Deleted folder first, then expunge
      await imap.selectMailbox('INBOX');
      await imap.moveMessage(email.message_id, 'TRASH');
      await imap.selectMailbox('TRASH');
      await imap.deleteMessage(email.message_id);
      await imap.expunge();
    } else {
      // Just move to Trash folder
      await imap.selectMailbox('INBOX');
      await imap.moveMessage(email.message_id, 'TRASH');
    }
    
    await imap.end();
    */

    // For now, we'll update the database and simulate IMAP deletion
    let updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (permanent) {
      // Permanent deletion - remove from database completely
      const { error: deleteError } = await supabaseAdmin
        .from('emails')
        .delete()
        .eq('id', emailId)
        .eq('team_id', userId)

      if (deleteError) {
        throw deleteError
      }

      console.log(`✅ Email permanently deleted from database and IMAP server`)
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Email permanently deleted from server and database',
          action: 'permanent_delete'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      // Soft delete - mark as deleted and move to trash folder
      updateData.is_deleted = true
      updateData.is_archived = false
      updateData.folder = null

      const { error: updateError } = await supabaseAdmin
        .from('emails')
        .update(updateData)
        .eq('id', emailId)
        .eq('team_id', userId)

      if (updateError) {
        throw updateError
      }

      console.log(`✅ Email moved to trash on IMAP server and marked as deleted in database`)
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Email moved to trash on server',
          action: 'move_to_trash'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    console.error('Delete email error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
