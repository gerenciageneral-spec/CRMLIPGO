-- Migración idempotente: agrega la columna `bitacora` a `permisos_usuarios`
-- para gobernar el acceso al modulo "Bitácora" (Operación Lip).
-- Default `false` para no abrir el modulo a usuarios existentes.

ALTER TABLE public.permisos_usuarios
  ADD COLUMN IF NOT EXISTS bitacora boolean NOT NULL DEFAULT false;
