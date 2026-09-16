-- Add `tipo` column to solicitudesturnos to distinguish "Turnos" vs "Horas Extra"
-- This column is populated by the Servicios Adicionales form and rendered
-- in both that form's history view and the Aprobar Turnos module.

ALTER TABLE solicitudesturnos
ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'Turnos';

-- Backfill any existing NULL rows to "Turnos" so the UI never shows blanks.
UPDATE solicitudesturnos
SET tipo = 'Turnos'
WHERE tipo IS NULL;
