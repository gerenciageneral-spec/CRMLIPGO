-- =====================================================================
-- Costo del examen médico PERIÓDICO por empresa (configurable).
-- Solo la línea "Médico ingreso/periódico/retiro" de TARIFAS LIP 2026,
-- para provisionar el gasto anual de exámenes periódicos.
-- Aditivo e idempotente. Correr en el SQL Editor de Supabase.
-- =====================================================================
alter table public.rrhh_config
  add column if not exists costo_periodico numeric(14,2) default 0;

-- Semilla con la tarifa por sede (editable luego desde la app).
update public.rrhh_config set costo_periodico = 28000 where idempresa = 1; -- Indupan · Bogotá
update public.rrhh_config set costo_periodico = 29000 where idempresa = 2; -- Avimol · Barranquilla
update public.rrhh_config set costo_periodico = 35000 where idempresa = 3; -- Cedi Funza
update public.rrhh_config set costo_periodico = 35000 where idempresa = 4; -- Cedi Medellín
update public.rrhh_config set costo_periodico = 0     where idempresa = 5; -- Demogistics · no aplica
