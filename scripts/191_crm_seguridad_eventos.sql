-- ============================================================================
-- 191_crm_seguridad_eventos.sql
-- ----------------------------------------------------------------------------
-- Fase 0 del requerimiento INDUPAN: permisos por rol y bitacora unica.
--
-- 1. PERMISOS NUEVOS en `permisos_usuarios`. El requerimiento define cuatro
--    roles (vendedor, cartera, gerencia, administrador), pero el sistema
--    trabaja con permisos por modulo. No se crea una tabla de roles: un rol es
--    un conjunto de estas casillas, y asi se sigue pudiendo dar a alguien un
--    permiso suelto sin inventar un rol nuevo.
--
--    `crm_ver_todos_clientes` es el que separa a un vendedor de los demas: sin
--    el, un usuario vinculado a un vendedor solo ve los clientes asignados a
--    ese vendedor (RNF-02). Quien no esta vinculado a ningun vendedor
--    (cartera, gerencia) ve todo aunque no lo tenga.
--
--    Mismo criterio del 186: se AGREGAN columnas a la tabla que tambien usa
--    LIPgo, y con DEFAULT FALSE explicito.
--
-- 2. BITACORA UNICA `crm_eventos`. Hasta hoy el unico historial era
--    crm_autorizaciones_log, solo para firmas y nunca mostrado en pantalla. El
--    requerimiento pide historial de pedidos (el "ojito", PED-24), de recaudos,
--    de prospectos y trazabilidad de cartera (CAR-05). Una sola tabla para
--    todo evita cinco historiales con cinco formatos distintos.
--
--    Es de solo insercion: no hay en el codigo ninguna ruta que la actualice
--    ni la borre. Un historial que se puede editar no prueba nada.
--
-- 3. PARAMETRO `seguridad.modo`. Endurecer permisos en un sistema en uso rompe
--    pantallas que hoy funcionan porque nadie validaba nada. En modo `log` la
--    denegacion se registra en crm_eventos y se deja pasar; se revisa que no
--    haya falsos positivos y se pasa a `enforce`.
--
-- Aditivo e idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. PERMISOS
-- ---------------------------------------------------------------------------
alter table public.permisos_usuarios
  add column if not exists crm_ver_todos_clientes  boolean not null default false,
  add column if not exists crm_recaudos_registrar  boolean not null default false,
  add column if not exists crm_recaudos_aprobar    boolean not null default false,
  add column if not exists crm_prospectos_aprobar  boolean not null default false,
  add column if not exists crm_maestros_admin      boolean not null default false,
  add column if not exists crm_importar            boolean not null default false,
  add column if not exists crm_integraciones_admin boolean not null default false,
  add column if not exists crm_descuentos_admin    boolean not null default false;

comment on column public.permisos_usuarios.crm_ver_todos_clientes is
  'Ver clientes, pedidos y cartera de todos los vendedores. Sin el, un usuario vinculado a un vendedor solo ve lo de ese vendedor.';
comment on column public.permisos_usuarios.crm_recaudos_registrar is
  'Reportar un recaudo con su comprobante. Es la unica accion de cartera que tiene el vendedor.';
comment on column public.permisos_usuarios.crm_recaudos_aprobar is
  'Aprobar o rechazar recaudos. Al aprobar se mueven los saldos de las facturas.';
comment on column public.permisos_usuarios.crm_prospectos_aprobar is
  'Aprobar la creacion de un cliente a partir de un prospecto.';
comment on column public.permisos_usuarios.crm_maestros_admin is
  'Administrar maestros: owners, impuestos, bancos, cuentas destino, medios de pago, motivos, destinatarios.';
comment on column public.permisos_usuarios.crm_importar is
  'Cargar archivos CSV o Excel de clientes, sucursales, productos, catalogos y facturas.';
comment on column public.permisos_usuarios.crm_integraciones_admin is
  'Ver la bandeja de integraciones (SAP, LIPgo, WhatsApp), reintentar y descartar envios.';
comment on column public.permisos_usuarios.crm_descuentos_admin is
  'Aplicar descuentos. Segun el requerimiento solo se gestionan desde el panel administrador, nunca desde la venta.';


-- ---------------------------------------------------------------------------
-- 2. BITACORA UNICA
-- ---------------------------------------------------------------------------
create table if not exists public.crm_eventos (
  id             bigserial primary key,
  idempresa      int  not null default 1,
  entidad        text not null
                 check (entidad in ('pedido','cotizacion','recaudo','cuenta','prospecto',
                                    'cliente','documento','integracion','seguridad','importacion')),
  entidad_id     bigint,
  tipo           text not null,
  estado_desde   text,
  estado_hasta   text,
  usuario_id     uuid,
  usuario_nombre text,
  nota           text,
  datos          jsonb not null default '{}'::jsonb,
  creado_en      timestamptz not null default now()
);

