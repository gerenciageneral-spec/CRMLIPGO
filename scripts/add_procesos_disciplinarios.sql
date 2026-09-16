-- ============================================================================
-- PROCESOS DISCIPLINARIOS
-- ----------------------------------------------------------------------------
-- Registro de las solicitudes de medida disciplinaria y su trámite, con el
-- soporte documental que queda en la carpeta del trabajador.
--
-- POR QUÉ ESTE MÓDULO NECESITA SU PROPIA TABLA
-- No existe hoy NADA disciplinario en LIPgo: ni tabla, ni columna, ni estado.
-- Una llamada de atención o una suspensión se maneja por fuera del sistema, así
-- que no hay trazabilidad de quién pidió qué, cuándo, ni con qué soporte.
--
-- EL DEBIDO PROCESO NO ES UN TRÁMITE INTERNO
-- En Colombia, antes de sancionar hay que oír al trabajador en descargos
-- (Art. 115 CST), y la sanción la impone el EMPLEADOR. En una empresa de
-- servicios temporales el empleador es la temporal, no la empresa usuaria: la
-- usuaria REPORTA la conducta y SOLICITA la medida, pero no sanciona.
--
-- Por eso el flujo tiene estados separados --radicado, descargos citados,
-- descargos realizados, resuelto-- y no un simple "aprobado/rechazado": saltarse
-- los descargos vicia la sanción y la vuelve ineficaz ante un juez laboral.
--
-- Aditivo e idempotente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — LOS CASOS
-- ----------------------------------------------------------------------------

create table if not exists public.procesos_disciplinarios (
  id uuid primary key default gen_random_uuid(),
  idempresa int not null,

  -- Número de radicado legible: DIS-0001, DIS-0002... Se asigna en el insert.
  radicado text not null,

  -- A quién. Se guarda la cédula porque es la llave con la que el resto del
  -- sistema identifica a la persona (headcount, registroasistencia, carpetas).
  identificacion text not null,
  nombre text not null,
  cargo text,

  -- Qué pasó.
  conducta text not null,
  -- Referencia legal de la conducta (Art. 60, 62, 58 CST...).
  norma text,
  -- Medida que sugiere el catálogo para esa conducta. NO es la que se aplica:
  -- la decide el empleador después de los descargos.
  medida_sugerida text,
  fecha_hecho date not null,
  hora_hecho text,
  lugar text,
  relato text not null,
  testigo text,
  testigo_cargo text,

  -- Trámite. El orden importa: radicado -> descargos_citados ->
  -- descargos_realizados -> resuelto | archivado.
  estado text not null default 'radicado',
  fecha_citacion_descargos date,
  fecha_descargos date,
  -- Lo que efectivamente se decidió, después de oír al trabajador.
  medida_aplicada text,
  fecha_resolucion date,
  motivo_archivo text,

  -- Quién lo radica (la usuaria) y quién lo tramita (la temporal).
  radicado_por text,
  responsable text,
  area_responsable text,

  -- Soportes. `documento_url` es el PDF generado del caso; `soportes` guarda
  -- los adjuntos que aporte quien radica.
  documento_url text,
  documento_nombre text,
  soportes jsonb not null default '[]'::jsonb,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists uq_disc_radicado
  on public.procesos_disciplinarios (idempresa, radicado);
create index if not exists idx_disc_emp
  on public.procesos_disciplinarios (idempresa, created_at desc);
-- Por persona: es la consulta de la carpeta del trabajador.
create index if not exists idx_disc_ident
  on public.procesos_disciplinarios (identificacion);

comment on table public.procesos_disciplinarios is
  'Solicitudes de medida disciplinaria y su trámite. La usuaria reporta y solicita; el empleador (la temporal) cita a descargos y decide. Ver scripts/add_procesos_disciplinarios.sql';
comment on column public.procesos_disciplinarios.medida_sugerida is
  'Sugerencia del catálogo para la conducta. NO es la medida aplicada: esa se decide tras los descargos.';
comment on column public.procesos_disciplinarios.estado is
  'radicado | descargos_citados | descargos_realizados | resuelto | archivado';


-- ----------------------------------------------------------------------------
-- PASO 2 — COHERENCIA DEL TRÁMITE
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.procesos_disciplinarios'::regclass
      and conname = 'chk_disc_estado'
  ) then
    alter table public.procesos_disciplinarios
      add constraint chk_disc_estado
      check (estado in ('radicado','descargos_citados','descargos_realizados','resuelto','archivado'))
      not valid;
  end if;
