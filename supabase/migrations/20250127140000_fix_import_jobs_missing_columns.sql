-- Drop and recreate import_jobs table with all required columns
DROP TABLE IF EXISTS public.import_jobs CASCADE;

-- Create import_jobs table with all required columns
CREATE TABLE public.import_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    total_records INTEGER NOT NULL DEFAULT 0,
    processed_records INTEGER NOT NULL DEFAULT 0,
    failed_records INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'completed_with_errors', 'failed')),
    error_details JSONB,
    undo_status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (undo_status IN ('active', 'undoing', 'undone', 'undo_failed')),
    undo_date TIMESTAMP WITH TIME ZONE,
    undo_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view import jobs for their team" ON public.import_jobs
    FOR SELECT USING (
        team_id IN (
            SELECT team_id FROM public.profiles 
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert import jobs for their team" ON public.import_jobs
    FOR INSERT WITH CHECK (
        team_id IN (
            SELECT team_id FROM public.profiles 
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can update import jobs for their team" ON public.import_jobs
    FOR UPDATE USING (
        team_id IN (
            SELECT team_id FROM public.profiles 
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can delete import jobs for their team" ON public.import_jobs
    FOR DELETE USING (
        team_id IN (
            SELECT team_id FROM public.profiles 
            WHERE id = auth.uid()
        )
    );

-- Create indices for better performance
CREATE INDEX idx_import_jobs_team_id ON public.import_jobs(team_id);
CREATE INDEX idx_import_jobs_status ON public.import_jobs(status);
CREATE INDEX idx_import_jobs_undo_status ON public.import_jobs(undo_status);
CREATE INDEX idx_import_jobs_created_at ON public.import_jobs(created_at DESC);