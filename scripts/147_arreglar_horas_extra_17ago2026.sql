-- ============================================================================
-- ARREGLO DEL 17 DE AGOSTO DE 2026 — horas extra que salieron ORDINARIAS
--
-- El 17-ago-2026 es LUNES y es FESTIVO: es el traslado de la Asunción, que cayó
-- sábado 15 (Ley Emiliani). Quien trabajó horas extra ese día debía recibirlas
-- como EXTRA DIURNA FESTIVA (`hedf`, recargo 115%) y las recibió como EXTRA
-- DIURNA ORDINARIA (`hed`, recargo 25%).
--
-- LA CAUSA: `calcular_y_asignar_horas_extras()` decidía mirando SOLO el día de
-- la semana -- `EXTRACT(ISODOW) = 7` -- y nunca consultaba la tabla `festivos`.
-- Un festivo de lunes a sábado se le escapaba por completo.
--
-- ESTE SCRIPT SÍ MODIFICA DATOS, y solo del 17-ago-2026. Antes de cambiar nada
-- guarda las filas afectadas en `respaldo_extras_17ago2026`, así que todo se
-- puede devolver (ver el bloque final).
--
-- CORRERLO COMPLETO Y DE CORRIDO. Los pasos van en este orden a propósito:
--   0. Foto de cómo está hoy.
--   1. Asegurar que el 17 esté en `festivos`.
--   2. Reemplazar la función, para que no vuelva a pasar.
--   3. Respaldar y corregir las filas del 17.
--   4. Verificar.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 0 — CÓMO ESTÁ HOY. Mirar esto antes de seguir.
-- ----------------------------------------------------------------------------
select '¿el 17-ago está en festivos?' as pregunta,
       case when exists (select 1 from public.festivos where fecha = date '2026-08-17')
            then 'SÍ' else 'NO — el paso 1 lo va a agregar' end as respuesta;

select r.idempresa,
       r.nombre,
       r.identificacion,
       r.puesto,
       r.aprobado,
       r.horaingreso,
       r.horasalida,
       r.hed  as extra_ordinaria_diurna,
       r.hedf as extra_festiva_diurna,
       r.hen  as extra_ordinaria_nocturna,
       r.hef  as extra_festiva_nocturna
  from public.registroasistencia r
 where r.fecha = date '2026-08-17'
   and (coalesce(r.hed, 0) > 0 or coalesce(r.hen, 0) > 0
        or coalesce(r.hedf, 0) > 0 or coalesce(r.hef, 0) > 0)
 order by r.nombre;


-- ----------------------------------------------------------------------------
-- PASO 1 — EL 17 TIENE QUE ESTAR EN `festivos`
--
-- Sin esto, ni la función corregida ni el pago dominical/festivo de
-- `pagonomina` reconocen el día. Es lo primero.
--
-- Si este INSERT falla porque la tabla pide más columnas (un nombre, un año),
-- correr antes:  select * from public.festivos limit 5;  y agregarlas a mano.
-- ----------------------------------------------------------------------------
insert into public.festivos (fecha)
select date '2026-08-17'
 where not exists (
   select 1 from public.festivos where fecha = date '2026-08-17'
 );


-- ----------------------------------------------------------------------------
-- PASO 2 — LA FUNCIÓN, PARA QUE NO SE REPITA
--
-- Igual que antes, pero ahora consulta `festivos`. Es la misma tabla que ya
-- usan `pagonomina` y `facturacionturnos`, así que las tres no pueden discrepar
-- sobre qué día es festivo.
--
-- Esto solo afecta filas NUEVAS (o las que se vuelvan a guardar). Lo que ya
-- está registrado lo corrige el paso 3.
-- ----------------------------------------------------------------------------
create or replace function public.calcular_y_asignar_horas_extras()
returns trigger
language plpgsql
as $function$
DECLARE
    hora_inicio_efectiva TIME;
    hora_fin_efectiva TIME;
    intervalo_trabajado INTERVAL;
    intervalo_exceso_salida INTERVAL;
    horas_totales NUMERIC;
    horas_extras NUMERIC;
    dia_semana INTEGER;
    es_festivo BOOLEAN;
