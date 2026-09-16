-- =====================================================================
-- Campos ESTÁTICOS por persona para el archivo de CARGA de Aportes en
-- Línea (PILA): Proyecto, Departamento, Ciudad, Tipo/Subtipo de Cotizante,
-- Administradoras (AFP/EPS/ARL/CCF), Clase de riesgo, Centro de Trabajo,
-- Actividad Económica. Estos campos casi nunca cambian mes a mes (a
-- diferencia del IBC/días/novedades, que sí varían y se calculan en vivo),
-- así que se guardan una vez (backfill desde la planilla real de julio-2026)
-- y el exportador mensual los lee de aquí en vez de recalcularlos.
--
-- Aditivo e idempotente.
-- =====================================================================

create table if not exists public.parafiscales_estatico (
  id uuid primary key default gen_random_uuid(),
  identificacion text not null unique,
  proyecto text,
  departamento text,
  ciudad text,
  tipo_cotizante text,
  subtipo_cotizante text,
  administradora_pension text,
  administradora_salud text,
  administradora_arl text,
  administradora_caja text,
  clase_riesgo text,
  centro_trabajo text,
  actividad_economica text,
  updated_at timestamptz default now()
);

alter table public.parafiscales_estatico replica identity full;

NOTIFY pgrst, 'reload schema';
