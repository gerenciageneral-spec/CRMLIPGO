-- Renaming table to asignacionpersonal to match existing database schema
-- Create asignacionpersonal table for tracking employee assignments to operations
CREATE TABLE IF NOT EXISTS asignacionpersonal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  idempleado TEXT NOT NULL,
  nombreempleado TEXT NOT NULL,
  asignacion TEXT NOT NULL,
  idempresa INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_empresa FOREIGN KEY (idempresa) REFERENCES empresas(id) ON DELETE CASCADE
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_asignacionpersonal_fecha ON asignacionpersonal(fecha);
CREATE INDEX IF NOT EXISTS idx_asignacionpersonal_idempresa ON asignacionpersonal(idempresa);
CREATE INDEX IF NOT EXISTS idx_asignacionpersonal_idempleado ON asignacionpersonal(idempleado);

-- Enable RLS
ALTER TABLE asignacionpersonal ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for authenticated users
CREATE POLICY "Enable all operations for authenticated users" ON asignacionpersonal
  FOR ALL USING (auth.role() = 'authenticated');
