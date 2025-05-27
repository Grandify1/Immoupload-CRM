import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Mail, Send, Inbox, Settings, Plus, Trash2, RefreshCw } from 'lucide-react';
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
  body: string;
  received_at: string;
  is_read: boolean;
  lead_id?: string;
}

export const EmailView: React.FC = () => {
  const { user } = useAuth();
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showComposeForm, setShowComposeForm] = useState(false);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    loadEmailAccounts();
    loadEmails();
  }, []);

  const loadEmailAccounts = async () => {
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
  };

  const loadEmails = async () => {
    try {
      const { data, error } = await supabase
        .from('emails')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setEmails(data || []);
    } catch (error) {
      console.error('Error loading emails:', error);
      toast.error('Fehler beim Laden der Emails');
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
          team_id: user?.id, // Vereinfacht für User-basiert
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

      // Show specific error messages
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
      loadEmails();
    } catch (error) {
      console.error('Error syncing emails:', error);
      toast.error('Fehler beim Synchronisieren der Emails');
    } finally {
      setLoading(false);
    }
  };

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

      <Tabs defaultValue="inbox" className="w-full">
        <TabsList>
          <TabsTrigger value="inbox">
            <Inbox className="w-4 h-4 mr-2" />
            Posteingang
          </TabsTrigger>
          <TabsTrigger value="accounts">
            <Settings className="w-4 h-4 mr-2" />
            Email-Konten
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <Card className="h-[calc(100vh-200px)] flex flex-col">
                <CardHeader className="flex-shrink-0">
                  <CardTitle>Posteingang</CardTitle>
                  <CardDescription>
                    {emails.filter(e => !e.is_read).length} ungelesene Nachrichten
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-hidden">
                  {emails.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      Keine Emails vorhanden
                    </div>
                  ) : (
                    <div className="divide-y h-full overflow-y-auto">
                      {emails.map((email) => (
                        <div
                          key={email.id}
                          className={`p-4 cursor-pointer hover:bg-muted/50 ${
                            selectedEmail?.id === email.id ? 'bg-muted' : ''
                          } ${!email.is_read ? 'font-semibold' : ''}`}
                          onClick={() => setSelectedEmail(email)}
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
                      <Button
                        variant="outline"
                        onClick={() => setComposeForm(prev => ({
                          ...prev,
                          to: selectedEmail.sender,
                          subject: `Re: ${selectedEmail.subject}`
                        }))}
                      >
                        Antworten
                      </Button>
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