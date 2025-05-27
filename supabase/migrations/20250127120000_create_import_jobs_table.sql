
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

-- Add missing columns if they don't exist
DO $$ 
BEGIN
    -- Add team_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'import_jobs' AND column_name = 'team_id') THEN
        ALTER TABLE public.import_jobs ADD COLUMN team_id UUID NOT NULL DEFAULT gen_random_uuid();
    END IF;
    
    -- Add created_by column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'import_jobs' AND column_name = 'created_by') THEN
        ALTER TABLE public.import_jobs ADD COLUMN created_by UUID NOT NULL DEFAULT gen_random_uuid();
    END IF;
    
    -- Add other columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'import_jobs' AND column_name = 'failed_records') THEN
        ALTER TABLE public.import_jobs ADD COLUMN failed_records INTEGER NOT NULL DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'import_jobs' AND column_name = 'error_details') THEN
        ALTER TABLE public.import_jobs ADD COLUMN error_details JSONB;
    END IF;
END $$;

-- Add foreign key constraints only if columns exist and constraints don't exist
DO $$ 
BEGIN
    -- Check if team_id column exists and add foreign key constraint
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
    
    -- Check if created_by column exists and add foreign key constraint
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

-- Create indexes only if columns exist
DO $$ 
BEGIN
    -- Create index for team_id only if column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'import_jobs' AND column_name = 'team_id') THEN
        CREATE INDEX IF NOT EXISTS idx_import_jobs_team_id ON public.import_jobs(team_id);
    END IF;
    
    -- Create index for created_at only if column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'import_jobs' AND column_name = 'created_at') THEN
        CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON public.import_jobs(created_at DESC);
    END IF;
    
    -- Create index for status only if column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'import_jobs' AND column_name = 'status') THEN
        CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON public.import_jobs(status);
    END IF;
END $$;

-- Enable RLS (Row Level Security)
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist before creating new ones
DROP POLICY IF EXISTS "Users can view import jobs from their team" ON public.import_jobs;
DROP POLICY IF EXISTS "Users can insert import jobs for their team" ON public.import_jobs;
DROP POLICY IF EXISTS "Users can update import jobs from their team" ON public.import_jobs;
DROP POLICY IF EXISTS "Users can delete import jobs from their team" ON public.import_jobs;

-- Create RLS policies only if team_id column exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'import_jobs' AND column_name = 'team_id') THEN
        -- Create RLS policies
        EXECUTE 'CREATE POLICY "Users can view import jobs from their team" ON public.import_jobs
            FOR SELECT USING (team_id = (SELECT team_id FROM public.profiles WHERE id = auth.uid()))';
        
        EXECUTE 'CREATE POLICY "Users can insert import jobs for their team" ON public.import_jobs
            FOR INSERT WITH CHECK (team_id = (SELECT team_id FROM public.profiles WHERE id = auth.uid()))';
        
        EXECUTE 'CREATE POLICY "Users can update import jobs from their team" ON public.import_jobs
            FOR UPDATE USING (team_id = (SELECT team_id FROM public.profiles WHERE id = auth.uid()))';
        
        EXECUTE 'CREATE POLICY "Users can delete import jobs from their team" ON public.import_jobs
            FOR DELETE USING (team_id = (SELECT team_id FROM public.profiles WHERE id = auth.uid()))';
    END IF;
END $$;

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_import_jobs_updated_at ON public.import_jobs;
CREATE TRIGGER update_import_jobs_updated_at BEFORE UPDATE ON public.import_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
