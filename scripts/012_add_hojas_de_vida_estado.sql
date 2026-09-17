-- =====================================================================
-- Estado de revision de cada hoja de vida (banco de hojas de vida).
-- Valores: 'pendiente' | 'aceptado' | 'rechazado'.
-- =====================================================================
alter table public.hojas_de_vida
  add column if not exists estado text not null default 'pendiente';

create index if not exists idx_hojas_de_vida_estado on public.hojas_de_vida (estado);
