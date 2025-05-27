
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
      
      // Add timeout to prevent infinite loops
      if (response.length > 10000) {
        console.log('Response too long, breaking...');
        break;
      }
    }
    
    console.log(`IMAP << ${response.trim()}`);
    
    if (response.includes(`${tag} NO`) || response.includes(`${tag} BAD`)) {
      throw new Error(`IMAP command failed: ${response}`);
    }
    
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

      if (!greeting.includes('* OK')) {
        throw new Error('IMAP server greeting failed');
      }

    } catch (error) {
      throw new Error(`Failed to connect to IMAP server: ${error.message}`);
    }
  }

  async login(): Promise<void> {
    const response = await this.sendCommand(`LOGIN "${this.config.username}" "${this.config.password}"`);
    if (!response.includes('OK')) {
      throw new Error('IMAP login failed');
    }
  }

  async selectMailbox(mailbox: string): Promise<void> {
    const response = await this.sendCommand(`SELECT "${mailbox}"`);
    if (!response.includes('OK')) {
      throw new Error(`Failed to select mailbox: ${mailbox}`);
    }
  }

  async searchByMessageId(messageId: string): Promise<string[]> {
    try {
      // Clean message ID - remove < > if present
      const cleanMessageId = messageId.replace(/^<|>$/g, '');
      const response = await this.sendCommand(`UID SEARCH HEADER "Message-ID" "${cleanMessageId}"`);
      
      // Look for UID SEARCH response
      const match = response.match(/\* SEARCH (.+)/);
      if (match && match[1].trim()) {
        return match[1].trim().split(' ').filter(uid => uid && uid !== '');
      }
      return [];
    } catch (error) {
      console.log(`Search failed: ${error.message}`);
      return [];
    }
  }

  async moveToTrash(uid: string): Promise<void> {
    try {
      // First try to move to common trash folders
      const trashFolders = ['INBOX.Trash', 'Trash', 'INBOX.Deleted Items', 'Deleted Items'];
      
      let moved = false;
      for (const folder of trashFolders) {
        try {
          await this.sendCommand(`UID MOVE ${uid} "${folder}"`);
          console.log(`Successfully moved email to ${folder}`);
          moved = true;
          break;
        } catch (error) {
          console.log(`Failed to move to ${folder}: ${error.message}`);
          continue;
        }
      }
      
      if (!moved) {
        // If move fails, mark as deleted and expunge
        console.log('Move failed, marking as deleted instead');
        await this.sendCommand(`UID STORE ${uid} +FLAGS (\\Deleted)`);
        await this.sendCommand(`EXPUNGE`);
      }
    } catch (error) {
      throw new Error(`Failed to move email to trash: ${error.message}`);
    }
  }

  async permanentDelete(uid: string): Promise<void> {
    try {
      // Mark as deleted
      await this.sendCommand(`UID STORE ${uid} +FLAGS (\\Deleted)`);
      // Expunge to permanently remove
      await this.sendCommand(`EXPUNGE`);
      console.log(`Email with UID ${uid} permanently deleted`);
    } catch (error) {
      throw new Error(`Failed to permanently delete email: ${error.message}`);
    }
  }

  async close(): Promise<void> {
    if (this.writer) {
      try {
        await this.sendCommand('LOGOUT');
      } catch (error) {
        console.log('Logout error (ignored):', error);
      }
      await this.writer.close();
    }
    if (this.conn) {
      this.conn.close();
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: corsHeaders,
      status: 200
    })
  }

  try {
    console.log(`Delete email request: ${req.method}`)
    
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
      console.error('Email not found:', emailError)
      throw new Error('Email not found')
    }

    const account = email.email_accounts

    console.log(`Found email: ${email.subject} from account ${account.email}`)
    console.log(`Message ID: ${email.message_id}`)

    // Configure IMAP settings
    const imapConfig = {
      host: account.imap_host || account.smtp_host.replace('smtp', 'imap'),
      port: account.imap_port || 993,
      username: account.smtp_username,
      password: account.smtp_password,
      useSSL: true
    }

    console.log(`Connecting to IMAP: ${imapConfig.host}:${imapConfig.port}`)

    let imapSuccess = false;

    // Connect to IMAP and delete email
    if (email.message_id) {
      const imap = new SimpleIMAPClient(imapConfig);
      
      try {
        await imap.connect();
        await imap.login();
        
        // Try different mailboxes
        const mailboxes = ['INBOX', 'Sent', 'Drafts'];
        
        for (const mailbox of mailboxes) {
          try {
            await imap.selectMailbox(mailbox);
            
            // Search for email by Message-ID
            const uids = await imap.searchByMessageId(email.message_id);
            
            if (uids.length > 0) {
              const uid = uids[0];
              console.log(`Found email with UID ${uid} in ${mailbox}`);
              
              if (permanent) {
                await imap.permanentDelete(uid);
                console.log(`✅ Email permanently deleted from IMAP server (${mailbox})`);
              } else {
                await imap.moveToTrash(uid);
                console.log(`✅ Email moved to trash on IMAP server (${mailbox})`);
              }
              
              imapSuccess = true;
              break;
            } else {
              console.log(`Email not found in ${mailbox}`);
            }
          } catch (mailboxError) {
            console.log(`Failed to process ${mailbox}: ${mailboxError.message}`);
            continue;
          }
        }
        
        await imap.close();
        
      } catch (imapError) {
        console.error('IMAP operation failed:', imapError);
        // Continue with database update even if IMAP fails
      }
    } else {
      console.log('No message_id found, skipping IMAP deletion');
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
        console.error('Database delete error:', deleteError)
        throw deleteError
      }

      console.log(`✅ Email permanently deleted from database`)
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: imapSuccess 
            ? 'Email permanently deleted from server and database'
            : 'Email permanently deleted from database (IMAP deletion failed)',
          action: 'permanent_delete',
          imapSuccess
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
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
        console.error('Database update error:', updateError)
        throw updateError
      }

      console.log(`✅ Email marked as deleted in database`)
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: imapSuccess 
            ? 'Email moved to trash on server and marked as deleted'
            : 'Email marked as deleted in database (IMAP deletion failed)',
          action: 'move_to_trash',
          imapSuccess
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }

  } catch (error) {
    console.error('Delete email error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Unknown error occurred',
        details: error.toString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 400 
      }
    )
  }
})
