-- Reporte / justificación de tiempos de paro de la máquina de producción.
-- Cada fila = una franja de paro (contigua) del día, con su motivo. El día y
-- las marcas inicio/fin se guardan en HORA LITERAL (UTC) igual que el dashboard
-- de producción (historial_intervalos.fecha_hora), para que coincidan al pintar.

create table if not exists public.paros_produccion (
  id uuid primary key default gen_random_uuid(),
  idempresa integer,
  fecha text,              -- YYYY-MM-DD (literal, igual que el selector del dashboard)
  inicio text,             -- ISO UTC del inicio de la franja (clave del paro)
  fin text,                -- ISO UTC del fin de la franja
  minutos integer,         -- duración del paro
  motivo text,             -- justificación escrita
  categoria text,          -- opcional: mecanico | electrico | insumos | cambio_referencia | aseo | personal | otro
  reportado_por text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Un comentario por franja (idempresa + fecha + inicio).
create unique index if not exists uq_paros_prod_franja
  on public.paros_produccion (idempresa, fecha, inicio);

create index if not exists idx_paros_prod_emp_fecha
  on public.paros_produccion (idempresa, fecha);
