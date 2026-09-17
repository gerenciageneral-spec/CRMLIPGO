-- Migración idempotente: agrega la columna `apoyo_cargue` a `permisos_usuarios`
-- para gobernar el acceso al módulo "Asignación de apoyo en cargue" (Compensación).
-- Default `false` para no abrir el módulo a usuarios existentes.

ALTER TABLE public.permisos_usuarios
  ADD COLUMN IF NOT EXISTS apoyo_cargue boolean NOT NULL DEFAULT false;
