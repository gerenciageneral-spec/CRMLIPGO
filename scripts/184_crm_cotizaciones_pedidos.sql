-- ============================================================================
-- 184_crm_cotizaciones_pedidos.sql
-- ----------------------------------------------------------------------------
-- El ciclo comercial: cotizacion -> pedido -> doble autorizacion -> LIPgo.
--
-- TOCA DINERO Y TOCA PRODUCCION AJENA: el pedido autorizado se proyecta a
-- pedidoscabecera, que es el origen de la cadena de LIPgo (orden de cargue,
-- despacho, facturacion). Leer con calma.
--
-- POR QUE TABLAS PROPIAS Y NO ESCRIBIR DIRECTO EN pedidoscabecera:
--   1. pedidoscabecera no tiene donde guardar etapa, vigencia, version de
--      cotizacion ni comision. Meterlas serian 12 ALTER sobre una tabla que
--      LIPgo lee en decenas de sitios.
--   2. Una cotizacion se edita varias veces antes de cerrarse. Si viviera en
--      pedidoscabecera, cada borrador contaminaria los tableros y las alertas
--      de LIPgo. Un pedido en LIPgo es un compromiso de despacho; una
--      cotizacion no lo es.
--   3. Asi la proyeccion queda como punto de control unico: un solo lugar del
--      CRM escribe en tablas de produccion ajena.
--
-- Aditivo e idempotente.
-- ============================================================================


-- ============================================================================
-- COTIZACIONES
-- ============================================================================

create table if not exists public.crm_cotizaciones (
  id                  bigserial primary key,
  idempresa           int  not null default 1,
  numero              text,                      -- COT-2026-0001, por empresa

  -- Origen: un prospecto puede cotizar antes de ser cliente
  prospecto_id        bigint references public.crm_prospectos(id),
  cliente_id          int,
  bodega_id           int,                       -- sucursal de entrega
  vendedor_id         int,

  -- 'directa' es el requisito de "marcar la venta de forma directa":
  -- se salta el paso de cotizacion y va derecho a pedido.
  tipo_venta          text not null default 'cotizacion'
                      check (tipo_venta in ('cotizacion','directa')),
  forma_pago          text not null default 'contado'
                      check (forma_pago in ('contado','credito')),
  dias_credito        int  not null default 0,
  condicion_pago_id   int,

  fecha_emision       date not null default current_date,
  -- vigencia_dias se COPIA del parametro al emitir, no se lee al consultar:
  -- cambiar el parametro no puede mover el vencimiento de lo ya emitido.
  vigencia_dias       int  not null,
  fecha_vencimiento   date not null,

  estado              text not null default 'borrador'
                      check (estado in ('borrador','enviada','aceptada','rechazada','vencida','convertida')),

  -- Totales. iva_pct se congela igual que la vigencia y por la misma razon.
  subtotal            numeric(14,2) not null default 0,
  descuento_valor     numeric(14,2) not null default 0,
  iva_pct             numeric(6,3)  not null,
  iva_valor           numeric(14,2) not null default 0,
  total               numeric(14,2) not null default 0,
  peso_total          numeric(14,3) not null default 0,

  lista_precio_id     int references public.crm_listas_precios(id),
  requiere_autorizacion_descuento boolean not null default false,

  pdf_url             text,
  version             int not null default 1,
  cotizacion_padre_id bigint references public.crm_cotizaciones(id),

  observaciones       text,
  motivo_rechazo      text,
  crm_pedido_id       bigint,                    -- al convertirse

  creado_por          text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),

  unique (idempresa, numero)
);

comment on column public.crm_cotizaciones.vigencia_dias is
  'Copiada del parametro cotizacion.vigencia_dias EN EL MOMENTO DE EMITIR. Cambiar el parametro no altera las cotizaciones ya emitidas.';
comment on column public.crm_cotizaciones.cotizacion_padre_id is
  'Si es una revision, apunta a la version anterior. Permite ver como evoluciono la negociacion.';
comment on column public.crm_cotizaciones.requiere_autorizacion_descuento is
  'Se marca cuando alguna linea baja del tope parametrizado (descuento.maximo_vendedor).';

create index if not exists ix_crm_cot_estado   on public.crm_cotizaciones (idempresa, estado, fecha_vencimiento);
create index if not exists ix_crm_cot_cliente  on public.crm_cotizaciones (idempresa, cliente_id);
create index if not exists ix_crm_cot_vendedor on public.crm_cotizaciones (idempresa, vendedor_id);


create table if not exists public.crm_cotizacion_detalle (
  id              bigserial primary key,
  idempresa       int not null default 1,
  cotizacion_id   bigint not null references public.crm_cotizaciones(id) on delete cascade,
  linea           int not null,

  producto_id     int,
  producto_nombre text not null,
  categoria       text,
  unidad          text,

  cantidad        numeric(14,3) not null check (cantidad > 0),
  precio_lista    numeric(14,2),                 -- lo que decia la lista
  precio_unitario numeric(14,2) not null check (precio_unitario >= 0),
  descuento_pct   numeric(6,3)  not null default 0,
  descuento_valor numeric(14,2) not null default 0,
  subtotal        numeric(14,2) not null default 0,
  total_linea     numeric(14,2) not null default 0,
  peso            numeric(14,3) not null default 0,

  unique (cotizacion_id, linea)
);

