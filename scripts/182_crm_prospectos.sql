-- ============================================================================
-- 182_crm_prospectos.sql
-- ----------------------------------------------------------------------------
-- El embudo comercial: prospectos, sus productos de interes, la bitacora de
-- lo que se hizo con cada uno y la agenda de lo que falta por hacer.
--
-- Todo con idempresa aunque hoy solo opere la empresa 1: la columna es barata
-- ahora y cara despues (agregarla a una tabla con datos obliga a decidir que
-- hacer con lo historico y a revisar cada consulta ya escrita).
--
-- No toca nomina, facturacion ni inventario: son tablas nuevas.
-- Aditivo e idempotente.
-- ============================================================================


-- ============================================================================
-- ETAPAS DEL EMBUDO
-- ----------------------------------------------------------------------------
-- Configurables, no fijas en el codigo: cada empresa arma su embudo. La
-- probabilidad alimenta el pronostico ponderado (un negocio en "Negociacion"
-- vale mas que uno en "Contacto inicial" aunque el monto sea el mismo).
-- ============================================================================

create table if not exists public.crm_etapas (
  id            serial primary key,
  idempresa     int  not null default 1,
  nombre        text not null,
  orden         int  not null,
  probabilidad  numeric(5,2) not null default 0 check (probabilidad between 0 and 100),
  es_ganada     boolean not null default false,
  es_perdida    boolean not null default false,
  color         text,
  activo        boolean not null default true,
  creado_en     timestamptz not null default now(),
  unique (idempresa, nombre)
);

comment on table public.crm_etapas is
  'Etapas del embudo. La probabilidad pondera el pronostico de ventas.';
comment on column public.crm_etapas.es_ganada is
  'Marca la etapa terminal de exito. El prospecto se convierte en cliente al llegar aqui.';

insert into public.crm_etapas (idempresa, nombre, orden, probabilidad, es_ganada, es_perdida, color) values
  (1,'Prospecto',          1,  10, false, false, '#94a3b8'),
  (1,'Contacto inicial',   2,  25, false, false, '#60a5fa'),
  (1,'Calificado',         3,  40, false, false, '#818cf8'),
  (1,'Cotizacion enviada', 4,  60, false, false, '#a78bfa'),
  (1,'Negociacion',        5,  80, false, false, '#fbbf24'),
  (1,'Ganado',             6, 100, true,  false, '#34d399'),
  (1,'Perdido',            7,   0, false, true,  '#f87171')
on conflict (idempresa, nombre) do nothing;


-- ============================================================================
-- PROSPECTOS
-- ----------------------------------------------------------------------------
-- Un potencial cliente. Al ganarse se convierte en fila de `clientes` y queda
-- el enlace en cliente_id, para no perder la historia de como se consiguio.
-- ============================================================================

create table if not exists public.crm_prospectos (
  id                 bigserial primary key,
  idempresa          int  not null default 1,
  codigo             text,                       -- PROS-2026-0001, por empresa

  -- Identificacion
  razon_social       text not null,
  nombre_comercial   text,
  documento          text,
  tipo_documento     text,

  -- Contacto detallado
  contacto_nombre    text,
  contacto_cargo     text,
  contacto_celular   text,
  contacto_telefono  text,
  contacto_email     text,

  -- Ubicacion
  direccion          text,
  barrio             text,
  ciudad             text,
  departamento       text,

  -- GPS del momento de la captura (requisito explicito).
  -- gps_precision_m viene de coords.accuracy del navegador: es lo unico que
  -- distingue un GPS real (5-30 m) de una ubicacion deducida por IP (miles de
  -- metros), que tiene toda la apariencia de un dato bueno y no lo es.
  latitud            numeric(10,7),
  longitud           numeric(10,7),
  gps_precision_m    numeric(8,2),
  gps_capturado_en   timestamptz,

  -- Embudo
  etapa_id           int not null references public.crm_etapas(id),
  vendedor_id        int,
  valor_estimado     numeric(14,2) not null default 0,
  probabilidad_manual numeric(5,2) check (probabilidad_manual between 0 and 100),
  fuente             text,                       -- referido | visita en frio | feria | web

  -- Proximo contacto: alimenta agenda, alerta y tablero
  proxima_accion     text,
  proxima_fecha      date,
  proxima_hora       time,

  -- Cierre
  motivo_perdida     text,
  fecha_cierre       date,
  cliente_id         int,                        -- clientes.id al convertirse
  convertido_en      timestamptz,

  observaciones      text,
  activo             boolean not null default true,
  creado_por         text,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),

  unique (idempresa, codigo)
);

