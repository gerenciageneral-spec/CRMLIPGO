-- Agrega la columna `lote` a detalleoc para que el formulario manual de
-- "Generar Orden de Descargue" (Recepción y Despacho) pueda capturar el lote
-- por producto cuando el descargue NO viene de un cargue madre en LIPgo (ej.
-- recepciones de terceros como Molinos, sin orden madre en el sistema).
--
-- generarIngresoProduccionDesdeDescargue (lib/orders-actions.tsx) ya usa este
-- valor como tercera fuente de lote (despues de despachotraslados e
-- historicolotes de la madre) al generar el ingreso pendiente en Producción.
ALTER TABLE public.detalleoc
  ADD COLUMN IF NOT EXISTS lote text;
