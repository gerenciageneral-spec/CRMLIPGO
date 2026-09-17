-- =====================================================================
-- Actualiza la vista public.facturacion para soportar productos que se
-- cobran POR UNIDAD (hoy: "Huevos" en ID2/Avimol, $2,95/unidad — ver
-- scripts/148_producto_huevos_avimol.sql y lib/facturacion-billed-party.ts).
--
-- Qué cambia respecto a la definición actual (scripts/050_vistas_financieras.sql):
--   1) Se agrega `cantidad` a la salida (ya existía en el CTE, no se
--      exponía).
--   2) `valor_a_facturar` usa CANTIDAD en vez de TONELADAS cuando la
--      subcategoría del producto es "Huevos" (comparación insensible a
--      mayúsculas/espacios, igual que hace esProductoPorUnidad() en
--      código). Todo lo demás queda exactamente igual: mismo join de
--      tarifa, mismo owner, misma columna `tarifa`.
--
-- Por qué hace falta: el motor de Cuadro de Control / Prefactura / Valor
-- Neto Orden (lib/facturacion-control-actions.ts) YA calcula esto bien en
-- código — no depende de esta vista para el monto final. Pero el Estado
-- de Resultados (components/estado-resultados/use-ingresos.ts) SÍ lee
-- `valor_a_facturar` directo de esta vista, así que sin este cambio el
-- ingreso de Huevos ahí sigue saliendo mal (tarifa × toneladas en vez de
-- tarifa × cantidad).
--
-- Ejecutar en el editor SQL de Supabase (no es DML, requiere permisos de
-- owner sobre la vista).
-- =====================================================================

create or replace view public.facturacion as
 WITH detalle_preparado AS (
         SELECT d.id,
            d.idorden,
            d.numeroorden,
            d.producto,
            d.cantidad,
            d.toneladas,
            d.cliente,
            c.idempresa,
            c.fechaorden,
            c.fechacargue,
            c.transporte,
            c.tipooperacion,
            c.tiquetebascula,
            c.placa,
            c.pesovascula,
            p.subcategoria,
                CASE
                    WHEN (p.id_empresa = 1) THEN 'INDUPAN'::text
                    WHEN (p.id_empresa = 2) THEN 'AVIMOL'::text
                    WHEN (p.id_empresa = 3) THEN 'Molinos del Atlántico'::text
                    WHEN (p.id_empresa = 4) THEN 'Molinos del Atlántico'::text
                    WHEN (p.id_empresa = 6) THEN 'INDUPAN'::text
                    ELSE (p.id_empresa)::text
                END AS owner_name
           FROM ((detalleoc d
             JOIN productos p ON ((d.producto = p.nombre)))
             JOIN cabeceraoc c ON ((d.idorden = c.id)))
        )
 SELECT dp.numeroorden,
    dp.tiquetebascula,
    dp.placa,
    dp.fechacargue,
    dp.pesovascula AS pesobascula,
    dp.cliente,
    dp.producto,
    dp.toneladas,
    dp.owner_name AS owner,
    dp.subcategoria,
    dp.idempresa,
    dp.fechaorden,
    dp.transporte,
    dp.tipooperacion,
        CASE
            WHEN (t.tarifa IS NOT NULL) THEN t.tarifa
            ELSE 'SIN TARIFA EN MAESTRO'::text
        END AS tarifa,
        CASE
            WHEN (t.tarifa IS NOT NULL) THEN
                ((t.tarifa)::numeric *
                    CASE
                        WHEN (upper(TRIM(BOTH FROM dp.subcategoria)) = 'HUEVOS') THEN dp.cantidad
                        ELSE dp.toneladas
                    END
                )::text
            ELSE '0'::text
        END AS valor_a_facturar,
    dp.idorden,
    -- Nueva columna, agregada AL FINAL a propósito: Postgres no permite
    -- insertar una columna en medio del SELECT de una vista existente con
    -- CREATE OR REPLACE VIEW (desplaza el nombre de las columnas que le
    -- siguen y falla con "cannot change name of view column").
    dp.cantidad
   FROM (detalle_preparado dp
     LEFT JOIN tarifasoperacion t ON (((t.empresaid = dp.idempresa) AND (TRIM(BOTH FROM upper(t.operacion)) = TRIM(BOTH FROM upper(dp.tipooperacion))) AND (((dp.idempresa = 6) AND (t.empresafactura = dp.owner_name)) OR ((dp.idempresa <> 6) AND ((TRIM(BOTH FROM upper(dp.tipooperacion)) = ANY (ARRAY['TOLVA'::text, 'TOLVA F'::text])) OR ((t.producto = dp.subcategoria) AND ((dp.idempresa = 2) OR (t.empresafactura =
        CASE
            WHEN ((dp.idempresa = ANY (ARRAY[1, 3])) AND (dp.transporte = 'TERCEROS'::text)) THEN dp.owner_name
            ELSE dp.transporte
        END)))))))));

-- VERIFICACIÓN: una línea de Huevos debe mostrar valor_a_facturar = cantidad × 2.95
-- (y ya no tarifa × toneladas, que daría un número mucho menor con peso_unitkg=1).
select numeroorden, producto, subcategoria, cantidad, toneladas, tarifa, valor_a_facturar
  from public.facturacion
 where idempresa = 2 and subcategoria = 'Huevos'
 order by numeroorden desc
 limit 20;
