-- ============================================================================
-- 181_crm_fundacion.sql
-- ----------------------------------------------------------------------------
-- PRIMER script del CRM comercial. Prepara el terreno para todo lo que viene:
--
--   1. Secuencias para pedidoscabecera/pedidosdetalle, porque hoy sus IDs se
--      calculan a mano con MAX(id)+1 y eso es una condicion de carrera.
--   2. Columnas comerciales en tablas que YA EXISTEN y comparte LIPgo
--      (clientes, bodegas, productos).
--   3. La tabla de parametros, que es donde viven todos los numeros de los
--      que depende una regla de negocio.
--
-- TOCA FACTURACION E INVENTARIO INDIRECTAMENTE: pedidoscabecera es el origen
-- de la cadena que termina en orden de cargue y en factura. Las secuencias se
-- agregan de forma que LIPgo siga funcionando EXACTAMENTE igual (ver nota
-- larga abajo). Merece una lectura con calma antes de correrlo.
--
-- Aditivo e idempotente: solo agrega. No borra ni renombra ninguna columna,
-- asi que LIPgo no se entera de nada. Correrlo dos veces no rompe nada.
-- ============================================================================


-- ============================================================================
-- 1. SECUENCIAS PARA LOS IDs DE PEDIDO
-- ----------------------------------------------------------------------------
-- El problema: lib/actions.ts (registerOrder) hace
--     select idpedido from pedidoscabecera order by idpedido desc limit 1
--     nextId = ultimo + 1
-- y lo mismo para pedidosdetalle.transid. Dos usuarios guardando un pedido en
-- el mismo segundo calculan el MISMO id y el segundo choca contra la PK.
-- En cabeceraoc el codigo ya reintenta ante el error 23505, que es la
-- confesion de que la carrera existe y ya se sufrio.
--
-- La solucion, sin tocar el repositorio de LIPgo:
--   - Se crea una secuencia arrancada en MAX(id) y se cuelga como DEFAULT.
--   - LIPgo sigue mandando el id EXPLICITO, y un valor explicito le gana al
--     DEFAULT: para LIPgo no cambia absolutamente nada.
--   - El CRM OMITE la columna al insertar, y entonces actua el DEFAULT.
--
-- EL DETALLE QUE IMPORTA: como LIPgo no consume la secuencia, esta se va
-- quedando atras. Por eso el CRM nunca inserta con nextval() a secas: usa la
-- funcion crm_siguiente_id() de abajo, que primero sincroniza la secuencia
-- con el MAX real de la tabla. Asi conviven los dos sistemas.
-- ============================================================================

do $$
declare
  v_max bigint;
  v_tipo text;
begin
  -- pedidoscabecera.idpedido -------------------------------------------------
  -- Si la columna ya fuera IDENTITY, el SET DEFAULT falla; se detecta antes.
  select a.attidentity into v_tipo
    from pg_attribute a
   where a.attrelid = 'public.pedidoscabecera'::regclass
     and a.attname  = 'idpedido';

  if coalesce(v_tipo, '') = '' then
    select coalesce(max(idpedido), 0) into v_max from public.pedidoscabecera;
    if not exists (select 1 from pg_class where relname = 'pedidoscabecera_idpedido_seq') then
      execute format('create sequence public.pedidoscabecera_idpedido_seq start with %s', greatest(v_max, 1));
    end if;
    perform setval('public.pedidoscabecera_idpedido_seq', greatest(v_max, 1), true);
    alter table public.pedidoscabecera
      alter column idpedido set default nextval('public.pedidoscabecera_idpedido_seq');
    raise notice 'pedidoscabecera.idpedido: secuencia lista en %', v_max;
  else
    raise notice 'pedidoscabecera.idpedido YA es identity (%): no se toca', v_tipo;
  end if;

  -- pedidosdetalle.transid ---------------------------------------------------
  select a.attidentity into v_tipo
    from pg_attribute a
   where a.attrelid = 'public.pedidosdetalle'::regclass
     and a.attname  = 'transid';

  if coalesce(v_tipo, '') = '' then
    select coalesce(max(transid), 0) into v_max from public.pedidosdetalle;
    if not exists (select 1 from pg_class where relname = 'pedidosdetalle_transid_seq') then
      execute format('create sequence public.pedidosdetalle_transid_seq start with %s', greatest(v_max, 1));
    end if;
    perform setval('public.pedidosdetalle_transid_seq', greatest(v_max, 1), true);
    alter table public.pedidosdetalle
      alter column transid set default nextval('public.pedidosdetalle_transid_seq');
    raise notice 'pedidosdetalle.transid: secuencia lista en %', v_max;
  else
    raise notice 'pedidosdetalle.transid YA es identity (%): no se toca', v_tipo;
  end if;
