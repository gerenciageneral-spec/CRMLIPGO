-- =====================================================================
-- Notificaciones al personal (WhatsApp / SMS) — tabla de auditoria
-- =====================================================================
-- Registra CADA mensaje enviado (o simulado) a un colaborador: a quien,
-- que se envio, por que canal, en que estado y con que id del proveedor.
-- Sirve como evidencia (SIG) y para reintentos / trazabilidad.
--
-- Reglas del proyecto respetadas:
--   * SQL ADITIVO e IDEMPOTENTE (se corre en el SQL Editor de Supabase
--     las veces que sea sin romper nada).
--   * La tabla queda SIN RLS: la app la lee/escribe con el cliente admin
--     (service_role) desde el servidor. (Leccion SIG: tabla nueva que lee
--     la app va sin RLS o se lee con cliente admin server-side.)
-- =====================================================================

create extension if not exists "uuid-ossp";

create table if not exists notificaciones_enviadas (
  id uuid primary key default uuid_generate_v4(),

  -- Empresa/proyecto al que pertenece el destinatario (1..4, 100=LIP).
  idempresa integer not null,

  -- Agrupa todos los mensajes de un mismo envio masivo ("lote").
  lote_id uuid,

  -- Publico/uso: 'alerta' (aviso libre al personal) | 'turno'
  -- (programacion de turno) | 'conductor' (info a conductores de
  -- citasvehiculos). Texto libre; puede crecer sin migracion.
  tipo text not null default 'alerta',

  -- Canal de salida. Por ahora 'whatsapp'; queda abierto para 'sms'.
  canal text not null default 'whatsapp',

  -- Datos del destinatario (se guardan desnormalizados como evidencia,
  -- para que el registro sea autoexplicativo aunque el colaborador
  -- cambie de celular o se retire despues).
  destinatario_nombre    text,
  destinatario_documento text,
  destinatario_celular   text,

  -- 'texto_libre' o el nombre de la plantilla aprobada en Meta.
  plantilla text,

  -- Mensaje ya renderizado (lo que efectivamente se envio / se veria).
  mensaje text,

  -- Variables usadas para armar la plantilla (nombre, fecha, puesto...).
  variables jsonb,

  -- Ciclo de vida:
  --   'simulado'   -> WHATSAPP_ENABLED=false, no se envio de verdad
  --   'enviado'    -> aceptado por el proveedor
  --   'entregado'  -> confirmado entregado (webhook, futuro)
  --   'leido'      -> confirmado leido (webhook, futuro)
  --   'error'      -> el proveedor rechazo el envio
  --   'sin_celular'-> el colaborador no tiene celular valido
  estado text not null default 'simulado',

  -- Id del mensaje devuelto por el proveedor (wamid de WhatsApp).
  proveedor_msg_id text,

  -- Detalle del error si estado='error'.
  error text,

  -- Quien disparo el envio (email/usuario) y cuando.
  created_by text,
  created_at timestamptz default now()
);

-- Indices para el historial y los reportes.
create index if not exists idx_notif_idempresa  on notificaciones_enviadas (idempresa);
create index if not exists idx_notif_created_at on notificaciones_enviadas (created_at desc);
create index if not exists idx_notif_lote        on notificaciones_enviadas (lote_id);

-- La app lee/escribe con service_role (cliente admin). Sin RLS.
alter table notificaciones_enviadas disable row level security;


-- =====================================================================
-- Permiso del modulo en `permisos_usuarios` (columna por permiso).
-- =====================================================================
-- El modulo "Notificaciones al Personal" queda protegido por el permiso
-- `notificaciones`. Si la columna no existe, /api/user-modules lo trata
-- como "no permitido" para todos y el sidebar lo oculta.
alter table public.permisos_usuarios
  add column if not exists notificaciones boolean not null default false;

-- Hereda el permiso para quienes ya pueden programar turnos: son los
-- mismos que enviarian la programacion / avisos al personal. Ajusta este
-- UPDATE si tu politica es distinta (p.ej. activarlo solo a un rol).
update public.permisos_usuarios
set notificaciones = true
where programacionturnos = true
  and notificaciones = false;
