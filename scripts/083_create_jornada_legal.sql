-- =====================================================================
-- JORNADA LEGAL VIGENTE POR FECHA (Ley 2101 de 2021 — reducción gradual
-- de la jornada máxima semanal). El "valor hora ordinaria" (HOD) que usa la
-- nómina para liquidar recargos/horas extras depende de la jornada VIGENTE
-- en la fecha del turno, NO del año calendario. Antes esto estaba fijo por
-- año (parametros_legales_anio.jornada_horas), lo que dañaba los meses de
-- transición: p.ej. JUNIO-2026 debe liquidar con 7,3333 h/día (44h/sem, ÷220)
-- y desde el 16-jul-2026 con 7 h/día (42h/sem, ÷210).
--
-- La vista pagonomina toma, para cada día, la fila con el mayor `fecha_desde`
-- que sea <= a la fecha del turno. Así el cambio de norma se aplica AUTOMÁTICO
-- según el mes que se revise, sin tocar parámetros a mano.
--
-- divisor mensual = dias_calendario(30) × horas_dia  ⇒ HOD = salario / divisor
--   8,0000 h → ÷240   ·   7,8333 h → ÷235   ·   7,6667 h → ÷230
--   7,3333 h → ÷220   ·   7,0000 h → ÷210
-- Aditivo e idempotente. Correr en el SQL Editor de Supabase ANTES de re-correr
-- scripts/053_pagonomina_reemplazo.sql.
-- =====================================================================

create table if not exists public.jornada_legal (
  fecha_desde   date primary key,
  horas_dia     numeric not null,           -- horas/día (base de 30 días → divisor mensual = 30 × horas_dia)
  horas_semana  numeric,                     -- referencia (jornada máxima semanal)
  norma         text
);

insert into public.jornada_legal (fecha_desde, horas_dia, horas_semana, norma) values
  ('2000-01-01', 8.0000, 48, 'Jornada plena (CST art. 161, antes de Ley 2101)'),
  ('2023-07-16', 7.8333, 47, 'Ley 2101/2021 — reducción a 47 h/semana'),
  ('2024-07-16', 7.6667, 46, 'Ley 2101/2021 — reducción a 46 h/semana'),
  ('2025-07-16', 7.3333, 44, 'Ley 2101/2021 — reducción a 44 h/semana'),
  ('2026-07-16', 7.0000, 42, 'Ley 2101/2021 — reducción final a 42 h/semana')
on conflict (fecha_desde) do nothing;

-- Consulta de ayuda: jornada vigente en una fecha cualquiera
--   select horas_dia from jornada_legal where fecha_desde <= DATE '2026-06-15'
--   order by fecha_desde desc limit 1;   -- → 7,3333
