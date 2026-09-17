-- =====================================================================
-- ACUERDO DE VOLÚMENES — actualización por proceso, ago-2026.
--
-- El usuario reenvió la estructura vigente por proyecto, desglosada por
-- proceso (cargue/descargue/distribución/tolva/estibado/salvado), porque
-- las tarjetas del Análisis Financiero (Estado de Resultados) no estaban
-- en línea con el acuerdo real. Verificado contra la tabla ANTES de este
-- script (2026-08-18):
--
--   ID1 Indupan   — coincide exacto, SIN cambios (no incluido aquí).
--   ID2 Avimol    — vigencia jul-dic ya correcta, pero le falta
--                    "Distribución" (300 t cargue + 300 t descargue).
--   ID3 Cedi Funza — Cargue y Descargue bajan de 1.100 a 1.000 t/mes.
--   ID4 Cedi Medellín — se reestructura en filas más granulares (mismo
--                    negocio, reportado por proceso en vez de agrupado).
--
-- Acompaña el cambio de código en lib/analisis-financiero-actions.ts
-- (codigoDe(): nuevos actividad_codigo para que "lo real" del período
-- se siga cruzando correctamente contra estas filas).
-- =====================================================================

-- ---------------------------------------------------------------------
-- ID2 · Avimol — Distribución (vigencia jul-dic-2026).
-- Las 300+300 t son el mismo universo que ya cubre el fijo mensual de
-- "Distribución Turno" en Cargos Fijos (scripts/111_create_cargos_fijos_proyecto.sql:
-- 300×$15.099 + 300×$37.800) — el código las trata como informativas
-- (nunca generan "$ a facturar adicional" por déficit).
-- ---------------------------------------------------------------------
insert into public.acuerdo_volumenes (idempresa, actividad, actividad_codigo, auxiliares, muelle, tarifa, volumen_acordado, fechainicio, fechafin) values
  (2, 'Distribución Cargue',    'distribucion_cargue',    null, null, 15099, 300, '2026-07-01', '2026-12-31'),
  (2, 'Distribución Descargue', 'distribucion_descargue', null, null, 37800, 300, '2026-07-01', '2026-12-31');

-- ---------------------------------------------------------------------
-- ID3 · Cedi Funza — Cargue y Descargue bajan de 1.100 a 1.000 t/mes.
-- Distribución (200 t) sin cambio.
-- ---------------------------------------------------------------------
update public.acuerdo_volumenes
   set volumen_acordado = 1000
 where idempresa = 3
   and actividad_codigo in ('cargue', 'descargue');

-- ---------------------------------------------------------------------
-- ID4 · Cedi Medellín — reestructura por proceso.
-- ---------------------------------------------------------------------

-- "Cargue y Distribución Propio" (480) -> "Cargue Propio" (230) +
-- "Descargue Propio" (230). Misma tarifa que la fila combinada (18.942).
delete from public.acuerdo_volumenes
 where idempresa = 4 and actividad_codigo = 'cargue_distribucion_propio';

insert into public.acuerdo_volumenes (idempresa, actividad, actividad_codigo, auxiliares, muelle, tarifa, volumen_acordado, fechainicio, fechafin) values
  (4, 'Cargue Propio',    'cargue_propio',    4, '1,2', 18942, 230, '2026-01-01', '2026-12-31'),
  (4, 'Descargue Propio', 'descargue_propio', 4, '1,2', 18942, 230, '2026-01-01', '2026-12-31');

-- "Descargue Terceros" (993) -> "Descargue PT Molinos" (508) +
-- "Descargue PT La Insuperable (Avimol)" (485). Suma exacta 993: mismo
-- total, partido por owner del producto. Misma tarifa (19.792).
delete from public.acuerdo_volumenes
 where idempresa = 4 and actividad_codigo = 'descargue_terceros';

insert into public.acuerdo_volumenes (idempresa, actividad, actividad_codigo, auxiliares, muelle, tarifa, volumen_acordado, fechainicio, fechafin) values
  (4, 'Descargue PT Molinos',                  'descargue_pt_molinos', 4, '1,2', 19792, 508, '2026-01-01', '2026-12-31'),
  (4, 'Descargue PT La Insuperable (Avimol)',   'descargue_pt_avimol',  4, '1,2', 19792, 485, '2026-01-01', '2026-12-31');

-- "Cargue Cliente Recoge" -> renombrado "Cargue Terceros" (cosmético,
-- el volumen ya está en 240 t y el código no cambia).
update public.acuerdo_volumenes
   set actividad = 'Cargue Terceros'
 where idempresa = 4 and actividad_codigo = 'cargue_cliente_recoge';

-- ---------------------------------------------------------------------
-- VERIFICACIÓN.
-- ---------------------------------------------------------------------
select idempresa, fechainicio, fechafin, actividad_codigo, actividad, volumen_acordado, tarifa
  from public.acuerdo_volumenes
 where idempresa in (2, 3, 4) and actividad_codigo is not null
 order by idempresa, fechainicio, actividad_codigo;
