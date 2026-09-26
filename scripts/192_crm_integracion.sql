-- ============================================================================
-- 192_crm_integracion.sql
-- ----------------------------------------------------------------------------
-- Fase 0 del requerimiento INDUPAN: la capa de integracion (INT-01 a INT-09).
--
-- EL PRINCIPIO: SAP es OPCIONAL y viene APAGADO. El sistema tiene que
-- funcionar al 100 % sin el, y encenderlo tiene que ser configuracion, no
-- desarrollo.
--
-- PATRON OUTBOX: ningun modulo de negocio llama a SAP directamente. Cuando un
-- pedido se aprueba, el CRM deja un registro en `crm_integracion_outbox` y
-- sigue su camino. Un proceso aparte recorre la bandeja y envia. Asi:
--   - con SAP apagado, el pedido no se bloquea: el registro queda anotado;
--   - si SAP se cae, los envios esperan y se reintentan, no se pierden;
--   - al encender SAP, lo acumulado se puede enviar o descartar desde el panel.
--
-- IDEMPOTENCIA (INT-09): cada registro lleva una llave unica. Si un reintento
-- vuelve a encolar el mismo envio, la llave lo rechaza y SAP no recibe el
-- documento dos veces.
--
-- NOMBRE: el requerimiento la llama `integration_outbox`. Aqui lleva el
-- prefijo `crm_` como todas las tablas del CRM, porque la base es compartida
-- con LIPgo y un nombre generico podria chocar con algo suyo.
--
-- Aditivo e idempotente.
-- ============================================================================

create table if not exists public.crm_integracion_outbox (
  id                 bigserial primary key,
  idempresa          int  not null default 1,
  sistema            text not null check (sistema in ('sap','lipgo','whatsapp','ocr','email')),
  flujo              text not null,
  entidad            text not null,
  entidad_id         bigint,
  operacion          text not null,
  payload            jsonb not null default '{}'::jsonb,
  idempotency_key    text not null,
  estado             text not null default 'pendiente'
                     check (estado in ('pendiente','procesando','enviado','error','omitido','descartado')),
  intentos           int  not null default 0,
  max_intentos       int  not null default 5,
  proximo_intento_en timestamptz not null default now(),
  bloqueado_por      text,
  bloqueado_en       timestamptz,
  ultimo_error       text,
  referencia_externa text,
  respuesta          jsonb,
  creado_por         text,
  creado_en          timestamptz not null default now(),
  enviado_en         timestamptz,
  actualizado_en     timestamptz not null default now(),
  unique (idempresa, idempotency_key)
);

create index if not exists ix_crm_outbox_cola
  on public.crm_integracion_outbox (idempresa, estado, proximo_intento_en)
  where estado in ('pendiente','error');
create index if not exists ix_crm_outbox_entidad
  on public.crm_integracion_outbox (idempresa, entidad, entidad_id);

comment on table public.crm_integracion_outbox is
  'Bandeja de salida hacia sistemas externos (SAP, LIPgo, WhatsApp). Equivale al integration_outbox del requerimiento. Nada de negocio espera a que esto se envie.';
comment on column public.crm_integracion_outbox.estado is
  'pendiente: por enviar. procesando: tomado por el worker. enviado: el sistema externo lo acepto. error: fallo, se reintenta hasta max_intentos. omitido: la integracion estaba apagada al procesarlo. descartado: un administrador decidio no enviarlo.';
comment on column public.crm_integracion_outbox.idempotency_key is
  'Llave unica del envio (ej. sap:pedido:123:v1). Evita que un reintento duplique el documento en el sistema externo.';


create table if not exists public.crm_integracion_log (
  id           bigserial primary key,
  idempresa    int  not null default 1,
  outbox_id    bigint references public.crm_integracion_outbox(id) on delete cascade,
  sistema      text not null,
  modo         text not null check (modo in ('disabled','mock','live')),
  request      jsonb,
  response     jsonb,
  http_status  int,
  duracion_ms  int,
  ok           boolean not null,
  error        text,
  creado_en    timestamptz not null default now()
);

create index if not exists ix_crm_integracion_log_outbox
  on public.crm_integracion_log (idempresa, outbox_id, creado_en desc);

comment on table public.crm_integracion_log is
  'Cada intento de envio con su request, response y error (INT-08). Es lo que se mira cuando SAP rechaza algo.';


