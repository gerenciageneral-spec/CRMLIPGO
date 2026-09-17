-- =====================================================================
-- GESTIÓN DE MONTACARGAS (Producción)
--
-- Maestro de equipos + QR + bitácora de mantenimiento con hoja de vida.
--
-- POR QUÉ SE AMPLÍAN LAS TABLAS DE SST EN VEZ DE CREAR OTRAS: `sst_equipos`
-- y `sst_mantenimientos` ya existen (módulo SST "Equipos y Mantenimiento") y
-- fueron creadas justamente para esto — el comentario de
-- components/sst/equipos-mantenimiento.tsx dice literalmente "Para montacargas,
-- la 'identificacion' es la placa que se cruza con inspecciones_montacargas".
-- Ese módulo quedó a medias (solo INSERT, sin fotos, sin hoja de vida), pero
-- duplicar el maestro dejaría a LIP con dos verdades sobre el mismo equipo.
-- Ambas tablas están VACÍAS (0 filas), así que ampliarlas no migra nada.
--
-- TODO ES ADITIVO E IDEMPOTENTE: solo ADD COLUMN IF NOT EXISTS y CREATE IF NOT
-- EXISTS. El módulo de SST sigue funcionando: las columnas nuevas son nullable
-- y no se toca ninguna existente.
--
-- La auditoría se adjunta sola a la tabla nueva por el event trigger de
-- scripts/auditoria/04b_event_trigger.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) sst_equipos — ficha completa del equipo
-- ---------------------------------------------------------------------

-- Token del QR. NO se usa el `id`: un QR con el id sería adivinable y
-- revelaría cuántos equipos hay. `gen_random_uuid()` viene de pgcrypto, que
-- Supabase trae habilitado.
alter table public.sst_equipos
  add column if not exists codigo_qr text;

update public.sst_equipos
   set codigo_qr = gen_random_uuid()::text
 where codigo_qr is null;

alter table public.sst_equipos
  alter column codigo_qr set default gen_random_uuid()::text;

create unique index if not exists ux_sst_equipos_codigo_qr
  on public.sst_equipos (codigo_qr);

-- Identificación y ficha técnica.
alter table public.sst_equipos
  add column if not exists alias                text,
  add column if not exists anio                 integer,
  add column if not exists capacidad_kg         numeric,
  add column if not exists tipo_energia         text,   -- gas | electrico | diesel
  add column if not exists altura_elevacion_mm  numeric,
  add column if not exists tipo_llanta          text;

-- Programación del preventivo. Se admiten las dos frecuencias porque un
-- montacarga se controla por horas de uso, pero un equipo poco usado igual
-- necesita su revisión periódica; vence lo que ocurra primero.
alter table public.sst_equipos
  add column if not exists frecuencia_preventivo_horas  integer,
  add column if not exists frecuencia_preventivo_dias   integer,
  add column if not exists horometro_actual             numeric,
  add column if not exists horometro_ultimo_preventivo  numeric,
  add column if not exists fecha_ultimo_preventivo      date;

-- Baja lógica. `estado` (operativo/fuera_servicio/baja) describe la condición
-- del equipo; `activo` decide si sigue apareciendo en los listados. Son cosas
-- distintas: un equipo puede estar fuera de servicio y seguir gestionándose.
alter table public.sst_equipos
  add column if not exists activo boolean not null default true;

create index if not exists idx_sst_equipos_empresa_tipo
  on public.sst_equipos (idempresa, tipo, activo);

-- ---------------------------------------------------------------------
-- 2) sst_mantenimientos — bitácora con ciclo abierto → cerrado
-- ---------------------------------------------------------------------

-- OJO: `estado` ya existe con la semántica del cronograma de SST
-- (programado/vencido/ejecutado) y el módulo de SST lo lee. El ciclo que pidió
-- el negocio es OTRO eje (¿ya se resolvió la falla?), así que va en su propia
-- columna en vez de sobrecargar la existente y romper SST.
alter table public.sst_mantenimientos
  add column if not exists estado_gestion text not null default 'cerrado',
  add column if not exists horometro      numeric,
  add column if not exists reportado_por  text,
  add column if not exists cerrado_por    text,
  add column if not exists cerrado_en     timestamptz,
  add column if not exists solucion       text,
  add column if not exists repuestos      text,
  add column if not exists created_at     timestamptz not null default now();

-- Los pendientes son la consulta caliente del módulo.
create index if not exists idx_sst_mantenimientos_equipo
  on public.sst_mantenimientos (equipo_id, created_at desc);
create index if not exists idx_sst_mantenimientos_abiertos
  on public.sst_mantenimientos (idempresa, estado_gestion)
  where estado_gestion = 'abierto';

-- ---------------------------------------------------------------------
-- 3) montacargas_documentos — documentos con vencimiento
--
-- Va aparte de `soportes_documentales` porque esa tabla NO tiene fecha de
-- vencimiento y agregársela afectaría a sus 31 filas y a todos sus
-- consumidores (SST, evidencias, repositorio). Las FOTOS de los hallazgos sí
-- usan `soportes_documentales`, que para eso ya sirve tal cual.
-- ---------------------------------------------------------------------
create table if not exists public.montacargas_documentos (
  id                 bigint generated always as identity primary key,
  idempresa          integer not null,
  equipo_id          bigint  not null,
  tipo               text    not null,        -- certificado, poliza, factura, manual...
  numero             text,
  fecha_expedicion   date,
  fecha_vencimiento  date,
  archivo_url        text,
  archivo_nombre     text,
  observacion        text,
  activo             boolean not null default true,
  created_at         timestamptz not null default now()
);

create index if not exists idx_montacargas_docs_equipo
  on public.montacargas_documentos (equipo_id, activo);
-- Para el aviso de "documentos por vencer".
create index if not exists idx_montacargas_docs_vencimiento
  on public.montacargas_documentos (idempresa, fecha_vencimiento)
  where activo = true and fecha_vencimiento is not null;

comment on table public.montacargas_documentos is
  'Documentos con vigencia de un equipo (certificado de operación, póliza, factura). Producción · Gestión de Montacargas.';

-- ---------------------------------------------------------------------
-- 4) Bitácora de auditoría: nombre legible del módulo
--    (el trigger se adjunta solo por el event trigger de auditoria/04b)
-- ---------------------------------------------------------------------
insert into public.auditoria_modulos (tabla, modulo) values
  ('sst_equipos',            'Producción · Gestión de Montacargas'),
  ('sst_mantenimientos',     'Producción · Gestión de Montacargas'),
  ('montacargas_documentos', 'Producción · Gestión de Montacargas')
on conflict (tabla) do update set modulo = excluded.modulo;

-- ---------------------------------------------------------------------
-- VERIFICACIÓN — correr después y revisar que salga todo
-- ---------------------------------------------------------------------
-- select column_name, data_type
--   from information_schema.columns
--  where table_name = 'sst_equipos'
--    and column_name in ('codigo_qr','alias','capacidad_kg','tipo_energia',
--                        'frecuencia_preventivo_horas','horometro_actual','activo')
--  order by column_name;
--
-- select column_name from information_schema.columns
--  where table_name = 'sst_mantenimientos'
--    and column_name in ('estado_gestion','horometro','solucion','cerrado_por');
--
-- select count(*) as documentos from public.montacargas_documentos;