comment on column public.crm_cotizacion_detalle.precio_lista is
  'Precio que resolvio la lista, antes de que el vendedor lo tocara. Comparado con precio_unitario dice cuanto descuento dio.';
comment on column public.crm_cotizacion_detalle.producto_nombre is
  'Texto, no solo id: es lo que viaja a LIPgo, que une por nombre. Y el precio debe quedar congelado aunque el producto se renombre.';


-- ============================================================================
-- PEDIDOS
-- ============================================================================

create table if not exists public.crm_pedidos (
  id                 bigserial primary key,
  idempresa          int  not null default 1,
  numero             text,                       -- CRM-2026-0001

  cotizacion_id      bigint references public.crm_cotizaciones(id),
  cliente_id         int not null,
  bodega_id          int,
  vendedor_id        int,

  fecha              date not null default current_date,
  fecha_programada   date,

  forma_pago         text not null default 'contado'
                     check (forma_pago in ('contado','credito')),
  dias_credito       int  not null default 0,
  condicion_pago_id  int,
  tipo_despacho_id   int,
  orden_compra       text,
  destino            text,
  direccion          text,

  subtotal           numeric(14,2) not null default 0,
  descuento_valor    numeric(14,2) not null default 0,
  iva_pct            numeric(6,3)  not null,
  iva_valor          numeric(14,2) not null default 0,
  total              numeric(14,2) not null default 0,
  peso_total         numeric(14,3) not null default 0,

  estado             text not null default 'borrador'
                     check (estado in ('borrador','pendiente_autorizacion','autorizado_parcial',
                                       'autorizado','rechazado','enviado_lipgo','anulado')),

  -- DOBLE AUTORIZACION -------------------------------------------------------
  -- Se pide la clave compartida del rol (parametrizada, no escrita en el
  -- codigo como hacia LIPgo con "LIP123456"), pero como el usuario ya tiene
  -- sesion abierta se guarda ademas QUIEN autorizo y CUANDO. Con la clave sola
  -- no habria forma de saber quien aprobo un pedido que no debia pasar.
  auth_contabilidad_por    uuid,
  auth_contabilidad_nombre text,
  auth_contabilidad_en     timestamptz,
  auth_contabilidad_nota   text,

  auth_gerencia_por        uuid,
  auth_gerencia_nombre     text,
  auth_gerencia_en         timestamptz,
  auth_gerencia_nota       text,

  rechazado_por      uuid,
  rechazado_nombre   text,
  rechazado_en       timestamptz,
  motivo_rechazo     text,

  -- PUENTE A LIPGO -----------------------------------------------------------
  idpedido_lipgo     int,
  enviado_lipgo_en   timestamptz,
  enviado_lipgo_por  uuid,
  error_lipgo        text,

  pdf_url            text,
  observaciones      text,
  creado_por         text,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),

  unique (idempresa, numero)
);

comment on column public.crm_pedidos.idpedido_lipgo is
  'pedidoscabecera.idpedido una vez proyectado. NULL = todavia no viajo a LIPgo.';
comment on column public.crm_pedidos.error_lipgo is
  'Motivo por el que fallo la proyeccion (tipicamente, un producto cuyo nombre no existe en el catalogo de LIPgo).';

-- Defensa contra doble proyeccion: si dos clics simultaneos en "Enviar a
-- LIPgo" pasaran la validacion de estado, el segundo choca aqui y no se crea
-- un pedido duplicado en produccion.
create unique index if not exists ux_crm_pedidos_lipgo
  on public.crm_pedidos (idpedido_lipgo)
  where idpedido_lipgo is not null;

create index if not exists ix_crm_ped_estado  on public.crm_pedidos (idempresa, estado, fecha desc);
create index if not exists ix_crm_ped_cliente on public.crm_pedidos (idempresa, cliente_id);
-- Para la bandeja "esperando mi firma"
create index if not exists ix_crm_ped_pendientes
  on public.crm_pedidos (idempresa, estado)
  where estado in ('pendiente_autorizacion','autorizado_parcial');


create table if not exists public.crm_pedido_detalle (
  id              bigserial primary key,
  idempresa       int not null default 1,
  pedido_id       bigint not null references public.crm_pedidos(id) on delete cascade,
  linea           int not null,

  producto_id     int,
  producto_nombre text not null,
  categoria       text,
  unidad          text,

  cantidad        numeric(14,3) not null check (cantidad > 0),
  precio_lista    numeric(14,2),
  precio_unitario numeric(14,2) not null check (precio_unitario >= 0),
  descuento_pct   numeric(6,3)  not null default 0,
  descuento_valor numeric(14,2) not null default 0,
  subtotal        numeric(14,2) not null default 0,
  total_linea     numeric(14,2) not null default 0,
  peso            numeric(14,3) not null default 0,

  unique (pedido_id, linea)
);


