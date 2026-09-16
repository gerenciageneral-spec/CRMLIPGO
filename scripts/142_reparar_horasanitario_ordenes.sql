-- =====================================================================
-- Ordenes que perdieron la hora de la inspeccion sanitaria
--
-- EL PROBLEMA (ya corregido en el codigo):
--   Cuando la inspeccion sanitaria se hacia ANTES de que existiera la orden, la
--   hora quedaba en `citasvehiculos.horaregistro` y el registro en
--   `registrosanitario` con `ordencargue` en NULL.
--
--   Al crear despues la orden directamente con la placa -- generateLoadOrder,
--   generateUnloadOrder, generateDistributionOrder -- se copiaban del vehiculo
--   `horapesoinicial` y `horallegada`, pero NO `horaregistro`. Resultado:
--   `cabeceraoc.horasanitario` quedaba vacio y la orden se veia como si el
--   vehiculo nunca se hubiera inspeccionado.
--
--   El camino de "asignar vehiculo a una orden existente"
--   (assignVehicleToLoadOrder) SI la copiaba. Por eso el problema aparecia solo
--   a veces, segun por donde se creara la orden.
--
-- ESTE SCRIPT NO MODIFICA NADA POR SI SOLO. Las tres primeras consultas son
-- para ver el tamano del problema; el UPDATE del final esta comentado.
--
-- CRITERIO DE EMPAREJAMIENTO: misma placa, inspeccion APROBADA, sin orden
-- asignada, y del mismo dia de la orden o del dia anterior. Una inspeccion de
-- hace tres dias no dice nada del estado del vehiculo el dia del cargue, asi
-- que arrastrarla seria peor que dejar el campo vacio. El dia anterior si
-- cuenta: un vehiculo inspeccionado de noche se carga a la manana siguiente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) EL TAMANO DEL PROBLEMA: cuantas ordenes con placa no tienen hora de
--    sanitario, y de esas cuantas SI tienen una inspeccion recuperable.
-- ---------------------------------------------------------------------
with ordenes_sin_hora as (
  select c.id, c.ordendecargue, c.placa, c.fechaorden, c.tipooperacion
    from public.cabeceraoc c
   where coalesce(nullif(trim(c.placa), ''), null) is not null
     and c.horasanitario is null
),
emparejadas as (
  select o.*,
         (select r.horaregistro
            from public.registrosanitario r
           where r.placa = o.placa
             and r.ordencargue is null
             and r.horaregistro is not null
             and lower(trim(coalesce(r.aprobacion, 'aprobado'))) <> 'rechazado'
             and r.fecha between (o.fechaorden::date - 1) and o.fechaorden::date
           order by r.id desc
           limit 1) as hora_recuperable
    from ordenes_sin_hora o
)
select count(*)                                          as ordenes_sin_hora_sanitario,
       count(*) filter (where hora_recuperable is not null) as recuperables,
       count(*) filter (where hora_recuperable is null)     as sin_inspeccion_previa,
       min(fechaorden)                                   as desde,
       max(fechaorden)                                   as hasta
  from emparejadas;

-- ---------------------------------------------------------------------
-- 2) EL DETALLE: que orden se emparejaria con que inspeccion.
--    REVISAR ESTA LISTA antes de correr el UPDATE. Si alguna fila no cuadra,
--    ahi se ve.
-- ---------------------------------------------------------------------
select o.id                as orden_id,
       o.ordendecargue,
       o.tipooperacion,
       o.placa,
       o.fechaorden,
       r.id                as registro_id,
       r.fecha             as fecha_inspeccion,
       r.horaregistro      as hora_a_poner,
       r.aprobacion,
       case when r.fecha = o.fechaorden::date then 'mismo dia' else 'dia anterior' end as cercania
  from public.cabeceraoc o
  join lateral (
    select r.*
      from public.registrosanitario r
     where r.placa = o.placa
       and r.ordencargue is null
       and r.horaregistro is not null
       and lower(trim(coalesce(r.aprobacion, 'aprobado'))) <> 'rechazado'
       and r.fecha between (o.fechaorden::date - 1) and o.fechaorden::date
     order by r.id desc
     limit 1
  ) r on true
 where coalesce(nullif(trim(o.placa), ''), null) is not null
   and o.horasanitario is null
 order by o.fechaorden desc, o.id desc;

-- ---------------------------------------------------------------------
-- 3) LO QUE NO SE PUEDE RECUPERAR: ordenes sin hora y sin inspeccion previa
--    que empareje. O el vehiculo no se inspecciono, o la inspeccion ya quedo
--    amarrada a otra orden, o esta fuera de la ventana de dos dias.
-- ---------------------------------------------------------------------
select o.id, o.ordendecargue, o.tipooperacion, o.placa, o.fechaorden
  from public.cabeceraoc o
 where coalesce(nullif(trim(o.placa), ''), null) is not null
   and o.horasanitario is null
   and not exists (
     select 1 from public.registrosanitario r
      where r.placa = o.placa
        and r.ordencargue is null
        and r.horaregistro is not null
        and lower(trim(coalesce(r.aprobacion, 'aprobado'))) <> 'rechazado'
        and r.fecha between (o.fechaorden::date - 1) and o.fechaorden::date
   )
 order by o.fechaorden desc, o.id desc
 limit 200;

-- =====================================================================
-- REPARACION -- descomentar SOLO despues de revisar la consulta 2.
--
-- Hace dos cosas, en este orden:
--   a) copia la hora de la inspeccion a la orden;
--   b) amarra esa inspeccion a la orden, para que deje de figurar sin orden
--      en el historico de inspecciones y no se le asigne despues a otra.
--
-- El paso (b) va segundo a proposito: si fuera primero, el paso (a) ya no
-- encontraria la inspeccion -- la busca justamente por `ordencargue is null`.
-- =====================================================================

-- begin;
--
-- create temporary table tmp_repara_sanitario as
-- select o.id as orden_id, o.ordendecargue, r.id as registro_id, r.horaregistro
--   from public.cabeceraoc o
--   join lateral (
--     select r.*
--       from public.registrosanitario r
--      where r.placa = o.placa
--        and r.ordencargue is null
--        and r.horaregistro is not null
--        and lower(trim(coalesce(r.aprobacion, 'aprobado'))) <> 'rechazado'
--        and r.fecha between (o.fechaorden::date - 1) and o.fechaorden::date
--      order by r.id desc
--      limit 1
--   ) r on true
--  where coalesce(nullif(trim(o.placa), ''), null) is not null
--    and o.horasanitario is null;
--
-- -- (a) la hora viaja a la orden
-- update public.cabeceraoc c
--    set horasanitario = t.horaregistro
--   from tmp_repara_sanitario t
--  where c.id = t.orden_id;
--
-- -- (b) la inspeccion queda amarrada a esa orden
-- update public.registrosanitario r
--    set ordencargue = t.ordendecargue
--   from tmp_repara_sanitario t
--  where r.id = t.registro_id
--    and r.ordencargue is null;
--
-- -- Verificar ANTES de confirmar: debe coincidir con lo que dio la consulta 2.
-- select count(*) as ordenes_reparadas from tmp_repara_sanitario;
--
-- commit;    -- o  rollback;  si el numero no cuadra
-- =====================================================================
