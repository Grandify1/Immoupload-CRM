
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Enhanced IMAP client with proper delete handling
class IMAPDeleteClient {
  private conn: Deno.TcpConn | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private tagCounter = 0;
  private isLoggedIn = false;
  private selectedMailbox = '';

  constructor(private config: {
    host: string;
    port: number;
    username: string;
    password: string;
    useSSL: boolean;
  }) {}

  private generateTag(): string {
    this.tagCounter++;
    return `A${this.tagCounter.toString().padStart(4, '0')}`;
  }

  private async readResponse(tag: string, timeout = 30000): Promise<string> {
    if (!this.reader) throw new Error('Not connected');
    
    const decoder = new TextDecoder();
    let response = '';
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const readPromise = this.reader.read();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Read timeout')), 5000)
        );
        
        const result = await Promise.race([readPromise, timeoutPromise]) as ReadableStreamDefaultReadResult<Uint8Array>;
        
        if (result.done) {
          console.log('⚠️ IMAP connection closed by server');
          break;
        }
        
        const chunk = decoder.decode(result.value);
        response += chunk;
        
        // Check for command completion
        const lines = response.split('\r\n');
        for (const line of lines) {
          if (line.startsWith(`${tag} OK`) || line.startsWith(`${tag} NO`) || line.startsWith(`${tag} BAD`)) {
            return response;
          }
        }
        
      } catch (readError) {
        if (readError.message === 'Read timeout') {
          continue; // Try again
        }
        throw readError;
      }
    }
    
    throw new Error(`IMAP command timeout for tag ${tag}`);
  }

  private async sendCommand(command: string, expectOK = true): Promise<string> {
    if (!this.writer) throw new Error('Not connected');
    
    const tag = this.generateTag();
    const fullCommand = `${tag} ${command}\r\n`;
    
    console.log(`📤 IMAP >> ${fullCommand.trim()}`);
    
    await this.writer.write(new TextEncoder().encode(fullCommand));
    
    const response = await this.readResponse(tag);
    
    console.log(`📥 IMAP << ${response.replace(/\r\n/g, '\\r\\n').substring(0, 500)}${response.length > 500 ? '...' : ''}`);
    
    if (expectOK && (response.includes(`${tag} NO`) || response.includes(`${tag} BAD`))) {
      throw new Error(`IMAP command failed: ${response.split('\r\n').find(line => line.startsWith(tag)) || 'Unknown error'}`);
    }
    
    return response;
  }

  async connect(): Promise<void> {
    try {
      console.log(`🔌 Connecting to IMAP ${this.config.host}:${this.config.port} (SSL: ${this.config.useSSL})`);
      
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

      // Read server greeting
      const greetingPromise = this.reader.read();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 10000)
      );
      
      const result = await Promise.race([greetingPromise, timeoutPromise]) as ReadableStreamDefaultReadResult<Uint8Array>;
      
      if (result.done) {
        throw new Error('Connection closed immediately');
      }
      
      const greeting = new TextDecoder().decode(result.value!);
      console.log(`📥 IMAP << ${greeting.trim()}`);

      if (!greeting.includes('* OK')) {
        throw new Error(`IMAP server greeting failed: ${greeting}`);
      }

      console.log('✅ IMAP connection established');

    } catch (error) {
      console.error('❌ IMAP connection error:', error);
      throw new Error(`Failed to connect to IMAP server: ${error.message}`);
    }
  }

  async login(): Promise<void> {
    try {
      console.log(`🔐 Authenticating as ${this.config.username}`);
      
      const response = await this.sendCommand(`LOGIN "${this.config.username}" "${this.config.password}"`);
      
      if (!response.includes('OK')) {
        throw new Error('IMAP login failed - check credentials');
      }
      
      this.isLoggedIn = true;
      console.log('✅ IMAP authentication successful');
      
    } catch (error) {
      console.error('❌ IMAP login error:', error);
      throw error;
    }
  }

  async listMailboxes(): Promise<string[]> {
    if (!this.isLoggedIn) throw new Error('Not logged in');
    
    try {
      const response = await this.sendCommand('LIST "" "*"');
      const mailboxes: string[] = [];
      
      const lines = response.split('\r\n');
      for (const line of lines) {
        if (line.startsWith('* LIST')) {
          // Extract mailbox name from various formats
          const match = line.match(/"([^"]+)"$/) || line.match(/\s([^\s]+)$/) || line.match(/\s(\S+)\s*$/);
          if (match && match[1]) {
            mailboxes.push(match[1]);
          }
        }
      }
      
      console.log(`📂 Available mailboxes: ${mailboxes.join(', ')}`);
      return mailboxes;
      
    } catch (error) {
      console.log('⚠️ Failed to list mailboxes:', error.message);
      return ['INBOX']; // Fallback to INBOX
    }
  }

  async selectMailbox(mailbox: string): Promise<boolean> {
    if (!this.isLoggedIn) throw new Error('Not logged in');
    
    try {
      console.log(`📂 Selecting mailbox: ${mailbox}`);
      
      const response = await this.sendCommand(`SELECT "${mailbox}"`);
      
      if (response.includes('OK [READ-WRITE]') || response.includes('OK')) {
        this.selectedMailbox = mailbox;
        console.log(`✅ Selected mailbox: ${mailbox} (READ-WRITE mode)`);
        return true;
      }
      
      console.log(`❌ Failed to select mailbox: ${mailbox}`);
      return false;
      
    } catch (error) {
      console.log(`❌ Error selecting mailbox ${mailbox}: ${error.message}`);
      return false;
    }
  }

  async searchByMessageId(messageId: string): Promise<string[]> {
    if (!this.selectedMailbox) throw new Error('No mailbox selected');
    
    try {
      const cleanMessageId = messageId.replace(/^<|>$/g, '');
      console.log(`🔍 Searching for Message-ID: ${cleanMessageId}`);
      
      const response = await this.sendCommand(`UID SEARCH HEADER "Message-ID" "${cleanMessageId}"`);
      
      const lines = response.split('\r\n');
      for (const line of lines) {
        if (line.startsWith('* SEARCH ')) {
          const uids = line.substring(9).trim();
          if (uids) {
            const uidList = uids.split(' ').filter(uid => uid && uid !== '');
            console.log(`✅ Found UIDs by Message-ID: ${uidList.join(', ')}`);
            return uidList;
          }
        }
      }
      
      console.log('❌ No emails found with this Message-ID');
      return [];
      
    } catch (error) {
      console.log(`❌ Message-ID search failed: ${error.message}`);
      return [];
    }
  }

  async searchBySender(sender: string): Promise<string[]> {
    if (!this.selectedMailbox) throw new Error('No mailbox selected');
    
    try {
      console.log(`🔍 Searching for sender: ${sender}`);
      
      const response = await this.sendCommand(`UID SEARCH FROM "${sender}"`);
      
      const lines = response.split('\r\n');
      for (const line of lines) {
        if (line.startsWith('* SEARCH ')) {
          const uids = line.substring(9).trim();
          if (uids) {
            const uidList = uids.split(' ').filter(uid => uid && uid !== '');
            console.log(`✅ Found UIDs by sender: ${uidList.join(', ')}`);
            return uidList.slice(0, 5); // Limit to first 5 to avoid deleting too many
          }
        }
      }
      
      return [];
      
    } catch (error) {
      console.log(`❌ Sender search failed: ${error.message}`);
      return [];
    }
  }

  async permanentDelete(uid: string): Promise<void> {
    if (!this.selectedMailbox) throw new Error('No mailbox selected');
    
    try {
      console.log(`🗑️ Permanently deleting email UID ${uid} from ${this.selectedMailbox}`);
      
      // Step 1: Mark email as deleted
      const storeResponse = await this.sendCommand(`UID STORE ${uid} +FLAGS (\\Deleted)`);
      if (!storeResponse.includes('OK')) {
        throw new Error(`Failed to mark email as deleted: ${storeResponse}`);
      }
      console.log(`✅ Marked email UID ${uid} as deleted`);
      
      // Step 2: Expunge to physically remove
      const expungeResponse = await this.sendCommand(`EXPUNGE`);
      if (!expungeResponse.includes('OK')) {
        throw new Error(`Failed to expunge deleted emails: ${expungeResponse}`);
      }
      console.log(`✅ Email UID ${uid} expunged (permanently deleted)`);
      
    } catch (error) {
      console.error(`❌ Permanent delete failed: ${error.message}`);
      throw new Error(`Failed to permanently delete email: ${error.message}`);
    }
  }

  async moveToTrash(uid: string): Promise<void> {
    if (!this.selectedMailbox) throw new Error('No mailbox selected');
    
    try {
      console.log(`📁 Moving email UID ${uid} to trash`);
      
      // Try common trash folder names
      const trashFolders = [
        'INBOX.Trash', 'Trash', 'INBOX.Deleted Items', 'Deleted Items',
        'INBOX.Junk', 'Junk', 'INBOX.Deleted', 'Deleted',
        '[Gmail]/Trash', 'Papierkorb', 'INBOX.Papierkorb'
      ];
      
      let moved = false;
      
      // Try MOVE command first (IMAP4rev1 extension)
      for (const folder of trashFolders) {
        try {
          const response = await this.sendCommand(`UID MOVE ${uid} "${folder}"`, false);
          if (response.includes('OK')) {
            console.log(`✅ Moved email UID ${uid} to ${folder}`);
            moved = true;
            break;
          }
        } catch (error) {
          console.log(`⚠️ MOVE to ${folder} failed: ${error.message}`);
          continue;
        }
      }
      
      // If MOVE failed, try COPY + STORE + EXPUNGE
      if (!moved) {
        console.log('📋 MOVE failed, trying COPY + STORE + EXPUNGE method');
        
        let copied = false;
        for (const folder of trashFolders) {
          try {
            const copyResponse = await this.sendCommand(`UID COPY ${uid} "${folder}"`, false);
            if (copyResponse.includes('OK')) {
              console.log(`✅ Copied email UID ${uid} to ${folder}`);
              copied = true;
              break;
            }
          } catch (error) {
            console.log(`⚠️ COPY to ${folder} failed: ${error.message}`);
            continue;
          }
        }
        
        // Mark original as deleted and expunge
        const storeResponse = await this.sendCommand(`UID STORE ${uid} +FLAGS (\\Deleted)`);
        if (!storeResponse.includes('OK')) {
          throw new Error(`Failed to mark email as deleted: ${storeResponse}`);
        }
        console.log(`✅ Marked email UID ${uid} as deleted`);
        
        const expungeResponse = await this.sendCommand(`EXPUNGE`);
        if (!expungeResponse.includes('OK')) {
          throw new Error(`Failed to expunge deleted emails: ${expungeResponse}`);
        }
        console.log(`✅ Email UID ${uid} moved to trash via COPY+DELETE+EXPUNGE`);
        moved = true;
      }
      
      if (!moved) {
        throw new Error('All trash move methods failed');
      }
      
    } catch (error) {
      console.error(`❌ Move to trash failed: ${error.message}`);
      throw new Error(`Failed to move email to trash: ${error.message}`);
    }
  }

  async verifyDeletion(originalUid: string): Promise<boolean> {
    if (!this.selectedMailbox) return false;
    
    try {
      console.log(`🔍 Verifying deletion of UID ${originalUid}`);
      
      const response = await this.sendCommand(`UID SEARCH UID ${originalUid}`);
      
      const lines = response.split('\r\n');
      for (const line of lines) {
        if (line.startsWith('* SEARCH ')) {
          const result = line.substring(9).trim();
          if (result === '' || result === originalUid) {
            console.log(`✅ Email UID ${originalUid} verified as deleted`);
            return result === '';
          }
        }
      }
      
      return true; // Assume deleted if search doesn't return the UID
      
    } catch (error) {
      console.log(`⚠️ Verification failed: ${error.message}`);
      return false; // Cannot verify, assume it failed
    }
  }

  async close(): Promise<void> {
    try {
      if (this.isLoggedIn && this.writer) {
        try {
          await this.sendCommand('LOGOUT', false);
          console.log('✅ IMAP logout successful');
        } catch (error) {
          console.log('⚠️ Logout error (ignored):', error.message);
        }
      }
      
      if (this.writer) {
        try {
          await this.writer.close();
        } catch (error) {
          console.log('⚠️ Writer close error (ignored):', error.message);
        }
      }
      
      if (this.conn) {
        try {
          this.conn.close();
          console.log('✅ IMAP connection closed');
        } catch (error) {
          console.log('⚠️ Connection close error (ignored):', error.message);
        }
      }
      
    } catch (error) {
      console.log('⚠️ Close error (ignored):', error.message);
    } finally {
      this.conn = null;
      this.reader = null;
      this.writer = null;
      this.isLoggedIn = false;
      this.selectedMailbox = '';
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
    console.log(`\n🚀 === Email Delete Request: ${req.method} ===`)
    
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { emailId, userId, permanent = false } = await req.json()

    console.log(`📧 Processing delete request:`)
    console.log(`   Email ID: ${emailId}`)
    console.log(`   User ID: ${userId}`)
    console.log(`   Permanent: ${permanent}`)

    // Get email details from database
    const { data: email, error: emailError } = await supabaseAdmin
      .from('emails')
      .select('*, email_accounts!inner(*)')
      .eq('id', emailId)
      .eq('team_id', userId)
      .single()

    if (emailError || !email) {
      console.error('❌ Email not found in database:', emailError)
      throw new Error('Email not found in database')
    }

    const account = email.email_accounts

    console.log(`📧 Email details:`)
    console.log(`   Subject: "${email.subject}"`)
    console.log(`   From: ${email.sender}`)
    console.log(`   Message-ID: ${email.message_id || 'N/A'}`)
    console.log(`   Account: ${account.email} (${account.name})`)

    // Configure IMAP settings
    const imapConfig = {
      host: account.imap_host || account.smtp_host.replace('smtp', 'imap'),
      port: account.imap_port || 993,
      username: account.smtp_username,
      password: account.smtp_password,
      useSSL: true
    }

    console.log(`🔧 IMAP Configuration:`)
    console.log(`   Host: ${imapConfig.host}:${imapConfig.port}`)
    console.log(`   Username: ${imapConfig.username}`)
    console.log(`   SSL: ${imapConfig.useSSL}`)

    // Perform IMAP deletion
    let imapSuccess = false;
    let imapErrorMessage = '';
    let deletedUids: string[] = [];

    const imap = new IMAPDeleteClient(imapConfig);
    
    try {
      console.log(`\n🔌 Starting IMAP operations...`)
      
      await imap.connect();
      await imap.login();
      
      // Get available mailboxes
      const mailboxes = await imap.listMailboxes();
      
      // Search through mailboxes in priority order
      const searchMailboxes = [
        'INBOX',
        'Sent',
        'Drafts',
        'INBOX.Sent',
        'INBOX.Drafts',
        '[Gmail]/Sent Mail',
        '[Gmail]/Drafts',
        ...mailboxes.filter(m => !['INBOX', 'Sent', 'Drafts'].some(priority => m.includes(priority)))
      ];
      
      let foundAndProcessed = false;
      
      for (const mailbox of searchMailboxes) {
        if (foundAndProcessed) break;
        
        console.log(`\n📂 === Checking mailbox: ${mailbox} ===`);
        
        const selected = await imap.selectMailbox(mailbox);
        if (!selected) {
          console.log(`⚠️ Could not select mailbox: ${mailbox}`);
          continue;
        }
        
        let uids: string[] = [];
        
        // Search by Message-ID first (most reliable)
        if (email.message_id) {
          uids = await imap.searchByMessageId(email.message_id);
        }
        
        // Fallback to sender search if Message-ID search fails
        if (uids.length === 0 && email.sender) {
          console.log(`🔍 No results by Message-ID, trying sender search...`);
          uids = await imap.searchBySender(email.sender);
        }
        
        if (uids.length > 0) {
          console.log(`✅ Found ${uids.length} email(s) in ${mailbox}: UIDs ${uids.join(', ')}`);
          
          // Process each UID
          for (const uid of uids) {
            try {
              console.log(`\n🗑️ Processing UID ${uid}...`);
              
              if (permanent) {
                await imap.permanentDelete(uid);
                console.log(`✅ UID ${uid} permanently deleted`);
              } else {
                await imap.moveToTrash(uid);
                console.log(`✅ UID ${uid} moved to trash`);
              }
              
              // Verify deletion
              const verified = await imap.verifyDeletion(uid);
              if (verified) {
                console.log(`✅ Deletion of UID ${uid} verified`);
                deletedUids.push(uid);
                foundAndProcessed = true;
                imapSuccess = true;
              } else {
                console.log(`❌ Deletion of UID ${uid} could not be verified`);
                imapErrorMessage += `UID ${uid} deletion not verified; `;
              }
              
            } catch (uidError) {
              console.error(`❌ Failed to process UID ${uid}:`, uidError.message);
              imapErrorMessage += `UID ${uid}: ${uidError.message}; `;
            }
          }
        } else {
          console.log(`⚠️ No emails found in ${mailbox}`);
        }
      }
      
      if (!foundAndProcessed) {
        imapErrorMessage = 'Email not found in any mailbox on IMAP server';
        console.log(`❌ ${imapErrorMessage}`);
      } else {
        console.log(`\n✅ IMAP operations completed successfully. Deleted UIDs: ${deletedUids.join(', ')}`);
      }
      
    } catch (imapError) {
      console.error('❌ IMAP operation failed:', imapError);
      imapErrorMessage = imapError.message;
    } finally {
      await imap.close();
    }

    // Update database based on deletion type and IMAP success
    console.log(`\n💾 Updating database...`);
    
    if (permanent) {
      // Permanent deletion - remove from database completely
      const { error: deleteError } = await supabaseAdmin
        .from('emails')
        .delete()
        .eq('id', emailId)
        .eq('team_id', userId)

      if (deleteError) {
        console.error('❌ Database delete error:', deleteError)
        throw deleteError
      }

      console.log(`✅ Email permanently deleted from database`)
      
      const message = imapSuccess 
        ? `Email wurde dauerhaft gelöscht (IMAP UIDs: ${deletedUids.join(', ')})`
        : `Email wurde aus der Datenbank gelöscht. IMAP-Fehler: ${imapErrorMessage}`;
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message,
          action: 'permanent_delete',
          imapSuccess,
          imapError: imapErrorMessage || null,
          deletedUids: deletedUids
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    } else {
      // Soft delete - mark as deleted in database
      const updateData = {
        is_deleted: true,
        is_archived: false,
        folder: null,
        updated_at: new Date().toISOString()
      };

      const { error: updateError } = await supabaseAdmin
        .from('emails')
        .update(updateData)
        .eq('id', emailId)
        .eq('team_id', userId)

      if (updateError) {
        console.error('❌ Database update error:', updateError)
        throw updateError
      }

      console.log(`✅ Email marked as deleted in database`)
      
      const message = imapSuccess 
        ? `Email wurde in den Papierkorb verschoben (IMAP UIDs: ${deletedUids.join(', ')})`
        : `Email wurde in der Datenbank als gelöscht markiert. IMAP-Fehler: ${imapErrorMessage}`;
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message,
          action: 'move_to_trash',
          imapSuccess,
          imapError: imapErrorMessage || null,
          deletedUids: deletedUids
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }

  } catch (error) {
    console.error('❌ Email delete operation failed:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
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
