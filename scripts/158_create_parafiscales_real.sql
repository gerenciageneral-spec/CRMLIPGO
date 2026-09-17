-- =====================================================================
-- Valor REAL (histórico) del IBC de Parafiscales/PILA por persona-mes.
--
-- getParafiscales() calcula el IBC en vivo con una fórmula (ver
-- lib/parafiscales-actions.ts). Para meses ya radicados en Aportes en
-- Línea cuyo IBC real no coincide exactamente con la fórmula (destajo antes
-- de julio-2026, ajustes puntuales de RRHH, etc.), esta tabla permite
-- guardar el valor REAL que efectivamente se radicó -- getParafiscales() lo
-- usa en vez de recalcular, cuando está presente (no nulo). Mismo patrón
-- que liquidaciones_retiro.cesantias_real / intereses_real / etc.
--
-- A diferencia de liquidaciones_retiro (una fila por persona, retiro único),
-- aquí la clave incluye año+mes porque el IBC se radica CADA MES.
--
-- Aditivo e idempotente.
-- =====================================================================

create table if not exists public.parafiscales_real (
  id uuid primary key default gen_random_uuid(),
  idempresa int,
  identificacion text not null,
  persona text,
  anio int not null,
  mes int not null,
  ibc_real numeric,
  dias_real int,
  updated_at timestamptz default now(),
  unique (identificacion, anio, mes)
);

alter table public.parafiscales_real replica identity full;

NOTIFY pgrst, 'reload schema';
