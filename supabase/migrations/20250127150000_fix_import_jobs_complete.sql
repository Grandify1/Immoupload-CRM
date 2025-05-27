
-- Drop and recreate import_jobs table completely
DROP TABLE IF EXISTS public.import_jobs CASCADE;

-- Create complete import_jobs table
CREATE TABLE public.import_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    file_name TEXT NOT NULL,
    total_records INTEGER NOT NULL DEFAULT 0,
    processed_records INTEGER NOT NULL DEFAULT 0,
    failed_records INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'completed_with_errors')),
    error_details JSONB,
    team_id UUID NOT NULL,
    created_by UUID NOT NULL,
    undo_status TEXT NOT NULL DEFAULT 'active' CHECK (undo_status IN ('active', 'undoing', 'undone', 'undo_failed')),
    undo_date TIMESTAMP WITH TIME ZONE,
    undo_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add foreign key constraints only if referenced tables exist
DO $$ 
BEGIN
    -- Add team_id foreign key if teams table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'teams') THEN
        ALTER TABLE public.import_jobs 
        ADD CONSTRAINT import_jobs_team_id_fkey 
        FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
    END IF;
    
    -- Add created_by foreign key if profiles table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
        ALTER TABLE public.import_jobs 
        ADD CONSTRAINT import_jobs_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_import_jobs_team_id ON public.import_jobs(team_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_by ON public.import_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON public.import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_undo_status ON public.import_jobs(undo_status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON public.import_jobs(created_at DESC);

-- Enable RLS
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their team's import jobs" ON public.import_jobs
    FOR SELECT USING (
        team_id IN (
            SELECT team_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can create import jobs for their team" ON public.import_jobs
    FOR INSERT WITH CHECK (
        team_id IN (
            SELECT team_id FROM public.profiles WHERE id = auth.uid()
        )
        AND created_by = auth.uid()
    );

CREATE POLICY "Users can update their team's import jobs" ON public.import_jobs
    FOR UPDATE USING (
        team_id IN (
            SELECT team_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their team's import jobs" ON public.import_jobs
    FOR DELETE USING (
        team_id IN (
            SELECT team_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_import_jobs_updated_at 
    BEFORE UPDATE ON public.import_jobs 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
