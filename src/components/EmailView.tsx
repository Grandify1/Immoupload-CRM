import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Mail, Send, Inbox, Settings, Plus, Trash2, RefreshCw, Archive, AlertTriangle, Edit, FolderOpen } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import DOMPurify from 'dompurify';

interface EmailAccount {
  id: string;
  name: string;
  email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  imap_host?: string;
  imap_port?: number;
  is_active: boolean;
  team_id: string;
}

interface Email {
  id: string;
  subject: string;
  sender: string;
  recipient: string;
  body?: string;
  received_at: string;
  is_read: boolean;
  lead_id?: string;
  account_id: string;
  message_id?: string;
  team_id: string;
  folder?: string;
  is_archived?: boolean;
  is_deleted?: boolean;
}

type EmailFolder = 'inbox' | 'sent' | 'drafts' | 'junk' | 'archived' | 'deleted';

// Base64 decoding helper function with improved German umlauts support
const decodeBase64Email = (text: string): string => {
  try {
    // Handle different Base64 email encoding patterns
    let processedText = text.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (match, charset, encoding, encoded) => {
      try {
        if (encoding.toUpperCase() === 'B') {
          // Base64 decoding
          const decoded = atob(encoded);
          // Handle UTF-8 encoding properly for German umlauts
          if (charset.toLowerCase().includes('utf-8') || charset.toLowerCase().includes('utf8')) {
            // Convert UTF-8 bytes to proper Unicode string
            const bytes = new Uint8Array(decoded.length);
            for (let i = 0; i < decoded.length; i++) {
              bytes[i] = decoded.charCodeAt(i);
            }
            return new TextDecoder('utf-8').decode(bytes);
          } else {
            return decodeURIComponent(escape(decoded));
          }
        } else if (encoding.toUpperCase() === 'Q') {
          // Quoted-printable decoding
          return encoded
            .replace(/=([0-9A-F]{2})/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/_/g, ' ');
        }
        return match;
      } catch (e) {
        console.warn('Failed to decode email text:', e);
        return encoded; // Return the encoded part if decoding fails
      }
    });

    // Additional cleanup for common German umlaut encoding issues
    processedText = processedText
      .replace(/=C3=A4/gi, 'ä')
      .replace(/=C3=B6/gi, 'ö')
      .replace(/=C3=BC/gi, 'ü')
      .replace(/=C3=84/gi, 'Ä')
      .replace(/=C3=96/gi, 'Ö')
      .replace(/=C3=9C/gi, 'Ü')
      .replace(/=C3=9F/gi, 'ß')
      .replace(/=E2=80=99/gi, "'") // Right single quotation mark
      .replace(/=E2=80=9C/gi, '"') // Left double quotation mark
      .replace(/=E2=80=9D/gi, '"'); // Right double quotation mark

    return processedText;
  } catch (e) {
    console.warn('Failed to process email encoding:', e);
    return text;
  }
};

