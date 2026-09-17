-- Centro de Evidencia ISO 9001: gestión manual de evidencias
--
-- Agrega columnas a `iso_clausulas` para:
--   1. Almacenar el archivo de evidencia subido (URL pública de Supabase
--      Storage, su path interno, nombre original y fecha de carga).
--   2. Permitir un estado gestionado manualmente (`estado_manual`) que tiene
--      prioridad sobre el cálculo automático por métrica. NULL = usar el
--      cálculo automático.
--   3. Una nota libre del responsable y la fecha de última actualización.

ALTER TABLE iso_clausulas
  ADD COLUMN IF NOT EXISTS evidencia_url     text,
  ADD COLUMN IF NOT EXISTS evidencia_path    text,
  ADD COLUMN IF NOT EXISTS evidencia_nombre  text,
  ADD COLUMN IF NOT EXISTS evidencia_fecha   timestamptz,
  ADD COLUMN IF NOT EXISTS estado_manual     text,
  ADD COLUMN IF NOT EXISTS nota              text,
  ADD COLUMN IF NOT EXISTS actualizado_en    timestamptz;

-- Restringe los valores válidos de estado_manual a los estados conocidos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'iso_clausulas_estado_manual_check'
  ) THEN
    ALTER TABLE iso_clausulas
      ADD CONSTRAINT iso_clausulas_estado_manual_check
      CHECK (estado_manual IN ('cumple', 'parcial', 'documental', 'pendiente'));
  END IF;
END $$;
