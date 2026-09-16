-- ============================================================================
-- DIAGNÓSTICO — por qué una fila pasó de 0.66 a 1.26 (o cualquier salto que
-- no cuadre con "+0.33" al bajar la jornada de 7.3333h a 7h).
-- ----------------------------------------------------------------------------
-- Muestra, por fila, los 4 tiempos crudos + los valores intermedios del
-- cálculo (hora_inicio_efectiva, hora_fin_efectiva, exceso de salida en
-- minutos, horas totales trabajadas) y el hed/hedf RECALCULADO con AMBAS
-- jornadas (7.3333 la vieja y 7.0 la nueva), para comparar contra lo que
-- tienes hoy en la tabla (hed_actual/hedf_actual, ya recalculado).
--
-- AJUSTA el filtro de abajo (WHERE) para apuntar a la fila o persona
-- puntual donde viste el salto 0.66 -> 1.26 (por id, o por nombre+fecha).
-- ============================================================================

WITH base AS (
  SELECT
    r.id,
    r.fecha,
    r.nombre,
    r.identificacion,
    r.horaentradaprogramada,
    r.horaingreso,
    r.horasalidaprogramada,
    r.horasalida,
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
    ) AS intervalo_exceso_salida
  FROM registroasistencia r
  WHERE r.fecha > DATE '2026-07-16'
    AND LOWER(r.especialidad) = 'true'
    -- <<< AJUSTA AQUÍ: por id puntual, o por nombre + fecha >>>
    -- AND r.id = 12345
    -- AND r.nombre ILIKE '%NOMBRE DE LA PERSONA%' AND r.fecha = DATE '2026-07-20'
),
calc AS (
  SELECT
    b.*,
    CASE
      WHEN b.intervalo_exceso_salida >= interval '0' AND b.intervalo_exceso_salida < interval '30 minutes'
      THEN b.horasalidaprogramada
      ELSE b.horasalida
    END AS hora_fin_efectiva
  FROM base b
),
calc2 AS (
  SELECT
    c.*,
    CASE
      WHEN (c.hora_fin_efectiva - c.hora_inicio_efectiva) < interval '0'
      THEN (c.hora_fin_efectiva - c.hora_inicio_efectiva) + interval '24 hours'
      ELSE (c.hora_fin_efectiva - c.hora_inicio_efectiva)
    END AS intervalo_trabajado
  FROM calc c
)
SELECT
  id,
  fecha,
  nombre,
  identificacion,
  horaentradaprogramada,
  horaingreso,
  horasalidaprogramada,
  horasalida,
  hora_inicio_efectiva,
  hora_fin_efectiva,
  ROUND(EXTRACT(EPOCH FROM intervalo_exceso_salida) / 60.0, 1) AS exceso_salida_minutos,
  ROUND((EXTRACT(EPOCH FROM intervalo_trabajado) / 3600.0)::numeric, 4) AS horas_totales_trabajadas,
  hed_actual,
  hedf_actual,
  -- Qué habría dado con la jornada VIEJA (7.3333h) usando la regla COMPLETA de hoy:
  GREATEST(TRUNC((EXTRACT(EPOCH FROM intervalo_trabajado) / 3600.0) - 1.0 - 7.3333, 2), 0) AS extra_con_jornada_vieja_7_3333,
  -- Qué da con la jornada NUEVA (7h) usando la regla COMPLETA de hoy (esto es
  -- lo que debería coincidir con hed_actual/hedf_actual si el script corrió bien):
  GREATEST(TRUNC((EXTRACT(EPOCH FROM intervalo_trabajado) / 3600.0) - 1.0 - 7.0, 2), 0) AS extra_con_jornada_nueva_7
FROM calc2
ORDER BY fecha, nombre;
