-- ============================================================================
-- SÁBADO + "Distribución Turno": jornada reducida, umbral de hora extra = 4.5h
-- ----------------------------------------------------------------------------
-- Pedido por el usuario 2026-08-28: los sábados, el personal cuyo puesto en
-- `registroasistencia` es "Distribución Turno" tiene jornada reducida — la
-- hora extra se cuenta desde las 4,5 horas trabajadas TOTALES (no desde las
-- 8h = 1h descanso + 7h jornada base que aplica el resto de días/puestos).
-- Si ese turno de sábado supera las 6h trabajadas, se resta 1h de descanso
-- ADEMÁS del umbral de 4.5h (turno largo de sábado).
--
-- La función trigger `calcular_y_asignar_horas_extras()` (scripts/fn_calcular_
-- y_asignar_horas_extras.sql) ya quedó con esta excepción, pero eso solo
-- afecta filas NUEVAS. Este script:
--   1) Reemplaza la función (para que no vuelva a pasar).
--   2) Recalcula RETROACTIVAMENTE las filas ya guardadas de la 2da quincena
--      de agosto/2026 (16 al 31) que califican para la excepción.
--
-- CORRERLO COMPLETO Y DE CORRIDO, en este orden:
--   PASO 0. Foto de cómo está hoy (antes de tocar nada).
--   PASO 1. Reemplazar la función.
--   PASO 2. Respaldar y recalcular las filas afectadas.
--   PASO 3. Verificar.
--
-- Alcance del recálculo: fecha entre 2026-08-16 y 2026-08-31, SÁBADO
-- (ISODOW=6), puesto = 'Distribución Turno', especialidad = 'true', con los
-- 4 tiempos (horaingreso/horaentradaprogramada/horasalida/horasalidaprogramada)
-- presentes. Se corrigen TODAS esas filas, aprobadas o no — igual que el
-- fix del 17-ago (147_arreglar_horas_extra_17ago2026.sql): mejor corregir antes
-- de que se apruebe con el valor viejo, que dejar una fila pendiente mal
-- calculada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PASO 0 (solo lectura) — cómo está hoy. Mirar antes de seguir.
-- ----------------------------------------------------------------------------
select r.id, r.fecha, r.idempresa, r.nombre, r.identificacion, r.puesto,
       r.aprobado, r.horaingreso, r.horaentradaprogramada, r.horasalida, r.horasalidaprogramada,
       r.hed as hed_actual, r.hedf as hedf_actual
  from public.registroasistencia r
 where r.fecha between date '2026-08-16' and date '2026-08-31'
   and extract(isodow from r.fecha) = 6
   and trim(r.puesto) = 'Distribución Turno'
   and lower(r.especialidad) = 'true'
 order by r.fecha, r.nombre;

-- ----------------------------------------------------------------------------
-- PASO 1 — reemplazar la función (queda igual a scripts/fn_calcular_y_
-- asignar_horas_extras.sql; se repite aquí para que el script sea autónomo).
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
    es_sabado_distribucion_turno BOOLEAN;
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

        dia_semana := EXTRACT(ISODOW FROM NEW.fecha);

        -- SÁBADO + "Distribución Turno": umbral de 4.5h totales (jornada
        -- reducida), en vez de 1h descanso + 7h jornada base. Si el turno
        -- supera las 6h, se resta 1h de descanso además del umbral de 4.5h.
        es_sabado_distribucion_turno := (dia_semana = 6 AND TRIM(NEW.puesto) = 'Distribución Turno');

        IF es_sabado_distribucion_turno THEN
            IF horas_totales > 6.0 THEN
                horas_extras := horas_totales - 1.0 - 4.5;
            ELSE
                horas_extras := horas_totales - 4.5;
            END IF;
        ELSE
            horas_extras := horas_totales - 1.0 - 7.0;
        END IF;

        IF horas_extras < 0 THEN
            horas_extras := 0;
        END IF;
        horas_extras := TRUNC(horas_extras, 2);

        -- 4. Domingo o festivo -> hedf; el resto -> hed. La excepción de
        -- sábado NO cambia esta clasificación.
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
-- PASO 2 — respaldar y recalcular las filas afectadas de la 2da quincena.
-- El respaldo se guarda ANTES de tocar nada (para poder revertir si algo no
-- cuadra, ver el bloque final).
-- ----------------------------------------------------------------------------
drop table if exists public.respaldo_horas_extra_sabado_dt_ago2026;

