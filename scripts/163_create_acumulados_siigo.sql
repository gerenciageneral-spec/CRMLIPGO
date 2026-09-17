-- ============================================================================
-- acumulados_siigo — copia persistente de los Acumulados reales de Siigo.
--
-- CONTEXTO (2026-09-09): hasta ahora este archivo de Siigo solo vivía como un
-- Excel en la carpeta del proyecto y en un JSON temporal de una sola sesión de
-- Claude -- nada consultable ni reutilizable de forma permanente. El usuario
-- pidió que "los acumulados... deben de vivir en LIPgo": esta tabla guarda el
-- archivo COMPLETO tal cual lo entrega Siigo (todo el personal, activo e
-- inactivo -- no solo el subconjunto "activos" usado en la primera ronda de
-- reconciliación), para que cualquier trabajo futuro de conciliación LIPgo↔
-- Siigo pueda consultarlo directo desde la base de datos, sin depender de
-- volver a parsear el Excel cada vez.
--
-- Un registro por fila real del Excel (identificación, periodo, novedad).
-- `archivo_origen` deja trazabilidad de qué carga de Siigo generó cada fila,
-- para poder tener MÁS DE UN corte en el tiempo sin pisarse (ej. un nuevo
-- acumulado de septiembre no debe borrar el de agosto).
-- ============================================================================

create table if not exists public.acumulados_siigo (
  id bigint generated always as identity primary key,
  identificacion text not null,
  nombre_empleado text not null,
  no_contrato text,
  periodo text,          -- 'Q1' / 'Q2'
  mes integer,
  anio integer,
  centro_costo text,
  origen text,
  novedad text,
  tipo text,             -- 'Ingreso' / 'Deducción'
  horas_dias text,       -- texto: Siigo a veces trae "-" en vez de un número
  valor_total numeric not null default 0,
  archivo_origen text not null,
  rango_desde date,
  rango_hasta date,
  cargado_en timestamptz not null default now()
);

comment on table public.acumulados_siigo is
  'Copia persistente y consultable de los Acumulados reales de Siigo (todo el personal), para reconciliación LIPgo vs Siigo sin depender de archivos externos.';

create index if not exists idx_acumulados_siigo_identificacion
  on public.acumulados_siigo (identificacion, anio, mes, periodo);
create index if not exists idx_acumulados_siigo_novedad
  on public.acumulados_siigo (novedad);
create index if not exists idx_acumulados_siigo_archivo
  on public.acumulados_siigo (archivo_origen);