end $$;


-- Sincroniza la secuencia con el MAX real y devuelve el siguiente id.
-- El CRM llama SIEMPRE a esta funcion en vez de nextval() directo, porque
-- LIPgo inserta ids explicitos sin consumir la secuencia y la deja atrasada.
create or replace function public.crm_siguiente_id(p_tabla text, p_columna text)
returns bigint
language plpgsql
as $$
declare
  v_seq  text := format('public.%s_%s_seq', p_tabla, p_columna);
  v_max  bigint;
begin
  execute format('select coalesce(max(%I), 0) from public.%I', p_columna, p_tabla) into v_max;
  -- El tercer argumento en true marca el valor como YA usado, de modo que el
  -- siguiente nextval devuelva v_max + 1.
  perform setval(v_seq, greatest(v_max, 1), true);
  return nextval(v_seq);
end $$;

comment on function public.crm_siguiente_id(text, text) is
  'Siguiente id sincronizando antes la secuencia con el MAX de la tabla. Necesaria porque LIPgo inserta ids explicitos y deja la secuencia atrasada.';


-- ============================================================================
-- 2. COLUMNAS COMERCIALES EN TABLAS COMPARTIDAS
-- ----------------------------------------------------------------------------
-- Estas tablas las usa LIPgo. Solo se AGREGAN columnas, con default, para que
-- ninguna fila existente cambie de sentido y ningun insert de LIPgo falle.
-- ============================================================================

-- CLIENTES: credito, lista de precios y ubicacion para las rutas.
alter table public.clientes
  add column if not exists cupo_credito      numeric(14,2) not null default 0,
  add column if not exists dias_credito      int           not null default 0,
  add column if not exists lista_precio_id   int,
  add column if not exists latitud           numeric(10,7),
  add column if not exists longitud          numeric(10,7),
  add column if not exists bloqueado_cartera boolean       not null default false,
  add column if not exists vendedor_asignado int,
  add column if not exists segmento          text,
  add column if not exists observaciones_crm text;

comment on column public.clientes.cupo_credito is
  'Monto maximo de cartera pendiente. 0 = solo contado. Lo valida el CRM antes de autorizar un pedido a credito.';
comment on column public.clientes.bloqueado_cartera is
  'Bloqueo manual de ventas a credito, independiente del cupo. Lo activa cartera.';
comment on column public.clientes.segmento is
  'Agrupador comercial libre (mayorista, institucional, panaderia...). Alimenta el analisis de oportunidades.';

-- BODEGAS (= sucursales del cliente): GPS del punto de entrega, para rutas.
alter table public.bodegas
  add column if not exists latitud  numeric(10,7),
  add column if not exists longitud numeric(10,7);

comment on column public.bodegas.latitud is
  'Coordenada del punto de entrega. La usa el planificador de rutas del CRM.';

-- PRODUCTOS: solo lo COMERCIAL. Peso, gramaje, estiba y vida util son de
-- LIPgo (los usa produccion e inventario) y el CRM no los toca.
alter table public.productos
  add column if not exists foto_url              text,
  add column if not exists fotos                 jsonb not null default '[]'::jsonb,
  add column if not exists descripcion_comercial text,
  add column if not exists precio_base           numeric(14,2);

