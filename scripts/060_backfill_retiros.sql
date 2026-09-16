-- ============================================================================
-- BACKFILL de retiros — aplica la baja a quienes YA tienen la novedad "Retiro"
-- marcada en registroasistencia (histórico), para que salgan del archivo plano.
-- Replica lo que hoy hace automáticamente lib/retiro-actions.ts al marcar la
-- novedad, pero de forma retroactiva. Idempotente (se puede correr varias veces).
--
-- Condición de retiro = existe al menos una fila en registroasistencia con
-- asistencia que contiene "retiro". La fecha de retiro = la PRIMERA (MIN) de esas
-- filas (día efectivo de la baja).
--
-- REQUISITOS (correr antes):
--   1) scripts/057_add_fecha_retiro_to_headcount.sql  (columna fecha_retiro)
--   2) scripts/059_archivoplano_reemplazo.sql         (el plano excluye Inactivos)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PASO 0 — PREVIEW (solo lectura): ¿a quién se va a dar de baja y con qué fecha?
-- Corre SOLO este SELECT primero y revisa la lista antes de aplicar los UPDATE.
-- ----------------------------------------------------------------------------
WITH retiros AS (
  SELECT TRIM(BOTH FROM ra.identificacion) AS identificacion,
         MIN(ra.fecha)  AS fecha_retiro,
         MAX(ra.nombre) AS nombre
  FROM registroasistencia ra
  WHERE lower(COALESCE(ra.asistencia, '')) LIKE '%retiro%'
    AND ra.identificacion IS NOT NULL
    AND TRIM(BOTH FROM ra.identificacion) <> ''
  GROUP BY TRIM(BOTH FROM ra.identificacion)
)
SELECT r.identificacion,
       r.nombre,
       r.fecha_retiro,
       h.estado           AS estado_actual_headcount,
       h.fecha_retiro     AS fecha_retiro_actual,
       c.estado           AS estado_actual_colaborador,
       c.fecha_fin_contrato
FROM retiros r
LEFT JOIN headcount h        ON (TRIM(BOTH FROM h.identificacion) = r.identificacion)
LEFT JOIN colaboradores_th c ON (TRIM(BOTH FROM c.numero_documento) = r.identificacion)
ORDER BY r.fecha_retiro DESC;

-- ----------------------------------------------------------------------------
-- PASO 1 — APLICAR: headcount → Inactivo + fecha_retiro + fuera del plano.
-- (Descomenta y corre cuando el PREVIEW te cuadre.)
-- ----------------------------------------------------------------------------
-- WITH retiros AS (
--   SELECT TRIM(BOTH FROM ra.identificacion) AS identificacion,
--          MIN(ra.fecha) AS fecha_retiro
--   FROM registroasistencia ra
--   WHERE lower(COALESCE(ra.asistencia, '')) LIKE '%retiro%'
--     AND ra.identificacion IS NOT NULL AND TRIM(BOTH FROM ra.identificacion) <> ''
--   GROUP BY TRIM(BOTH FROM ra.identificacion)
-- )
-- UPDATE headcount h
--    SET estado       = 'Inactivo',
--        fecha_retiro = r.fecha_retiro,
--        aplicaplano  = false
--   FROM retiros r
--  WHERE TRIM(BOTH FROM h.identificacion) = r.identificacion;

-- ----------------------------------------------------------------------------
-- PASO 2 — APLICAR: colaboradores_th → inactivo + fecha_fin_contrato.
-- Mantiene consistencia (evita que la sync revierta el estado) y alimenta el
-- filtro de vínculo de pagonomina. (Descomenta y corre junto con el PASO 1.)
-- ----------------------------------------------------------------------------
-- WITH retiros AS (
--   SELECT TRIM(BOTH FROM ra.identificacion) AS identificacion,
--          MIN(ra.fecha) AS fecha_retiro
--   FROM registroasistencia ra
--   WHERE lower(COALESCE(ra.asistencia, '')) LIKE '%retiro%'
--     AND ra.identificacion IS NOT NULL AND TRIM(BOTH FROM ra.identificacion) <> ''
--   GROUP BY TRIM(BOTH FROM ra.identificacion)
-- )
-- UPDATE colaboradores_th c
--    SET estado             = 'inactivo',
--        fecha_fin_contrato = r.fecha_retiro
--   FROM retiros r
--  WHERE TRIM(BOTH FROM c.numero_documento) = r.identificacion;

-- ----------------------------------------------------------------------------
-- PASO 3 — VERIFICAR: cuántos quedaron Inactivos y si alguno sigue en el plano.
-- ----------------------------------------------------------------------------
-- SELECT count(*) AS inactivos_con_fecha_retiro
--   FROM headcount WHERE lower(coalesce(estado,'')) = 'inactivo' AND fecha_retiro IS NOT NULL;
