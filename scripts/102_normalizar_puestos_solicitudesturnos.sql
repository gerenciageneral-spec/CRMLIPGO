-- =====================================================================
-- NORMALIZAR solicitudesturnos.puesto CONTRA EL MAESTRO DE TARIFAS
--
-- `solicitudesturnos.puesto` se capturó como texto libre durante meses, así
-- que el mismo puesto aparece escrito de muchas formas y no casa con
-- `tarifasfacturacionturnos.puesto`, que sí es estructurado. Sin ese match no
-- se puede valorizar el turno ni la hora extra: se factura en $0.
--
-- REGLA DE SEGURIDAD (aprendida a golpes): aquí NO se usa LIKE ni ILIKE ni
-- ningún patrón. Cada reemplazo es una IGUALDAD EXACTA contra un literal
-- escrito a mano, uno por línea. Un patrón puede tocar filas que nadie
-- revisó; una igualdad exacta no.
--
-- Se corre en dos bloques: el BLOQUE 1 solo LEE y muestra qué va a pasar.
-- Solo cuando ese resultado cuadre se corre el BLOQUE 2, que escribe.
--
-- Estado de origen (leído el 2026-08-01): 139 filas, de las cuales 85 ya
-- estaban correctas. Este script toca 49 y deja 4 sin tocar a propósito.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 — SOLO LECTURA. Correr primero y revisar.
-- =====================================================================

-- 1.a) ¿Qué puestos de las solicitudes NO casan hoy con el maestro?
SELECT
  s.puesto                              AS puesto_escrito,
  COUNT(*)                              AS filas,
  STRING_AGG(DISTINCT s.tipo, ' / ')    AS tipos,
  MIN(s.fecharequerida)                 AS desde,
  MAX(s.fecharequerida)                 AS hasta
FROM public.solicitudesturnos s
WHERE NOT EXISTS (
  SELECT 1 FROM public.tarifasfacturacionturnos t
  WHERE UPPER(TRIM(t.puesto)) = UPPER(TRIM(s.puesto))
)
GROUP BY s.puesto
ORDER BY COUNT(*) DESC, s.puesto;

-- 1.b) Foto del maestro tal como está ahora.
SELECT id, puesto, cobraturno, tarifaturno, tarifaturnofestivo, tarifahoraextra,
       fechainicio, fechafin
FROM public.tarifasfacturacionturnos
ORDER BY puesto;


-- =====================================================================
-- BLOQUE 2 — ESCRITURA. Correr completo, de una sola vez.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- PASO 0 · RESTAURAR EL PUESTO "Salvado" DEL MAESTRO
--
-- El 2026-08-01 15:50 una edición cayó sobre la tabla equivocada y renombró
-- este registro ("Salvado" -> "Cosedor"); a las 16:02 se borró el duplicado.
-- Resultado: "Salvado" desapareció del maestro y sus horas extra se facturan
-- en $0 (123,99 h solo en julio). Los valores de abajo son EXACTAMENTE los
-- que tenía el registro id=6, recuperados de la tabla `auditoria`.
-- ---------------------------------------------------------------------
INSERT INTO public.tarifasfacturacionturnos
  (id, puesto, fechainicio, fechafin, idempresa, cobraturno,
   tarifaturno, tarifaturnofestivo, tarifahoraextra,
   costoturno, costoturnofestivo, costohoraextra)
SELECT
  (SELECT COALESCE(MAX(id), 0) + 1 FROM public.tarifasfacturacionturnos),
  'Salvado', DATE '2026-01-01', DATE '2026-12-31', NULL, 'NO',
  NULL, NULL, 16046,
  NULL, NULL, 9948
WHERE NOT EXISTS (
  SELECT 1 FROM public.tarifasfacturacionturnos WHERE TRIM(puesto) = 'Salvado'
);

-- ---------------------------------------------------------------------
-- PASO 1 · CREAR LOS PUESTOS NUEVOS
--
-- Todos con las MISMAS TARIFAS de Cosedor, como se pidió. La única
-- diferencia es el interruptor `cobraturno` de Estibado PT: ver su nota.
-- ---------------------------------------------------------------------

