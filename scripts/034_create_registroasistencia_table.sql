-- Crear tabla registroasistencia para registro de turnos
CREATE TABLE IF NOT EXISTS registroasistencia (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  identificacion VARCHAR(50) NOT NULL,
  puesto VARCHAR(100),
  idempresa INTEGER REFERENCES empresas(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_registroasistencia_fecha ON registroasistencia(fecha);
CREATE INDEX IF NOT EXISTS idx_registroasistencia_identificacion ON registroasistencia(identificacion);
CREATE INDEX IF NOT EXISTS idx_registroasistencia_idempresa ON registroasistencia(idempresa);

-- Comentarios
COMMENT ON TABLE registroasistencia IS 'Registro de turnos y asignación de puestos del personal';
COMMENT ON COLUMN registroasistencia.id IS 'Identificador único del registro';
COMMENT ON COLUMN registroasistencia.fecha IS 'Fecha del registro';
COMMENT ON COLUMN registroasistencia.nombre IS 'Nombre de la persona';
COMMENT ON COLUMN registroasistencia.identificacion IS 'Identificación de la persona';
COMMENT ON COLUMN registroasistencia.puesto IS 'Puesto asignado (operación o especialidad)';
COMMENT ON COLUMN registroasistencia.idempresa IS 'ID de la empresa';
