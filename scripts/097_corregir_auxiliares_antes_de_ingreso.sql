-- ============================================================================
-- CORRECCIÓN — auxiliares asignados a vehículos ANTES de su fecha de ingreso
-- ----------------------------------------------------------------------------
-- Caso: ambos ingresaron el 27-jul-2026 pero aparecen en `cabeceraoc.auxiliares`
-- de órdenes anteriores (20, 23, 24 de julio), y por eso `pagonomina` les
-- liquidó destajo:
--   · OTONIEL DE JESUS MURILLO OSPINA  (ID 4)
--   · ANDRES FELIPE ESCORCIA UCROS     (ID 2)
--
-- POR QUÉ SE REEMPLAZA EL NOMBRE EN VEZ DE BORRARLO:
--   pagonomina reparte el tonelaje así:  peso_base_calculo / cantidad_auxiliares
--   Si se borra el nombre, el DIVISOR baja y a los demás auxiliares del mismo
--   vehículo les SUBE el tonelaje (y el pago). Reemplazándolo por "Aux. Prueba
--   10" el divisor se mantiene y esa porción simplemente no se paga: pagonomina
--   excluye a cualquiera cuyo nombre contenga "prueba"
--   (WHERE pc.persona !~* 'prueba', ver 053_pagonomina_reemplazo.sql).
--
-- COINCIDENCIA: por nombre EXACTO, normalizando mayúsculas, espacios y TILDES
-- (translate ÁÉÍÓÚÜÑ -> AEIOUUN), por si en la base están acentuados. Cada
-- nombre está atado a su idempresa para no tocar a un homónimo de otro proyecto.
--
-- ###########################################################################
-- POR QUÉ NOMBRE EXACTO Y NUNCA UN PATRÓN — INCIDENTE REAL DEL 31-JUL-2026
-- Una versión previa de este script buscaba por patrón ('%ESCORCIA%' para la
-- ID 2). Ese apellido NO es único en Avimol, así que el reemplazo alcanzó a
-- TRES personas en vez de una:
--     ANDRES FELIPE ESCORCIA UCROS            9 órdenes  <- el objetivo
--     ANDERSON MILLER DE LA ROSA ESCORCIA   107 órdenes  <- colateral
--     LUIS ANTONIO ESCORCIA ANTONIO GUILLEN  64 órdenes  <- colateral
-- De 178 órdenes tocadas, 171 fueron daño colateral. A Anderson le desapareció
-- todo el tonelaje del 7 al 25 de julio (114,8 t) porque su nombre quedó como
-- "Aux. Prueba 10", y pagonomina excluye cualquier nombre con "prueba".
-- Se revirtió desde la tabla `auditoria`, que guardaba el valor anterior de
-- cada orden: 169 órdenes restauradas, respaldo en
-- scripts/BACKUP_pre_restauracion.json.
--
-- REGLA: este script NO debe volver a usar LIKE/ILIKE sobre el nombre. Y el
-- PASO 0 no es opcional: hay que verificar que cada objetivo devuelva UNA
-- sola persona antes de escribir nada.
-- ###########################################################################
--
-- OJO — esto corrige el DESTAJO (cabeceraoc). Si además tienen filas en
-- `registroasistencia` antes del ingreso, cobran la BASE del día por otra vía;
-- el PASO 0(b) lo diagnostica.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PASO 0 (solo lectura) — DIAGNÓSTICO.
-- ----------------------------------------------------------------------------

