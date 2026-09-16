-- =====================================================================
-- Examenes Medicos (modulo en "Gestión de Contratación")
-- Almacena el documento del examen medico de empleados que fueron
-- declarados APTOS en la entrevista. El archivo se guarda en Supabase
-- Storage (bucket "archivos") y aqui conservamos la URL y metadatos.
-- =====================================================================
create table if not exists public.examenes_medicos (
  id uuid primary key default gen_random_uuid(),
  idempresa integer not null,
  -- Trazabilidad hacia la entrevista aprobada y la hoja de vida.
  entrevista_id uuid references public.entrevistas(id) on delete set null,
  hoja_vida_id uuid references public.hojas_de_vida(id) on delete set null,
  cedula text,
  nombre text not null,
  -- Datos del examen.
  tipo_examen text,
  resultado text,
  fecha_examen date,
  observaciones text,
  -- Documento almacenado en Storage.
  archivo_url text not null,
  archivo_nombre text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_examenes_medicos_idempresa on public.examenes_medicos (idempresa);
create index if not exists idx_examenes_medicos_cedula on public.examenes_medicos (cedula);
create index if not exists idx_examenes_medicos_entrevista on public.examenes_medicos (entrevista_id);
create index if not exists idx_examenes_medicos_created_at on public.examenes_medicos (created_at desc);
