-- =====================================================================
-- Tabla unica de colaboradores (Gestion Humana) con la informacion de
-- registro en 2 partes: (1) Hoja de vida y (2) Informacion del contrato.
-- Incluye idempresa para multiempresa.
-- =====================================================================
create extension if not exists "uuid-ossp";

create table if not exists colaboradores_th (
  id uuid primary key default uuid_generate_v4(),

  -- Multiempresa: a que empresa pertenece el trabajador.
  idempresa integer not null,

  -- ===========================================================
  -- PARTE 1 - HOJA DE VIDA
  -- ===========================================================
  primer_nombre            text not null,
  segundo_nombre           text,
  primer_apellido          text not null,
  segundo_apellido         text,
  tipo_documento           text not null,
  numero_documento         text not null,
  centro_costos            text,
  correo_electronico       text not null,
  numero_celular           text not null,
  pais_residencia          text not null,
  departamento_residencia  text not null,
  ciudad_residencia        text not null,
  direccion_residencia     text not null,
  metodo_pago              text not null,
  entidad_bancaria         text,
  tipo_cuenta              text,
  numero_cuenta            text,
  numero_telefono_celular  text,
  direccion_oficina        text not null,
  pais_oficina             text not null,
  departamento_oficina     text not null,
  ciudad_oficina           text not null,

  -- ===========================================================
  -- PARTE 2 - INFORMACION DEL CONTRATO
  -- ===========================================================
  nombre_empleado          text,
  numero_identificacion    text not null,
  tipo_contrato            text not null,
  fecha_inicio_contrato    date not null,
  fecha_fin_contrato       date,
  sueldo                   numeric not null,
  salario_integral         boolean default false,
  numero_contrato          text not null,
  grupo_nomina             text not null,
  cargo                    text not null,
  centro_costo             text,
  tipo_cotizante           text not null,
  subtipo_cotizante        text not null,
  fondo_salud              text not null,
  porcentaje_salud         numeric not null,
  fondo_pension            text,
  porcentaje_pension       numeric,
  fondo_arl                text,
  clase_riesgo             text,
  codigo_ciiu              text,
  codigo                   text,
  caja_compensacion        text,
  fondo_cesantias          text,
  deduccion_vivienda                          numeric,
  deduccion_medicina_prepagada                numeric,
  aportes_voluntarios_pension_obligatoria     numeric,
  aporte_voluntario_pension_renta_exenta      numeric,
  aporte_voluntario_afc                       numeric,
  aplica_deduccion_dependientes               boolean default false,

  -- ===========================================================
  -- Metadatos
  -- ===========================================================
  estado     text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- El numero de documento es unico por empresa.
  constraint colaboradores_th_doc_empresa_uniq unique (idempresa, numero_documento)
);

-- Indice para filtrar por empresa rapidamente.
create index if not exists idx_colaboradores_th_idempresa
  on colaboradores_th (idempresa);

-- Trigger para mantener updated_at.
create or replace function set_colaboradores_th_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_colaboradores_th_updated_at on colaboradores_th;
create trigger trg_colaboradores_th_updated_at
  before update on colaboradores_th
  for each row execute function set_colaboradores_th_updated_at();
