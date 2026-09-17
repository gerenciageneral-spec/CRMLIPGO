-- =====================================================================
-- Agrega el campo `placa` a historicolotes: la placa del vehículo al que
-- se le hizo la aprobación de lotes (módulo "Asignación de Lotes" →
-- Aprobación). Se captura automáticamente desde cabeceraoc.placa en cada
-- aprobación nueva (lib/batch-actions.ts:approveBatchAllocation).
--
-- Para el histórico ya aprobado antes de este cambio, correr DESPUÉS de
-- este script: scripts/118_backfill_placa_historicolotes.sql
-- =====================================================================

alter table public.historicolotes add column if not exists placa text;

create index if not exists historicolotes_placa_idx
  on public.historicolotes (placa);

-- Verificación
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'historicolotes' and column_name = 'placa';
