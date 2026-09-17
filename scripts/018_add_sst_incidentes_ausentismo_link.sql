-- ============================================================================
-- Vincula las investigaciones de AT (sst_incidentes) con el ausentismo (AT)
-- registrado en Gestion Humana (ausentismosst). Permite generar alertas e
-- investigaciones pendientes automaticamente cuando un ausentismo es tipo AT.
-- Ejecutar una sola vez en Supabase (SQL Editor).
-- ============================================================================

-- 1. Columna de vinculo (UUID, referencia logica a ausentismosst.id).
ALTER TABLE public.sst_incidentes
  ADD COLUMN IF NOT EXISTS ausentismo_id uuid;

-- 2. Indice para buscar rapido la investigacion de un ausentismo.
CREATE INDEX IF NOT EXISTS idx_sst_incidentes_ausentismo
  ON public.sst_incidentes (ausentismo_id);

-- 3. (Opcional) FK con borrado en cascada suave: si se borra el ausentismo,
--    la investigacion queda sin vinculo (no se borra).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_sst_incidentes_ausentismo'
  ) THEN
    ALTER TABLE public.sst_incidentes
      ADD CONSTRAINT fk_sst_incidentes_ausentismo
      FOREIGN KEY (ausentismo_id)
      REFERENCES public.ausentismosst (id)
      ON DELETE SET NULL;
  END IF;
END $$;