create table public.respaldo_horas_extra_sabado_dt_ago2026 as
select r.id, r.fecha, r.idempresa, r.nombre, r.identificacion, r.aprobado,
       r.hed, r.hedf, r.hen, r.hef, now() as respaldado_en
  from public.registroasistencia r
 where r.fecha between date '2026-08-16' and date '2026-08-31'
   and extract(isodow from r.fecha) = 6
   and trim(r.puesto) = 'Distribución Turno'
   and lower(r.especialidad) = 'true'
   and r.horasalida is not null and r.horaingreso is not null
   and r.horaentradaprogramada is not null and r.horasalidaprogramada is not null;

WITH calculo AS (
  SELECT
    r.id,
    r.fecha,
    CASE WHEN r.horaingreso < r.horaentradaprogramada
         THEN r.horaentradaprogramada
         ELSE r.horaingreso
    END AS hora_inicio_efectiva,
    (
      (r.horasalida - r.horasalidaprogramada)
      + CASE
          WHEN (r.horasalida - r.horasalidaprogramada) < interval '-12 hours' THEN interval '24 hours'
          WHEN (r.horasalida - r.horasalidaprogramada) > interval '12 hours' THEN interval '-24 hours'
          ELSE interval '0'
        END
    ) AS intervalo_exceso_salida,
    r.horasalida,
    r.horasalidaprogramada
  FROM public.registroasistencia r
  WHERE r.fecha BETWEEN DATE '2026-08-16' AND DATE '2026-08-31'
    AND EXTRACT(ISODOW FROM r.fecha) = 6
    AND TRIM(r.puesto) = 'Distribución Turno'
    AND LOWER(r.especialidad) = 'true'
    AND r.horasalida IS NOT NULL AND r.horaingreso IS NOT NULL
    AND r.horaentradaprogramada IS NOT NULL AND r.horasalidaprogramada IS NOT NULL
),
calculo2 AS (
  SELECT
    c.id, c.fecha, c.hora_inicio_efectiva,
    CASE
      WHEN c.intervalo_exceso_salida >= interval '0' AND c.intervalo_exceso_salida < interval '45 minutes'
      THEN c.horasalidaprogramada
      ELSE c.horasalida
    END AS hora_fin_efectiva
  FROM calculo c
),
calculo3 AS (
  SELECT
    c2.id, c2.fecha,
    CASE
      WHEN (c2.hora_fin_efectiva - c2.hora_inicio_efectiva) < interval '0'
      THEN (c2.hora_fin_efectiva - c2.hora_inicio_efectiva) + interval '24 hours'
      ELSE (c2.hora_fin_efectiva - c2.hora_inicio_efectiva)
    END AS intervalo_trabajado
  FROM calculo2 c2
),
calculo4 AS (
  SELECT
    c3.id, c3.fecha,
    (EXTRACT(EPOCH FROM c3.intervalo_trabajado) / 3600.0) AS horas_totales
  FROM calculo3 c3
),
resultado AS (
  SELECT
    c4.id, c4.fecha,
    GREATEST(
      TRUNC(
        c4.horas_totales - CASE WHEN c4.horas_totales > 6.0 THEN 1.0 + 4.5 ELSE 4.5 END,
        2
      ),
      0
    ) AS horas_extras_nuevas
  FROM calculo4 c4
)
UPDATE public.registroasistencia AS ra
SET
  hed  = CASE WHEN EXISTS (SELECT 1 FROM public.festivos f WHERE f.fecha = res.fecha) THEN 0 ELSE res.horas_extras_nuevas END,
  hedf = CASE WHEN EXISTS (SELECT 1 FROM public.festivos f WHERE f.fecha = res.fecha) THEN res.horas_extras_nuevas ELSE 0 END
FROM resultado res
WHERE ra.id = res.id;

-- Revisa el mensaje "UPDATE N" antes de continuar. Debe coincidir con el
-- número de filas del PASO 0.

-- ----------------------------------------------------------------------------
-- PASO 3 (solo lectura) — verificación: compara antes/después.
-- ----------------------------------------------------------------------------
select b.fecha, b.nombre, b.identificacion, b.aprobado,
       b.hed as hed_antes, r.hed as hed_ahora,
       b.hedf as hedf_antes, r.hedf as hedf_ahora
  from public.respaldo_horas_extra_sabado_dt_ago2026 b
  join public.registroasistencia r on r.id = b.id
 order by b.fecha, b.nombre;

-- ============================================================================
-- PARA DEVOLVER TODO (si algo no cuadró):
--
--   update public.registroasistencia r
--      set hed = b.hed, hedf = b.hedf
--     from public.respaldo_horas_extra_sabado_dt_ago2026 b
--    where r.id = b.id;
--
-- OJO CON LA NÓMINA: si alguna de estas filas ya se aprobó y pagó antes de
-- correr este script, después de esto `pagonomina` va a arrojar un valor
-- MAYOR para esas personas — es el correcto, pero hay que decidir si se
-- ajusta en la quincena siguiente.
-- ============================================================================
