-- ============================================================================
-- DIAGNÓSTICO — ¿se está liquidando a personas fuera de su vínculo laboral?
-- ----------------------------------------------------------------------------
-- Cruza pagonomina (por nombre) → headcount (identificacion) → colaboradores_th
-- (numero_documento, que tiene fecha_inicio_contrato / fecha_fin_contrato).
-- "Fuera de vínculo" = la persona SÍ tiene contratos registrados, pero NINGUNO
-- cubre esa fecha (antes de iniciar o después de terminar). Esos días NO
-- deberían pagarse. Ajusta el rango de fechas.
-- ============================================================================

-- 1) RESUMEN: cuánto y cuántos días se pagan fuera del vínculo en el mes.
SELECT count(*)                       AS dias_fuera_de_vinculo,
       count(DISTINCT p.persona)      AS personas,
       sum(p.total_liquidado_dia)     AS total_pagado_indebido
FROM pagonomina p
WHERE p.fecha BETWEEN '2026-06-01' AND '2026-06-30'
  AND p.total_liquidado_dia > 0
  AND EXISTS (  -- la persona tiene contrato(s) en colaboradores_th
        SELECT 1 FROM headcount h
          JOIN colaboradores_th c ON (TRIM(c.numero_documento) = TRIM(h.identificacion))
        WHERE TRIM(h.nombre) = TRIM(p.persona))
  AND NOT EXISTS (  -- pero NINGÚN contrato cubre esa fecha
        SELECT 1 FROM headcount h
          JOIN colaboradores_th c ON (TRIM(c.numero_documento) = TRIM(h.identificacion))
        WHERE TRIM(h.nombre) = TRIM(p.persona)
          AND p.fecha >= c.fecha_inicio_contrato
          AND (c.fecha_fin_contrato IS NULL OR p.fecha <= c.fecha_fin_contrato));

-- 2) DETALLE: qué persona, qué día, cuánto, y su ventana de contrato.
SELECT p.fecha, p.persona, p.total_liquidado_dia,
       min(c.fecha_inicio_contrato) AS contrato_desde,
       max(c.fecha_fin_contrato)    AS contrato_hasta,
       string_agg(DISTINCT coalesce(c.estado,'(null)'), ', ') AS estados
FROM pagonomina p
  JOIN headcount h ON (TRIM(h.nombre) = TRIM(p.persona))
  JOIN colaboradores_th c ON (TRIM(c.numero_documento) = TRIM(h.identificacion))
WHERE p.fecha BETWEEN '2026-06-01' AND '2026-06-30'
  AND p.total_liquidado_dia > 0
  AND NOT EXISTS (
        SELECT 1 FROM headcount h2
          JOIN colaboradores_th c2 ON (TRIM(c2.numero_documento) = TRIM(h2.identificacion))
        WHERE TRIM(h2.nombre) = TRIM(p.persona)
          AND p.fecha >= c2.fecha_inicio_contrato
          AND (c2.fecha_fin_contrato IS NULL OR p.fecha <= c2.fecha_fin_contrato))
GROUP BY p.fecha, p.persona, p.total_liquidado_dia
ORDER BY p.fecha DESC, p.persona;

-- 3) CONTEXTO: personas de pagonomina que NO se pudieron vincular a un contrato
--    (por nombre) — a estas el filtro NUNCA las tocaría (falla hacia pagar).
--    Útil para medir cuántos nombres no cuadran headcount↔colaboradores_th.
SELECT DISTINCT p.persona
FROM pagonomina p
WHERE p.fecha BETWEEN '2026-06-01' AND '2026-06-30'
  AND p.total_liquidado_dia > 0
  AND NOT EXISTS (
        SELECT 1 FROM headcount h
          JOIN colaboradores_th c ON (TRIM(c.numero_documento) = TRIM(h.identificacion))
        WHERE TRIM(h.nombre) = TRIM(p.persona))
ORDER BY p.persona;
