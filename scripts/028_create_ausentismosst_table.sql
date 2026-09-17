-- =====================================================================
-- ausentismosst (modulo "Ausentismos" en Gestion Humana > Relaciones
-- Laborales). Basado en la matriz SST-MAT-06 "Analisis Estadistico de
-- Ausentismo Laboral por Enfermedad General y Accidente Laboral".
--
-- Cada fila es una incapacidad. tipo_evento distingue Enfermedad
-- General (EG) de Accidente de Trabajo (AT). Los diagnosticos cuyo
-- codigo CIE-10 empieza por "M" (enfermedades del sistema
-- osteomuscular) se resaltan en rojo en la UI para revision del
-- profesional de SST.
-- =====================================================================
create table if not exists public.ausentismosst (
  id uuid primary key default gen_random_uuid(),
  idempresa integer not null,

  -- Identificacion del colaborador
  mes text,
  nombre_colaborador text not null,
  cedula text,
  cargo text,
  area text,
  estado_colaborador text,            -- ACTIVO / RETIRADO
  centro_trabajo text,

  -- Clasificacion del evento
  tipo_evento text not null default 'EG',  -- EG (Enfermedad General) | AT (Accidente de Trabajo)
  eps text,                            -- EPS (EG) o Centro Medico (AT)

  -- Fechas y duracion
  fecha_inicial date,
  fecha_final date,
  dias_incapacidad integer default 0,
  prorroga integer default 0,
  total_dias_incapacidad integer default 0,
  dias_empresa integer default 0,      -- TOTAL DE DIAS CONSUMIDOS POR EMPRESA
  dias_eps integer default 0,          -- TOTAL DE DIAS CONSUMIDOS POR EPS / ARL

  -- Diagnostico (CIE-10)
  codigo_diagnostico text,
  descripcion_diagnostico text,        -- DESCRIPCION DE LA CATEGORIA DE LA CONDICION DE SALUD
  parte_cuerpo text,
  estadistica text,
  -- Marca derivada del codigo (TRUE cuando empieza por "M"). Se calcula
  -- tambien en la app, pero la persistimos para filtrar facil en SQL.
  requiere_revision_sst boolean default false,

  -- Costos
  salario_base numeric default 0,
  salario_base_dia numeric default 0,
  costos_empresa numeric default 0,
  costos_eps numeric default 0,        -- COSTOS ASUMIDOS EPS / ARL
  total_salario_pagado numeric default 0,

  observaciones text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ausentismosst_idempresa on public.ausentismosst (idempresa);
create index if not exists idx_ausentismosst_tipo_evento on public.ausentismosst (tipo_evento);
create index if not exists idx_ausentismosst_cedula on public.ausentismosst (cedula);
create index if not exists idx_ausentismosst_revision on public.ausentismosst (requiere_revision_sst);
create index if not exists idx_ausentismosst_created_at on public.ausentismosst (created_at desc);
