-- =====================================================================
-- Barrido #2 (toda la app): SQL de apoyo para 2 de los fixes de código.
-- Idempotente y seguro (correr en el SQL Editor de Supabase). NO toca
-- cabeceraoc ni invtrans (su patrón de id es intencional y se deja igual).
-- =====================================================================

-- 1) qrestibadetalle.id (SERIAL): resincronizar la SECUENCIA con el máximo id.
--    Se corrigió el código para que el registro de estibas NO fije el id a mano
--    (max+1) y use el SERIAL (nextval), igual que la verificación por QR en Picking
--    y el traslado de estibas. Este setval sana el desfase acumulado para que el
--    próximo nextval no choque con ids ya existentes (mismo caso que registroasistencia).
DO $$
DECLARE
  mx bigint;
  seqname text := pg_get_serial_sequence('public.qrestibadetalle', 'id');
BEGIN
  IF seqname IS NULL THEN
    RAISE NOTICE 'qrestibadetalle.id no tiene secuencia asociada; nada que resincronizar.';
    RETURN;
  END IF;
  SELECT COALESCE(MAX(id), 0) INTO mx FROM public.qrestibadetalle;
  IF mx > 0 THEN
    PERFORM setval(seqname, mx, true);      -- próximo nextval = mx + 1
  ELSE
    PERFORM setval(seqname, 1, false);      -- tabla vacía: próximo nextval = 1
  END IF;
  RAISE NOTICE 'Secuencia % resincronizada a max(id)=%', seqname, mx;
END $$;

-- 2) Facturación por Proyectos: valores DISTINCT para los filtros (owner/placa/
--    subcategoria/transporte) SIN toparse en 1000 filas. El route
--    app/api/facturacion/filters la consulta (con fallback si no existe). El DISTINCT
--    se calcula en el motor => devuelve pocas filas y no pierde placas/transportes.
CREATE OR REPLACE VIEW public.facturacion_filtros AS
  SELECT 'owner'::text AS tipo, owner AS valor FROM public.facturacion WHERE owner IS NOT NULL
  UNION
  SELECT 'placa'::text, placa FROM public.facturacion WHERE placa IS NOT NULL
  UNION
  SELECT 'subcategoria'::text, subcategoria FROM public.facturacion WHERE subcategoria IS NOT NULL
  UNION
  SELECT 'transporte'::text, transporte FROM public.facturacion WHERE transporte IS NOT NULL;

-- Verificación rápida (opcional):
-- SELECT last_value FROM pg_get_serial_sequence('public.qrestibadetalle','id')::regclass;
-- SELECT tipo, count(*) FROM public.facturacion_filtros GROUP BY tipo;
