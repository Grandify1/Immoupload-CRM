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
      const { data, error } = await supabase
        .from('emails')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      console.log(`Loaded ${data?.length || 0} emails from database`);
      setEmails(data || []);
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
          return !email.folder || email.folder === 'inbox';
        case 'sent':
          return email.folder === 'sent';
        case 'drafts':
          return email.folder === 'drafts';
        case 'junk':
          return email.folder === 'junk';
        case 'archived':
          return email.is_archived === true;
        case 'deleted':
          return email.is_deleted === true;
        default:
          return !email.folder || email.folder === 'inbox';
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
      
      if (permanent) {
        toast.success('Email dauerhaft vom Server und aus der Datenbank gelöscht');
        // Remove from local state completely
        setEmails(prev => {
          const newEmails = prev.filter(email => email.id !== emailId);
          console.log(`Permanently removed email ${emailId}. Remaining emails:`, newEmails.length);
          return newEmails;
        });
      } else {
        toast.success('Email in den Papierkorb verschoben');
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

      // Force a re-render by triggering loadEmails after a short delay
      setTimeout(() => {
        console.log('Refreshing email list after deletion...');
        loadEmails(true);
      }, 500);

    } catch (error) {
      console.error('Error deleting email via IMAP:', error);
      toast.error(`Fehler beim Löschen der Email: ${error.message}`);
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

  
  
  const filteredEmails = getFilteredEmails();
  const unreadCount = emails.filter(e => !e.is_read && (!e.folder || e.folder === 'inbox')).length;

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
                            return !email.folder || email.folder === 'inbox';
                          case 'sent':
                            return email.folder === 'sent';
                          case 'drafts':
                            return email.folder === 'drafts';
                          case 'junk':
                            return email.folder === 'junk';
                          case 'archived':
                            return email.is_archived === true;
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
                  {filteredEmails.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      Keine Emails in diesem Ordner
                    </div>
                  ) : (
                    <div className="divide-y h-full overflow-y-auto">
                      {filteredEmails.map((email) => (
                        <div
                          key={email.id}
                          className={`p-4 cursor-pointer hover:bg-muted/50 ${
                            selectedEmail?.id === email.id ? 'bg-muted' : ''
                          } ${!email.is_read ? 'font-semibold' : ''}`}
                          onClick={() => handleEmailSelect(email)}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium truncate">
                              {email.sender}
                            </span>
                            {!email.is_read && (
                              <Badge variant="default" className="ml-2">
                                Neu
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm font-medium mb-1 truncate">
                            {email.subject}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(email.received_at).toLocaleDateString('de-DE')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Email-Inhalt */}
            <div className="lg:col-span-2">
              {selectedEmail ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>{selectedEmail.subject}</CardTitle>
                        <CardDescription>
                          Von: {selectedEmail.sender} • {new Date(selectedEmail.received_at).toLocaleString('de-DE')}
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
                  <CardContent>
                    <div className="whitespace-pre-wrap">
                      {selectedEmail.body}
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