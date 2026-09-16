-- Migración idempotente: agrega la columna `liquidaciones` a `permisos_usuarios`
-- para gobernar el acceso al submódulo "Liquidaciones" (Nómina).
-- Default `false` para no abrir el módulo a usuarios existentes.

ALTER TABLE public.permisos_usuarios
  ADD COLUMN IF NOT EXISTS liquidaciones boolean NOT NULL DEFAULT false;
