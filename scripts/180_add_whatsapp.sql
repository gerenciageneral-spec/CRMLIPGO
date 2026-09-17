-- ============================================================================
-- 180 — MENSAJERÍA POR WHATSAPP
-- ----------------------------------------------------------------------------
-- Bitácora de los mensajes enviados por la API de WhatsApp Business y catálogo
-- de las plantillas aprobadas por Meta.
--
-- POR QUÉ SE GUARDA CADA ENVÍO
-- Cada mensaje de plantilla SE COBRA, y se envía a un número personal. Sin
-- bitácora no hay forma de responder tres preguntas que van a surgir:
--   · ¿le llegó al trabajador el aviso que dice que no recibió?
--   · ¿cuántos mensajes mandamos este mes y cuánto costaron?
--   · ¿por qué falló el envío a este número?
--
-- EL TOKEN NO VIVE AQUÍ. Va en variables de entorno (WHATSAPP_TOKEN), nunca en
-- la base ni en el código: quien tenga ese token puede escribirle a cualquiera
-- en nombre de la empresa.
--
-- Aditivo e idempotente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — PLANTILLAS APROBADAS
-- ----------------------------------------------------------------------------
-- WhatsApp NO permite enviar texto libre a alguien que no escribió primero: hay
-- una ventana de 24 h desde su último mensaje, y fuera de ella solo se pueden
-- enviar plantillas aprobadas por Meta.
--
-- Como los avisos los inicia LIPgo, TODO va por plantilla. Esta tabla guarda
-- cuáles hay y qué espera cada una.

create table if not exists public.whatsapp_plantillas (
  id serial primary key,
  -- Nombre EXACTO registrado en Meta. Es lo que viaja en la llamada a la API.
  nombre text not null unique,
  -- Código de idioma de Meta: es, es_CO, es_MX... Debe coincidir dígito a
  -- dígito con el de la plantilla aprobada o el envío se rechaza.
  idioma text not null default 'es',
  descripcion text,
  -- Para qué sirve, en palabras del negocio.
  uso text,
  /*
   * Las variables, EN ORDEN.
   *
   * WhatsApp no guarda los nombres de las variables: internamente son {{1}},
   * {{2}}, {{3}} por orden de aparición. Acá se guarda el nombre legible de
   * cada posición para que quien arme el mensaje sepa qué va en cada una.
   *
   * Formato: {"header": ["nombrereporte"], "body": ["usuario", "toneladas"]}
   *
   * Si se reordenan las variables en Meta sin actualizar esto, los valores se
   * cruzan: saldría el nombre donde van las toneladas, sin ningún error.
   */
  variables jsonb not null default '{"header": [], "body": []}'::jsonb,
  activa boolean not null default true,
  created_at timestamptz default now()
);

comment on column public.whatsapp_plantillas.variables is
  'Nombres legibles de las variables POR POSICION. WhatsApp usa {{1}},{{2}}... por orden, no por nombre.';


-- ----------------------------------------------------------------------------
-- PASO 2 — BITÁCORA DE ENVÍOS
-- ----------------------------------------------------------------------------

create table if not exists public.whatsapp_mensajes (
  id uuid primary key default gen_random_uuid(),
  idempresa int,

  -- A quién. Se guarda el número tal como se envió (formato E.164 sin el "+")
  -- y, si se conoce, a qué persona corresponde.
  telefono text not null,
  identificacion text,
  nombre text,

  plantilla text,
  idioma text,
  -- Los valores que se sustituyeron, para poder reconstruir el mensaje exacto
  -- que recibió la persona. Sin esto, la bitácora dice que se envió algo pero
  -- no qué decía.
  parametros jsonb,

  /*
   * Estado del mensaje. Los cuatro primeros los reporta Meta por webhook:
   *   enviado    — la API lo aceptó (no significa que haya llegado)
   *   entregado  — llegó al teléfono
   *   leido      — la persona lo abrió
   *   fallido    — Meta lo rechazó o no se pudo entregar
   *   error      — ni siquiera se pudo llamar a la API
   */
  estado text not null default 'enviado',
  -- Id que devuelve Meta. Es la llave para casar los acuses del webhook.
  message_id text,
  error_codigo text,
  error_detalle text,

  -- Qué disparó el mensaje: "prueba", "reporte_toneladas", etc. Permite medir
  -- volumen y costo por flujo.
  origen text,
  enviado_por text,

  created_at timestamptz default now(),
  entregado_at timestamptz,
  leido_at timestamptz
);

-- El webhook llega por message_id: sin índice, cada acuse haría un recorrido
-- completo de la tabla.
create index if not exists idx_wa_message_id
  on public.whatsapp_mensajes (message_id)
  where message_id is not null;
create index if not exists idx_wa_emp_fecha
  on public.whatsapp_mensajes (idempresa, created_at desc);
create index if not exists idx_wa_telefono
  on public.whatsapp_mensajes (telefono, created_at desc);

comment on column public.whatsapp_mensajes.estado is
  'enviado | entregado | leido | fallido | error. "enviado" solo significa que la API lo acepto.';


-- ----------------------------------------------------------------------------
-- PASO 3 — PERMISO
-- ----------------------------------------------------------------------------
-- Enviar un WhatsApp escribe a un número personal en nombre de la empresa, y
-- cada mensaje se cobra. Permiso propio, sin heredar de otro módulo.

alter table public.permisos_usuarios
  add column if not exists whatsapp boolean not null default false;

-- Sin backfill a propósito: NADIE debe poder enviar mensajes hasta que un
-- administrador lo habilite de forma consciente.


-- ----------------------------------------------------------------------------
-- PASO 4 — SEMILLA DE LA PRIMERA PLANTILLA
-- ----------------------------------------------------------------------------
-- La plantilla creada el 2026-09-17. Si el nombre o el idioma en Meta son
-- otros, se corrigen desde la pantalla de configuración.
--
-- OJO con el orden: en el encabezado va el nombre del reporte; en el cuerpo,
-- primero el usuario y después las toneladas. Ese orden es el que WhatsApp
-- traduce a {{1}} y {{2}}.

insert into public.whatsapp_plantillas (nombre, idioma, descripcion, uso, variables)
values (
  'toneladas_del_dia',
  'es',
  'Reporte diario de toneladas procesadas en la operación.',
  'Informa al usuario cuántas toneladas se movieron en el día.',
  '{"header": ["nombrereporte"], "body": ["usuario", "cantidadtoneladas"]}'::jsonb
)
on conflict (nombre) do nothing;


-- ----------------------------------------------------------------------------
-- PASO 5 — VERIFICACIÓN (solo lecturas)
-- ----------------------------------------------------------------------------

-- 5a) Las tablas quedaron creadas.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('whatsapp_plantillas', 'whatsapp_mensajes')
order by table_name;

-- 5b) La plantilla sembrada, con sus variables en orden.
select nombre, idioma, variables, activa
from public.whatsapp_plantillas;

-- 5c) El permiso: debe arrancar en 0. Se otorga desde Gestión de Usuarios.
select count(*) filter (where whatsapp) as pueden_enviar,
       count(*) as total_usuarios
from public.permisos_usuarios;

-- 5d) Arranca sin mensajes.
select count(*) as mensajes from public.whatsapp_mensajes;


-- ----------------------------------------------------------------------------
-- REVERSIÓN
-- ----------------------------------------------------------------------------
--   drop table if exists public.whatsapp_mensajes;
--   drop table if exists public.whatsapp_plantillas;
--   alter table public.permisos_usuarios drop column if exists whatsapp;
