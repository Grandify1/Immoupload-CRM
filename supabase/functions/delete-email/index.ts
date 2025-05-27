
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Enhanced IMAP client implementation
class EnhancedIMAPClient {
  private conn: Deno.TcpConn | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private tagCounter = 0;
  private responseBuffer = '';

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

  private async readUntilComplete(tag: string, timeout = 30000): Promise<string> {
    if (!this.reader) throw new Error('Not connected');
    
    const decoder = new TextDecoder();
    let response = this.responseBuffer;
    this.responseBuffer = '';
    
    const startTime = Date.now();
    
    while (true) {
      // Check timeout
      if (Date.now() - startTime > timeout) {
        throw new Error('IMAP command timeout');
      }
      
      // Try to read with a shorter timeout for each read
      const readPromise = this.reader.read();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Read timeout')), 5000)
      );
      
      try {
        const result = await Promise.race([readPromise, timeoutPromise]) as ReadableStreamDefaultReadResult<Uint8Array>;
        
        if (result.done) {
          console.log('IMAP connection closed by server');
          break;
        }
        
        const chunk = decoder.decode(result.value);
        response += chunk;
        
        // Check if we have a complete response
        const lines = response.split('\r\n');
        for (const line of lines) {
          if (line.startsWith(`${tag} OK`) || line.startsWith(`${tag} NO`) || line.startsWith(`${tag} BAD`)) {
            // Store any remaining data in buffer
            const responseLines = response.split('\r\n');
            const tagLineIndex = responseLines.findIndex(l => l.startsWith(`${tag} `));
            if (tagLineIndex >= 0 && tagLineIndex < responseLines.length - 1) {
              this.responseBuffer = responseLines.slice(tagLineIndex + 1).join('\r\n');
            }
            return response;
          }
        }
        
        // Prevent infinite growth
        if (response.length > 50000) {
          console.log('Response too long, truncating...');
          return response;
        }
        
      } catch (readError) {
        console.log('Read error (continuing):', readError.message);
        // For timeout errors, continue the loop
        if (readError.message === 'Read timeout') {
          continue;
        }
        throw readError;
      }
    }
    
