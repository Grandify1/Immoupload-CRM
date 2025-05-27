
-- Create import_jobs table for tracking CSV imports
CREATE TABLE IF NOT EXISTS public.import_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID NOT NULL,
    created_by UUID NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    total_records INTEGER NOT NULL DEFAULT 0,
    processed_records INTEGER NOT NULL DEFAULT 0,
    failed_records INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'completed_with_errors', 'failed')),
    error_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Only add constraints if table was actually created and columns exist
DO $$ 
BEGIN
    -- Check if team_id column exists before adding foreign key
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'import_jobs' AND column_name = 'team_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'import_jobs_team_id_fkey'
    ) THEN
        ALTER TABLE public.import_jobs 
        ADD CONSTRAINT import_jobs_team_id_fkey 
        FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
    END IF;
    
    -- Check if created_by column exists before adding foreign key
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'import_jobs' AND column_name = 'created_by'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'import_jobs_created_by_fkey'
    ) THEN
        ALTER TABLE public.import_jobs 
        ADD CONSTRAINT import_jobs_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_import_jobs_team_id ON public.import_jobs(team_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON public.import_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON public.import_jobs(status);

-- Enable RLS (Row Level Security)
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view import jobs from their team" ON public.import_jobs
    FOR SELECT USING (team_id = (SELECT team_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert import jobs for their team" ON public.import_jobs
    FOR INSERT WITH CHECK (team_id = (SELECT team_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update import jobs from their team" ON public.import_jobs
    FOR UPDATE USING (team_id = (SELECT team_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete import jobs from their team" ON public.import_jobs
    FOR DELETE USING (team_id = (SELECT team_id FROM public.profiles WHERE id = auth.uid()));

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_import_jobs_updated_at BEFORE UPDATE ON public.import_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
