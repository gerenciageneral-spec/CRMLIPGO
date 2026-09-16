-- =====================================================================
-- liquidaciones_retiro: valores REALES de prestaciones (histórico).
--
-- getLiquidaciones() calcula cesantías/intereses/prima/vacaciones en vivo
-- con una fórmula. Para personas ya liquidadas cuyo pago real (Siigo) no
-- coincide exactamente con la fórmula (por huecos de datos históricos,
-- ajustes manuales de RRHH, etc.), estas 4 columnas permiten guardar el
-- valor REAL que efectivamente se pagó -- getLiquidaciones() las usa en
-- vez de recalcular, cuando están presentes (no nulas).
--
-- Aditivo e idempotente.
-- =====================================================================

alter table public.liquidaciones_retiro
  add column if not exists cesantias_real numeric,
  add column if not exists intereses_real numeric,
  add column if not exists prima_real numeric,
  add column if not exists vacaciones_real numeric;
