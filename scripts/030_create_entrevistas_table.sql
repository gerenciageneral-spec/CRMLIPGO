-- =====================================================================
-- Modulo "Entrevistas" (Reclutamiento y Selección)
-- Almacena las entrevistas estructuradas aplicadas a candidatos cuya hoja
-- de vida esta registrada y ACEPTADA. Los campos replican el formato de
-- entrevista en PDF: datos personales, contacto de emergencia, educacion,
-- experiencia laboral (varias, en jsonb) y el concepto del entrevistador.
-- =====================================================================
create table if not exists public.entrevistas (
  id uuid primary key default gen_random_uuid(),
  idempresa integer not null,
  hoja_vida_id uuid references public.hojas_de_vida(id) on delete set null,

  -- Datos del candidato
  nombre_candidato text not null,
  cedula text,
  correo text,
  telefono text,
  edad text,
  fecha_nacimiento text,
  lugar_nacimiento text,
  procedencia text,
  direccion text,

  -- Contacto de emergencia
  contacto_emergencia_nombre text,
  contacto_emergencia_parentesco text,
  contacto_emergencia_telefono text,

  -- Datos complementarios
  sabe_leer_escribir text,        -- 'Sí' | 'No'
  talla_pantalon text,
  talla_camisa text,

  -- Educacion
  institucion_educativa text,
  nivel_educativo text,
  ano_ingreso text,
  ano_finalizacion text,

  -- Experiencia laboral: arreglo de objetos
  -- { empresa, cargo, fecha_inicio, fecha_fin, motivo_retiro, funciones, jefe_nombre, jefe_telefono }
  experiencia_laboral jsonb not null default '[]'::jsonb,

  -- Concepto del entrevistador
  observaciones text,
  concepto_final text not null default 'aplazado',  -- 'apto' | 'no_apto' | 'aplazado'

  -- Metadatos de la entrevista
  entrevistador text,
  fecha_entrevista date,
  created_at timestamptz not null default now()
);

create index if not exists idx_entrevistas_idempresa on public.entrevistas (idempresa);
create index if not exists idx_entrevistas_cedula on public.entrevistas (cedula);
create index if not exists idx_entrevistas_hoja_vida on public.entrevistas (hoja_vida_id);
create index if not exists idx_entrevistas_created_at on public.entrevistas (created_at desc);
