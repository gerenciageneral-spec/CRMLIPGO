-- =====================================================================
-- Verificación del cambio de `recargodominical` en `pagonomina`.
--
-- QUÉ CAMBIÓ (ver scripts/053_pagonomina_reemplazo.sql):
--
--  1. FESTIVO TRABAJADO ahora paga recargo. Antes las dos ramas exigían
--     `dia_semana = 0`, así que un festivo entre semana pagaba solo la base
--     (1,0) y el recargo quedaba en CERO.
--
--  2. RECARGO REFORZADO. Si no descansó en los 6 días anteriores ni tiene
--     compensatorio en los 6 siguientes, el recargo pasa de `pct` a `1 + pct`
--     — de 0,90 a 1,90 hoy.
--
-- >>> OJO — ESTO RECALCULA HISTÓRICO. La rama tiene piso 16-jul-2026, así que
-- >>> al reemplazar la vista TODOS los domingos y festivos desde esa fecha se
-- >>> recalculan, incluidas quincenas ya pagadas y reportadas a Siigo.
-- >>> Correr el punto 1 ANTES de reemplazar la vista y guardar el resultado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ANTES DE REEMPLAZAR — foto de lo que hay hoy.
--    Guardar esta salida (exportar a CSV) para poder comparar después.
-- ---------------------------------------------------------------------
select fecha,
       persona,
       idempresaliquidacion,
       actividad_registrada,
       base_dia,
       recargodominical,
       total_liquidado_dia
from public.pagonomina
where fecha >= date '2026-07-16'
  and (extract(dow from fecha) = 0 or fecha in (select fecha from public.festivos))
  and base_dia > 0
order by fecha, persona;

-- ---------------------------------------------------------------------
-- 2) DESPUÉS DE REEMPLAZAR — quién quedó con recargo reforzado.
--
--    `factor` es el recargo expresado en veces la base del día:
--      ≈ 0,90 → descansó (antes o después): recargo normal.
--      ≈ 1,90 → no descansó: recargo reforzado.
--      = 0    → no trabajó ese día (o es día 31).
-- ---------------------------------------------------------------------
select fecha,
       to_char(fecha, 'Dy')                                  as dia,
       case when fecha in (select fecha from public.festivos)
            then 'festivo' else 'domingo' end                as tipo,
       persona,
       idempresaliquidacion                                  as empresa,
       base_dia,
       recargodominical,
       round(recargodominical / nullif(base_dia, 0), 2)      as factor,
       total_liquidado_dia
from public.pagonomina
where fecha >= date '2026-07-16'
  and (extract(dow from fecha) = 0 or fecha in (select fecha from public.festivos))
  and base_dia > 0
order by fecha desc, persona;

-- ---------------------------------------------------------------------
-- 3) CUÁNTO CUESTA — el impacto en plata por quincena.
--
--    `recargo_viejo` reconstruye lo que pagaba la regla anterior: pct sobre la
--    base para los DOMINGOS, y CERO para los festivos entre semana.
-- ---------------------------------------------------------------------
with base as (
  select p.fecha,
         p.persona,
         p.idempresaliquidacion as empresa,
         p.base_dia,
         p.recargodominical,
         (p.fecha in (select fecha from public.festivos)) as es_festivo,
         (extract(dow from p.fecha) = 0)                  as es_domingo,
         coalesce((select v.pct_recargo_dominical
                     from public.parametros_legales_vigencia v
                    where v.fecha_desde <= p.fecha
                    order by v.fecha_desde desc
                    limit 1), 90) as pct
  from public.pagonomina p
  where p.fecha >= date '2026-07-16'
    and p.base_dia > 0
    and (extract(dow from p.fecha) = 0 or p.fecha in (select fecha from public.festivos))
)
select empresa,
       case when extract(day from fecha) <= 15 then 'Q1' else 'Q2' end as quincena,
       to_char(fecha, 'YYYY-MM')                        as mes,
       count(*)                                          as dias_persona,
       round(sum(case when es_domingo then base_dia * pct / 100.0 else 0 end)) as recargo_viejo,
       round(sum(recargodominical))                      as recargo_nuevo,
       round(sum(recargodominical)
             - sum(case when es_domingo then base_dia * pct / 100.0 else 0 end)) as diferencia
from base
group by empresa, quincena, mes
order by mes desc, empresa, quincena;

-- ---------------------------------------------------------------------
-- 4) EL CASO QUE ORIGINÓ EL CAMBIO, para comprobarlo al peso.
--    Domingo 02-ago-2026, salario 1.750.905 → base 58.363,50.
--      antes: recargo 52.527,15 (0,90)
--      ahora: recargo 110.890,65 (1,90) si no descansó ni tiene compensatorio.
-- ---------------------------------------------------------------------
select fecha, persona, base_dia, recargodominical,
       round(recargodominical / nullif(base_dia, 0), 2) as factor,
       total_liquidado_dia
from public.pagonomina
where persona = 'ANDRES FELIPE ESCORCIA UCROS'
  and fecha between date '2026-07-27' and date '2026-08-09'
order by fecha;

-- =====================================================================
-- SI SE PREFIERE NO TOCAR LO YA PAGADO
--
-- Basta con subir el piso de la rama nueva en 053_pagonomina_reemplazo.sql: cambiar
--
--     WHEN ((calculo_nomina_base.fecha >= DATE '2026-07-16')
--
-- por la fecha desde la que se quiera aplicar (por ejemplo el inicio de la
-- quincena en curso). El resto de la vista queda igual.
--
-- OJO: el festivo del 07-ago-2026 quedaría fuera si el piso se pone después.
-- =====================================================================
