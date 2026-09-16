-- =====================================================================
-- Liquidaciones: INDEMNIZACIÓN (por despido sin justa causa) y
-- DEDUCCIONES (préstamos, anticipos, otros descuentos autorizados).
--
-- 1) headcount.motivo_retiro: motivo del retiro (Voluntario / Justa Causa /
--    Sin Justa Causa / Terminación Justa Causa Periodo de Prueba). La
--    indemnización (Ley 789/2002 art. 28, modifica CST art. 64) SOLO aplica
--    cuando el motivo es "Sin Justa Causa".
--
-- 2) liquidaciones_retiro.indemnizacion_real: mismo patrón que
--    cesantias_real/intereses_real/prima_real/vacaciones_real -- valor real
--    guardado que prevalece sobre la fórmula, si no coincide con Siigo.
--
-- 3) liquidaciones_retiro_deducciones: registro caso-por-caso de
--    deducciones (un concepto no calculable por fórmula: préstamos,
--    anticipos, licencia no remunerada, otros descuentos autorizados).
--
-- Aditivo e idempotente.
-- =====================================================================

alter table public.headcount
  add column if not exists motivo_retiro text;

alter table public.liquidaciones_retiro
  add column if not exists indemnizacion_real numeric;

create table if not exists public.liquidaciones_retiro_deducciones (
  id uuid primary key default gen_random_uuid(),
  idempresa integer not null,
  identificacion text not null,
  persona text,
  concepto text not null,
  valor numeric not null default 0,
  observacion text,
  created_at timestamptz not null default now()
);
create index if not exists idx_liq_deducciones_persona on public.liquidaciones_retiro_deducciones (idempresa, identificacion);