end $$;

-- No se puede resolver un caso sin haber pasado por descargos. Es la garantía
-- del Art. 115 CST llevada a la base: si el dato permite saltárselo, tarde o
-- temprano alguien se lo salta y la sanción queda viciada.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.procesos_disciplinarios'::regclass
      and conname = 'chk_disc_descargos_previos'
  ) then
    alter table public.procesos_disciplinarios
      add constraint chk_disc_descargos_previos
      check (
        estado <> 'resuelto'
        or (medida_aplicada is null)          -- resuelto sin sanción: no exige descargos
        or fecha_descargos is not null        -- con sanción: los descargos son obligatorios
      )
      not valid;
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- PASO 3 — BITÁCORA DEL CASO
-- ----------------------------------------------------------------------------
-- Cada cambio de estado deja rastro. En un proceso disciplinario, "cuándo se
-- citó" y "cuándo se oyó" son tan importantes como el resultado: son lo que
-- prueba que hubo debido proceso.

create table if not exists public.procesos_disciplinarios_bitacora (
  id serial primary key,
  proceso_id uuid not null references public.procesos_disciplinarios(id) on delete cascade,
  estado_anterior text,
  estado_nuevo text not null,
  nota text,
  actor text,
  created_at timestamptz default now()
);

create index if not exists idx_disc_bitacora
  on public.procesos_disciplinarios_bitacora (proceso_id, created_at);


-- ----------------------------------------------------------------------------
-- PASO 4 — PERMISO
-- ----------------------------------------------------------------------------
-- Un proceso disciplinario contiene el relato de una conducta, el nombre de
-- testigos y la decisión que se tomó. No es información operativa: se cuelga de
-- un permiso propio y no se hereda del de novedades.
--
-- El backfill lo otorga a quien administra Gestión Humana (gestionsolicitudes),
-- que es el perfil que hoy tramita lo laboral. A los demás se les entrega desde
-- Gestión de Usuarios.

alter table public.permisos_usuarios
  add column if not exists procesos_disciplinarios boolean not null default false;

update public.permisos_usuarios
  set procesos_disciplinarios = true
  where gestionsolicitudes = true;


-- ----------------------------------------------------------------------------
-- PASO 5 — VERIFICACIÓN (solo lecturas)
-- ----------------------------------------------------------------------------

-- 5a) Las tablas quedaron creadas.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('procesos_disciplinarios','procesos_disciplinarios_bitacora')
order by table_name;

-- 5b) El permiso.
select count(*) filter (where procesos_disciplinarios) as con_permiso,
       count(*) filter (where gestionsolicitudes)      as con_gestion_solicitudes,
       count(*)                                        as total_usuarios
from public.permisos_usuarios;

-- 5c) Arranca vacío: no hay casos históricos que migrar porque esto no existía.
select count(*) as casos from public.procesos_disciplinarios;

-- 5d) El bucket donde van los soportes debe existir. Si esto sale vacío, hay
--     que crear el bucket `archivos` en Storage antes de subir el primer PDF.
select id, name, public
from storage.buckets
where name = 'archivos';


-- ----------------------------------------------------------------------------
-- REVERSIÓN
-- ----------------------------------------------------------------------------
-- Los PDF ya generados viven en Storage y NO se borran con esto: hay que
-- limpiarlos aparte si se quiere revertir de verdad.
--
--   drop table if exists public.procesos_disciplinarios_bitacora;
--   drop table if exists public.procesos_disciplinarios;
--   alter table public.permisos_usuarios drop column if exists procesos_disciplinarios;