-- ---------------------------------------------------------------------------
-- Tomar un lote de la bandeja sin que dos procesos tomen el mismo registro.
-- FOR UPDATE SKIP LOCKED: si otro proceso ya bloqueo una fila, esta la salta
-- en vez de esperar. Asi dos ejecuciones del cron a la vez no envian dos
-- veces lo mismo.
-- ---------------------------------------------------------------------------
create or replace function public.crm_outbox_reclamar(
  p_limite int default 20,
  p_worker text default 'cron'
) returns setof public.crm_integracion_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Un registro "procesando" hace mas de 10 minutos es de un proceso que
  -- murio a medias: se devuelve a la cola para que no quede atascado.
  update public.crm_integracion_outbox
     set estado = 'pendiente', bloqueado_por = null, bloqueado_en = null,
         actualizado_en = now()
   where estado = 'procesando' and bloqueado_en < now() - interval '10 minutes';

  return query
  with lote as (
    select id from public.crm_integracion_outbox
     where estado in ('pendiente','error')
       and intentos < max_intentos
       and proximo_intento_en <= now()
     order by proximo_intento_en, id
     limit p_limite
     for update skip locked
  )
  update public.crm_integracion_outbox o
     set estado = 'procesando', bloqueado_por = p_worker, bloqueado_en = now(),
         actualizado_en = now()
    from lote
   where o.id = lote.id
  returning o.*;
end $$;

comment on function public.crm_outbox_reclamar(int, text) is
  'Reclama un lote de la bandeja de integraciones con FOR UPDATE SKIP LOCKED: dos ejecuciones simultaneas nunca toman el mismo registro.';


-- ---------------------------------------------------------------------------
-- Interruptores por flujo (INT-03). Todos APAGADOS.
-- El modo global (disabled | mock | live) va en la variable de entorno
-- SAP_MODE, no aqui: encender la conexion real a un ERP contable no debe
-- poder hacerse desde una pantalla. Estos parametros deciden que flujos
-- viajan una vez la conexion esta encendida.
-- ---------------------------------------------------------------------------
insert into public.crm_parametros
  (idempresa, clave, valor, tipo, grupo, etiqueta, descripcion, editable)
select 1, v.clave, v.valor, v.tipo, 'integracion', v.etiqueta, v.descripcion, true
  from (values
    ('integracion.sap.pedidos',    'false', 'boolean', 'SAP: enviar pedidos aprobados',
     'Solo aplica a owners marcados para SAP (INDUPAN). Los pedidos de Molinos nunca viajan a SAP.'),
    ('integracion.sap.recaudos',   'false', 'boolean', 'SAP: enviar recaudos aprobados',
     'Con esto apagado los recaudos se aprueban igual y los saldos se actualizan en el CRM.'),
    ('integracion.sap.clientes',   'false', 'boolean', 'SAP: crear clientes nuevos',
     'Al aprobar un prospecto, crear el cliente también en SAP.'),
    ('integracion.sap.facturas',   'false', 'boolean', 'SAP: traer facturas y notas',
     'Con esto apagado las facturas se cargan por importación o se crean desde el pedido.'),
    ('integracion.sap.inventario', 'false', 'boolean', 'SAP: traer inventario',
     'Con esto apagado el inventario se lee del de LIPgo.'),
    ('integracion.sap.sucursales', 'false', 'boolean', 'SAP: traer sucursales de clientes',
     'Con esto apagado las sucursales son las de LIPgo más las importadas.'),
    ('integracion.outbox.max_intentos', '5', 'number', 'Reintentos máximos por envío',
     'Pasado este número el envío queda en error y hay que reintentarlo a mano desde el panel.'),
    ('integracion.outbox.espera_min', '5', 'number', 'Minutos de espera entre reintentos',
     'Se duplica en cada intento: 5, 10, 20, 40… Así un sistema caído no recibe una avalancha al volver.')
  ) as v(clave, valor, tipo, etiqueta, descripcion)
 where not exists (
   select 1 from public.crm_parametros p
    where p.idempresa = 1 and p.clave = v.clave and p.vigente_hasta is null
 );


-- ============================================================================
-- VERIFICACION
-- ============================================================================

-- 1. Tablas y funcion (esperado: 2 tablas, 1 funcion)
select table_name from information_schema.tables
 where table_schema = 'public' and table_name in ('crm_integracion_outbox','crm_integracion_log');
select routine_name from information_schema.routines
 where routine_schema = 'public' and routine_name = 'crm_outbox_reclamar';

-- 2. Todos los interruptores de SAP arrancan apagados (esperado: 0)
select count(*) as flujos_sap_encendidos
  from public.crm_parametros
 where clave like 'integracion.sap.%' and vigente_hasta is null and valor <> 'false';

-- 3. Reclamar sobre la bandeja vacia no falla (esperado: 0 filas)
select count(*) from public.crm_outbox_reclamar(5, 'verificacion');


-- ============================================================================
-- REVERSION (comentada)
-- ----------------------------------------------------------------------------
--   drop function if exists public.crm_outbox_reclamar(int, text);
--   drop table if exists public.crm_integracion_log;
--   drop table if exists public.crm_integracion_outbox;
--   delete from public.crm_parametros where clave like 'integracion.%';
-- ============================================================================
