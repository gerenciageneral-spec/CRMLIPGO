-- ============================================================================
-- 003_add_gastos_permission.sql
-- ----------------------------------------------------------------------------
-- Agrega la columna `gastos` (boolean, default false) a `permisos_usuarios`
-- si no existe. Este flag controla la visibilidad de los modulos:
--   - "Registrar Gasto"
--   - "Dashboard Gastos"
-- (ambos modulos comparten el mismo permiso `gastos`).
--
-- Idempotente: usa IF NOT EXISTS, asi que correrlo varias veces es seguro.
-- ============================================================================

ALTER TABLE public.permisos_usuarios
  ADD COLUMN IF NOT EXISTS gastos boolean NOT NULL DEFAULT false;

-- Comentario descriptivo en la columna para que quede documentada en el
-- catalogo de Postgres (lo ven herramientas como pg_dump, psql \d+, etc).
COMMENT ON COLUMN public.permisos_usuarios.gastos IS
  'Permite acceder a los modulos "Registrar Gasto" y "Dashboard Gastos" del subgrupo Facturacion.';
