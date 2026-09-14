-- ============================================================================
-- Cortes de facturación personalizados (Ciclo de Facturación)
-- ----------------------------------------------------------------------------
-- Extiende `condiciones_generacion_prefactura` con una tercera cadencia,
-- "cortes": el Jefe define varios días del mes (ej. 8, 16, 25) en los que
-- quiere que se genere automáticamente la prefactura -- no necesariamente
-- semanal ni equiespaciados. Se repite todos los meses sin volver a
-- configurarse (el cron solo compara el día-del-mes de "ayer" contra esta
-- lista, ver app/api/cron/anexos-pendientes/route.ts).
-- ============================================================================

alter table public.condiciones_generacion_prefactura
  drop constraint if exists condiciones_generacion_prefactura_frecuencia_check;

alter table public.condiciones_generacion_prefactura
  add constraint condiciones_generacion_prefactura_frecuencia_check
  check (frecuencia in ('diario', 'semanal', 'cortes'));

alter table public.condiciones_generacion_prefactura
  add column if not exists dias_corte integer[];

notify pgrst, 'reload schema';
