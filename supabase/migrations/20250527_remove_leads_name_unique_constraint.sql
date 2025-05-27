
-- Remove the unique constraint on the name field in the leads table
-- This allows multiple leads to have the same name but different UUIDs

-- First, drop the unique constraint if it exists
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_name_unique;

-- Also drop any unique index on name if it exists
DROP INDEX IF EXISTS leads_name_key;
DROP INDEX IF EXISTS idx_leads_name_unique;

-- Verify the constraint is removed by checking the table constraints
-- (This is just for verification, doesn't change anything)
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'leads'::regclass 
AND contype = 'u';
