-- =====================================================================
-- Estado de la liquidación de cada persona retirada (submódulo Liquidaciones).
-- Guarda si la liquidación está 'pendiente' o 'liquidada', el soporte adjunto y
-- la fecha "pagado hasta" (para calcular las novedades PENDIENTES de pago).
-- El detalle de novedades se calcula en vivo desde pagonomina; aquí solo vive
-- el ESTADO, el SOPORTE y "pagado hasta". Aditivo e idempotente.
-- =====================================================================

create table if not exists public.liquidaciones_retiro (
  id uuid primary key default gen_random_uuid(),
  idempresa int,
  identificacion text,
  persona text,
  fecha_retiro date,
  estado text not null default 'pendiente',   -- 'pendiente' | 'liquidada'
  soporte_url text,
  soporte_nombre text,
  pagado_hasta date,                            -- novedades pendientes = posteriores a esta fecha
  total_liquidado numeric,
  fecha_liquidacion timestamptz,
  updated_at timestamptz default now(),
  unique (idempresa, identificacion)
);

-- Por si la tabla ya existía de una corrida previa sin la columna.
alter table public.liquidaciones_retiro add column if not exists pagado_hasta date;

alter table public.liquidaciones_retiro replica identity full;

NOTIFY pgrst, 'reload schema';
