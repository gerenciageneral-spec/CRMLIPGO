-- Create colaboradores table if it doesn't exist
create table if not exists colaboradores (
  id uuid primary key default uuid_generate_v4(),
  tipo_documento text,
  numero_documento text unique,
  nombres text,
  apellidos text,
  fecha_nacimiento date,
  telefono text,
  email text,
  direccion text,
  ciudad text,
  departamento text,
  contacto_emergencia_nombre text,
  contacto_emergencia_telefono text,
  cargo text,
  area text,
  cliente_asignado text,
  sede text,
  tipo_contrato text,
  fecha_ingreso date,
  fecha_retiro date,
  estado text,
  salario_base numeric,
  banco text,
  cuenta_bancaria text,
  eps text,
  arl text,
  caja_compensacion text,
  fondo_pension text,
  talla_camisa text,
  talla_pantalon text,
  talla_zapato text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create contratos table
create table if not exists contratos (
  id uuid primary key default uuid_generate_v4(),
  colaborador_id uuid references colaboradores(id) on delete cascade,
  fecha_inicio date,
  fecha_fin date,
  tipo_contrato text,
  cargo text,
  salario_base numeric,
  cliente_asignado text,
  sede text,
  estado text,
  url_documento text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create dotacion_epp table
create table if not exists dotacion_epp (
  id uuid primary key default uuid_generate_v4(),
  colaborador_id uuid references colaboradores(id) on delete cascade,
  fecha_entrega date,
  tipo_item text,
  item text,
  talla text,
  cantidad integer,
  estado text,
  observaciones text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create capacitaciones table
create table if not exists capacitaciones (
  id uuid primary key default uuid_generate_v4(),
  tema text,
  categoria text,
  fecha date,
  duracion_horas numeric,
  instructor text,
  cliente_aplica text,
  sede text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create capacitaciones_asistencia table
create table if not exists capacitaciones_asistencia (
  id uuid primary key default uuid_generate_v4(),
  capacitacion_id uuid references capacitaciones(id) on delete cascade,
  colaborador_id uuid references colaboradores(id) on delete cascade,
  asistio boolean,
  resultado text,
  observaciones text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