create index if not exists ix_crm_eventos_entidad
  on public.crm_eventos (idempresa, entidad, entidad_id, creado_en);
create index if not exists ix_crm_eventos_tipo
  on public.crm_eventos (idempresa, tipo, creado_en desc);

comment on table public.crm_eventos is
  'Historial unico del CRM: pedidos, recaudos, prospectos, cartera, seguridad. Solo insercion. Alimenta el historial de cada documento y la auditoria.';
comment on column public.crm_eventos.tipo is
  'Que paso: creado, editado, solicitado, firmado, rechazado, reenviado, proyectado, error_integracion, acceso_denegado...';

-- Se trae lo que ya habia en el log de firmas, para que el historial de un
-- pedido no empiece en blanco. datos->>'log_id' evita duplicar al re-correr.
insert into public.crm_eventos
  (idempresa, entidad, entidad_id, tipo, usuario_id, usuario_nombre, nota, datos, creado_en)
select l.idempresa, 'pedido', l.pedido_id,
       case l.accion when 'autorizar' then 'firmado'
                     when 'rechazar'  then 'rechazado'
                     else l.accion end,
       l.usuario_id, l.usuario_nombre, l.nota,
       jsonb_build_object('log_id', l.id,
                          'rol', case l.rol when 'contabilidad' then 'cartera' else l.rol end,
                          'total', l.total_al_momento),
       l.creado_en
  from public.crm_autorizaciones_log l
 where not exists (
   select 1 from public.crm_eventos e
    where e.entidad = 'pedido' and e.datos->>'log_id' = l.id::text
 );


-- ---------------------------------------------------------------------------
-- 3. PARAMETROS
-- ---------------------------------------------------------------------------
-- `where not exists` y no `on conflict (…, vigente_desde)`: vigente_desde es
-- la fecha del dia, asi que on conflict solo protege si se corre el mismo dia.
insert into public.crm_parametros
  (idempresa, clave, valor, tipo, grupo, etiqueta, descripcion, editable)
select 1, 'seguridad.modo', 'log', 'string', 'seguridad',
       'Modo de validación de permisos',
       'log = registra en la bitácora cuando alguien intenta algo sin permiso y lo deja pasar. enforce = lo bloquea. Se deja en log mientras se revisa que la validación no bloquee a quien sí debe tener acceso.',
       true
 where not exists (
   select 1 from public.crm_parametros
    where idempresa = 1 and clave = 'seguridad.modo' and vigente_hasta is null
 );


-- ============================================================================
-- VERIFICACION
-- ============================================================================

-- 1. Los 8 permisos nuevos existen (esperado: 8)
select count(*) as permisos_nuevos
  from information_schema.columns
 where table_schema = 'public' and table_name = 'permisos_usuarios'
   and column_name in ('crm_ver_todos_clientes','crm_recaudos_registrar','crm_recaudos_aprobar',
                       'crm_prospectos_aprobar','crm_maestros_admin','crm_importar',
                       'crm_integraciones_admin','crm_descuentos_admin');

-- 2. Ningun usuario quedo con acceso por defecto (esperado: 0)
select count(*) as usuarios_con_permiso_por_defecto
  from public.permisos_usuarios
 where crm_ver_todos_clientes or crm_recaudos_aprobar or crm_integraciones_admin
    or crm_descuentos_admin;

-- 3. El historial de firmas se migro completo (esperado: las dos cifras iguales)
select (select count(*) from public.crm_autorizaciones_log) as filas_log,
       (select count(*) from public.crm_eventos where entidad = 'pedido' and datos ? 'log_id') as migradas;

-- 4. El parametro existe una sola vez (esperado: 1)
select count(*) as seguridad_modo
  from public.crm_parametros where clave = 'seguridad.modo' and vigente_hasta is null;


-- ============================================================================
-- REVERSION (comentada)
-- ----------------------------------------------------------------------------
--   drop table if exists public.crm_eventos;
--   delete from public.crm_parametros where clave = 'seguridad.modo';
--   alter table public.permisos_usuarios
--     drop column if exists crm_ver_todos_clientes,  drop column if exists crm_recaudos_registrar,
--     drop column if exists crm_recaudos_aprobar,    drop column if exists crm_prospectos_aprobar,
--     drop column if exists crm_maestros_admin,      drop column if exists crm_importar,
--     drop column if exists crm_integraciones_admin, drop column if exists crm_descuentos_admin;
-- ============================================================================
