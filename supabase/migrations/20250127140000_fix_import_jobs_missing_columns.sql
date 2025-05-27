
-- Fix missing columns in import_jobs table
ALTER TABLE public.import_jobs 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS undo_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS undo_details JSONB;

-- Ensure all columns have correct constraints
DO $$ 
BEGIN
    -- Update status constraint if needed
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'import_jobs_status_check'
    ) THEN
        ALTER TABLE public.import_jobs 
        ADD CONSTRAINT import_jobs_status_check 
        CHECK (status IN ('pending', 'processing', 'completed', 'completed_with_errors', 'failed'));
    END IF;
    
    -- Update undo_status constraint if needed  
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'import_jobs_undo_status_check'
    ) THEN
        ALTER TABLE public.import_jobs 
        ADD CONSTRAINT import_jobs_undo_status_check 
        CHECK (undo_status IN ('active', 'undone'));
    END IF;
END $$;

-- Create missing indexes
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON public.import_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_jobs_updated_at ON public.import_jobs(updated_at DESC);

-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for automatic updated_at updates
DROP TRIGGER IF EXISTS update_import_jobs_updated_at ON public.import_jobs;
CREATE TRIGGER update_import_jobs_updated_at
    BEFORE UPDATE ON public.import_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Ensure foreign key constraints exist
DO $$
BEGIN
    -- Add foreign key constraint for team_id if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'import_jobs_team_id_fkey'
    ) THEN
        ALTER TABLE public.import_jobs 
        ADD CONSTRAINT import_jobs_team_id_fkey 
        FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
    END IF;
    
    -- Add foreign key constraint for created_by if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'import_jobs_created_by_fkey'
    ) THEN
        ALTER TABLE public.import_jobs 
        ADD CONSTRAINT import_jobs_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
END $$;
