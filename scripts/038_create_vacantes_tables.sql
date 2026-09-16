-- Create vacantes table
create table if not exists vacantes (
  id uuid primary key default uuid_generate_v4(),
  idempresa integer not null,
  proyecto text not null,
  cargo text not null,
  headcount integer,
  turno text,
  ciudad text,
  rango_salarial_min numeric,
  rango_salarial_max numeric,
  requisitos text,
  estado text default 'en_revision',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create vacantes_candidatos table
create table if not exists vacantes_candidatos (
  id uuid primary key default uuid_generate_v4(),
  vacante_id uuid not null references vacantes(id) on delete cascade,
  nombre text not null,
  email text,
  telefono text,
  documento text,
  experiencia text,
  estado_candidato text default 'pendiente',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create indices for better query performance
create index if not exists idx_vacantes_idempresa on vacantes(idempresa);
create index if not exists idx_vacantes_estado on vacantes(estado);
create index if not exists idx_vacantes_candidatos_vacante_id on vacantes_candidatos(vacante_id);