// Email Body Renderer Component - Apple Mail Style
const EmailBodyRenderer: React.FC<{ body?: string }> = ({ body }) => {
  if (!body) {
    return (
      <div className="text-muted-foreground italic p-6 text-center">
        <div className="text-gray-400 mb-2">📧</div>
        <p>Keine Nachricht verfügbar</p>
      </div>
    );
  }

  // First, decode any Base64 encoded text
  let processedBody = decodeBase64Email(body);

  // Check if content looks like HTML
  const isHTML = processedBody.includes('<html') || processedBody.includes('<!DOCTYPE') || 
                 processedBody.includes('<div') || processedBody.includes('<p') || 
                 processedBody.includes('<br') || processedBody.includes('<table') ||
                 processedBody.includes('<span');

  if (isHTML) {
    // Advanced HTML cleaning for Apple Mail-like appearance
    let cleanedHTML = processedBody
      // Remove DOCTYPE and structure tags
      .replace(/<!DOCTYPE[^>]*>/gi, '')
      .replace(/<\/?html[^>]*>/gi, '')
      .replace(/<\/?head[^>]*>/gi, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<\/?body[^>]*>/gi, '')
      // Remove style/script/meta tags
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<meta[^>]*>/gi, '')
      .replace(/<link[^>]*>/gi, '')
      // Clean up quoted-printable encoding
      .replace(/=([0-9A-F]{2})/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/=\r?\n/g, '') // Remove soft line breaks
      // Clean up whitespace but preserve intentional spacing
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive line breaks
      .replace(/>\s+</g, '><') // Remove whitespace between tags
      .trim();

    // Use DOMPurify with Apple Mail-like settings
    const sanitizedHTML = DOMPurify.sanitize(cleanedHTML, {
      ALLOWED_TAGS: [
        'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot',
        'center', 'font'
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'width', 'height', 'color', 'size', 'face', 'style'
      ],
      ALLOW_DATA_ATTR: false,
      SANITIZE_DOM: true,
      KEEP_CONTENT: true
    });

    return (
      <div className="apple-mail-container">
        <style>{`
          .apple-mail-container {
            background: #ffffff;
            padding: 24px;
            font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 15px;
            line-height: 1.6;
            color: #1d1d1f;
            max-width: 100%;
            word-wrap: break-word;
            overflow-wrap: break-word;
            min-height: 100%;
          }
          
          .apple-mail-container * {
            max-width: 100%;
          }
          
          .apple-mail-container p {
            margin: 0 0 16px 0;
            line-height: 1.47;
          }
          
          .apple-mail-container p:last-child {
            margin-bottom: 0;
          }
          
          .apple-mail-container div {
            margin: 0 0 8px 0;
          }
          
          .apple-mail-container div:last-child {
            margin-bottom: 0;
          }
          
          .apple-mail-container br {
            line-height: 1.47;
          }
          
          .apple-mail-container h1, .apple-mail-container h2, .apple-mail-container h3, 
          .apple-mail-container h4, .apple-mail-container h5, .apple-mail-container h6 {
            margin: 24px 0 12px 0;
            font-weight: 600;
            line-height: 1.3;
            color: #000000;
          }
          
          .apple-mail-container h1 { font-size: 24px; }
          .apple-mail-container h2 { font-size: 20px; }
          .apple-mail-container h3 { font-size: 18px; }
          .apple-mail-container h4 { font-size: 16px; }
          .apple-mail-container h5 { font-size: 14px; }
          .apple-mail-container h6 { font-size: 12px; }
          
          .apple-mail-container a {
            color: #007AFF;
            text-decoration: none;
          }
          
          .apple-mail-container a:hover {
            text-decoration: underline;
          }
          
          .apple-mail-container strong, .apple-mail-container b {
            font-weight: 600;
            color: #000000;
          }
          
          .apple-mail-container em, .apple-mail-container i {
            font-style: italic;
          }
          
          .apple-mail-container ul, .apple-mail-container ol {
            margin: 16px 0;
            padding-left: 24px;
          }
          
          .apple-mail-container li {
            margin: 4px 0;
            line-height: 1.47;
          }
          
          .apple-mail-container blockquote {
            margin: 16px 0;
            padding-left: 16px;
            border-left: 3px solid #E5E5E7;
            color: #6B6B6B;
            font-style: italic;
          }
          
          .apple-mail-container table {
            border-collapse: collapse;
            margin: 16px 0;
            width: 100%;
            font-size: 14px;
          }
          
          .apple-mail-container td, .apple-mail-container th {
            padding: 8px 12px;
            text-align: left;
            vertical-align: top;
            border-bottom: 1px solid #E5E5E7;
          }
          
          .apple-mail-container th {
            font-weight: 600;
            background-color: #F5F5F7;
          }
          
          .apple-mail-container img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 16px 0;
            border-radius: 4px;
          }
          
          .apple-mail-container center {
            text-align: center;
            display: block;
            margin: 16px 0;
          }
          
          .apple-mail-container font {
            display: inline;
          }
          
          .apple-mail-container span {
            display: inline;
          }
          
          /* Remove extra spacing from nested elements */
          .apple-mail-container div div {
            margin: 0;
          }
          
          .apple-mail-container p br + br {
            display: none;
          }
          
          /* Clean code blocks */
          .apple-mail-container code {
            background-color: #F5F5F7;
            padding: 16px;
            border-radius: 8px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.45;
            display: block;
            margin: 16px 0;
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-x: auto;
          }
        `}</style>
        <div dangerouslySetInnerHTML={{ __html: sanitizedHTML }} />
      </div>
    );
  } else {
    // Handle plain text emails with Apple Mail styling
    let cleanedText = processedBody
      // Clean up quoted-printable encoding
      .replace(/=([0-9A-F]{2})/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/=\r?\n/g, '') // Remove soft line breaks
      // Convert URLs to clickable links
      .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      // Convert email addresses to mailto links
      .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '<a href="mailto:$1">$1</a>')
      // Convert line breaks to <br> tags
      .replace(/\r?\n/g, '<br>')
      .trim();

    return (
      <div className="apple-mail-plain-text">
        <style>{`
          .apple-mail-plain-text {
            background: #ffffff;
            padding: 24px;
            font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 15px;
            line-height: 1.6;
            color: #1d1d1f;
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-wrap: break-word;
            min-height: 100%;
          }
          
          .apple-mail-plain-text a {
            color: #007AFF;
            text-decoration: none;
          }
          
          .apple-mail-plain-text a:hover {
            text-decoration: underline;
          }
        `}</style>
        <div dangerouslySetInnerHTML={{ __html: cleanedText }} />
      </div>
    );
  }
};