comment on column public.crm_prospectos.gps_precision_m is
  'Exactitud en metros que reporta el navegador. Por encima de ~100 m casi seguro es ubicacion por IP, no GPS: la UI lo advierte.';
comment on column public.crm_prospectos.probabilidad_manual is
  'Si esta, manda sobre la probabilidad de la etapa. Para el caso en que el vendedor sabe algo que el embudo no.';
comment on column public.crm_prospectos.cliente_id is
  'Se llena al ganar el prospecto. Conserva el rastro de como se consiguio el cliente.';

create index if not exists ix_crm_prosp_empresa_etapa on public.crm_prospectos (idempresa, etapa_id) where activo;
create index if not exists ix_crm_prosp_vendedor      on public.crm_prospectos (idempresa, vendedor_id) where activo;
create index if not exists ix_crm_prosp_proxima       on public.crm_prospectos (idempresa, proxima_fecha) where activo;
create index if not exists ix_crm_prosp_cliente       on public.crm_prospectos (cliente_id) where cliente_id is not null;


-- ============================================================================
-- PRODUCTOS DE INTERES
-- ----------------------------------------------------------------------------
-- Que quiere comprar el prospecto y en que cantidad (requisito explicito).
-- Se guarda producto_id Y producto_nombre: el id para relacionar, el nombre
-- porque es lo que LIPgo usa para joinear mas adelante (su modelo une por
-- texto) y porque el prospecto puede pedir algo que aun no esta en el catalogo.
-- ============================================================================

create table if not exists public.crm_prospecto_interes (
  id                bigserial primary key,
  idempresa         int not null default 1,
  prospecto_id      bigint not null references public.crm_prospectos(id) on delete cascade,
  producto_id       int,
  producto_nombre   text not null,
  cantidad          numeric(14,3),
  unidad            text,
  frecuencia        text,                        -- semanal | quincenal | mensual
  precio_referencia numeric(14,2),
  observacion       text,
  creado_en         timestamptz not null default now()
);

comment on column public.crm_prospecto_interes.precio_referencia is
  'Lo que el prospecto dice pagar hoy a su proveedor actual. Es la informacion mas util para armar la propuesta.';

create index if not exists ix_crm_interes_prospecto on public.crm_prospecto_interes (prospecto_id);


-- ============================================================================
-- ACTIVIDADES (bitacora)
-- ----------------------------------------------------------------------------
-- Lo que YA PASO: llamadas, visitas, correos. Sirve a prospectos y a clientes
-- ya convertidos, por eso las dos referencias son opcionales con un CHECK que
-- exige al menos una.
-- ============================================================================

create table if not exists public.crm_actividades (
  id              bigserial primary key,
  idempresa       int not null default 1,
  prospecto_id    bigint references public.crm_prospectos(id) on delete cascade,
  cliente_id      int,

  tipo            text not null,                 -- llamada|visita|correo|whatsapp|reunion|nota
  asunto          text not null,
  detalle         text,
  resultado       text,                          -- exitoso | sin contacto | reprogramar
  fecha_hora      timestamptz not null default now(),
  duracion_min    int,

  -- GPS de la visita: es la evidencia de que se estuvo alli
  latitud         numeric(10,7),
  longitud        numeric(10,7),
  gps_precision_m numeric(8,2),

  vendedor_id     int,
  usuario         text,
  adjunto_url     text,
  creado_en       timestamptz not null default now(),

  constraint crm_act_tiene_referencia
    check (prospecto_id is not null or cliente_id is not null)
);

