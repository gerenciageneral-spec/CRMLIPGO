-- =====================================================================
-- Producto "Huevos" (Descargue, ID2 - Avimol): se factura POR UNIDAD.
--
-- Pedido por el usuario 2026-08-27: el descargue de huevos en Avimol (id2)
-- se cobra a $2,95 por unidad (NO por tonelada/peso, como el resto de
-- productos). El producto "HUEVO" (id 999999, id_empresa 2) ya existía en
-- el maestro `productos` de una petición anterior, pero quedó con
-- subcategoria = 'Producto Terminado' — eso lo hacía calzar con la tarifa
-- genérica de PT ($15.099/ton) en vez de tener su propia tarifa por unidad.
--
-- Este script:
--   1) Corrige la subcategoría a 'Huevos' (deja de heredar la tarifa de PT).
--   2) Crea la tarifa de Descargue/Huevos = $2,95 (empresafactura AVIMOL).
--
-- El cálculo real (cantidad × tarifa, en vez de toneladas × tarifa) y la
-- excepción de owner (Huevos siempre se factura a Avimol, sin importar el
-- transporte) ya están resueltos en código:
--   lib/facturacion-billed-party.ts (esProductoPorUnidad, facturadoAOwner)
--   lib/facturacion-control-actions.ts (getPrefactura/getControlFacturacion/getValoresNetosOrden)
--
-- PENDIENTE (no incluido aquí, no bloquea el Cuadro de Control): la vista
-- `scripts/050_vistas_financieras.sql` (public.facturacion) no expone
-- `detalleoc.cantidad` y su `valor_a_facturar` sigue calculando
-- tarifa × toneladas para TODOS los productos, Huevos incluido. El motor de
-- Cuadro de Control / Prefactura / Valor Neto Orden NO usa ese campo (lo
-- recalcula en código, ya corregido) — pero el Estado de Resultados
-- (components/estado-resultados/use-ingresos.ts) SÍ lee `valor_a_facturar`
-- directo de la vista, así que el ingreso de Huevos ahí seguirá saliendo mal
-- hasta que se actualice esa vista (requiere ALTER en el editor SQL de
-- Supabase; no ejecutable desde la app).
-- =====================================================================

-- ANTES (verificación): debe mostrar subcategoria = 'Producto Terminado'.
select id, nombre, subcategoria, peso_unitkg
  from public.productos
 where id = 999999;

update public.productos
   set subcategoria = 'Huevos'
 where id = 999999
   and id_empresa = 2
   and nombre = 'HUEVO';

insert into public.tarifasoperacion
  (empresaid, operacion, producto, tarifa, empresafactura, descripcion, fechainicio, fechafin)
values
  (2, 'Descargue', 'Huevos', 2.95, 'AVIMOL',
   'Descargue de Huevos: se factura POR UNIDAD (cantidad digitada en la orden), no por tonelada. Confirmado por el usuario 2026-08-27.',
   '2026-01-01', '2026-12-31');

-- DESPUÉS: debe mostrar subcategoria = 'Huevos' y la tarifa 2.95 recién creada.
select id, nombre, subcategoria from public.productos where id = 999999;
select id, empresaid, operacion, producto, tarifa, empresafactura
  from public.tarifasoperacion
 where empresaid = 2 and producto = 'Huevos';
