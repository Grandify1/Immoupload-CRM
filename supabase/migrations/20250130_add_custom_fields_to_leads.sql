
-- Add custom_fields column to leads table if it doesn't exist
ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT NULL;

-- Create index for custom_fields for better query performance
CREATE INDEX IF NOT EXISTS idx_leads_custom_fields ON leads USING GIN (custom_fields);

-- Add comment to explain the column
COMMENT ON COLUMN leads.custom_fields IS 'JSONB field to store custom field values for leads';