comment on table public.crm_actividades is
  'Bitacora de lo ocurrido. Es historico: no se edita ni se borra, se agrega.';

create index if not exists ix_crm_act_prospecto on public.crm_actividades (prospecto_id, fecha_hora desc);
create index if not exists ix_crm_act_cliente   on public.crm_actividades (cliente_id, fecha_hora desc);
create index if not exists ix_crm_act_empresa   on public.crm_actividades (idempresa, fecha_hora desc);


-- ============================================================================
-- AGENDA
-- ----------------------------------------------------------------------------
-- Lo que FALTA POR HACER. Separada de crm_actividades a proposito: una es
-- compromiso futuro (se cumple, se reprograma o se cancela) y la otra es hecho
-- consumado. Mezclarlas obliga a filtrar por fecha futura en todas partes y
-- deja sin forma de registrar "se agendo y el cliente no asistio".
-- ============================================================================

create table if not exists public.crm_agenda (
  id                bigserial primary key,
  idempresa         int not null default 1,

  titulo            text not null,
  descripcion       text,
  tipo              text not null default 'visita',

  fecha             date not null,
  hora_inicio       time,
  hora_fin          time,

  prospecto_id      bigint references public.crm_prospectos(id) on delete cascade,
  cliente_id        int,
  vendedor_id       int,
  usuario_asignado  uuid,                        -- profiles.id

  estado            text not null default 'pendiente'
                    check (estado in ('pendiente','cumplida','reprogramada','cancelada')),
  recordatorio_dias int not null default 1,

  -- Al cumplirse se enlaza con la actividad que la documenta
  actividad_id      bigint references public.crm_actividades(id),

  direccion         text,
  latitud           numeric(10,7),
  longitud          numeric(10,7),

  creado_por        text,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);

comment on table public.crm_agenda is
  'Compromisos futuros. Alimenta el calendario, la alerta de la campana y el tablero de proximas visitas.';
comment on column public.crm_agenda.actividad_id is
  'Al marcar cumplida se crea una actividad y se enlaza aqui: el compromiso queda amarrado a su evidencia.';

create index if not exists ix_crm_agenda_fecha    on public.crm_agenda (idempresa, fecha, estado);
create index if not exists ix_crm_agenda_usuario  on public.crm_agenda (usuario_asignado, fecha) where estado = 'pendiente';
create index if not exists ix_crm_agenda_vendedor on public.crm_agenda (idempresa, vendedor_id, fecha);


-- ============================================================================
-- CONSECUTIVOS POR EMPRESA
-- ----------------------------------------------------------------------------
-- Los codigos se numeran POR EMPRESA, no globalmente: si manana entra otra
-- empresa, sus cotizaciones arrancan en 0001 y no continuan la numeracion
-- ajena. El contador vive en su propia tabla para poder bloquear solo esa fila
-- mientras se asigna el numero.
-- ============================================================================

create table if not exists public.crm_consecutivos (
  idempresa   int  not null default 1,
  tipo        text not null,                     -- prospecto | cotizacion | pedido
  anio        int  not null,
  ultimo      int  not null default 0,
  primary key (idempresa, tipo, anio)
);

comment on table public.crm_consecutivos is
  'Contador por empresa, tipo de documento y anio. Se bloquea la fila al asignar para que dos usuarios simultaneos no reciban el mismo numero.';

create or replace function public.crm_siguiente_consecutivo(
  p_idempresa int,
  p_tipo      text,
  p_prefijo   text
) returns text
language plpgsql
as $$
declare
  v_anio  int := extract(year from current_date)::int;
  v_num   int;
