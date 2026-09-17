-- =====================================================================
-- CORREGIR subcategoría de la mogolla empacada de AVIMOL (id 2).
--
-- Hallado el 2026-08-02 al validar el Análisis Financiero: el usuario
-- confirmó que la mogolla se vende casi a diario por órdenes de cargue en
-- id1 e id2. En id2 sale bajo 'PT MOGOLLA 40 KG' (709,5 t solo en julio),
-- pero ese producto —y 'PT MOGOLLA 25 KG'— estaban clasificados como
-- 'Producto Terminado' en el maestro `productos`. La mogolla es
-- SUBPRODUCTO: su cargue se factura a la tarifa de Mogolla ($19.416), no
-- a la de PT ($15.099).
--
-- Medido antes del fix: 5.290,2 t de 2026 facturadas de menos por
-- $22.837.793 (feb $3,9M · mar $3,9M · abr $3,7M · may $4,8M · jun $3,4M ·
-- jul $3,1M).
--
-- EFECTO RETROACTIVO: la vista `facturacion` es en vivo, así que TODA la
-- historia de estos productos pasa a valorarse a $19.416 — P&L y Cuadro
-- suben retroactivamente. Las prefacturas ya GUARDADAS no cambian (van
-- congeladas). Refacturar o no la diferencia ya cobrada a $15.099 es
-- decisión del negocio; el sistema la deja visible.
--
-- Además arregla el Análisis Financiero: esas toneladas dejan de contar
-- como 'Auxiliar de Cargue/Descargue' (que daba 109%) y pasan a 'Cargue
-- Sub Producto' (que daba 0%).
--
-- REGLA DE SEGURIDAD: igualdad exacta contra literales, sin LIKE.
-- =====================================================================

-- ANTES (verificación): debe mostrar 2 filas con subcat 'Producto Terminado'.
select nombre, subcategoria, id_empresa
  from public.productos
 where id_empresa = 2
   and nombre in ('PT MOGOLLA 40 KG', 'PT MOGOLLA 25 KG');

update public.productos
   set subcategoria = 'Mogolla Kg.'
 where id_empresa = 2
   and nombre in ('PT MOGOLLA 40 KG', 'PT MOGOLLA 25 KG')
   and subcategoria = 'Producto Terminado';

-- DESPUÉS: julio id2 Cargue de Mogolla debe pasar de 1,3 t a ~710,8 t.
select sum(toneladas) as ton_mogolla_julio
  from public.facturacion
 where idempresa = 2
   and tipooperacion = 'Cargue'
   and subcategoria = 'Mogolla Kg.'
   and fechacargue >= '2026-07-01' and fechacargue < '2026-08-01';
