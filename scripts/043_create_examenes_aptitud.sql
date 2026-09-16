-- =====================================================================
-- Exámenes Médicos como FILTRO de contratación + trazabilidad de aptitud
-- ---------------------------------------------------------------------
-- El examen médico es el REQUISITO que aprueba o rechaza una contratación.
-- Flujo: Hoja de Vida + Antecedentes + Entrevista (cada uno en su submódulo) →
-- Examen Médico. Si el resultado es APTO, todos los documentos suben a Head Count
-- (la persona queda vinculada). Si es NO APTO, se rechaza y no entra a Head Count.
-- Se conserva el histórico (varios exámenes por cédula) para que los resultados
-- persistan en el tiempo y para medir el costo asumido por LIP en negativos.
--
-- SCRIPT ÚNICO Y AUTOSUFICIENTE: crea la tabla si no existe, agrega las columnas
-- de aptitud si faltan y crea la config de costo. Aditivo e idempotente.
-- Correr en el SQL Editor de Supabase. No borra datos.
-- =====================================================================

-- 1) Tabla base examenes_medicos (si aún no existe en el proyecto).
create table if not exists public.examenes_medicos (
  id uuid primary key default gen_random_uuid(),
  idempresa integer not null,
  entrevista_id uuid references public.entrevistas(id) on delete set null,
  hoja_vida_id uuid references public.hojas_de_vida(id) on delete set null,
  cedula text,
  nombre text not null,
  tipo_examen text,
  resultado text,
  fecha_examen date,
  observaciones text,
  archivo_url text not null,
  archivo_nombre text not null,
  created_at timestamptz not null default now()
);

-- 2) Columnas de aptitud, costo y trazabilidad (idempotentes).
alter table public.examenes_medicos
  add column if not exists apto boolean,                      -- null=pendiente · true=apto · false=no apto
  add column if not exists costo numeric(14,2) default 0,     -- costo del examen (lo asume LIP)
  add column if not exists promovido boolean default false,   -- si el APTO ya subió los docs a Head Count
  add column if not exists fuente text default 'candidato',   -- 'candidato' | 'headcount' (histórico) | 'entrevista'
  add column if not exists vigente boolean default true;      -- el último examen de la cédula es el vigente

create index if not exists idx_examenes_medicos_idempresa on public.examenes_medicos (idempresa);
create index if not exists idx_examenes_medicos_cedula on public.examenes_medicos (cedula);
create index if not exists idx_examenes_medicos_entrevista on public.examenes_medicos (entrevista_id);
create index if not exists idx_examenes_medicos_created_at on public.examenes_medicos (created_at desc);
create index if not exists idx_examenes_medicos_apto on public.examenes_medicos (apto);
create index if not exists idx_examenes_medicos_cedula_fecha on public.examenes_medicos (cedula, created_at desc);

-- 3) Normalizar el texto libre `resultado` existente → bandera `apto` (una sola vez).
--    "apto" (sin "no") = true; "no apto"/"rechaz"/"aplazado"/"no pasa" = false; resto pendiente.
update public.examenes_medicos
   set apto = case
     when apto is not null then apto
     when lower(coalesce(resultado,'')) ~ '(no[ _]?apto|rechaz|aplaz|no[ _]?pas)' then false
     when lower(coalesce(resultado,'')) ~ 'apto' then true
     else null end
 where apto is null;

-- 4) Config de RRHH: costo por defecto del examen médico (editable por empresa).
create table if not exists public.rrhh_config (
  idempresa integer primary key,
  costo_examen_default numeric(14,2) not null default 0,
  updated_at timestamptz not null default now()
);

-- Semilla del costo por defecto para LIP (empresa 100) y los sitios/clientes (1-4).
insert into public.rrhh_config (idempresa, costo_examen_default) values
  (100, 80000), (1, 80000), (2, 80000), (3, 80000), (4, 80000)
on conflict (idempresa) do nothing;

-- Nota: la lectura de estas tablas en la app se hace con el cliente de servidor
-- (service role) desde server actions, por lo que NO requieren cambios de permisos
-- ni políticas. No se toca RLS ni ninguna otra tabla del esquema.
