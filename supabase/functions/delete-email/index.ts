
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Simple IMAP client implementation
class SimpleIMAPClient {
  private conn: Deno.TcpConn | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private tagCounter = 0;

  constructor(private config: {
    host: string;
    port: number;
    username: string;
    password: string;
    useSSL: boolean;
  }) {}

  private generateTag(): string {
    return `A${++this.tagCounter.toString().padStart(3, '0')}`;
  }

  private async sendCommand(command: string): Promise<string> {
    if (!this.writer) throw new Error('Not connected');
    
    const tag = this.generateTag();
    const fullCommand = `${tag} ${command}\r\n`;
    
    console.log(`IMAP >> ${fullCommand.trim()}`);
    
    await this.writer.write(new TextEncoder().encode(fullCommand));
    
    // Read response
    let response = '';
    const decoder = new TextDecoder();
    
    while (true) {
      const { value, done } = await this.reader!.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      response += chunk;
      
      if (response.includes(`${tag} OK`) || response.includes(`${tag} NO`) || response.includes(`${tag} BAD`)) {
        break;
      }
    }
    
    console.log(`IMAP << ${response.trim()}`);
    return response;
  }

  async connect(): Promise<void> {
    try {
      if (this.config.useSSL) {
        this.conn = await Deno.connectTls({
          hostname: this.config.host,
          port: this.config.port,
        });
      } else {
        this.conn = await Deno.connect({
          hostname: this.config.host,
          port: this.config.port,
        });
      }

      this.reader = this.conn.readable.getReader();
      this.writer = this.conn.writable.getWriter();

      // Read greeting
      const { value } = await this.reader.read();
      const greeting = new TextDecoder().decode(value!);
      console.log(`IMAP << ${greeting.trim()}`);

    } catch (error) {
      throw new Error(`Failed to connect to IMAP server: ${error.message}`);
    }
  }

  async login(): Promise<void> {
    await this.sendCommand(`LOGIN "${this.config.username}" "${this.config.password}"`);
  }

  async selectMailbox(mailbox: string): Promise<void> {
    await this.sendCommand(`SELECT "${mailbox}"`);
  }

  async searchByMessageId(messageId: string): Promise<string[]> {
    const response = await this.sendCommand(`SEARCH HEADER "Message-ID" "${messageId}"`);
    const match = response.match(/\* SEARCH (.+)/);
    if (match && match[1].trim()) {
      return match[1].trim().split(' ');
    }
    return [];
  }

  async moveToTrash(uid: string): Promise<void> {
    // Mark as deleted
    await this.sendCommand(`STORE ${uid} +FLAGS (\\Deleted)`);
    // Move to Trash folder (common folder names)
    try {
      await this.sendCommand(`MOVE ${uid} "Trash"`);
    } catch {
      try {
        await this.sendCommand(`MOVE ${uid} "INBOX.Trash"`);
      } catch {
        // If move fails, just mark as deleted and expunge
        await this.sendCommand(`EXPUNGE`);
      }
    }
  }

  async permanentDelete(uid: string): Promise<void> {
    await this.sendCommand(`STORE ${uid} +FLAGS (\\Deleted)`);
    await this.sendCommand(`EXPUNGE`);
  }

  async close(): Promise<void> {
    if (this.writer) {
      await this.sendCommand('LOGOUT');
      await this.writer.close();
    }
    if (this.conn) {
      this.conn.close();
    }
  }
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
    const imapConfig = {
      host: account.imap_host || account.smtp_host.replace('smtp', 'imap'),
      port: account.imap_port || 993,
      username: account.smtp_username,
      password: account.smtp_password,
      useSSL: true
    }

    console.log(`Connecting to IMAP: ${imapConfig.host}:${imapConfig.port}`)

    // Connect to IMAP and delete email
    const imap = new SimpleIMAPClient(imapConfig);
    
    try {
      await imap.connect();
      await imap.login();
      await imap.selectMailbox('INBOX');
      
      // Search for email by Message-ID
      const uids = await imap.searchByMessageId(email.message_id);
      
      if (uids.length === 0) {
        console.log('Email not found on IMAP server (may already be deleted)');
      } else {
        const uid = uids[0];
        
        if (permanent) {
          await imap.permanentDelete(uid);
          console.log(`✅ Email permanently deleted from IMAP server`);
        } else {
          await imap.moveToTrash(uid);
          console.log(`✅ Email moved to trash on IMAP server`);
        }
      }
      
      await imap.close();
      
    } catch (imapError) {
      console.error('IMAP operation failed:', imapError);
      // Continue with database update even if IMAP fails
    }

    // Update database
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

      console.log(`✅ Email permanently deleted from database`)
      
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

      console.log(`✅ Email marked as deleted in database`)
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Email moved to trash on server and marked as deleted',
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
