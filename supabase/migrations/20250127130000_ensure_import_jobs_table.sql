
-- Ensure import_jobs table exists with all required columns
CREATE TABLE IF NOT EXISTS public.import_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    total_records INTEGER NOT NULL DEFAULT 0,
    processed_records INTEGER NOT NULL DEFAULT 0,
    failed_records INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'completed_with_errors', 'failed')),
    error_details JSONB,
    undo_status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (undo_status IN ('active', 'undone')),
    undo_date TIMESTAMP WITH TIME ZONE,
    undo_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns if they don't exist
DO $$ 
BEGIN
    -- Add undo_status column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'import_jobs' AND column_name = 'undo_status') THEN
        ALTER TABLE public.import_jobs ADD COLUMN undo_status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (undo_status IN ('active', 'undone'));
    END IF;
    
    -- Add undo_date column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'import_jobs' AND column_name = 'undo_date') THEN
        ALTER TABLE public.import_jobs ADD COLUMN undo_date TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Add undo_details column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'import_jobs' AND column_name = 'undo_details') THEN
        ALTER TABLE public.import_jobs ADD COLUMN undo_details JSONB;
    END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_import_jobs_team_id ON public.import_jobs(team_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON public.import_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON public.import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_undo_status ON public.import_jobs(undo_status);

-- Enable RLS (Row Level Security)
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view import jobs from their team" ON public.import_jobs;
DROP POLICY IF EXISTS "Users can insert import jobs for their team" ON public.import_jobs;
DROP POLICY IF EXISTS "Users can update import jobs from their team" ON public.import_jobs;

-- Create RLS policies
CREATE POLICY "Users can view import jobs from their team" ON public.import_jobs
    FOR SELECT USING (team_id = (SELECT team_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert import jobs for their team" ON public.import_jobs
    FOR INSERT WITH CHECK (team_id = (SELECT team_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update import jobs from their team" ON public.import_jobs
    FOR UPDATE USING (team_id = (SELECT team_id FROM public.profiles WHERE id = auth.uid()));
