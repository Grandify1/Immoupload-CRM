
-- Erstelle die import_jobs Tabelle direkt in Supabase
CREATE TABLE IF NOT EXISTS import_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    file_name TEXT NOT NULL,
    total_records INTEGER NOT NULL DEFAULT 0,
    processed_records INTEGER NOT NULL DEFAULT 0,
    failed_records INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'completed_with_errors')),
    error_details JSONB,
    team_id UUID NOT NULL,
    created_by UUID NOT NULL,
    undo_status TEXT NOT NULL DEFAULT 'active' CHECK (undo_status IN ('active', 'undone')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Erstelle Indizes
CREATE INDEX IF NOT EXISTS idx_import_jobs_team_id ON import_jobs(team_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_by ON import_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);

-- RLS Policies
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their team's import jobs" ON import_jobs
    FOR SELECT USING (
        team_id IN (
            SELECT team_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY IF NOT EXISTS "Users can insert import jobs for their team" ON import_jobs
    FOR INSERT WITH CHECK (
        team_id IN (
            SELECT team_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY IF NOT EXISTS "Users can update their team's import jobs" ON import_jobs
    FOR UPDATE USING (
        team_id IN (
            SELECT team_id FROM profiles WHERE id = auth.uid()
        )
    );
