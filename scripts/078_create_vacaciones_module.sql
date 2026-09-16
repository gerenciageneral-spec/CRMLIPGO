-- =====================================================================
-- Submódulo VACACIONES (Gestión Humana).
--
-- Control de vacaciones por trabajador: los días CAUSADOS se calculan desde la
-- fecha de ingreso (headcount.fechainicio) a razón de 15 días hábiles/año
-- (1.25/mes); los DISFRUTADOS se leen del control diario (registroasistencia con
-- novedad "Vacaciones"); el SALDO = causados − disfrutados − liquidados.
--
-- Dos tablas:
--   * vacaciones_solicitudes  → flujo de solicitud/aprobación de un periodo.
--     Al APROBAR, el sistema escribe la novedad "31- Vacaciones disfrutadas" en
--     registroasistencia (control diario → nómina) por cada día hábil del rango.
--   * vacaciones_liquidaciones → compensación en dinero de saldo (p. ej. al retiro).
--
-- Aditivo e idempotente.
-- =====================================================================

create table if not exists public.vacaciones_solicitudes (
  id uuid primary key default gen_random_uuid(),
  idempresa integer not null,
  cedula text not null,
  nombre text,
  cargo text,
  fecha_inicio date not null,
  fecha_fin date not null,
  dias_habiles integer not null default 0,
  estado text not null default 'PENDIENTE',        -- PENDIENTE | APROBADA | RECHAZADA
  aprobado_por text,
  fecha_aprobacion timestamptz,
  motivo_rechazo text,
  observaciones text,
  created_at timestamptz not null default now()
);
create index if not exists idx_vacaciones_sol_empresa on public.vacaciones_solicitudes (idempresa, estado);
create index if not exists idx_vacaciones_sol_cedula on public.vacaciones_solicitudes (idempresa, cedula);

create table if not exists public.vacaciones_liquidaciones (
  id uuid primary key default gen_random_uuid(),
  idempresa integer not null,
  cedula text not null,
  nombre text,
  dias numeric not null default 0,
  valor_dia numeric not null default 0,
  valor_total numeric not null default 0,
  fecha date not null default current_date,
  observaciones text,
  created_at timestamptz not null default now()
);
create index if not exists idx_vacaciones_liq_cedula on public.vacaciones_liquidaciones (idempresa, cedula);

-- Permiso propio del submódulo (default true = visible para todos hasta que se
-- restrinja desde Gestión de Usuarios; mismo criterio que el resto de columnas).
alter table public.permisos_usuarios
  add column if not exists vacaciones boolean default true;

-- =====================================================================
