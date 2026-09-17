-- ============================================================================
-- VERIFICACIÓN — el festivo trabajado pasa a liquidarse como el domingo (0,90)
--
-- Definido por RRHH (2026-09): el festivo trabajado "debe tener el mismo efecto
-- que el domingo que se liquida al 0.9". Antes tenía una rama propia que lo
-- forzaba a tarifa completa (1,90) sin mirar el descanso semanal, y por eso
-- viajaba al archivo plano en la novedad 08. Ahora sigue la MISMA regla del
-- domingo y, para quien ya descansó, cae en la novedad 25.
--
-- ESTE ARCHIVO NO MODIFICA NADA. Son solo consultas.
--
-- ORDEN DE USO
--   PASO 1 — correrlo ANTES de reemplazar la vista y guardar el resultado.
--   PASO 2 — correr scripts/053_pagonomina_reemplazo.sql (y, si se quiere que el
--            plano quede con los comentarios al día, 059_archivoplano_reemplazo.sql;
--            ese no cambió de lógica).
--   PASO 3 — volver a correr el PASO 1 y comparar. Los festivos de quien ya
--            descansó deben pasar de 1,90 a 0,90, y de la novedad 08 a la 25.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 / 3 — Festivos trabajados de la quincena en curso, con su tarifa.
--
-- `recargo_dominical_tasa_completa` es la bandera que decide la novedad del
-- plano: true → 08, false → 25.
-- ----------------------------------------------------------------------------
select p.fecha,
       to_char(p.fecha, 'TMDay')                          as dia,
       p.idempresa,
       p.persona,
       round(p.recargodominical, 2)                       as recargo_liquidado,
       p.recargo_dominical_tasa_completa                  as tasa_completa,
       case when p.recargo_dominical_tasa_completa
            then '08 - Hora extra recargo dominical o festivo'
            else '25 - Recargo dominical o festivo'
       end                                                as novedad_plano
  from public.pagonomina p
  join public.festivos f on f.fecha = p.fecha
 where p.recargodominical > 0
   and p.fecha >= date_trunc('month', current_date)
 order by p.fecha, p.idempresa, p.persona;


-- ----------------------------------------------------------------------------
-- El total en pesos, por festivo. Es la cifra que cambia.
--
-- Corriendo esto ANTES y DESPUÉS del reemplazo se ve exactamente cuánto baja.
-- ----------------------------------------------------------------------------
select p.fecha,
       count(*)                                                   as personas,
       count(*) filter (where p.recargo_dominical_tasa_completa)  as en_novedad_08,
       count(*) filter (where not p.recargo_dominical_tasa_completa) as en_novedad_25,
       round(sum(p.recargodominical), 0)                          as total_recargo
  from public.pagonomina p
  join public.festivos f on f.fecha = p.fecha
 where p.recargodominical > 0
   and p.fecha >= date '2026-01-01'
 group by p.fecha
 order by p.fecha desc;


-- ----------------------------------------------------------------------------
-- CONTRASTE con el domingo: después del cambio, las dos filas deben mostrar el
-- mismo criterio — la proporción entre tasa completa y solo recargo depende del
-- descanso, no de si el día era domingo o festivo.
-- ----------------------------------------------------------------------------
select case when f.fecha is not null then 'Festivo' else 'Domingo' end as tipo_dia,
       count(*)                                                        as personas,
       count(*) filter (where p.recargo_dominical_tasa_completa)       as tasa_completa_190,
       count(*) filter (where not p.recargo_dominical_tasa_completa)   as solo_recargo_090
  from public.pagonomina p
  left join public.festivos f on f.fecha = p.fecha
 where p.recargodominical > 0
   and p.fecha >= date '2026-07-16'
 group by 1
 order by 1;


-- ============================================================================
-- LO QUE HAY QUE MIRAR ANTES DE DAR EL CAMBIO POR BUENO
--
--  · Un festivo de alguien que YA descansó su domingo debe quedar en 0,90 y en
--    la novedad 25. Con un valor diario de $58.363,50 eso es $52.527,15 en vez
--    de $110.890,65: baja $58.363,50 por persona y por festivo.
--
--  · Un festivo de alguien que NO descansó sigue en 1,90 y en la novedad 08.
--    Si TODOS los festivos quedaron en 25, revisar `descansos_semana_anterior`:
--    puede que nadie esté registrando descansos.
--
--  · `pagonomina` es una VISTA: se recalcula al consultarla. Un festivo de una
--    quincena YA PAGADA y reportada a Siigo al 1,90 va a mostrarse al 0,90 en
--    cuanto se corra el reemplazo. Si eso no se quiere, hay que acotar el
--    cambio por fecha, igual que se hizo con el corte del 2026-07-16.
-- ============================================================================
