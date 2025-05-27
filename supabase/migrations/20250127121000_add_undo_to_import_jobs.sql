
-- Add undo_status and undo_date columns to import_jobs table
ALTER TABLE public.import_jobs 
ADD COLUMN IF NOT EXISTS undo_status VARCHAR(50) DEFAULT 'active' CHECK (undo_status IN ('active', 'undoing', 'undone', 'undo_failed')),
ADD COLUMN IF NOT EXISTS undo_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS undo_details JSONB;

-- Create index for undo queries
CREATE INDEX IF NOT EXISTS idx_import_jobs_undo_status ON public.import_jobs(undo_status);