comment on column public.productos.foto_url is
  'Foto principal: la que sale en listados, cotizaciones y catalogo.';
comment on column public.productos.fotos is
  'Galeria adicional, array de URLs. Separada de foto_url porque casi toda lectura quiere una sola imagen y no conviene desarmar un jsonb en cada fila.';
comment on column public.productos.precio_base is
  'Precio de lista antes de descuentos. Es la base sobre la que operan las listas de precios del CRM.';


-- ============================================================================
-- 3. PARAMETROS DE NEGOCIO
-- ----------------------------------------------------------------------------
-- Requisito explicito: NADA hardcodeado. Cada numero del que dependa una regla
-- vive aqui y se edita desde el modulo de Parametrizacion.
--
-- POR QUE CLAVE/VALOR Y NO UNA TABLA POR DOMINIO: con una tabla por dominio,
-- cada regla nueva exige un ALTER TABLE y un despliegue, que es el hardcodeo
-- movido de sitio. Aqui agregar un parametro es un INSERT, y la pantalla de
-- Parametrizacion lo dibuja sola leyendo etiqueta/tipo/unidad/min/max.
--
-- El precio a pagar es perder el tipado en la base; se compensa con la columna
-- `tipo`, los rangos min/max y un helper tipado en TypeScript.
--
-- VIGENCIAS: cambiar una comision no puede reescribir la liquidacion del mes
-- pasado. Por eso un parametro no se edita en sitio: se cierra el vigente y se
-- abre uno nuevo. Lo ya liquidado guarda ademas su propio porcentaje.
-- ============================================================================

create table if not exists public.crm_parametros (
  id            serial primary key,
  idempresa     int  not null default 1,
  clave         text not null,
  valor         text not null,
  tipo          text not null default 'number'
                check (tipo in ('number','string','boolean','json','date')),
  grupo         text not null,
  etiqueta      text not null,
  descripcion   text,
  unidad        text,
  min_valor     numeric,
  max_valor     numeric,
  vigente_desde date not null default current_date,
  vigente_hasta date,
  editable      boolean not null default true,
  actualizado_por text,
  actualizado_en  timestamptz not null default now(),
  creado_en       timestamptz not null default now(),
  unique (idempresa, clave, vigente_desde)
);

comment on table public.crm_parametros is
  'Todo numero del que depende una regla de negocio del CRM. Si un valor aparece literal en el codigo y gobierna una regla, es un bug: va aqui.';
comment on column public.crm_parametros.valor is
  'Siempre texto; la columna `tipo` dice como interpretarlo. El helper de TypeScript hace la conversion.';
comment on column public.crm_parametros.vigente_hasta is
  'NULL = vigente. Cambiar un parametro cierra el anterior y abre uno nuevo, para no reescribir el pasado.';
comment on column public.crm_parametros.editable is
  'false para parametros que solo deberia mover un tecnico (ej. limites de integracion).';

-- Solo puede haber UN parametro vigente por clave y empresa. Sin esto, dos
-- filas con vigente_hasta nulo harian que el IVA dependiera del orden de
-- lectura, que es la clase de bug que aparece en la factura del cliente.
create unique index if not exists ux_crm_parametros_vigente
  on public.crm_parametros (idempresa, clave)
  where vigente_hasta is null;

create index if not exists ix_crm_parametros_grupo
  on public.crm_parametros (idempresa, grupo);


-- ---------------------------------------------------------------------------
-- Semilla. Incluye TODO lo que hoy esta hardcodeado en el codigo de LIPgo.
-- El caso mas claro: el IVA del 5% literal en components/order-entry-form.tsx.
-- ---------------------------------------------------------------------------
insert into public.crm_parametros
  (idempresa, clave, valor, tipo, grupo, etiqueta, unidad, min_valor, max_valor, descripcion)
