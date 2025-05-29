
-- Ensure leads table exists with all required columns
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  website TEXT,
  address TEXT,
  description TEXT,
  status TEXT DEFAULT 'potential' CHECK (status IN ('potential', 'contacted', 'qualified', 'closed')),
  owner_id UUID REFERENCES profiles(id),
  custom_fields JSONB DEFAULT '{}',
  import_job_id UUID REFERENCES import_jobs(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if they don't exist
DO $$ 
BEGIN
  -- Check and add custom_fields column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'custom_fields'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN custom_fields JSONB DEFAULT '{}';
  END IF;

  -- Check and add import_job_id column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'import_job_id'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN import_job_id UUID REFERENCES import_jobs(id);
  END IF;

  -- Ensure status column has correct constraint
  BEGIN
    ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
    ALTER TABLE public.leads ADD CONSTRAINT leads_status_check 
      CHECK (status IN ('potential', 'contacted', 'qualified', 'closed'));
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_team_id ON public.leads(team_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_import_job_id ON public.leads(import_job_id);

-- Ensure RLS policies exist
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Drop existing policies and recreate them
DROP POLICY IF EXISTS "Users can view leads in their team" ON public.leads;
DROP POLICY IF EXISTS "Users can create leads in their team" ON public.leads;
DROP POLICY IF EXISTS "Users can update leads in their team" ON public.leads;
DROP POLICY IF EXISTS "Users can delete leads in their team" ON public.leads;

-- Create RLS policies
CREATE POLICY "Users can view leads in their team" ON public.leads
  FOR SELECT USING (
    team_id IN (
      SELECT team_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create leads in their team" ON public.leads
  FOR INSERT WITH CHECK (
    team_id IN (
      SELECT team_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update leads in their team" ON public.leads
  FOR UPDATE USING (
    team_id IN (
      SELECT team_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete leads in their team" ON public.leads
  FOR DELETE USING (
    team_id IN (
      SELECT team_id FROM profiles WHERE id = auth.uid()
    )
  );
