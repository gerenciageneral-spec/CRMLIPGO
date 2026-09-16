-- =====================================================================
-- Banco de Hojas de Vida (modulo "Hojas de Vida" en Reclutamiento)
-- Guarda los METADATOS de cada hoja de vida; el archivo se almacena en
-- Vercel Blob y aqui solo conservamos su URL y nombre original.
-- =====================================================================
create table if not exists public.hojas_de_vida (
  id uuid primary key default gen_random_uuid(),
  idempresa integer not null,
  nombre_candidato text not null,
  cargo_aspirado text,
  correo text,
  telefono text,
  notas text,
  -- Datos del archivo almacenado en Blob.
  archivo_url text not null,
  archivo_nombre text not null,
  archivo_tipo text,
  archivo_tamano bigint,
  created_at timestamptz not null default now()
);

-- Filtro principal: por empresa.
create index if not exists idx_hojas_de_vida_idempresa on public.hojas_de_vida (idempresa);
create index if not exists idx_hojas_de_vida_created_at on public.hojas_de_vida (created_at desc);
