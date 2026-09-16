-- Fotos de asistencia: se captura automáticamente una foto al marcar INGRESO y
-- otra al marcar SALIDA (cámara siempre activa en el módulo de marcación). Se
-- guardan como URL en registroasistencia y se muestran en la tabla de consulta.
ALTER TABLE registroasistencia ADD COLUMN IF NOT EXISTS foto_ingreso text;
ALTER TABLE registroasistencia ADD COLUMN IF NOT EXISTS foto_salida  text;

COMMENT ON COLUMN registroasistencia.foto_ingreso IS 'URL de la foto tomada al marcar ingreso (cámara del módulo de asistencia).';
COMMENT ON COLUMN registroasistencia.foto_salida  IS 'URL de la foto tomada al marcar salida.';
