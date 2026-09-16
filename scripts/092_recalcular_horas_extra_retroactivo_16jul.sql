-- ============================================================================
-- Recálculo RETROACTIVO de horas extra (hed / hedf) en registroasistencia
-- ----------------------------------------------------------------------------
-- Motivo: la jornada base cambió de 7.3333h a 7h a partir del 16-jul-2026
-- (parametros_legales_vigencia). La función trigger
-- public.calcular_y_asignar_horas_extras() (scripts/fn_calcular_y_asignar_
-- horas_extras.sql) ya quedó actualizada a 7h, pero eso solo afecta filas
-- NUEVAS (INSERT/UPDATE futuros) — las filas ya guardadas después del 16-jul
-- quedaron con el hed/hedf calculado con la jornada VIEJA (7.3333h) y hay
-- que recalcularlas.
--
-- Alcance:
--   - fecha > '2026-07-16' (estrictamente después; el 16-jul en sí NO se toca).
--   - SOLO filas con aprobado = 'aprobado' (o su equivalente true/'true'/'si',
--     mismo criterio que estadoAprobacion() en components/extra-hours-
--     assignment.tsx). Las pendientes o rechazadas NO se tocan.
--   - Replica la MISMA fórmula del trigger (no lo re-dispara con un UPDATE
--     "vacío" por si el trigger real tuviera una condición WHEN que no
--     detecte un no-op) — así el resultado es determinista y auditable.
--
-- IMPORTANTE: si algún registro tuvo un AJUSTE MANUAL de hed/hedf (botón
-- "Ajuste Manual" en Asignación de horas extra, valores 0.66/2.66), este
-- script lo SOBRESCRIBE con el valor recalculado. Revisar la lista de
-- afectados en el PASO 1 antes de correr el PASO 2 si eso es una preocupación.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PASO 1 (solo lectura) — vista previa: cuántas filas se van a tocar y cómo
-- cambiaría hed/hedf. Correr primero y revisar antes de continuar.
-- ----------------------------------------------------------------------------
WITH calculo AS (
  SELECT
    r.id,
    r.fecha,
    r.nombre,
    r.identificacion,
    r.hed  AS hed_actual,
    r.hedf AS hedf_actual,
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
  FROM registroasistencia r
  WHERE r.fecha > DATE '2026-07-16'
    AND LOWER(TRIM(r.aprobado::text)) IN ('aprobado', 'true', 'si')
    AND LOWER(r.especialidad) = 'true'
    AND r.horasalida IS NOT NULL
    AND r.horaingreso IS NOT NULL
    AND r.horaentradaprogramada IS NOT NULL
    AND r.horasalidaprogramada IS NOT NULL
),
calculo2 AS (
  SELECT
    c.*,
    CASE
      WHEN c.intervalo_exceso_salida >= interval '0' AND c.intervalo_exceso_salida < interval '30 minutes'
      THEN c.horasalidaprogramada
      ELSE c.horasalida
    END AS hora_fin_efectiva
  FROM calculo c
),
calculo3 AS (
  SELECT
    c2.*,
    CASE
      WHEN (c2.hora_fin_efectiva - c2.hora_inicio_efectiva) < interval '0'
      THEN (c2.hora_fin_efectiva - c2.hora_inicio_efectiva) + interval '24 hours'
      ELSE (c2.hora_fin_efectiva - c2.hora_inicio_efectiva)
    END AS intervalo_trabajado
  FROM calculo2 c2
),
resultado AS (
  SELECT
    c3.id,
    c3.fecha,
    c3.nombre,
    c3.identificacion,
    c3.hed_actual,
    c3.hedf_actual,
    GREATEST(
      TRUNC((EXTRACT(EPOCH FROM c3.intervalo_trabajado) / 3600.0) - 1.0 - 7.0, 2),
      0
    ) AS horas_extras_nuevas
  FROM calculo3 c3
)
SELECT
  id,
  fecha,
  nombre,
  identificacion,
  hed_actual,
  hedf_actual,
  CASE WHEN EXTRACT(ISODOW FROM fecha) = 7 THEN 0 ELSE horas_extras_nuevas END AS hed_nuevo,
  CASE WHEN EXTRACT(ISODOW FROM fecha) = 7 THEN horas_extras_nuevas ELSE 0 END AS hedf_nuevo,
  (COALESCE(hed_actual, 0) <> CASE WHEN EXTRACT(ISODOW FROM fecha) = 7 THEN 0 ELSE horas_extras_nuevas END)
    OR (COALESCE(hedf_actual, 0) <> CASE WHEN EXTRACT(ISODOW FROM fecha) = 7 THEN horas_extras_nuevas ELSE 0 END)
    AS cambia
FROM resultado
ORDER BY cambia DESC, fecha, nombre;

-- Conteo rápido de cuántas filas realmente cambiarían (ejecutar aparte si se
-- quiere solo el número):
-- (usar la misma consulta de arriba envuelta en SELECT count(*) FROM (...) x WHERE x.cambia)

