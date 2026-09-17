-- Add idempresa column to registroasistencia table
ALTER TABLE registroasistencia
ADD COLUMN IF NOT EXISTS idempresa INTEGER;

-- Add comment to document the column
COMMENT ON COLUMN registroasistencia.idempresa IS 'ID de la empresa';
