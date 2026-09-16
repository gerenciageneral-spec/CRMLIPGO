-- =====================================================================
-- Parámetros de PRESTACIONES SOCIALES (ley colombiana). Una sola fila (id=1).
-- Porcentajes mensuales equivalentes que se aplican sobre el devengado para la
-- liquidación de personal retirado. Editables (por si cambia la ley).
--   Prima de servicios .......... 8.33%
--   Cesantías ................... 8.33%
--   Intereses a las cesantías ... 12% anual (1% mensual)
--   Vacaciones .................. 4.17%  (excluye Auxilio de Transporte)
-- La base incluye salario + horas extras + recargos + Auxilio de Transporte
-- (el auxilio se excluye SOLO para vacaciones).
-- =====================================================================

create table if not exists public.parametros_prestaciones (
  id int primary key default 1,
  pct_prima numeric not null default 8.33,
  pct_cesantias numeric not null default 8.33,
  pct_intereses_cesantias numeric not null default 12,   -- anual
  pct_vacaciones numeric not null default 4.17,
  incluye_aux boolean not null default true,             -- auxilio en la base (excepto vacaciones)
  updated_at timestamptz default now(),
  constraint parametros_prestaciones_fila_unica check (id = 1)
);

insert into public.parametros_prestaciones (id) values (1) on conflict (id) do nothing;

alter table public.parametros_prestaciones replica identity full;

NOTIFY pgrst, 'reload schema';
