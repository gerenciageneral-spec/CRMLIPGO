-- =====================================================================
-- Placas de Distribución (Configuración) — administrable desde la app.
--
-- Vehículos PROPIOS de cada cliente que, al montar una orden de cargue, generan
-- automáticamente su orden de distribución (+D). Antes esta lista estaba hardcodeada
-- en lib/distribucion-placas.ts; ahora vive en tabla para asignar/desasignar sin deploy.
-- Desasignar = activo=false (soft, conserva historial y auditoría).
--
-- El OWNER del vehículo se sigue validando por productos.id_empresa (no por la
-- empresa de la orden) en el código de facturación — eso NO cambia.
-- Aditivo e idempotente.
-- =====================================================================

create table if not exists public.distribucion_placas (
  id          bigint generated always as identity primary key,
  idempresa   integer not null,
  placa       text    not null,
  activo      boolean not null default true,
  observacion text,
  created_at  timestamptz not null default now()
);

-- Una placa única por empresa (case-insensitive vía normalización en la app).
create unique index if not exists ux_distribucion_placas_empresa_placa
  on public.distribucion_placas (idempresa, upper(placa));
create index if not exists idx_distribucion_placas_activo
  on public.distribucion_placas (idempresa, activo);

-- Seed con la configuración actual (2/3/4). Idempotente.
insert into public.distribucion_placas (idempresa, placa, activo) values
  (2, 'QHC437', true), (2, 'QHQ434', true), (2, 'GQV639', true),
  (3, 'LWY354', true),
  (4, 'LWY393', true)
on conflict do nothing;

-- Permiso del módulo (solo-admin: default false, se otorga a administración).
alter table public.permisos_usuarios
  add column if not exists placas_distribucion boolean default false;
-- update public.permisos_usuarios set placas_distribucion = true
--   where usuario_id in (select id from public.profiles where usuario ilike '%admin%');

-- =====================================================================
