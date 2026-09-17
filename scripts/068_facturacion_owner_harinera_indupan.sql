-- =====================================================================
-- Unifica el owner INDUPAN -> "Harinera Indupan" (id_empresa 1 y 6 son el MISMO
-- owner) en la facturación, alineado con el PDF de orden de cargue y la trazabilidad.
-- Se cambian LAS DOS cosas juntas para que el JOIN de tarifa no se rompa:
--   1) tarifasoperacion.empresafactura: 'INDUPAN' -> 'Harinera Indupan'
--   2) vista facturacion: owner_name de id_empresa 1 y 6 -> 'Harinera Indupan'
-- Idempotente. Correr en el SQL Editor de Supabase.
-- =====================================================================

begin;

update public.tarifasoperacion
   set empresafactura = 'Harinera Indupan'
 where trim(empresafactura) = 'INDUPAN';

create or replace view public.facturacion as
 WITH detalle_preparado AS (
         SELECT d.id, d.idorden, d.numeroorden, d.producto, d.cantidad, d.toneladas, d.cliente,
            c.idempresa, c.fechaorden, c.fechacargue, c.transporte, c.tipooperacion,
            c.tiquetebascula, c.placa, c.pesovascula, p.subcategoria,
                CASE
                    WHEN (p.id_empresa = 1) THEN 'Harinera Indupan'::text
                    WHEN (p.id_empresa = 2) THEN 'AVIMOL'::text
                    WHEN (p.id_empresa = 3) THEN 'Molinos del Atlántico'::text
                    WHEN (p.id_empresa = 4) THEN 'Molinos del Atlántico'::text
                    WHEN (p.id_empresa = 6) THEN 'Harinera Indupan'::text
                    ELSE (p.id_empresa)::text
                END AS owner_name
           FROM ((detalleoc d
             JOIN productos p ON ((d.producto = p.nombre)))
             JOIN cabeceraoc c ON ((d.idorden = c.id)))
        )
 SELECT dp.numeroorden, dp.tiquetebascula, dp.placa, dp.fechacargue,
    dp.pesovascula AS pesobascula, dp.cliente, dp.producto, dp.toneladas,
    dp.owner_name AS owner, dp.subcategoria, dp.idempresa, dp.fechaorden, dp.transporte, dp.tipooperacion,
        CASE WHEN (t.tarifa IS NOT NULL) THEN t.tarifa ELSE 'SIN TARIFA EN MAESTRO'::text END AS tarifa,
        CASE WHEN (t.tarifa IS NOT NULL) THEN (((t.tarifa)::numeric * dp.toneladas))::text ELSE '0'::text END AS valor_a_facturar,
    dp.idorden
   FROM (detalle_preparado dp
     LEFT JOIN tarifasoperacion t ON (((t.empresaid = dp.idempresa) AND (TRIM(BOTH FROM upper(t.operacion)) = TRIM(BOTH FROM upper(dp.tipooperacion))) AND (((dp.idempresa = 6) AND (t.empresafactura = dp.owner_name)) OR ((dp.idempresa <> 6) AND ((TRIM(BOTH FROM upper(dp.tipooperacion)) = ANY (ARRAY['TOLVA'::text, 'TOLVA F'::text])) OR ((t.producto = dp.subcategoria) AND ((dp.idempresa = 2) OR (t.empresafactura =
        CASE
            WHEN ((dp.idempresa = ANY (ARRAY[1, 3])) AND (dp.transporte = 'TERCEROS'::text)) THEN dp.owner_name
            ELSE dp.transporte
        END)))))))));

commit;
