-- =====================================================================
-- Serie histórica de indicadores del BSC (para la tendencia del viewer).
-- El BSC calcula el valor ACTUAL en vivo (getIndicadoresValores); esta tabla
-- congela el valor por período (snapshot mensual) para poder graficar la
-- tendencia de CUALQUIER indicador del cuadro de mando.
--   codigo   = clave del indicador (calculo_auto: 'desp_cumplimiento', etc.)
--   periodo  = 'YYYY-MM' (mensual)
-- Aditivo e idempotente. Se alimenta con snapshotIndicadoresHistorico().
-- =====================================================================

create table if not exists public.indicador_historico (
  id uuid primary key default gen_random_uuid(),
  idempresa int not null default 100,
  codigo text not null,
  periodo text not null,          -- 'YYYY-MM'
  valor numeric,
  meta numeric,
  base text,
  created_at timestamptz not null default now(),
  unique (idempresa, codigo, periodo)
);

create index if not exists idx_indicador_historico_cod on public.indicador_historico (idempresa, codigo, periodo);

alter table public.indicador_historico replica identity full;
notify pgrst, 'reload schema';