-- Estibado PT — puesto REAL (431 registros de asistencia en 2026) que nunca
-- estuvo en el maestro; por eso sus 88,82 h extra de julio se facturaban en $0.
--
-- cobraturno = 'NO' A PROPÓSITO: este puesto ya se le cobra a Avimol por
-- PRODUCCIÓN (el tonelaje de tolva de Estibado PT). Con el interruptor en 'SI'
-- se cobraría dos veces el día que alguien radique un turno suyo. La tarifa de
-- turno queda cargada por si algún día cambia la regla; el interruptor es lo
-- que decide. Para activarlo:
--   UPDATE public.tarifasfacturacionturnos SET cobraturno = 'SI' WHERE puesto = 'Estibado PT';
INSERT INTO public.tarifasfacturacionturnos
  (id, puesto, fechainicio, fechafin, idempresa, cobraturno,
   tarifaturno, tarifaturnofestivo, tarifahoraextra,
   costoturno, costoturnofestivo, costohoraextra)
SELECT
  (SELECT COALESCE(MAX(id), 0) + 1 FROM public.tarifasfacturacionturnos),
  'Estibado PT', DATE '2026-01-01', DATE '2026-12-31', 2, 'NO',
  136131, 188045, 16046,
  64930, 115828, 9948
WHERE NOT EXISTS (
  SELECT 1 FROM public.tarifasfacturacionturnos WHERE TRIM(puesto) = 'Estibado PT'
);

-- Operador Empaque
INSERT INTO public.tarifasfacturacionturnos
  (id, puesto, fechainicio, fechafin, idempresa, cobraturno,
   tarifaturno, tarifaturnofestivo, tarifahoraextra,
   costoturno, costoturnofestivo, costohoraextra)
SELECT
  (SELECT COALESCE(MAX(id), 0) + 1 FROM public.tarifasfacturacionturnos),
  'Operador Empaque', DATE '2026-01-01', DATE '2026-12-31', 2, 'SI',
  136131, 188045, 16046,
  64930, 115828, 9948
WHERE NOT EXISTS (
  SELECT 1 FROM public.tarifasfacturacionturnos WHERE TRIM(puesto) = 'Operador Empaque'
);

-- Subir Bultos
INSERT INTO public.tarifasfacturacionturnos
  (id, puesto, fechainicio, fechafin, idempresa, cobraturno,
   tarifaturno, tarifaturnofestivo, tarifahoraextra,
   costoturno, costoturnofestivo, costohoraextra)
SELECT
  (SELECT COALESCE(MAX(id), 0) + 1 FROM public.tarifasfacturacionturnos),
  'Subir Bultos', DATE '2026-01-01', DATE '2026-12-31', 2, 'SI',
  136131, 188045, 16046,
  64930, 115828, 9948
WHERE NOT EXISTS (
  SELECT 1 FROM public.tarifasfacturacionturnos WHERE TRIM(puesto) = 'Subir Bultos'
);

-- Si la columna `id` tiene secuencia, se resincroniza: arriba se insertó con
-- id explícito y sin esto el próximo INSERT automático chocaría.
SELECT setval(
         pg_get_serial_sequence('public.tarifasfacturacionturnos', 'id'),
         (SELECT MAX(id) FROM public.tarifasfacturacionturnos)
       )
WHERE pg_get_serial_sequence('public.tarifasfacturacionturnos', 'id') IS NOT NULL;


-- ---------------------------------------------------------------------
-- PASO 2 · REEMPLAZOS EN solicitudesturnos
--
-- Igualdad exacta, un literal por línea. 49 filas en total.
-- ---------------------------------------------------------------------

-- → Arrume Negro (10 filas)
UPDATE public.solicitudesturnos SET puesto = 'Arrume Negro'
 WHERE puesto IN (
   'Arrume negro',                    -- 4 · solo difiere en mayúsculas
   'UNA PERSONA ARRUME NEGRO 2 H',    -- 2
   'ARRUME NEGRO-FALTA DE ESPACIO',   -- 1
   'ARRUME NEGRO 5 OPERADORES',       -- 1
   'OPERADORES ARRUME NEGRO',         -- 1
   'Operadores arrume negro'          -- 1
 );

-- → Cosedor (1 fila)
UPDATE public.solicitudesturnos SET puesto = 'Cosedor'
 WHERE puesto IN (
   'OPERADOR COSEDOR'                 -- 1
 );

-- → Operador PT (Carrusel) (6 filas)
UPDATE public.solicitudesturnos SET puesto = 'Operador PT (Carrusel)'
 WHERE puesto IN (
   'OPERADORES CARRUSEL',             -- 3
   'Operador carrusel',               -- 2
   'OPERADOR CARRUSEL'                -- 1
 );

