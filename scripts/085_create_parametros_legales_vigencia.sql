-- =====================================================================
-- PARÁMETROS LEGALES POR VIGENCIA (intervalos de fecha)
-- ---------------------------------------------------------------------
-- Reemplaza el modelo "un valor por AÑO" (parametros_legales_anio) por
-- INTERVALOS con `fecha_desde`, para poder programar los cambios legales que
-- ocurren a MITAD de año y no por año calendario:
--   · Jornada (Ley 2101): baja el 16-jul de cada año (46h→44h→42h).
--   · Recargo dominical (Ley 2466): sube el 16-jul (75%→80%→90%→100%).
--   · Los recargos de hora extra DOMINICAL dependen del recargo:
--       pct_hedf = 25 (extra diurna)  + recargo_dominical
--       pct_hef  = 75 (extra nocturna)+ recargo_dominical
--       pct_recargo_nocturno_dominical = 35 (recargo nocturno) + recargo_dominical
-- Para cualquier fecha aplica la fila con el MAYOR `fecha_desde <= fecha`.
-- Unifica y reemplaza jornada_legal + recargo_dominical_legal.
-- Aditivo e idempotente. Correr ANTES de re-correr pagonomina.
-- =====================================================================

create table if not exists public.parametros_legales_vigencia (
  fecha_desde                    date primary key,
  -- Salariales (cambian por AÑO, el 1-ene)
  smlv                           numeric not null,
  auxilio_transporte             numeric not null default 0,
  dias_cargo_empleador           integer not null default 2,   -- incapacidad EG: días a cargo del empleador
  pct_pago_incapacidad           numeric not null default 66.67,
  dias_calendario                numeric not null default 30,
  -- Jornada (Ley 2101): cambia el 16-jul. divisor mensual = dias_calendario × jornada_horas
  jornada_horas                  numeric not null,
  -- Recargos de hora extra base (estables)
  pct_hed                        numeric not null default 25,   -- extra diurna
  pct_hen                        numeric not null default 75,   -- extra nocturna
  pct_hn                         numeric not null default 35,   -- recargo nocturno
  -- Recargo dominical (Ley 2466): cambia el 16-jul
  pct_recargo_dominical          numeric not null,
  -- Derivados del dominical (extra diurna/nocturna dominical y recargo nocturno dominical)
  pct_hedf                       numeric not null,   -- = pct_hed + pct_recargo_dominical
  pct_hef                        numeric not null,   -- = pct_hen + pct_recargo_dominical
  pct_recargo_nocturno_dominical numeric not null,   -- = pct_hn  + pct_recargo_dominical
  actualizado_at                 timestamptz default now()
);

-- Semilla: intervalos reales de LIP. Cada año tiene un corte el 1-ene (nuevo SMLV)
-- y otro el 16-jul (nueva jornada + nuevo recargo dominical). `do nothing`: no pisa
-- lo que el usuario ajuste desde la interfaz.
insert into public.parametros_legales_vigencia
  (fecha_desde, smlv, auxilio_transporte, dias_cargo_empleador, pct_pago_incapacidad,
   dias_calendario, jornada_horas, pct_hed, pct_hen, pct_hn,
   pct_recargo_dominical, pct_hedf, pct_hef, pct_recargo_nocturno_dominical)
values
  -- 2025 ene–jul15: 46h/sem (7,6667), recargo 75%
  ('2025-01-01', 1423500, 200000, 2, 66.67, 30, 7.6667, 25, 75, 35, 75, 100, 150, 110),
  -- 2025 jul16–dic: 44h/sem (7,3333), recargo 80%
  ('2025-07-16', 1423500, 200000, 2, 66.67, 30, 7.3333, 25, 75, 35, 80, 105, 155, 115),
  -- 2026 ene–jul15: 44h/sem (7,3333), recargo 80%
  ('2026-01-01', 1750905, 249095, 2, 66.67, 30, 7.3333, 25, 75, 35, 80, 105, 155, 115),
  -- 2026 jul16–dic: 42h/sem (7,0000), recargo 90%
  ('2026-07-16', 1750905, 249095, 2, 66.67, 30, 7.0000, 25, 75, 35, 90, 115, 165, 125)
on conflict (fecha_desde) do nothing;

-- Consulta de ayuda: parámetros vigentes en una fecha
--   select * from parametros_legales_vigencia
--   where fecha_desde <= DATE '2026-06-15' order by fecha_desde desc limit 1;
