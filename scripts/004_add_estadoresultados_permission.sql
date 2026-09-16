-- 004_add_estadoresultados_permission.sql
-- Idempotente: agrega la columna `estadoresultados` (boolean) a la tabla
-- `public.permisos_usuarios` para habilitar el modulo "Estado de Resultados"
-- en el subgrupo Facturacion del CRM.
--
-- Si la columna ya existe no hace nada. Por defecto la dejamos en FALSE
-- para que ningun usuario lo vea hasta que un admin lo active explicitamente
-- desde el modulo de Permisos de Usuarios.

ALTER TABLE public.permisos_usuarios
  ADD COLUMN IF NOT EXISTS estadoresultados boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.permisos_usuarios.estadoresultados IS
  'Permiso para acceder al modulo "Estado de Resultados" (subgrupo Facturacion).';
