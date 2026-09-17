-- Create asistencia table for attendance registration
CREATE TABLE IF NOT EXISTS asistencia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempresa INTEGER NOT NULL,
  identificacion TEXT NOT NULL,
  fecha TIMESTAMPTZ NOT NULL,
  hora TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_asistencia_idempresa ON asistencia(idempresa);
CREATE INDEX IF NOT EXISTS idx_asistencia_identificacion ON asistencia(identificacion);
CREATE INDEX IF NOT EXISTS idx_asistencia_fecha ON asistencia(fecha);

-- Add RLS policies
ALTER TABLE asistencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" ON asistencia
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON asistencia
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
