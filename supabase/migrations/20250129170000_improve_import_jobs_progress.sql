
-- Improve import jobs table for better progress tracking
ALTER TABLE public.import_jobs 
ADD COLUMN IF NOT EXISTS progress_percentage INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS batch_size INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS last_processed_row INTEGER DEFAULT 0;

-- Create index for better performance on active jobs
CREATE INDEX IF NOT EXISTS idx_import_jobs_active ON public.import_jobs(status, updated_at) 
WHERE status IN ('pending', 'processing');

-- Add function to calculate progress percentage
CREATE OR REPLACE FUNCTION update_import_job_progress() 
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-calculate progress percentage
  IF NEW.total_records > 0 THEN
    NEW.progress_percentage = ROUND((NEW.processed_records::numeric / NEW.total_records::numeric) * 100);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update progress
DROP TRIGGER IF EXISTS trigger_update_import_progress ON public.import_jobs;
CREATE TRIGGER trigger_update_import_progress
  BEFORE UPDATE ON public.import_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_import_job_progress();
