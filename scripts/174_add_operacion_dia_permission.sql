-- ============================================================================
-- Permiso del módulo "Operación del día" (grupo Operación LIP).
-- ----------------------------------------------------------------------------
-- Panel ejecutivo del coordinador: personal activo, cobertura de turnos,
-- pendientes del día, solicitudes de personal y pago de la quincena, todo de la
-- empresa seleccionada.
--
-- El panel NO calcula nada por su cuenta: reúne cifras que ya producen otros
-- módulos (Tabla Asistencia, Aprobar Turnos, Ausentismos, Solicitud de
-- Personal, Revisión de nómina) y enlaza a cada uno para resolverlas.
--
-- POR QUÉ UN PERMISO PROPIO Y NO REUSAR OTRO
-- El panel muestra el PAGO DE LA QUINCENA. Esa cifra hoy solo la ve quien entra
-- a Revisión de nómina. Colgarlo de un permiso operativo --por ejemplo el de
-- Tabla Asistencia-- le mostraría el costo de nómina a todo el que programa
-- turnos, que es bastante más gente.
--
-- Por eso el backfill toma como referencia `revision_nomina`: quien ya puede ver
-- el pago de la quincena, puede ver este panel. A los demás se les otorga desde
-- Gestión de Usuarios.
--
-- Cada botón del panel lleva a otro módulo, y ese módulo conserva SU PROPIO
-- PermissionGuard: tener este permiso no da acceso a nada más.
--
-- Aditivo e idempotente: correrlo dos veces es inofensivo.
-- ============================================================================

ALTER TABLE public.permisos_usuarios
  ADD COLUMN IF NOT EXISTS operacion_dia boolean NOT NULL DEFAULT false;

-- Backfill: quien ya ve el pago de la quincena en Revisión de nómina.
UPDATE public.permisos_usuarios
  SET operacion_dia = true
  WHERE revision_nomina = true;


-- ----------------------------------------------------------------------------
-- VERIFICACIÓN (solo lecturas)
-- ----------------------------------------------------------------------------

-- 1) La columna quedó creada.
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'permisos_usuarios'
  and column_name = 'operacion_dia';

-- 2) A cuántos se les otorgó.
select count(*) filter (where operacion_dia) as con_operacion_dia,
       count(*) filter (where revision_nomina) as con_revision_nomina,
       count(*) as total_usuarios
from public.permisos_usuarios;


-- ----------------------------------------------------------------------------
-- REVERSIÓN
-- ----------------------------------------------------------------------------
--   alter table public.permisos_usuarios drop column if exists operacion_dia;
