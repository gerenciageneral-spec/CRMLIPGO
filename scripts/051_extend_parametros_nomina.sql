-- =====================================================================
-- Cuadro de mando de nómina: parámetros de cálculo de recargos/horas extra.
-- Extiende parametros_legales_anio (misma tabla que ya usa SST/ausentismos)
-- para NO tener dos fuentes de SMLV. Todo es ADITIVO (ADD COLUMN con default):
-- no altera datos existentes ni el comportamiento de ausentismos.
--
-- Con estos parámetros, la vista pagonomina calculará por PERSONA:
--   SMMLV   = salario_contrato (headcount.salario) + auxilio_transporte
--   HOD     = SMMLV / (dias_calendario * jornada_horas)      -- hora ordinaria
--   valorDia= SMMLV / dias_calendario
--   hed  = horas × HOD × (1 + pct_hed/100)     -- hora extra diurna (completa)
--   hen  = horas × HOD × (1 + pct_hen/100)     -- hora extra nocturna (completa)
--   hn   = horas × HOD × (pct_hn/100)          -- recargo nocturno (solo recargo)
--   hedf = horas × HOD × (1 + pct_hedf/100)    -- H.E. diurna dominical/festiva
--   hef  = horas × HOD × (1 + pct_hef/100)     -- H.E. nocturna dominical/festiva
--   recargodominical = valorDia × (pct_recargo_dominical/100)
-- =====================================================================

alter table public.parametros_legales_anio
  add column if not exists dias_calendario int default 30,                  -- divisor del valor día
  add column if not exists jornada_horas numeric default 7,                 -- horas/día (jornada legal); divisor mensual = dias × jornada
  add column if not exists pct_hed numeric default 25,                      -- % hora extra diurna
  add column if not exists pct_hen numeric default 75,                      -- % hora extra nocturna
  add column if not exists pct_hn numeric default 35,                       -- % recargo nocturno ordinario
  add column if not exists pct_recargo_dominical numeric default 90,        -- % recargo dominical/festivo (100% en 2027)
  add column if not exists pct_hedf numeric default 115,                    -- % H.E. diurna dominical/festiva (25 + 90)
  add column if not exists pct_hef numeric default 165,                     -- % H.E. nocturna dominical/festiva (75 + 90)
  add column if not exists pct_recargo_nocturno_dominical numeric default 125; -- % recargo nocturno dominical (35 + 90) [informativo]

-- Asegura que los años ya sembrados queden con los defaults explícitos
-- (por si la columna existía nula de una corrida previa).
update public.parametros_legales_anio
   set dias_calendario = coalesce(dias_calendario, 30),
       jornada_horas   = coalesce(jornada_horas, 7),
       pct_hed  = coalesce(pct_hed, 25),
       pct_hen  = coalesce(pct_hen, 75),
       pct_hn   = coalesce(pct_hn, 35),
       pct_recargo_dominical = coalesce(pct_recargo_dominical, 90),
       pct_hedf = coalesce(pct_hedf, 115),
       pct_hef  = coalesce(pct_hef, 165),
       pct_recargo_nocturno_dominical = coalesce(pct_recargo_nocturno_dominical, 125);
