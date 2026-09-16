-- =====================================================================
-- RECARGO DOMINICAL/FESTIVO VIGENTE POR FECHA (reforma laboral, Ley 2466/2025).
-- El % del recargo dominical sube gradualmente. La nómina (pagonomina) lo aplica
-- según el % VIGENTE en la fecha del turno, NO por año calendario — igual criterio
-- que la jornada (jornada_legal). Antes estaba fijo por año
-- (parametros_legales_anio.pct_recargo_dominical = 90 para todo 2026), lo que
-- dañaba JUNIO-2026, que aún era 80% (el 90% entró a regir este mes, jul-2026).
--
-- La vista pagonomina toma, para cada día, la fila con el mayor `fecha_desde`
-- que sea <= a la fecha del turno.
--
-- Aditivo e idempotente. Correr en el SQL Editor de Supabase ANTES de re-correr
-- scripts/053_pagonomina_reemplazo.sql. Editable si cambian las fechas/tarifas.
-- =====================================================================

create table if not exists public.recargo_dominical_legal (
  fecha_desde date primary key,
  pct         numeric not null,   -- % de recargo dominical/festivo vigente desde esa fecha
  norma       text
);

insert into public.recargo_dominical_legal (fecha_desde, pct, norma) values
  ('2000-01-01', 75, 'CST art. 179 (recargo base, antes de la reforma)'),
  ('2025-07-01', 80, 'Ley 2466/2025 — recargo dominical 80%'),
  ('2026-07-01', 90, 'Ley 2466/2025 — recargo dominical 90% (rige desde jul-2026)')
on conflict (fecha_desde) do nothing;

-- Consulta de ayuda: recargo vigente en una fecha
--   select pct from recargo_dominical_legal where fecha_desde <= DATE '2026-06-15'
--   order by fecha_desde desc limit 1;   -- → 80
