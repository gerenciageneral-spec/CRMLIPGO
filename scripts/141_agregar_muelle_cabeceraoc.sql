-- Muelle real asignado a mano por el coordinador (Centro de Coordinación).
-- Antes el "Estado de Muelles" era una simulación en memoria; ahora el
-- coordinador asigna un número de muelle real a la orden (Cargue, Descargue
-- o Distribución comparten los mismos muelles físicos). Sin FK: es un
-- entero validado en la app contra MUELLES_SIMULTANEOS[idempresa]
-- (lib/meta-productividad-utils.ts).
ALTER TABLE public.cabeceraoc
  ADD COLUMN IF NOT EXISTS muelle integer;