-- ----------------------------------------------------------------------------
-- PASO 2 — UPDATE real. Envuelto en transacción: revisa el resultado del
-- PASO 1 primero; si algo se ve mal, no corras este bloque (o usa ROLLBACK
-- antes del COMMIT si lo corres manualmente por partes).
-- ----------------------------------------------------------------------------
BEGIN;

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
  FROM registroasistencia r
  WHERE r.fecha > DATE '2026-07-16'
    AND LOWER(TRIM(r.aprobado::text)) IN ('aprobado', 'true', 'si')
    AND LOWER(r.especialidad) = 'true'
    AND r.horasalida IS NOT NULL
    AND r.horaingreso IS NOT NULL
    AND r.horaentradaprogramada IS NOT NULL
    AND r.horasalidaprogramada IS NOT NULL
),
calculo2 AS (
  SELECT
    c.id,
    c.fecha,
    c.hora_inicio_efectiva,
    CASE
      WHEN c.intervalo_exceso_salida >= interval '0' AND c.intervalo_exceso_salida < interval '30 minutes'
      THEN c.horasalidaprogramada
      ELSE c.horasalida
    END AS hora_fin_efectiva
  FROM calculo c
),
calculo3 AS (
  SELECT
    c2.id,
    c2.fecha,
    CASE
      WHEN (c2.hora_fin_efectiva - c2.hora_inicio_efectiva) < interval '0'
      THEN (c2.hora_fin_efectiva - c2.hora_inicio_efectiva) + interval '24 hours'
      ELSE (c2.hora_fin_efectiva - c2.hora_inicio_efectiva)
    END AS intervalo_trabajado
  FROM calculo2 c2
),
resultado AS (
  SELECT
    c3.id,
    c3.fecha,
    GREATEST(
      TRUNC((EXTRACT(EPOCH FROM c3.intervalo_trabajado) / 3600.0) - 1.0 - 7.0, 2),
      0
    ) AS horas_extras_nuevas
  FROM calculo3 c3
)
UPDATE registroasistencia AS ra
SET
  hed  = CASE WHEN EXTRACT(ISODOW FROM res.fecha) = 7 THEN 0 ELSE res.horas_extras_nuevas END,
  hedf = CASE WHEN EXTRACT(ISODOW FROM res.fecha) = 7 THEN res.horas_extras_nuevas ELSE 0 END
FROM resultado res
WHERE ra.id = res.id;

-- Revisa el mensaje "UPDATE N" que devuelve Supabase antes de confirmar.
-- Si N no coincide con lo esperado del PASO 1, ROLLBACK en vez de COMMIT.
COMMIT;

-- ----------------------------------------------------------------------------
-- PASO 3 (solo lectura) — verificación posterior: confirma que ya no quedan
-- filas aprobadas después del 16-jul con hed/hedf distinto al recalculado.
-- Debe devolver 0 filas.
-- ----------------------------------------------------------------------------
WITH calculo AS (
  SELECT
    r.id, r.fecha, r.hed AS hed_actual, r.hedf AS hedf_actual,
    CASE WHEN r.horaingreso < r.horaentradaprogramada THEN r.horaentradaprogramada ELSE r.horaingreso END AS hora_inicio_efectiva,
    (
      (r.horasalida - r.horasalidaprogramada)
      + CASE
          WHEN (r.horasalida - r.horasalidaprogramada) < interval '-12 hours' THEN interval '24 hours'
          WHEN (r.horasalida - r.horasalidaprogramada) > interval '12 hours' THEN interval '-24 hours'
          ELSE interval '0'
        END
    ) AS intervalo_exceso_salida,
    r.horasalida, r.horasalidaprogramada
  FROM registroasistencia r
  WHERE r.fecha > DATE '2026-07-16'
    AND LOWER(TRIM(r.aprobado::text)) IN ('aprobado', 'true', 'si')
    AND LOWER(r.especialidad) = 'true'
    AND r.horasalida IS NOT NULL AND r.horaingreso IS NOT NULL
    AND r.horaentradaprogramada IS NOT NULL AND r.horasalidaprogramada IS NOT NULL
),
calculo2 AS (
  SELECT c.*, CASE WHEN c.intervalo_exceso_salida >= interval '0' AND c.intervalo_exceso_salida < interval '30 minutes' THEN c.horasalidaprogramada ELSE c.horasalida END AS hora_fin_efectiva
  FROM calculo c
),
calculo3 AS (
  SELECT c2.*, CASE WHEN (c2.hora_fin_efectiva - c2.hora_inicio_efectiva) < interval '0' THEN (c2.hora_fin_efectiva - c2.hora_inicio_efectiva) + interval '24 hours' ELSE (c2.hora_fin_efectiva - c2.hora_inicio_efectiva) END AS intervalo_trabajado
  FROM calculo2 c2
),
resultado AS (
  SELECT c3.id, c3.fecha, c3.hed_actual, c3.hedf_actual, GREATEST(TRUNC((EXTRACT(EPOCH FROM c3.intervalo_trabajado) / 3600.0) - 1.0 - 7.0, 2), 0) AS horas_extras_nuevas
  FROM calculo3 c3
)
SELECT id, fecha, hed_actual, hedf_actual
FROM resultado
WHERE COALESCE(hed_actual, 0) <> CASE WHEN EXTRACT(ISODOW FROM fecha) = 7 THEN 0 ELSE horas_extras_nuevas END
   OR COALESCE(hedf_actual, 0) <> CASE WHEN EXTRACT(ISODOW FROM fecha) = 7 THEN horas_extras_nuevas ELSE 0 END;
