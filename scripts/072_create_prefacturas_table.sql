-- =====================================================================
-- Prefacturas guardadas por proyecto/período (Cuadro de Control de Facturación).
-- Permite armar la prefactura en LipGo, guardarla (borrador), aprobarla y luego
-- enlazarla a Siigo. `lineas` = arreglo JSON de {owner, servicio, toneladas, tarifa, total}.
-- Aditivo e idempotente.
-- =====================================================================

create table if not exists public.prefacturas (
  id bigserial primary key,
  idempresa int not null,
  proyecto text,
  periodo_desde date,
  periodo_hasta date,
  lineas jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  toneladas numeric not null default 0,
  estado text not null default 'borrador',  -- 'borrador' | 'aprobada'
  usuario text,
  observacion text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint prefacturas_estado_chk check (estado in ('borrador','aprobada'))
);

create index if not exists idx_prefacturas_empresa on public.prefacturas (idempresa);
create index if not exists idx_prefacturas_fecha on public.prefacturas (created_at desc);