values
  -- Fiscal
  (1,'iva.porcentaje_default','5','number','fiscal','IVA por defecto','%',0,100,
   'Reemplaza el 5% que estaba escrito a mano en el formulario de pedidos. Cada documento guarda ademas el IVA con el que se emitio.'),

  -- Cotizaciones
  (1,'cotizacion.vigencia_dias','15','number','cotizaciones','Vigencia de la cotizacion','dias',1,365,
   'Dias desde la emision hasta el vencimiento. Se copia al documento al emitirlo: cambiarlo no altera las ya emitidas.'),
  (1,'cotizacion.dias_alerta_vencimiento','3','number','cotizaciones','Avisar antes de vencer','dias',0,60,
   'Con cuantos dias de anticipacion aparece la alerta de cotizacion por vencer.'),

  -- Prospectos
  (1,'prospecto.dias_alerta_seguimiento','7','number','prospectos','Alerta de seguimiento','dias',1,180,
   'Dias sin actividad registrada tras los cuales el prospecto aparece en la campana.'),
  (1,'prospecto.dias_sin_gestion_frio','30','number','prospectos','Marcar como frio','dias',1,365,
   'Dias sin gestion tras los cuales el prospecto se considera frio en el tablero.'),
  (1,'visita.radio_validacion_gps','500','number','prospectos','Radio para validar visita','m',50,5000,
   'Distancia maxima entre el GPS capturado y la ubicacion del cliente para dar la visita por presencial.'),

  -- Comisiones
  (1,'comision.porcentaje_default','2.5','number','comisiones','Comision por defecto','%',0,100,
   'Se aplica cuando el vendedor no tiene tasa propia ni hay una regla mas especifica.'),
  (1,'comision.momento_causacion','recaudo','string','comisiones','Cuando se causa la comision',null,null,null,
   'recaudo = cuando el cliente paga | despacho = al entregar | autorizacion = al aprobar el pedido.'),
  (1,'comision.base','subtotal','string','comisiones','Base de calculo',null,null,null,
   'subtotal = sin IVA (lo habitual) | total = con IVA.'),

  -- Cartera
  (1,'cartera.rango_1_hasta','30','number','cartera','Aging: primer tramo','dias',1,365,
   'Limite superior del primer tramo de antiguedad. La vista de aging lee estos tres valores.'),
  (1,'cartera.rango_2_hasta','60','number','cartera','Aging: segundo tramo','dias',1,365,null),
  (1,'cartera.rango_3_hasta','90','number','cartera','Aging: tercer tramo','dias',1,365,null),
  (1,'cartera.dias_alerta_vencimiento','5','number','cartera','Preaviso de vencimiento','dias',0,60,
   'Con cuantos dias de anticipacion avisa la campana que una factura va a vencer.'),
  (1,'cartera.bloquear_por_mora','true','boolean','cartera','Bloquear venta a cliente en mora',null,null,null,
   'Si esta activo, un cliente con mora mayor al umbral no puede recibir pedidos nuevos a credito.'),
  (1,'cartera.dias_mora_bloqueo','15','number','cartera','Dias de mora para bloquear','dias',1,365,null),

  -- Credito
  (1,'credito.validar_cupo','true','boolean','credito','Validar cupo de credito',null,null,null,
   'Si esta activo, no se autoriza un pedido a credito que deje la cartera del cliente por encima de su cupo.'),
  (1,'credito.dias_default','30','number','credito','Plazo por defecto','dias',0,365,
   'Dias de plazo que se proponen al marcar una venta a credito.'),

  -- Descuentos
  (1,'descuento.maximo_vendedor','10','number','descuentos','Descuento maximo sin autorizacion','%',0,100,
   'Hasta aqui el vendedor baja el precio por su cuenta. Por debajo, el documento queda marcado y exige autorizacion.'),

  -- Pedidos y autorizaciones
  (1,'pedido.requiere_doble_autorizacion','true','boolean','pedidos','Exigir gerencia y contabilidad',null,null,null,
   'Si esta activo, un pedido no viaja a LIPgo sin las dos autorizaciones.'),
  (1,'pedido.monto_autorizacion_gerencia','0','number','pedidos','Umbral de gerencia','COP',0,null,
   '0 = gerencia autoriza siempre. Por encima de 0, solo los pedidos que superen ese monto.'),

  -- Rutas
  (1,'ruta.max_paradas_dia','12','number','rutas','Paradas maximas por ruta',null,1,50,
   'Tope de visitas que el planificador pone en una ruta de un dia.'),
  (1,'ruta.velocidad_promedio_kmh','35','number','rutas','Velocidad promedio urbana','km/h',5,120,
   'Se usa para estimar los tiempos de desplazamiento de la ruta propuesta.')