-- (a) Órdenes afectadas (anteriores al ingreso)
WITH objetivo(idempresa, nombre_exacto, fecha_ingreso) AS (
  VALUES (4, 'OTONIEL DE JESUS MURILLO OSPINA', DATE '2026-07-27'),
         (2, 'ANDRES FELIPE ESCORCIA UCROS',    DATE '2026-07-27')
)
SELECT c.idempresa,
       c.id,
       c.ordendecargue,
       c.fechacargue,
       c.placa,
       c.auxiliares,
       array_length(string_to_array(c.auxiliares, ','), 1) AS n_auxiliares,
       TRIM(t.parte) AS nombre_encontrado
  FROM cabeceraoc c
  JOIN objetivo o ON o.idempresa = c.idempresa
  CROSS JOIN LATERAL regexp_split_to_table(c.auxiliares, ',') AS t(parte)
 WHERE c.fechacargue < o.fecha_ingreso
   AND translate(UPPER(TRIM(t.parte)), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = o.nombre_exacto
 ORDER BY c.idempresa, c.fechacargue, c.id;

-- (b) ¿Tienen ASISTENCIA antes del ingreso? Eso paga la BASE del día por otra
--     vía y NO lo corrige este script. Si devuelve filas, tratar aparte.
WITH objetivo(idempresa, nombre_exacto, fecha_ingreso) AS (
  VALUES (4, 'OTONIEL DE JESUS MURILLO OSPINA', DATE '2026-07-27'),
         (2, 'ANDRES FELIPE ESCORCIA UCROS',    DATE '2026-07-27')
)
SELECT r.idempresa, r.fecha, r.nombre, r.identificacion, r.puesto, r.asistencia
  FROM registroasistencia r
  JOIN objetivo o ON o.idempresa = r.idempresa
 WHERE r.fecha < o.fecha_ingreso
   AND translate(UPPER(TRIM(r.nombre)), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = o.nombre_exacto
 ORDER BY r.idempresa, r.fecha;

-- ----------------------------------------------------------------------------
-- PASO 1 — VISTA PREVIA del reemplazo. No modifica nada.
-- Confirmar que el número de nombres separados por coma NO cambia.
-- ----------------------------------------------------------------------------
WITH objetivo(idempresa, nombre_exacto, fecha_ingreso) AS (
  VALUES (4, 'OTONIEL DE JESUS MURILLO OSPINA', DATE '2026-07-27'),
         (2, 'ANDRES FELIPE ESCORCIA UCROS',    DATE '2026-07-27')
)
SELECT c.idempresa,
       c.id,
       c.ordendecargue,
       c.fechacargue,
       c.auxiliares AS auxiliares_actual,
       (SELECT string_agg(
                 CASE WHEN translate(UPPER(TRIM(t.parte)), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = o.nombre_exacto
                      THEN 'Aux. Prueba 10'
                      ELSE TRIM(t.parte) END,
                 ',' ORDER BY t.ord)
          FROM regexp_split_to_table(c.auxiliares, ',') WITH ORDINALITY AS t(parte, ord)
       ) AS auxiliares_nuevo,
       array_length(string_to_array(c.auxiliares, ','), 1) AS n_auxiliares_antes
  FROM cabeceraoc c
  JOIN objetivo o ON o.idempresa = c.idempresa
 WHERE c.fechacargue < o.fecha_ingreso
   AND EXISTS (
         SELECT 1
           FROM regexp_split_to_table(c.auxiliares, ',') AS p(parte)
          WHERE translate(UPPER(TRIM(p.parte)), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = o.nombre_exacto
       )
 ORDER BY c.idempresa, c.fechacargue, c.id;

-- ----------------------------------------------------------------------------
-- PASO 2 — UPDATE real. Solo si el PASO 1 se ve correcto.
-- Revisa el "UPDATE N" antes de confirmar el COMMIT.
-- ----------------------------------------------------------------------------
BEGIN;

WITH objetivo(idempresa, nombre_exacto, fecha_ingreso) AS (
  VALUES (4, 'OTONIEL DE JESUS MURILLO OSPINA', DATE '2026-07-27'),
         (2, 'ANDRES FELIPE ESCORCIA UCROS',    DATE '2026-07-27')
),
recalculado AS (
  SELECT c.id,
         (SELECT string_agg(
                   CASE WHEN translate(UPPER(TRIM(t.parte)), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = o.nombre_exacto
                        THEN 'Aux. Prueba 10'
                        ELSE TRIM(t.parte) END,
                   ',' ORDER BY t.ord)
            FROM regexp_split_to_table(c.auxiliares, ',') WITH ORDINALITY AS t(parte, ord)
         ) AS nuevo
    FROM cabeceraoc c
    JOIN objetivo o ON o.idempresa = c.idempresa
   WHERE c.fechacargue < o.fecha_ingreso
     AND EXISTS (
           SELECT 1
             FROM regexp_split_to_table(c.auxiliares, ',') AS p(parte)
            WHERE translate(UPPER(TRIM(p.parte)), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = o.nombre_exacto
         )
)
UPDATE cabeceraoc c
   SET auxiliares = r.nuevo
  FROM recalculado r
 WHERE c.id = r.id;

-- Si el número de filas no coincide con el PASO 1 -> ROLLBACK; en vez de COMMIT.
COMMIT;

-- ----------------------------------------------------------------------------
-- PASO 2b — ASISTENCIA. Mismo criterio: se RENOMBRA (no se borra la fila) para
-- que el head count del día no cambie. Al llamarse "Aux. Prueba 10", pagonomina
-- deja de liquidarle la BASE del día (filtro persona !~* 'prueba').
--
-- Se cambia SOLO `nombre`. La `identificacion` se deja intacta a propósito: es
-- el rastro de qué fila era, y permite revertir. Efecto lateral conocido: en
-- Tabla Asistencia esa fila ya no cruzará con su persona de Head Count (el
-- match es identificación + nombre), así que ese día aparecerá como no
-- procesado — inocuo para una fecha ya cerrada.
-- ----------------------------------------------------------------------------
BEGIN;

WITH objetivo(idempresa, nombre_exacto, fecha_ingreso) AS (
  VALUES (4, 'OTONIEL DE JESUS MURILLO OSPINA', DATE '2026-07-27'),
         (2, 'ANDRES FELIPE ESCORCIA UCROS',    DATE '2026-07-27')
)
UPDATE registroasistencia r
   SET nombre = 'Aux. Prueba 10'
  FROM objetivo o
 WHERE o.idempresa = r.idempresa
   AND r.fecha < o.fecha_ingreso
   AND translate(UPPER(TRIM(r.nombre)), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = o.nombre_exacto;

COMMIT;

-- ----------------------------------------------------------------------------
-- PASO 3 (solo lectura) — VERIFICACIÓN. Debe devolver 0 filas.
-- ----------------------------------------------------------------------------
WITH objetivo(idempresa, nombre_exacto, fecha_ingreso) AS (
  VALUES (4, 'OTONIEL DE JESUS MURILLO OSPINA', DATE '2026-07-27'),
         (2, 'ANDRES FELIPE ESCORCIA UCROS',    DATE '2026-07-27')
)
SELECT p.fecha, p.persona, p.idempresa, p.toneladas, p.total_liquidado_dia
  FROM pagonomina p
  JOIN objetivo o ON o.idempresa = p.idempresa
 WHERE p.fecha < o.fecha_ingreso
   AND translate(UPPER(TRIM(p.persona)), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = o.nombre_exacto
 ORDER BY p.fecha;