begin
  -- El INSERT ... ON CONFLICT DO UPDATE toma el lock de la fila: dos llamadas
  -- simultaneas se serializan y cada una recibe un numero distinto.
  insert into public.crm_consecutivos (idempresa, tipo, anio, ultimo)
  values (p_idempresa, p_tipo, v_anio, 1)
  on conflict (idempresa, tipo, anio)
  do update set ultimo = public.crm_consecutivos.ultimo + 1
  returning ultimo into v_num;

  return format('%s-%s-%s', p_prefijo, v_anio, lpad(v_num::text, 4, '0'));
end $$;

comment on function public.crm_siguiente_consecutivo(int, text, text) is
  'Devuelve el siguiente consecutivo con formato PREFIJO-ANIO-0001, contando por empresa.';


-- Asigna el codigo del prospecto si no viene dado.
create or replace function public.crm_prospecto_codigo() returns trigger
language plpgsql
as $$
begin
  if new.codigo is null or new.codigo = '' then
    new.codigo := public.crm_siguiente_consecutivo(new.idempresa, 'prospecto', 'PROS');
  end if;
  return new;
end $$;

drop trigger if exists trg_crm_prospecto_codigo on public.crm_prospectos;
create trigger trg_crm_prospecto_codigo
  before insert on public.crm_prospectos
  for each row execute function public.crm_prospecto_codigo();


-- Mantiene actualizado_en al dia sin que el codigo tenga que acordarse.
create or replace function public.crm_touch_actualizado() returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

drop trigger if exists trg_crm_prospectos_touch on public.crm_prospectos;
create trigger trg_crm_prospectos_touch
  before update on public.crm_prospectos
  for each row execute function public.crm_touch_actualizado();

drop trigger if exists trg_crm_agenda_touch on public.crm_agenda;
create trigger trg_crm_agenda_touch
  before update on public.crm_agenda
  for each row execute function public.crm_touch_actualizado();


-- ============================================================================
-- VERIFICACION
-- ============================================================================

-- 1. Las 7 etapas sembradas, en orden
select orden, nombre, probabilidad, es_ganada, es_perdida
  from public.crm_etapas where idempresa = 1 order by orden;

-- 2. Las tablas existen y todas tienen idempresa (esperado: 5 filas, todas 't')
select t.table_name,
       (c.column_name is not null) as tiene_idempresa
  from information_schema.tables t
  left join information_schema.columns c
    on c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'idempresa'
 where t.table_schema = 'public'
   and t.table_name in ('crm_etapas','crm_prospectos','crm_prospecto_interes','crm_actividades','crm_agenda')
 order by t.table_name;

-- 3. El consecutivo funciona (devuelve PROS-2026-0001 la primera vez).
--    Descomentar para probar; consume un numero.
-- select public.crm_siguiente_consecutivo(1, 'prospecto', 'PROS');


-- ============================================================================
-- REVERSION (comentada)
-- ----------------------------------------------------------------------------
-- Borra los prospectos capturados y su historia de gestion, que no se puede
-- reconstruir. Las fotos o adjuntos ya subidos siguen en el Storage.
--
--   drop trigger if exists trg_crm_agenda_touch     on public.crm_agenda;
--   drop trigger if exists trg_crm_prospectos_touch on public.crm_prospectos;
--   drop trigger if exists trg_crm_prospecto_codigo on public.crm_prospectos;
--   drop function if exists public.crm_touch_actualizado();
--   drop function if exists public.crm_prospecto_codigo();
--   drop function if exists public.crm_siguiente_consecutivo(int, text, text);
--   drop table if exists public.crm_agenda;
--   drop table if exists public.crm_actividades;
--   drop table if exists public.crm_prospecto_interes;
--   drop table if exists public.crm_prospectos;
--   drop table if exists public.crm_consecutivos;
--   drop table if exists public.crm_etapas;
-- ============================================================================
