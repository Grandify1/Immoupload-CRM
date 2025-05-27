
-- Create email_accounts table
CREATE TABLE IF NOT EXISTS public.email_accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    smtp_host TEXT NOT NULL,
    smtp_port INTEGER NOT NULL DEFAULT 587,
    smtp_username TEXT NOT NULL,
    smtp_password TEXT NOT NULL,
    imap_host TEXT,
    imap_port INTEGER DEFAULT 993,
    is_active BOOLEAN DEFAULT true,
    team_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create emails table
CREATE TABLE IF NOT EXISTS public.emails (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subject TEXT NOT NULL,
    sender TEXT NOT NULL,
    recipient TEXT NOT NULL,
    body TEXT,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_read BOOLEAN DEFAULT false,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    account_id UUID REFERENCES public.email_accounts(id) ON DELETE CASCADE,
    message_id TEXT,
    team_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

-- Create policies for email_accounts
CREATE POLICY "Users can view their email accounts" ON public.email_accounts
    FOR SELECT USING (team_id = auth.uid());

CREATE POLICY "Users can insert their email accounts" ON public.email_accounts
    FOR INSERT WITH CHECK (team_id = auth.uid());

CREATE POLICY "Users can update their email accounts" ON public.email_accounts
    FOR UPDATE USING (team_id = auth.uid());

CREATE POLICY "Users can delete their email accounts" ON public.email_accounts
    FOR DELETE USING (team_id = auth.uid());

-- Create policies for emails
CREATE POLICY "Users can view their emails" ON public.emails
    FOR SELECT USING (team_id = auth.uid());

CREATE POLICY "Users can insert their emails" ON public.emails
    FOR INSERT WITH CHECK (team_id = auth.uid());

CREATE POLICY "Users can update their emails" ON public.emails
    FOR UPDATE USING (team_id = auth.uid());

CREATE POLICY "Users can delete their emails" ON public.emails
    FOR DELETE USING (team_id = auth.uid());

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_email_accounts_team_id ON public.email_accounts(team_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_email ON public.email_accounts(email);
CREATE INDEX IF NOT EXISTS idx_emails_team_id ON public.emails(team_id);
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON public.emails(received_at);
CREATE INDEX IF NOT EXISTS idx_emails_sender ON public.emails(sender);
CREATE INDEX IF NOT EXISTS idx_emails_recipient ON public.emails(recipient);

-- Create triggers for updated_at
CREATE TRIGGER update_email_accounts_updated_at 
    BEFORE UPDATE ON public.email_accounts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_emails_updated_at 
    BEFORE UPDATE ON public.emails 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