on conflict (idempresa, clave, vigente_desde) do nothing;


-- ============================================================================
-- VERIFICACION (solo lecturas; se puede correr las veces que haga falta)
-- ============================================================================

-- 1. Las secuencias quedaron colgadas como DEFAULT
select 'DEFAULT de idpedido' as verificacion,
       pg_get_expr(d.adbin, d.adrelid) as valor
  from pg_attrdef d
  join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
 where a.attrelid = 'public.pedidoscabecera'::regclass and a.attname = 'idpedido'
union all
select 'DEFAULT de transid',
       pg_get_expr(d.adbin, d.adrelid)
  from pg_attrdef d
  join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
 where a.attrelid = 'public.pedidosdetalle'::regclass and a.attname = 'transid';

-- 2. Las columnas nuevas existen
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and (
     (table_name = 'clientes'  and column_name in ('cupo_credito','dias_credito','lista_precio_id','latitud','longitud','bloqueado_cartera','vendedor_asignado','segmento')) or
     (table_name = 'bodegas'   and column_name in ('latitud','longitud')) or
     (table_name = 'productos' and column_name in ('foto_url','fotos','descripcion_comercial','precio_base'))
   )
 order by table_name, column_name;

-- 3. Los parametros quedaron sembrados (esperado: 22)
select grupo, count(*) as parametros
  from public.crm_parametros
 where idempresa = 1 and vigente_hasta is null
 group by grupo
 order by grupo;

-- 4. Ninguna clave puede tener dos filas vigentes a la vez (esperado: 0 filas)
select clave, count(*)
  from public.crm_parametros
 where idempresa = 1 and vigente_hasta is null
 group by clave
having count(*) > 1;


-- ============================================================================
-- REVERSION (comentada a proposito)
-- ----------------------------------------------------------------------------
-- NO revierte lo que ya ocurrio: los pedidos creados con la secuencia
-- conservan su id, y las fotos ya subidas siguen en el Storage aunque se
-- borre la columna que las apuntaba.
--
-- Quitar el DEFAULT deja a LIPgo funcionando igual (siempre manda el id
-- explicito), pero rompe al CRM, que cuenta con el.
--
--   alter table public.pedidoscabecera alter column idpedido drop default;
--   alter table public.pedidosdetalle  alter column transid  drop default;
--   drop function if exists public.crm_siguiente_id(text, text);
--
--   alter table public.clientes
--     drop column if exists cupo_credito, drop column if exists dias_credito,
--     drop column if exists lista_precio_id, drop column if exists latitud,
--     drop column if exists longitud, drop column if exists bloqueado_cartera,
--     drop column if exists vendedor_asignado, drop column if exists segmento,
--     drop column if exists observaciones_crm;
--   alter table public.bodegas
--     drop column if exists latitud, drop column if exists longitud;
--   alter table public.productos
--     drop column if exists foto_url, drop column if exists fotos,
--     drop column if exists descripcion_comercial, drop column if exists precio_base;
--
--   drop table if exists public.crm_parametros;
-- ============================================================================