-- ============================================================================
-- BITACORA DE AUTORIZACIONES
-- ----------------------------------------------------------------------------
-- Append-only: no se edita ni se borra. Es la respuesta a "quien autorizo esto
-- y cuanto valia cuando lo autorizo".
-- ============================================================================

create table if not exists public.crm_autorizaciones_log (
  id                bigserial primary key,
  idempresa         int  not null default 1,
  pedido_id         bigint not null references public.crm_pedidos(id),
  rol               text not null check (rol in ('contabilidad','gerencia')),
  accion            text not null check (accion in ('autorizar','rechazar','revertir','intento_fallido')),
  usuario_id        uuid,
  usuario_nombre    text,
  nota              text,
  total_al_momento  numeric(14,2),
  creado_en         timestamptz not null default now()
);

comment on table public.crm_autorizaciones_log is
  'Historia de las autorizaciones, incluidos los intentos fallidos (clave errada). Solo se agrega.';
comment on column public.crm_autorizaciones_log.total_al_momento is
  'Valor del pedido cuando se autorizo. Si alguien lo modifica despues, queda la evidencia de que se autorizo otra cifra.';

create index if not exists ix_crm_autlog_pedido on public.crm_autorizaciones_log (pedido_id, creado_en desc);


-- ============================================================================
-- CONSECUTIVOS Y TOUCH
-- ============================================================================

create or replace function public.crm_cotizacion_numero() returns trigger
language plpgsql as $$
begin
  if new.numero is null or new.numero = '' then
    new.numero := public.crm_siguiente_consecutivo(new.idempresa, 'cotizacion', 'COT');
  end if;
  return new;
end $$;

drop trigger if exists trg_crm_cot_numero on public.crm_cotizaciones;
create trigger trg_crm_cot_numero
  before insert on public.crm_cotizaciones
  for each row execute function public.crm_cotizacion_numero();

create or replace function public.crm_pedido_numero() returns trigger
language plpgsql as $$
begin
  if new.numero is null or new.numero = '' then
    new.numero := public.crm_siguiente_consecutivo(new.idempresa, 'pedido', 'CRM');
  end if;
  return new;
end $$;

drop trigger if exists trg_crm_ped_numero on public.crm_pedidos;
create trigger trg_crm_ped_numero
  before insert on public.crm_pedidos
  for each row execute function public.crm_pedido_numero();

drop trigger if exists trg_crm_cot_touch on public.crm_cotizaciones;
create trigger trg_crm_cot_touch before update on public.crm_cotizaciones
  for each row execute function public.crm_touch_actualizado();

drop trigger if exists trg_crm_ped_touch on public.crm_pedidos;
create trigger trg_crm_ped_touch before update on public.crm_pedidos
  for each row execute function public.crm_touch_actualizado();


-- ============================================================================
-- VERIFICACION
-- ============================================================================

-- 1. Las tablas existen, con idempresa (esperado: 5 filas, todas 't')
select t.table_name, (c.column_name is not null) as tiene_idempresa
  from information_schema.tables t
  left join information_schema.columns c
    on c.table_schema='public' and c.table_name=t.table_name and c.column_name='idempresa'
 where t.table_schema='public'
   and t.table_name in ('crm_cotizaciones','crm_cotizacion_detalle','crm_pedidos',
                        'crm_pedido_detalle','crm_autorizaciones_log')
 order by t.table_name;

-- 2. El indice anti-duplicado existe (esperado: 1 fila)
select indexname from pg_indexes
 where schemaname='public' and indexname='ux_crm_pedidos_lipgo';

-- 3. Los estados validos quedaron en el CHECK
select conname, pg_get_constraintdef(oid) as definicion
  from pg_constraint
 where conrelid='public.crm_pedidos'::regclass and contype='c'
   and conname like '%estado%';


-- ============================================================================
-- REVERSION (comentada)
-- ----------------------------------------------------------------------------
-- NO deshace lo ya proyectado: los pedidos que viajaron a pedidoscabecera
-- siguen en LIPgo y hay que anularlos alli, con su proceso, no borrando estas
-- tablas. Borrar aqui solo hace perder el rastro de quien los autorizo.
--
--   drop trigger if exists trg_crm_ped_touch  on public.crm_pedidos;
--   drop trigger if exists trg_crm_cot_touch  on public.crm_cotizaciones;
--   drop trigger if exists trg_crm_ped_numero on public.crm_pedidos;
--   drop trigger if exists trg_crm_cot_numero on public.crm_cotizaciones;
--   drop function if exists public.crm_pedido_numero();
--   drop function if exists public.crm_cotizacion_numero();
--   drop table if exists public.crm_autorizaciones_log;
--   drop table if exists public.crm_pedido_detalle;
--   drop table if exists public.crm_pedidos;
--   drop table if exists public.crm_cotizacion_detalle;
--   drop table if exists public.crm_cotizaciones;
-- ============================================================================
