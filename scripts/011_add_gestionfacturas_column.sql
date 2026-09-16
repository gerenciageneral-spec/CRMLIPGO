-- Add gestionfacturas permission column to permisos_usuarios table
ALTER TABLE permisos_usuarios 
ADD COLUMN IF NOT EXISTS gestionfacturas BOOLEAN DEFAULT false;

-- Update existing records to have default value
UPDATE permisos_usuarios 
SET gestionfacturas = false 
WHERE gestionfacturas IS NULL;
