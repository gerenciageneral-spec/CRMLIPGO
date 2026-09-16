-- =====================================================================
-- Muelles de Cargue (Configuración) — administrable desde la app.
--
-- Antes el número de muelles simultáneos por proyecto estaba hardcodeado en
-- lib/meta-productividad-utils.ts (MUELLES_SIMULTANEOS: {1:3, 2:5, 3:4, 4:1}).
-- Ahora vive en tabla, una fila por muelle físico, para agregar/quitar (o
-- desactivar uno puntual, ej. "el muelle 4 se dañó") sin deploy.
-- Desactivar = activo=false (soft, conserva historial).
--
-- Aditivo e idempotente. La semilla reproduce EXACTO lo que ya existía en
-- código, para que el día que se corre este script no cambie nada visible.
-- =====================================================================

create table if not exists public.muelles_empresa (
  id          bigint generated always as identity primary key,
  idempresa   integer not null,
  muelle      integer not null,
  activo      boolean not null default true,
  observacion text,
  created_at  timestamptz not null default now()
);

create unique index if not exists ux_muelles_empresa_idempresa_muelle
  on public.muelles_empresa (idempresa, muelle);
create index if not exists idx_muelles_empresa_activo
  on public.muelles_empresa (idempresa, activo);

-- Seed = MUELLES_SIMULTANEOS actual exacto (1:3, 2:5, 3:4, 4:1). Idempotente.
insert into public.muelles_empresa (idempresa, muelle, activo) values
  (1,1,true),(1,2,true),(1,3,true),
  (2,1,true),(2,2,true),(2,3,true),(2,4,true),(2,5,true),
  (3,1,true),(3,2,true),(3,3,true),(3,4,true),
  (4,1,true)
on conflict do nothing;

-- Permiso del módulo (solo-admin: default false, se otorga a administración).
alter table public.permisos_usuarios
  add column if not exists muelles_empresa boolean default false;

-- =====================================================================
