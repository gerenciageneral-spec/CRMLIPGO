-- Add SST and Inducción columns to headcount table
ALTER TABLE headcount ADD COLUMN IF NOT EXISTS sst text;
ALTER TABLE headcount ADD COLUMN IF NOT EXISTS induccion text;

-- Add contrato column if it doesn't exist (was missing from original schema)
ALTER TABLE headcount ADD COLUMN IF NOT EXISTS contrato text;

-- Update RLS policy if needed
ALTER TABLE headcount replica identity full;
