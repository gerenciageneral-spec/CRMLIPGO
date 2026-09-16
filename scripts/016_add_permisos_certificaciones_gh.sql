-- ============================================================================
-- Permisos por submódulo para Certificaciones LIP y Gestión Humana
-- ----------------------------------------------------------------------------
-- Agrega las columnas de permiso que aún NO existen en `permisos_usuarios`.
-- Las columnas SST base (sst_auditoria, sst_autoevaluacion, sst_plan_mejora,
-- sst_ipevr, sst_incidentes, sst_epp, sst_mantenimiento, sst_comunicacion,
-- sst_gestion_cambio, sst_actividades, sst_indicadores) y `gestion_colaboradores`
-- YA existen; este script solo crea las 8 que faltan.
--
-- Todas se crean en FALSE: por defecto NADIE ve estos submódulos hasta que un
-- administrador los habilite manualmente en "Accesos de Usuario".
-- Ejecuta este script UNA sola vez en el SQL Editor de Supabase.
-- ============================================================================

ALTER TABLE permisos_usuarios
  -- Certificaciones LIP · SST (submódulos nuevos sin columna previa)
  ADD COLUMN IF NOT EXISTS sst_repositorio_soportes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sst_alertas_at           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sst_investigaciones      boolean NOT NULL DEFAULT false,
  -- Certificaciones LIP · ISO 9001
  ADD COLUMN IF NOT EXISTS iso_repositorio          boolean NOT NULL DEFAULT false,
  -- Gestión Humana (submódulos sin columna previa)
  ADD COLUMN IF NOT EXISTS gh_carpetas              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gh_entrevistas           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gh_bienestar             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gh_participacion         boolean NOT NULL DEFAULT false;