    return response;
  }

  private async sendCommand(command: string, timeout = 30000): Promise<string> {
    if (!this.writer) throw new Error('Not connected');
    
    const tag = this.generateTag();
    const fullCommand = `${tag} ${command}\r\n`;
    
    console.log(`IMAP >> ${fullCommand.trim()}`);
    
    await this.writer.write(new TextEncoder().encode(fullCommand));
    
    const response = await this.readUntilComplete(tag, timeout);
    
    console.log(`IMAP << ${response.trim()}`);
    
    if (response.includes(`${tag} NO`) || response.includes(`${tag} BAD`)) {
      throw new Error(`IMAP command failed: ${response}`);
    }
    
    return response;
  }

  async connect(): Promise<void> {
    try {
      console.log(`Connecting to ${this.config.host}:${this.config.port} (SSL: ${this.config.useSSL})`);
      
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

      // Read greeting with timeout
      const greetingPromise = this.reader.read();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 10000)
      );
      
      const result = await Promise.race([greetingPromise, timeoutPromise]) as ReadableStreamDefaultReadResult<Uint8Array>;
      
      if (result.done) {
        throw new Error('Connection closed immediately');
      }
      
      const greeting = new TextDecoder().decode(result.value!);
      console.log(`IMAP << ${greeting.trim()}`);

      if (!greeting.includes('* OK')) {
        throw new Error(`IMAP server greeting failed: ${greeting}`);
      }

      console.log('✅ IMAP connection established');

    } catch (error) {
      console.error('IMAP connection error:', error);
      throw new Error(`Failed to connect to IMAP server: ${error.message}`);
    }
  }

  async login(): Promise<void> {
    try {
      const response = await this.sendCommand(`LOGIN "${this.config.username}" "${this.config.password}"`);
      if (!response.includes('OK')) {
        throw new Error('IMAP login failed');
      }
      console.log('✅ IMAP login successful');
    } catch (error) {
      console.error('IMAP login error:', error);
      throw error;
    }
  }

  async listMailboxes(): Promise<string[]> {
    try {
      const response = await this.sendCommand('LIST "" "*"');
      const mailboxes: string[] = [];
      
      const lines = response.split('\r\n');
      for (const line of lines) {
        if (line.startsWith('* LIST')) {
          // Extract mailbox name - it's usually the last quoted string
          const match = line.match(/"([^"]+)"$/);
          if (match) {
            mailboxes.push(match[1]);
          }
        }
      }
      
      console.log('Available mailboxes:', mailboxes);
      return mailboxes;
    } catch (error) {
      console.log('Failed to list mailboxes:', error.message);
      return [];
    }
  }

  async selectMailbox(mailbox: string): Promise<boolean> {
    try {
      const response = await this.sendCommand(`SELECT "${mailbox}"`);
      if (response.includes('OK')) {
        console.log(`✅ Selected mailbox: ${mailbox}`);
        return true;
      }
      return false;
    } catch (error) {
      console.log(`Failed to select mailbox ${mailbox}:`, error.message);
      return false;
    }
  }

  async searchByMessageId(messageId: string): Promise<string[]> {
    try {
      // Clean message ID
      const cleanMessageId = messageId.replace(/^<|>$/g, '');
      console.log(`Searching for Message-ID: ${cleanMessageId}`);
      
      const response = await this.sendCommand(`UID SEARCH HEADER "Message-ID" "${cleanMessageId}"`);
      
      // Look for UID SEARCH response
      const lines = response.split('\r\n');
      for (const line of lines) {
        if (line.startsWith('* SEARCH ')) {
          const uids = line.substring(9).trim();
          if (uids) {
            const uidList = uids.split(' ').filter(uid => uid && uid !== '');
            console.log(`Found UIDs: ${uidList}`);
            return uidList;
          }
        }
      }
      
      console.log('No emails found with this Message-ID');
      return [];
    } catch (error) {
      console.log(`Search failed: ${error.message}`);
      return [];
    }
  }

  async searchBySender(sender: string): Promise<string[]> {
    try {
      console.log(`Searching for sender: ${sender}`);
      const response = await this.sendCommand(`UID SEARCH FROM "${sender}"`);
      
      const lines = response.split('\r\n');
      for (const line of lines) {
        if (line.startsWith('* SEARCH ')) {
          const uids = line.substring(9).trim();
          if (uids) {
            const uidList = uids.split(' ').filter(uid => uid && uid !== '');
            console.log(`Found UIDs by sender: ${uidList}`);
            return uidList;
          }
        }
      }
      
      return [];
    } catch (error) {
      console.log(`Sender search failed: ${error.message}`);
      return [];
    }
  }

  async moveToTrash(uid: string): Promise<void> {
    try {
      console.log(`Attempting to move email UID ${uid} to trash`);
      
      // Try common trash folder names
      const trashFolders = [
        'INBOX.Trash', 'Trash', 'INBOX.Deleted Items', 'Deleted Items',
        'INBOX.Junk', 'Junk', 'INBOX.Deleted', 'Deleted',
        '[Gmail]/Trash', 'Papierkorb', 'INBOX.Papierkorb'
      ];
      
      let moved = false;
      for (const folder of trashFolders) {
        try {
          const response = await this.sendCommand(`UID MOVE ${uid} "${folder}"`);
          if (response.includes('OK')) {
            console.log(`✅ Successfully moved email to ${folder}`);
            moved = true;
            break;
          }
        } catch (error) {
          console.log(`Failed to move to ${folder}: ${error.message}`);
          continue;
        }
      }
      
      if (!moved) {
        console.log('MOVE command failed, trying COPY + STORE + EXPUNGE');
        
        // Try to copy to trash first
        for (const folder of trashFolders) {
          try {
            await this.sendCommand(`UID COPY ${uid} "${folder}"`);
            console.log(`✅ Copied email to ${folder}`);
            break;
          } catch (error) {
            continue;
          }
        }
        
        // Mark as deleted and expunge
        await this.sendCommand(`UID STORE ${uid} +FLAGS (\\Deleted)`);
        console.log(`✅ Marked email UID ${uid} as deleted`);
        
        await this.sendCommand(`EXPUNGE`);
        console.log(`✅ Expunged deleted emails`);
      }
    } catch (error) {
      throw new Error(`Failed to move email to trash: ${error.message}`);
    }
  }

  async permanentDelete(uid: string): Promise<void> {
    try {
      console.log(`Permanently deleting email UID ${uid}`);
      
      // Mark as deleted
      await this.sendCommand(`UID STORE ${uid} +FLAGS (\\Deleted)`);
      console.log(`✅ Marked email UID ${uid} as deleted`);
      
      // Expunge to permanently remove
      await this.sendCommand(`EXPUNGE`);
      console.log(`✅ Email UID ${uid} permanently deleted`);
    } catch (error) {
      throw new Error(`Failed to permanently delete email: ${error.message}`);
    }
  }

  async close(): Promise<void> {
    try {
      if (this.writer) {
        try {
          await this.sendCommand('LOGOUT');
          console.log('✅ IMAP logout successful');
        } catch (error) {
          console.log('Logout error (ignored):', error.message);
        }
        
        try {
          await this.writer.close();
        } catch (error) {
          console.log('Writer close error (ignored):', error.message);
        }
      }
      
      if (this.conn) {
        try {
          this.conn.close();
          console.log('✅ IMAP connection closed');
        } catch (error) {
          console.log('Connection close error (ignored):', error.message);
        }
      }
    } catch (error) {
      console.log('Close error (ignored):', error.message);
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
    console.log(`=== Delete email request: ${req.method} ===`)
    
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

    console.log(`Found email: "${email.subject}" from ${email.sender}`)
    console.log(`Account: ${account.email}`)
    console.log(`Message ID: ${email.message_id || 'N/A'}`)

    // Configure IMAP settings
    const imapConfig = {
      host: account.imap_host || account.smtp_host.replace('smtp', 'imap'),
      port: account.imap_port || 993,
      username: account.smtp_username,
      password: account.smtp_password,
      useSSL: true
    }

    console.log(`IMAP Config: ${imapConfig.host}:${imapConfig.port}`)

    let imapSuccess = false;
    let imapErrorMessage = '';

    // Connect to IMAP and delete email
    const imap = new EnhancedIMAPClient(imapConfig);
    
    try {
      await imap.connect();
      await imap.login();
      
      // Get list of available mailboxes for debugging
      const mailboxes = await imap.listMailboxes();
      console.log(`Available mailboxes: ${mailboxes.join(', ')}`);
      
      // Try different mailboxes in order of preference
      const searchMailboxes = [
        'INBOX',
        'Sent',
        'Drafts',
        'INBOX.Sent',
        'INBOX.Drafts',
        '[Gmail]/Sent Mail',
        '[Gmail]/Drafts',
        ...mailboxes.filter(m => !['INBOX', 'Sent', 'Drafts'].includes(m))
      ];
      
      let foundAndProcessed = false;
      
      for (const mailbox of searchMailboxes) {
        if (foundAndProcessed) break;
        
        console.log(`\n--- Checking mailbox: ${mailbox} ---`);
        
        const selected = await imap.selectMailbox(mailbox);
        if (!selected) {
          console.log(`Could not select mailbox: ${mailbox}`);
          continue;
        }
        
        let uids: string[] = [];
        
        // First try searching by Message-ID if available
        if (email.message_id) {
          uids = await imap.searchByMessageId(email.message_id);
        }
        
        // If no results and we have sender info, try searching by sender
        if (uids.length === 0 && email.sender) {
          console.log(`No results by Message-ID, trying sender search...`);
          uids = await imap.searchBySender(email.sender);
        }
        
        if (uids.length > 0) {
          console.log(`Found ${uids.length} emails in ${mailbox}`);
          
          // Process each UID (in case there are multiple matches)
          for (const uid of uids) {
            try {
              if (permanent) {
                await imap.permanentDelete(uid);
                console.log(`✅ Email UID ${uid} permanently deleted from ${mailbox}`);
              } else {
                await imap.moveToTrash(uid);
                console.log(`✅ Email UID ${uid} moved to trash from ${mailbox}`);
              }
              foundAndProcessed = true;
              imapSuccess = true;
            } catch (uidError) {
              console.log(`Failed to process UID ${uid}: ${uidError.message}`);
              imapErrorMessage += `UID ${uid}: ${uidError.message}; `;
            }
          }
        } else {
          console.log(`No emails found in ${mailbox}`);
        }
      }
      
      if (!foundAndProcessed) {
        imapErrorMessage = 'Email not found in any mailbox';
        console.log(`❌ ${imapErrorMessage}`);
      }
      
    } catch (imapError) {
      console.error('IMAP operation failed:', imapError);
      imapErrorMessage = imapError.message;
    } finally {
      await imap.close();
    }

    // Update database regardless of IMAP success
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
            : `Email permanently deleted from database. IMAP error: ${imapErrorMessage}`,
          action: 'permanent_delete',
          imapSuccess,
          imapError: imapErrorMessage || null
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
            : `Email marked as deleted in database. IMAP error: ${imapErrorMessage}`,
          action: 'move_to_trash',
          imapSuccess,
          imapError: imapErrorMessage || null
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
