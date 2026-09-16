-- ============================================================================
-- CAUSAL DE CONTRATACIÓN EN LA REQUISICIÓN DE PERSONAL
-- ----------------------------------------------------------------------------
-- En Colombia una empresa de servicios temporales solo puede enviar personal en
-- misión por las causales del Art. 77 de la Ley 50 de 1990, y la causal define
-- CUÁNTO puede durar la vinculación:
--
--   1. Labor ocasional, accidental o transitoria ....... hasta 30 días
--   2. Reemplazo por licencia, vacaciones, incapacidad . mientras dure la ausencia
--   3. Incremento de producción / picos de temporada ... 6 meses + 6 de prórroga
--
-- Superado el tope, la vinculación debe ser DIRECTA con la usuaria. Hoy la
-- requisición no guarda por qué se pide la persona, así que no hay forma de
-- saber --ni de auditar-- si un cargo lleva más tiempo del que la ley permite.
--
-- Aditivo e idempotente. No modifica ninguna fila existente: las requisiciones
-- ya creadas quedan con la causal en NULL, y la pantalla lo muestra como "sin
-- causal registrada" en vez de inventarles una.
-- ============================================================================

alter table public.vacantes
  add column if not exists causal text;

comment on column public.vacantes.causal is
  'Causal del Art. 77 Ley 50/1990: ocasional | reemplazo | incremento | periodos_estacionales. Define el plazo máximo de la vinculación.';

-- Fecha prevista de inicio y fin: con la causal, permiten verificar el tope.
alter table public.vacantes
  add column if not exists fecha_inicio_prevista date;
alter table public.vacantes
  add column if not exists fecha_fin_prevista date;

comment on column public.vacantes.fecha_fin_prevista is
  'Fin previsto de la misión. Contrastado con la causal dice si se supera el tope legal.';


-- ----------------------------------------------------------------------------
-- VERIFICACIÓN (solo lecturas)
-- ----------------------------------------------------------------------------

-- 1) Las columnas quedaron creadas.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'vacantes'
  and column_name in ('causal', 'fecha_inicio_prevista', 'fecha_fin_prevista')
order by column_name;

-- 2) Nada cambió para las requisiciones existentes: todas con causal en NULL.
select count(*) as total_requisiciones,
       count(causal) as con_causal,
       count(*) - count(causal) as sin_causal_aun
from public.vacantes;

-- 3) Requisiciones por empresa, para saber dónde se va a ver el cambio.
--    Cambiar el 1 por la empresa que se está mirando.
select cargo, headcount as vacantes, estado,
       aprobacion_rrhh, aprobacion_operaciones, causal
from public.vacantes
where idempresa = 1
order by created_at desc
limit 10;


-- ----------------------------------------------------------------------------
-- REVERSIÓN
-- ----------------------------------------------------------------------------
--   alter table public.vacantes drop column if exists causal;
--   alter table public.vacantes drop column if exists fecha_inicio_prevista;
--   alter table public.vacantes drop column if exists fecha_fin_prevista;
