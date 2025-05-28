
-- Create scraping_jobs table
CREATE TABLE IF NOT EXISTS scraping_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  search_query text NOT NULL,
  location text NOT NULL,
  result_limit integer NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'error')),
  progress integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  total_found integer DEFAULT 0,
  results jsonb DEFAULT '[]'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_user_id ON scraping_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_status ON scraping_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_created_at ON scraping_jobs(created_at DESC);

-- Enable RLS
ALTER TABLE scraping_jobs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own scraping jobs"
  ON scraping_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own scraping jobs"
  ON scraping_jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scraping jobs"
  ON scraping_jobs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_scraping_jobs_updated_at 
  BEFORE UPDATE ON scraping_jobs 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();
