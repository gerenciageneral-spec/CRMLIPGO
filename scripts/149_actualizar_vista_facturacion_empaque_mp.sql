-- =====================================================================
-- Actualiza la vista public.facturacion para que "Materia Prima"
-- (producto "Empaque MP", ID2/Avimol, $1.355/paquete) se cobre por
-- CANTIDAD igual que "Huevos" -- ver lib/facturacion-billed-party.ts
-- (esProductoPorUnidad) y memoria lipgo-empaque-mp-nuevo-producto.
--
-- Qué cambia respecto a la definición actual (confirmada en vivo,
-- coincide con scripts/050_vistas_financieras.sql líneas 661-728): el único
-- cambio real es agregar 'MATERIA PRIMA' al CASE de `valor_a_facturar`
-- (antes solo comparaba contra 'HUEVOS'). Todo lo demás es una copia
-- exacta de la vista actual -- no se toca ningún otro criterio (owner,
-- join de tarifa, etc.).
--
-- Por qué hace falta: el motor de Cuadro de Control / Prefactura / Valor
-- Neto Orden (lib/facturacion-control-actions.ts) YA calcula esto bien en
-- código -- no depende de esta vista para el monto final. Pero el Estado
-- de Resultados (components/estado-resultados/use-ingresos.ts) SÍ lee
-- `valor_a_facturar` directo de esta vista, así que sin este cambio el
-- ingreso de Empaque MP ahí sale mal (tarifa × toneladas en vez de
-- tarifa × cantidad de paquetes).
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
        -- Productos por UNIDAD (ver esProductoPorUnidad() en
        -- lib/facturacion-billed-party.ts) se cobran por CANTIDAD, no por
        -- peso: hoy "Huevos" y "Materia Prima" (Empaque MP).
        CASE
            WHEN (t.tarifa IS NOT NULL) THEN
                ((t.tarifa)::numeric *
                    CASE
                        WHEN (upper(TRIM(BOTH FROM dp.subcategoria)) = ANY (ARRAY['HUEVOS'::text, 'MATERIA PRIMA'::text])) THEN dp.cantidad
                        ELSE dp.toneladas
                    END
                )::text
            ELSE '0'::text
        END AS valor_a_facturar,
    dp.idorden,
    dp.cantidad
   FROM (detalle_preparado dp
     LEFT JOIN tarifasoperacion t ON (((t.empresaid = dp.idempresa) AND (TRIM(BOTH FROM upper(t.operacion)) = TRIM(BOTH FROM upper(dp.tipooperacion))) AND (((dp.idempresa = 6) AND (t.empresafactura = dp.owner_name)) OR ((dp.idempresa <> 6) AND ((TRIM(BOTH FROM upper(dp.tipooperacion)) = ANY (ARRAY['TOLVA'::text, 'TOLVA F'::text])) OR ((t.producto = dp.subcategoria) AND ((dp.idempresa = 2) OR (t.empresafactura =
        CASE
            WHEN ((dp.idempresa = ANY (ARRAY[1, 3])) AND (dp.transporte = 'TERCEROS'::text)) THEN dp.owner_name
            ELSE dp.transporte
        END)))))))));

-- VERIFICACIÓN 1: Huevos debe seguir mostrando valor_a_facturar = cantidad × 2.95
-- (sin cambio respecto a antes de correr este script).
select numeroorden, producto, subcategoria, cantidad, toneladas, tarifa, valor_a_facturar
  from public.facturacion
 where idempresa = 2 and subcategoria = 'Huevos'
 order by numeroorden desc
 limit 10;

-- VERIFICACIÓN 2: Empaque MP debe mostrar valor_a_facturar = cantidad × 1355
-- (antes de este script salía cantidad × 1355 solo por casualidad si
-- cantidad = toneladas en detalleoc; con órdenes reales de Packing puede
-- diferir, por eso hace falta este fix explícito).
select numeroorden, producto, subcategoria, cantidad, toneladas, tarifa, valor_a_facturar
  from public.facturacion
 where idempresa = 2 and subcategoria = 'Materia Prima'
 order by numeroorden desc
 limit 10;