-- → Estibado PT (16 filas)
-- Los números 1/2/3 identificaban a la persona, no a puestos distintos.
UPDATE public.solicitudesturnos SET puesto = 'Estibado PT'
 WHERE puesto IN (
   'PT ESTIBADO',
   'ESTIBADOR 1 PT', 'ESTIBADOR 2 PT', 'ESTIBADOR 3 PT',
   'ESTIBADOR PT 1', 'ESTIBADOR PT 2', 'ESTIBADOR PT 3',
   'PERSONAL PT 1',  'PERSONAL PT 2',  'PERSONAL PT 3',
   'OPERADOR PT1',   'OPERADOR PT2',   'OPERADOR PT3',
   'Operador pt 1',  'Operador pt 2',  'Operador pt 3'
 );

-- → Montacargas de producción (7 filas)
UPDATE public.solicitudesturnos SET puesto = 'Montacargas de producción'
 WHERE puesto IN (
   'OPERADOR YALISTA'                 -- 7
 );

-- → Operador Empaque (5 filas)
UPDATE public.solicitudesturnos SET puesto = 'Operador Empaque'
 WHERE puesto IN (
   'OPERADORES EMPAQUE',              -- 4
   'OPERARIOS EMPAQUE'                -- 1
 );

-- → Subir Bultos (4 filas)
UPDATE public.solicitudesturnos SET puesto = 'Subir Bultos'
 WHERE puesto IN (
   'OPERADORES PARA SUBIR BULTOS',    -- 2
   'OPETADORES PARA SUBIR BULTOS',    -- 1 · errata de "OPERADORES"
   'OPERARIOS SUBIDA DE BULTOS'       -- 1
 );

-- NO SE TOCAN (4 filas), porque no hay forma de decidirlas sin inventar:
--   'OPERADOR MONTACARGAS'  (2) → hay dos montacargas: "de producción" (en el
--                                 maestro) y "de cargue" (152 registros de
--                                 asistencia, sin fila en el maestro).
--   'Operadores auxiliares' (1) → no corresponde a ningún puesto conocido.
--   'DESARME DE ARROBAS'    (1) → es de Indupan (id 1) y está RECHAZADA.
-- Quedan reportadas como "puesto no reconocido" en la conciliación hasta que
-- se decidan. Ninguna se factura, así que no hay riesgo de cobro indebido.


-- ---------------------------------------------------------------------
-- PASO 3 · VERIFICACIÓN. Revisar ANTES de confirmar.
-- ---------------------------------------------------------------------

-- 3.a) Lo que quedó sin casar. Deben salir SOLO las 4 filas de arriba.
SELECT s.puesto, COUNT(*) AS filas
FROM public.solicitudesturnos s
WHERE NOT EXISTS (
  SELECT 1 FROM public.tarifasfacturacionturnos t
  WHERE UPPER(TRIM(t.puesto)) = UPPER(TRIM(s.puesto))
)
GROUP BY s.puesto
ORDER BY COUNT(*) DESC;

-- 3.b) El total no puede haber cambiado: deben seguir siendo 139 filas.
SELECT COUNT(*) AS total_solicitudes FROM public.solicitudesturnos;

-- 3.c) El maestro debe quedar con 14 puestos, sin ninguno repetido.
SELECT puesto, COUNT(*) AS veces
FROM public.tarifasfacturacionturnos
GROUP BY puesto
HAVING COUNT(*) > 1;

COMMIT;
-- Si algo no cuadra: ROLLBACK; en vez de COMMIT.


-- =====================================================================
-- PENDIENTE, aparte de este script
--
-- `Montacargas de producción` tiene cobraturno = 'NO', así que los turnos de
-- YALISTA que acaban de mapearse ahí NO se van a cobrar (sus horas extra sí,
-- a $17.863/h). Si la intención es cobrarlos —el 2026-08-01 se le cargó
-- tarifaturno = 136131, que apunta en esa dirección— falta el interruptor:
--
--   UPDATE public.tarifasfacturacionturnos
--      SET cobraturno = 'SI'
--    WHERE puesto = 'Montacargas de producción';
--
-- Y siguen sin fila en el maestro dos puestos que sí se trabajan, así que sus
-- horas extra se facturan en $0:
--   · Montacargas de cargue — 152 registros de asistencia · 27,11 h en julio
--   · Reempaque             —  16 registros de asistencia ·  3,44 h en julio
-- =====================================================================
