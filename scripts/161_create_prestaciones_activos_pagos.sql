-- =====================================================================
-- Prestaciones sociales REALES (prima, cesantías, intereses de cesantías)
-- de personal ACTIVO -- distinto de `liquidaciones_retiro`, que solo aplica
-- al momento del RETIRO. Estos son los pagos masivos periódicos que la ley
-- exige para TODO el personal activo:
--   · Prima de servicios: 2 periodos/año (ene-jun, pagada ~30-jun; jul-dic,
--     pagada ~20-dic).
--   · Cesantías + intereses de cesantías: 1 periodo/año (ene-dic), cesantías
--     consignadas al fondo ~14-feb, intereses pagados directo ~31-ene.
--
-- Patrón "valor real" -- igual que parafiscales_real / liquidaciones_retiro:
-- se PROYECTA un cálculo (mismos % de `parametros_prestaciones` que ya usa
-- Liquidaciones) y se puede confirmar/ajustar por persona antes de marcar el
-- periodo como pagado. Una vez pagada, Estado de Resultados / Cierre
-- Financiero usan el valor_real en vez de la provisión estimada mensual.
--
-- Aditivo e idempotente.
-- =====================================================================

create table if not exists public.prestaciones_activos_pagos (
  id uuid primary key default gen_random_uuid(),
  idempresa int,
  identificacion text not null,
  persona text,
  concepto text not null,               -- 'prima' | 'cesantias' | 'intereses_cesantias'
  periodo_desde date not null,
  periodo_hasta date not null,
  fecha_pago date,
  valor_calculado numeric,
  valor_real numeric,
  estado text not null default 'proyectado',  -- 'proyectado' | 'pagada'
  updated_at timestamptz default now(),
  unique (identificacion, concepto, periodo_desde, periodo_hasta)
);

alter table public.prestaciones_activos_pagos replica identity full;

NOTIFY pgrst, 'reload schema';
