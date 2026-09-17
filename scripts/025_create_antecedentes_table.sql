-- =====================================================================
-- Modulo "Antecedentes" (Reclutamiento y Seleccion)
-- Permite cargar, por candidato/trabajador, los 3 certificados de
-- antecedentes: Policia, Procuraduria y Contraloria.
-- Los archivos se almacenan en Supabase Storage (bucket "archivos") y
-- aqui se guardan sus URLs y metadatos asociados al candidato.
-- =====================================================================

-- 1) La seleccion del candidato se hace por cedula o nombre desde una hoja
--    de vida existente. Aseguramos que hojas_de_vida tenga la columna cedula.
alter table public.hojas_de_vida add column if not exists cedula text;
create index if not exists idx_hojas_de_vida_cedula on public.hojas_de_vida (cedula);

-- 2) Tabla de antecedentes: un registro por candidato/trabajador con los 3
--    archivos correspondientes.
create table if not exists public.antecedentes (
  id uuid primary key default gen_random_uuid(),
  idempresa integer not null,
  -- Vinculo a la hoja de vida seleccionada (id de trabajador/candidato).
  hoja_vida_id uuid references public.hojas_de_vida(id) on delete set null,
  cedula text,
  nombre text not null,
  -- Certificado de Policia.
  policia_url text,
  policia_nombre text,
  -- Certificado de Procuraduria.
  procuraduria_url text,
  procuraduria_nombre text,
  -- Certificado de Contraloria.
  contraloria_url text,
  contraloria_nombre text,
  created_at timestamptz not null default now()
);

create index if not exists idx_antecedentes_idempresa on public.antecedentes (idempresa);
create index if not exists idx_antecedentes_cedula on public.antecedentes (cedula);
create index if not exists idx_antecedentes_hoja_vida on public.antecedentes (hoja_vida_id);
create index if not exists idx_antecedentes_created_at on public.antecedentes (created_at desc);
