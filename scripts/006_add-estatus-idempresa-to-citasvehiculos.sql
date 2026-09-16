-- Add estatus and idempresa fields to citas_vehiculos table
ALTER TABLE citas_vehiculos
ADD COLUMN IF NOT EXISTS estatus VARCHAR(50),
ADD COLUMN IF NOT EXISTS idempresa INTEGER;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_citasvehiculos_estatus ON citas_vehiculos(estatus);
CREATE INDEX IF NOT EXISTS idx_citasvehiculos_idempresa ON citas_vehiculos(idempresa);