export function EmailView() {
  const { user } = useAuth();
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<EmailFolder>('inbox');
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showComposeForm, setShowComposeForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastLoadTime, setLastLoadTime] = useState(0);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);

  const [accountForm, setAccountForm] = useState({
    name: '',
    email: '',
    smtp_host: '',
    smtp_port: 587,
    smtp_username: '',
    smtp_password: '',
    imap_host: '',
    imap_port: 993
  });

  const [composeForm, setComposeForm] = useState({
    to: '',
    subject: '',
    body: '',
    account_id: ''
  });

  const folders = [
    { id: 'inbox' as EmailFolder, name: 'Posteingang', icon: Inbox },
    { id: 'sent' as EmailFolder, name: 'Gesendet', icon: Send },
    { id: 'drafts' as EmailFolder, name: 'Entwürfe', icon: Edit },
    { id: 'junk' as EmailFolder, name: 'Junk', icon: AlertTriangle },
    { id: 'archived' as EmailFolder, name: 'Archiviert', icon: Archive },
    { id: 'deleted' as EmailFolder, name: 'Gelöscht', icon: Trash2 }
  ];

  const loadEmailAccounts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('email_accounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEmailAccounts(data || []);
    } catch (error) {
      console.error('Error loading email accounts:', error);
      toast.error('Fehler beim Laden der Email-Konten');
    }
  }, []);

  const loadEmails = useCallback(async (force: boolean = false) => {
    const now = Date.now();
    if (!force && now - lastLoadTime < 2000) {
      console.log('Skipping email load - too recent');
      return;
    }

    try {
      setLastLoadTime(now);
      console.log('Loading emails from database...');

      // Load all emails first, then filter in getFilteredEmails()
      // This ensures we have full control over what's shown in each folder
      const { data, error } = await supabase
        .from('emails')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(200); // Increased limit to account for deleted emails

      if (error) throw error;

      // Keep all emails from database - filtering will be done in getFilteredEmails()
      const allEmails = data || [];

      console.log(`Loaded ${allEmails.length} emails from database`);
      setEmails(allEmails);
    } catch (error) {
      console.error('Error loading emails:', error);
      toast.error('Fehler beim Laden der Emails');
    }
  }, [lastLoadTime]);

  useEffect(() => {
    if (user) {
      loadEmailAccounts();
      loadEmails();
    }
  }, [user, loadEmailAccounts, loadEmails]);

  const getFilteredEmails = () => {
    return emails.filter(email => {
      switch (selectedFolder) {
        case 'inbox':
          return !email.is_deleted && !email.is_archived && (!email.folder || email.folder === 'inbox');
        case 'sent':
          return !email.is_deleted && email.folder === 'sent';
        case 'drafts':
          return !email.is_deleted && email.folder === 'drafts';
        case 'junk':
          return !email.is_deleted && email.folder === 'junk';
        case 'archived':
          return !email.is_deleted && email.is_archived === true;
        case 'deleted':
          return email.is_deleted === true;
        default:
          return !email.is_deleted && (!email.folder || email.folder === 'inbox');
      }
    });
  };

  const moveEmailToFolder = async (emailId: string, folder: EmailFolder) => {
    try {
      if (folder === 'deleted') {
        // Use the IMAP deletion function for deleted emails
        await deleteEmailViaIMAP(emailId, false);
        return;
      }

      const updateData: any = { 
        updated_at: new Date().toISOString()
      };

      if (folder === 'archived') {
        updateData.is_archived = true;
        updateData.is_deleted = false;
        updateData.folder = null; // Don't set folder for archived emails
      } else if (folder === 'inbox') {
        updateData.is_deleted = false;
        updateData.is_archived = false;
        updateData.folder = 'inbox';
      } else if (folder === 'sent') {
        updateData.is_deleted = false;
        updateData.is_archived = false;
        updateData.folder = 'sent';
      } else if (folder === 'drafts') {
        updateData.is_deleted = false;
        updateData.is_archived = false;
        updateData.folder = 'drafts';
      } else if (folder === 'junk') {
        updateData.is_deleted = false;
        updateData.is_archived = false;
        updateData.folder = 'junk';
      } else {
        updateData.is_deleted = false;
        updateData.is_archived = false;
        updateData.folder = 'inbox';
      }

      const { error } = await supabase
        .from('emails')
        .update(updateData)
        .eq('id', emailId)
        .eq('team_id', user?.id);

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      toast.success(`Email nach ${folders.find(f => f.id === folder)?.name} verschoben`);

      // Update local state immediately
      setEmails(prev => {
        const newEmails = prev.map(email => 
          email.id === emailId 
            ? { ...email, ...updateData }
            : email
        );
        console.log(`Moved email ${emailId} to folder ${folder}. Updated email:`, newEmails.find(e => e.id === emailId));
        return newEmails;
      });

      if (selectedEmail?.id === emailId) {
        setSelectedEmail(null);
      }

      // Force refresh after folder move to ensure data consistency
      setTimeout(() => {
        console.log('Refreshing email list after folder move...');
        loadEmails(true);
      }, 500);
    } catch (error) {
      console.error('Error moving email:', error);
      toast.error(`Fehler beim Verschieben der Email: ${error.message}`);
    }
  };

  const deleteEmailViaIMAP = async (emailId: string, permanent: boolean = false) => {
    try {
      setLoading(true);
      console.log(`Starting email deletion: ${emailId}, permanent: ${permanent}`);

      const { data, error } = await supabase.functions.invoke('delete-email', {
        body: {
          emailId,
          userId: user?.id,
          permanent
        }
      });

      if (error) {
        console.error('IMAP deletion error:', error);
        throw new Error(error.message || 'Fehler beim Löschen über IMAP');
      }

      console.log('Email deletion result:', data);

      // Check if the deletion was actually successful
      if (!data || !data.success) {
        throw new Error(data?.error || 'Email-Löschung fehlgeschlagen');
      }

      // Show different messages based on IMAP success
      if (data.imapSuccess) {
        if (permanent) {
          toast.success(data.message || 'Email wurde dauerhaft gelöscht', {
            description: data.deletedUids ? `IMAP UIDs: ${data.deletedUids.join(', ')}` : undefined
          });
        } else {
          toast.success(data.message || 'Email wurde erfolgreich in den Papierkorb verschoben', {
            description: data.deletedUids ? `IMAP UIDs: ${data.deletedUids.join(', ')}` : undefined
          });
        }
      } else {
        // IMAP failed but database was updated - provide more specific feedback
        const isNotFoundError = data.imapError && data.imapError.includes('not found');

        if (isNotFoundError) {
          // Email not found on IMAP server - this is actually OK, it means it was already deleted
          if (permanent) {
            toast.success('Email wurde aus der Datenbank entfernt', {
              description: 'Email war bereits vom IMAP-Server gelöscht'
            });
          } else {
            toast.success('Email wurde in den Papierkorb verschoben', {
              description: 'Email war bereits vom IMAP-Server gelöscht'
            });
          }
        } else {
          // Other IMAP errors
          if (permanent) {
            toast.warning('Email aus Datenbank gelöscht, aber IMAP-Löschung fehlgeschlagen', {
              description: data.imapError || 'Unbekannter IMAP-Fehler'
            });
          } else {
            toast.warning('Email in Datenbank als gelöscht markiert, aber IMAP-Verschiebung fehlgeschlagen', {
              description: data.imapError || 'Unbekannter IMAP-Fehler'
            });
          }
        }
      }

      // Update local state based on deletion type
      if (permanent) {
        // Remove from local state completely
        setEmails(prev => {
          const newEmails = prev.filter(email => email.id !== emailId);
          console.log(`Permanently removed email ${emailId}. Remaining emails:`, newEmails.length);
          return newEmails;
        });
      } else {
        // Update local state to mark as deleted
        setEmails(prev => {
          const newEmails = prev.map(email => 
            email.id === emailId 
              ? { ...email, is_deleted: true, is_archived: false, folder: null, updated_at: new Date().toISOString() }
              : email
          );
          console.log(`Marked email ${emailId} as deleted. Updated emails:`, newEmails.filter(e => e.id === emailId));
          return newEmails;
        });
      }

      // Clear selected email if it was the one being deleted
      if (selectedEmail?.id === emailId) {
        setSelectedEmail(null);
      }

      // Email state is already updated locally - no need for automatic refresh
      // User can manually refresh if needed using the "Emails aktualisieren" button

    } catch (error) {
      console.error('Error deleting email via IMAP:', error);

      // Show specific error messages
      if (error.message.includes('not found')) {
        toast.error('Email nicht gefunden', {
          description: 'Die Email existiert möglicherweise nicht mehr auf dem Server'
        });
      } else if (error.message.includes('IMAP')) {
        toast.error('IMAP-Server Fehler', {
          description: error.message
        });
      } else if (error.message.includes('authentication') || error.message.includes('login')) {
        toast.error('Authentifizierung fehlgeschlagen', {
          description: 'Überprüfen Sie die Email-Konto Einstellungen'
        });
      } else {
        toast.error('Fehler beim Löschen der Email', {
          description: error.message
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const deleteEmailPermanently = async (emailId: string) => {
    await deleteEmailViaIMAP(emailId, true);
  };

  const markAsRead = async (emailId: string) => {
    try {
      const { error } = await supabase
        .from('emails')
        .update({ is_read: true })
        .eq('id', emailId);

      if (error) throw error;

      setEmails(prev => prev.map(email => 
        email.id === emailId ? { ...email, is_read: true } : email
      ));
    } catch (error) {
      console.error('Error marking email as read:', error);
    }
  };

  const handleEmailSelect = (email: Email) => {
    setSelectedEmail(email);
    if (!email.is_read) {
      markAsRead(email.id);
    }
  };

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('email_accounts')
        .insert([{
          ...accountForm,
          team_id: user?.id,
          is_active: true
        }]);

      if (error) throw error;

      toast.success('Email-Konto erfolgreich hinzugefügt');
      setShowAccountForm(false);
      setAccountForm({
        name: '',
        email: '',
        smtp_host: '',
        smtp_port: 587,
        smtp_username: '',
        smtp_password: '',
        imap_host: '',
        imap_port: 993
      });
      loadEmailAccounts();
    } catch (error) {
      console.error('Error adding email account:', error);
      toast.error('Fehler beim Hinzufügen des Email-Kontos');
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          ...composeForm,
          user_id: user?.id
        }
      });

      if (error) {
        console.error('SMTP Error:', error);
        throw new Error(error.message || 'Unbekannter SMTP-Fehler');
      }

      console.log('Email sent successfully:', data);
      toast.success('Email erfolgreich über SMTP versendet!');
      setComposeForm({ to: '', subject: '', body: '', account_id: '' });
      setShowComposeForm(false);
      loadEmails();
    } catch (error) {
      console.error('Error sending email:', error);

      if (error.message.includes('SMTP')) {
        toast.error(`SMTP-Fehler: ${error.message}`, {
          description: 'Überprüfen Sie Ihre SMTP-Einstellungen'
        });
      } else if (error.message.includes('authentication') || error.message.includes('login')) {
        toast.error('Authentifizierung fehlgeschlagen', {
          description: 'Überprüfen Sie Benutzername und Passwort'
        });
      } else {
        toast.error('Fehler beim Versenden der Email', {
          description: error.message
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const deleteEmailAccount = async (accountId: string) => {
    try {
      const { error } = await supabase
        .from('email_accounts')
        .delete()
        .eq('id', accountId);

      if (error) throw error;

      toast.success('Email-Konto gelöscht');
      loadEmailAccounts();
    } catch (error) {
      console.error('Error deleting email account:', error);
      toast.error('Fehler beim Löschen des Email-Kontos');
    }
  };

  const syncEmails = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('sync-emails', {
        body: { user_id: user?.id }
      });

      if (error) throw error;

      toast.success('Emails werden synchronisiert');
      setTimeout(() => loadEmails(), 1000);
    } catch (error) {
      console.error('Error syncing emails:', error);
      toast.error('Fehler beim Synchronisieren der Emails');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectEmail = (emailId: string) => {
    setSelectedEmails(prev => {
      if (prev.includes(emailId)) {
        return prev.filter(id => id !== emailId);
      } else {
        return [...prev, emailId];
      }
    });
  };

  const handleBulkDelete = async () => {
    if (selectedEmails.length === 0) {
      toast.warning('Bitte wähle zuerst Emails aus.');
      return;
    }

    setLoading(true);
    try {
      await Promise.all(
        selectedEmails.map(emailId => deleteEmailViaIMAP(emailId, false))
      );
      toast.success('Ausgewählte Emails wurden gelöscht.');
      setSelectedEmails([]);
      
      // No automatic refresh - emails are already updated in local state
    } catch (error) {
      console.error('Fehler beim Löschen von Emails:', error);
      toast.error('Fehler beim Löschen der ausgewählten Emails.');
    } finally {
      setLoading(false);
    }
  };

  const filteredEmails = getFilteredEmails();
  const unreadCount = emails.filter(e => !e.is_read && !e.is_deleted && (!e.folder || e.folder === 'inbox')).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Email</h1>
          <p className="text-muted-foreground">
            Verwalte deine Email-Konten und Kommunikation
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={syncEmails} variant="outline" disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Emails aktualisieren
          </Button>
          <Button onClick={() => setShowComposeForm(true)}>
            <Send className="w-4 h-4 mr-2" />
            Neue Email
          </Button>
        </div>
      </div>

      <Tabs defaultValue="emails" className="w-full">
        <TabsList>
          <TabsTrigger value="emails">
            <Mail className="w-4 h-4 mr-2" />
            Emails
          </TabsTrigger>
          <TabsTrigger value="accounts">
            <Settings className="w-4 h-4 mr-2" />
            Email-Konten
          </TabsTrigger>
        </TabsList>

        <TabsContent value="emails">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Ordner-Sidebar */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle>Ordner</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="space-y-1">
                    {folders.map((folder) => {
                      const folderEmails = emails.filter(email => {
                        switch (folder.id) {
                          case 'inbox':
                            return !email.is_deleted && !email.is_archived && (!email.folder || email.folder === 'inbox');
                          case 'sent':
                            return !email.is_deleted && email.folder === 'sent';
                          case 'drafts':
                            return !email.is_deleted && email.folder === 'drafts';
                          case 'junk':
                            return !email.is_deleted && email.folder === 'junk';
                          case 'archived':
                            return !email.is_deleted && email.is_archived === true;
                          case 'deleted':
                            return email.is_deleted === true;
                          default:
                            return false;
                        }
                      });

                      const folderUnreadCount = folderEmails.filter(e => !e.is_read).length;

                      return (
                        <div
                          key={folder.id}
                          className={`flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 ${
                            selectedFolder === folder.id ? 'bg-muted' : ''
                          }`}
                          onClick={() => setSelectedFolder(folder.id)}
                        >
                          <div className="flex items-center gap-2">
                            <folder.icon className="w-4 h-4" />
                            <span className="text-sm font-medium">{folder.name}</span>
                          </div>
                          <div className="flex gap-1">
                            {folderUnreadCount > 0 && (
                              <Badge variant="default" className="text-xs">
                                {folderUnreadCount}
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-xs">
                              {folderEmails.length}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Email-Liste */}
            <div className="lg:col-span-1">
              <Card className="h-[calc(100vh-200px)] flex flex-col">
                <CardHeader className="flex-shrink-0">
                  <CardTitle>
                    {folders.find(f => f.id === selectedFolder)?.name}
                  </CardTitle>
                  <CardDescription>
                    {filteredEmails.filter(e => !e.is_read).length} ungelesene von {filteredEmails.length} Nachrichten
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-hidden">
                {selectedEmails.length > 0 && (
                    <div className="p-4">
                      <Button variant="destructive" onClick={handleBulkDelete} disabled={loading}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Ausgewählte löschen ({selectedEmails.length})
                      </Button>
                    </div>
                  )}
                  {filteredEmails.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      Keine Emails in diesem Ordner
                    </div>
                  ) : (
                    <div className="divide-y h-full overflow-y-auto">
                      {filteredEmails.map((email) => {
                        // Extract sender name and email from sender field
                        const extractSenderInfo = (senderString: string) => {
                          // Handle formats like "Name <email@domain.com>" or just "email@domain.com"
                          const match = senderString.match(/^(.+?)\s*<(.+?)>$/);
                          if (match) {
                            return {
                              name: decodeBase64Email(match[1].trim()),
                              email: match[2].trim()
                            };
                          } else {
                            // If no name, just email
                            return {
                              name: senderString.trim(),
                              email: senderString.trim()
                            };
                          }
                        };

                        const senderInfo = extractSenderInfo(email.sender);
                        const decodedSubject = decodeBase64Email(email.subject);

                        return (
                          <div
                            key={email.id}
                            className={`p-4 cursor-pointer hover:bg-muted/50 ${
                              selectedEmail?.id === email.id ? 'bg-muted' : ''
                            } ${!email.is_read ? 'font-semibold' : ''}`}
                            onClick={() => handleEmailSelect(email)}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id={`email-${email.id}`}
                                checked={selectedEmails.includes(email.id)}
                                onCheckedChange={() => handleSelectEmail(email.id)}
                                className="mt-1"
                              />
                              <div className="flex-1 min-w-0 space-y-1">
                                {/* Sender Name */}
                                <div className="flex items-center justify-between">
                                  <div className="text-sm font-medium truncate">
                                    {senderInfo.name}
                                  </div>
                                  {!email.is_read && (
                                    <Badge variant="default" className="ml-2 flex-shrink-0">
                                      Neu
                                    </Badge>
                                  )}
                                </div>
                                
                                {/* Sender Email (if different from name) */}
                                {senderInfo.name !== senderInfo.email && (
                                  <div className="text-xs text-muted-foreground truncate">
                                    {senderInfo.email}
                                  </div>
                                )}
                                
                                {/* Subject */}
                                <div className="text-sm truncate">
                                  {decodedSubject}
                                </div>
                                
                                {/* Date */}
                                <div className="text-xs text-muted-foreground">
                                  {new Date(email.received_at).toLocaleDateString('de-DE', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Email-Inhalt */}
            <div className="lg:col-span-2">
              {selectedEmail ? (
                <Card className="h-[calc(100vh-200px)] flex flex-col">
                  <CardHeader className="flex-shrink-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{decodeBase64Email(selectedEmail.subject)}</CardTitle>
                        <CardDescription>
                          Von: {(() => {
                            const match = selectedEmail.sender.match(/^(.+?)\s*<(.+?)>$/);
                            if (match) {
                              return `${decodeBase64Email(match[1].trim())} (${match[2].trim()})`;
                            }
                            return selectedEmail.sender;
                          })()} • {new Date(selectedEmail.received_at).toLocaleString('de-DE')}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setComposeForm(prev => ({
                            ...prev,
                            to: selectedEmail.sender,
                            subject: `Re: ${selectedEmail.subject}`
                          }))}
                        >
                          Antworten
                        </Button>
                        {selectedFolder !== 'archived' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => moveEmailToFolder(selectedEmail.id, 'archived')}
                          >
                            <Archive className="w-4 h-4" />
                          </Button>
                        )}
                        {selectedFolder !== 'deleted' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => moveEmailToFolder(selectedEmail.id, 'deleted')}
                            disabled={loading}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => moveEmailToFolder(selectedEmail.id, 'inbox')}
                              disabled={loading}
                            >
                              <FolderOpen className="w-4 h-4" />
                              Wiederherstellen
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => deleteEmailPermanently(selectedEmail.id)}
                              disabled={loading}
                            >
                              <Trash2 className="w-4 h-4" />
                              Dauerhaft löschen
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 p-0">
                    <div className="h-full overflow-y-auto">
                      <EmailBodyRenderer body={selectedEmail.body} />
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="flex items-center justify-center h-64">
                    <div className="text-center text-muted-foreground">
                      <Mail className="w-12 h-12 mx-auto mb-4" />
                      <p>Wähle eine Email aus, um sie zu lesen</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="accounts">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Email-Konten</h2>
              <Button onClick={() => setShowAccountForm(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Konto hinzufügen
              </Button>
            </div>

            <div className="grid gap-4">
              {emailAccounts.map((account) => (
                <Card key={account.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>{account.name}</CardTitle>
                        <CardDescription>{account.email}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={account.is_active ? "default" : "secondary"}>
                          {account.is_active ? "Aktiv" : "Inaktiv"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteEmailAccount(account.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <Label className="text-xs text-muted-foreground">SMTP Server</Label>
                        <p>{account.smtp_host}:{account.smtp_port}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">IMAP Server</Label>
                        <p>{account.imap_host}:{account.imap_port}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Account Form Modal */}
      {showAccountForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Email-Konto hinzufügen</CardTitle>
              <CardDescription>
                Füge ein neues Email-Konto für SMTP und IMAP hinzu
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAccountSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={accountForm.name}
                    onChange={(e) => setAccountForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="z.B. Geschäftskonto"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="email">Email-Adresse</Label>
                  <Input
                    id="email"
                    type="email"
                    value={accountForm.email}
                    onChange={(e) => setAccountForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="mail@example.com"
                    required
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="smtp_host">SMTP Server</Label>
                    <Input
                      id="smtp_host"
                      value={accountForm.smtp_host}
                      onChange={(e) => setAccountForm(prev => ({ ...prev, smtp_host: e.target.value }))}
                      placeholder="smtp.gmail.com"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="smtp_port">SMTP Port</Label>
                    <Input
                      id="smtp_port"
                      type="number"
                      value={accountForm.smtp_port}
                      onChange={(e) => setAccountForm(prev => ({ ...prev, smtp_port: parseInt(e.target.value) }))}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="smtp_username">SMTP Benutzername</Label>
                  <Input
                    id="smtp_username"
                    value={accountForm.smtp_username}
                    onChange={(e) => setAccountForm(prev => ({ ...prev, smtp_username: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="smtp_password">SMTP Passwort</Label>
                  <Input
                    id="smtp_password"
                    type="password"
                    value={accountForm.smtp_password}
                    onChange={(e) => setAccountForm(prev => ({ ...prev, smtp_password: e.target.value }))}
                    required
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="imap_host">IMAP Server (optional)</Label>
                    <Input
                      id="imap_host"
                      value={accountForm.imap_host}
                      onChange={(e) => setAccountForm(prev => ({ ...prev, imap_host: e.target.value }))}
                      placeholder="imap.gmail.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="imap_port">IMAP Port</Label>
# Adding bulk selection and bulk delete functionality to the EmailView component.
                    <Input
                      id="imap_port"
                      type="number"
                      value={accountForm.imap_port}
                      onChange={(e) => setAccountForm(prev => ({ ...prev, imap_port: parseInt(e.target.value) }))}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowAccountForm(false)}>
                    Abbrechen
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Speichern...' : 'Speichern'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Compose Email Modal */}
      {showComposeForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl mx-4">
            <CardHeader>
              <CardTitle>Neue Email</CardTitle>
              <CardDescription>
                Erstelle und sende eine neue Email
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSendEmail} className="space-y-4">
                <div>
                  <Label htmlFor="account_id">Von Konto</Label>
                  <select
                    className="w-full p-2 border rounded"
                    value={composeForm.account_id}
                    onChange={(e) => setComposeForm(prev => ({ ...prev, account_id: e.target.value }))}
                    required
                  >
                    <option value="">Konto auswählen</option>
                    {emailAccounts.filter(a => a.is_active).map(account => (
                      <option key={account.id} value={account.id}>
                        {account.name} ({account.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="to">An</Label>
                  <Input
                    id="to"
                    type="email"
                    value={composeForm.to}
                    onChange={(e) => setComposeForm(prev => ({ ...prev, to: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="subject">Betreff</Label>
                  <Input
                    id="subject"
                    value={composeForm.subject}
                    onChange={(e) => setComposeForm(prev => ({ ...prev, subject: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="body">Nachricht</Label>
                  <Textarea
                    id="body"
                    value={composeForm.body}
                    onChange={(e) => setComposeForm(prev => ({ ...prev, body: e.target.value }))}
                    rows={10}
                    required
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowComposeForm(false)}>
                    Abbrechen
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Senden...' : 'Senden'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};