BEGIN
    IF LOWER(NEW.especialidad) = 'true'
       AND NEW.horasalida IS NOT NULL
       AND NEW.horaingreso IS NOT NULL
       AND NEW.horaentradaprogramada IS NOT NULL
       AND NEW.horasalidaprogramada IS NOT NULL THEN

        -- 1. Inicio efectivo
        IF NEW.horaingreso < NEW.horaentradaprogramada THEN
            hora_inicio_efectiva := NEW.horaentradaprogramada;
        ELSE
            hora_inicio_efectiva := NEW.horaingreso;
        END IF;

        -- 2. Fin efectivo (tolerancia de 45 minutos)
        intervalo_exceso_salida := NEW.horasalida - NEW.horasalidaprogramada;
        IF intervalo_exceso_salida < interval '-12 hours' THEN
            intervalo_exceso_salida := intervalo_exceso_salida + interval '24 hours';
        ELSIF intervalo_exceso_salida > interval '12 hours' THEN
            intervalo_exceso_salida := intervalo_exceso_salida - interval '24 hours';
        END IF;

        IF intervalo_exceso_salida >= interval '0' AND intervalo_exceso_salida < interval '45 minutes' THEN
            hora_fin_efectiva := NEW.horasalidaprogramada;
        ELSE
            hora_fin_efectiva := NEW.horasalida;
        END IF;

        -- 3. Horas trabajadas y horas extra
        intervalo_trabajado := hora_fin_efectiva - hora_inicio_efectiva;
        IF intervalo_trabajado < interval '0' THEN
            intervalo_trabajado := intervalo_trabajado + interval '24 hours';
        END IF;

        horas_totales := EXTRACT(EPOCH FROM intervalo_trabajado) / 3600.0;
        horas_extras  := horas_totales - 1.0 - 7.0;

        IF horas_extras < 0 THEN
            horas_extras := 0;
        END IF;
        horas_extras := TRUNC(horas_extras, 2);

        -- 4. Domingo O FESTIVO -> hedf; el resto -> hed.
        --    La consulta a `festivos` es lo que se agrego: antes solo se miraba
        --    el dia de la semana y un festivo de lunes a sabado caia en `hed`.
        dia_semana := EXTRACT(ISODOW FROM NEW.fecha);

        SELECT EXISTS (
            SELECT 1 FROM public.festivos f WHERE f.fecha = NEW.fecha
        ) INTO es_festivo;

        IF dia_semana = 7 OR es_festivo THEN
            NEW.hedf := horas_extras;
            NEW.hed := 0;
        ELSE
            NEW.hed := horas_extras;
            NEW.hedf := 0;
        END IF;

    END IF;

    RETURN NEW;
END;
$function$;


-- ----------------------------------------------------------------------------
-- PASO 3 — CORREGIR LO YA REGISTRADO DEL 17
--
-- NO se recalculan las horas: la CANTIDAD siempre estuvo bien, lo único mal era
-- en qué columna quedó. Se mueve el valor:
--     hed (diurna ordinaria, 25%)  ->  hedf (diurna festiva, 115%)
--     hen (nocturna ordinaria, 75%) ->  hef  (nocturna festiva, 165%)
--
-- Se corrigen TODAS las filas del día, aprobadas o no. La clasificación no
-- depende de la aprobación: trabajar un festivo es festivo. Si una fila
-- pendiente quedara mal clasificada, al aprobarla se pagaría mal.
--
-- El respaldo se guarda ANTES de tocar nada.
-- ----------------------------------------------------------------------------
drop table if exists public.respaldo_extras_17ago2026;

create table public.respaldo_extras_17ago2026 as
select r.id, r.fecha, r.idempresa, r.nombre, r.identificacion, r.aprobado,
       r.hed, r.hedf, r.hen, r.hef, now() as respaldado_en
  from public.registroasistencia r
 where r.fecha = date '2026-08-17'
   and (coalesce(r.hed, 0) > 0 or coalesce(r.hen, 0) > 0);

update public.registroasistencia r
   set hedf = coalesce(r.hedf, 0) + coalesce(r.hed, 0),
       hed  = 0,
       hef  = coalesce(r.hef, 0) + coalesce(r.hen, 0),
       hen  = 0
 where r.fecha = date '2026-08-17'
   and (coalesce(r.hed, 0) > 0 or coalesce(r.hen, 0) > 0);


-- ----------------------------------------------------------------------------
-- PASO 4 — VERIFICACIÓN. Las tres tienen que cuadrar.
-- ----------------------------------------------------------------------------

-- 4a) Qué se movió y a quién. Comparar contra la foto del PASO 0.
select b.nombre,
       b.identificacion,
       b.aprobado,
       b.hed  as antes_ordinaria_diurna,
       r.hedf as ahora_festiva_diurna,
       b.hen  as antes_ordinaria_nocturna,
       r.hef  as ahora_festiva_nocturna
  from public.respaldo_extras_17ago2026 b
  join public.registroasistencia r on r.id = b.id
 order by b.nombre;

-- 4b) El total. `horas_movidas` es lo que pasó de ordinaria a festiva.
select count(*)                                  as filas_corregidas,
       count(distinct identificacion)            as personas,
       round(sum(coalesce(hed, 0)), 2)           as horas_diurnas_movidas,
       round(sum(coalesce(hen, 0)), 2)           as horas_nocturnas_movidas
  from public.respaldo_extras_17ago2026;

-- 4c) No debe quedar NINGUNA hora ordinaria el 17. Tiene que dar 0.
select count(*) as deberia_ser_cero
  from public.registroasistencia
 where fecha = date '2026-08-17'
   and (coalesce(hed, 0) > 0 or coalesce(hen, 0) > 0);


-- ============================================================================
-- PARA DEVOLVER TODO (si algo no cuadró)
--
--   update public.registroasistencia r
--      set hed = b.hed, hedf = b.hedf, hen = b.hen, hef = b.hef
--     from public.respaldo_extras_17ago2026 b
--    where r.id = b.id;
--
-- OJO CON LA NÓMINA: si la quincena del 17 de agosto YA SE PAGÓ y se reportó a
-- Siigo, después de esto `pagonomina` va a arrojar un valor MAYOR para esas
-- personas -- que es el correcto, pero ya no coincide con lo que se pagó. Hay
-- que decidir si se ajusta en la quincena siguiente.
--
-- LOS DEMÁS FESTIVOS DE 2026 SIGUEN MAL. Los dieciocho caen entre lunes y
-- sábado, así que a todos les pasó lo mismo. Este script arregla solo el 17.
-- Para ver el resto: scripts/146_corregir_horas_extra_festivos.sql
-- ============================================================================
