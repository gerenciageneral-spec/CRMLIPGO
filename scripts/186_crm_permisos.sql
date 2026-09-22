-- ============================================================================
-- 186_crm_permisos.sql
-- ----------------------------------------------------------------------------
-- Permisos de los modulos del CRM.
--
-- SE AGREGAN COLUMNAS, NO SE REEMPLAZA EL ESQUEMA. `permisos_usuarios` es la
-- MISMA tabla que usa LIPgo en produccion: un DROP de sus columnas lo rompe al
-- instante. Las columnas operativas quedan huerfanas para el CRM (no estan en
-- su MODULE_PERMISSION_MAP) y eso es basura inocua.
--
-- DEFAULT FALSE EXPLICITO: las columnas viejas de esta tabla tienen DEFAULT
-- TRUE, que es el motivo de que crearUsuario() en lib/user-admin-actions.ts
-- tenga que insertar todos los permisos en false a mano. Un usuario nuevo no
-- puede nacer con acceso a todo. Aqui no se repite ese error.
--
-- Aditivo e idempotente.
-- ============================================================================

alter table public.permisos_usuarios
  -- Inicio
  add column if not exists crm_dashboard              boolean not null default false,
  add column if not exists crm_agenda                 boolean not null default false,
  -- Prospectos
  add column if not exists crm_prospectos             boolean not null default false,
  add column if not exists crm_embudo                 boolean not null default false,
  add column if not exists crm_actividades            boolean not null default false,
  -- Ventas
  add column if not exists crm_cotizaciones           boolean not null default false,
  add column if not exists crm_pedidos                boolean not null default false,
  add column if not exists crm_autorizar_contabilidad boolean not null default false,
  add column if not exists crm_autorizar_gerencia     boolean not null default false,
  -- Clientes
  add column if not exists crm_clientes               boolean not null default false,
  add column if not exists crm_listas_precios         boolean not null default false,
  -- Cartera
  add column if not exists crm_cartera                boolean not null default false,
  add column if not exists crm_pagos                  boolean not null default false,
  add column if not exists crm_comisiones             boolean not null default false,
  -- Inteligencia
  add column if not exists crm_ia_rutas               boolean not null default false,
  add column if not exists crm_ia_oportunidades       boolean not null default false,
  add column if not exists crm_reportes               boolean not null default false,
  -- Configuracion
  add column if not exists crm_productos              boolean not null default false,
  add column if not exists crm_vendedores             boolean not null default false,
  add column if not exists crm_parametros             boolean not null default false,
  add column if not exists crm_usuarios               boolean not null default false,
  add column if not exists crm_auditoria              boolean not null default false;


comment on column public.permisos_usuarios.crm_autorizar_contabilidad is
  'Primera firma del pedido. Separado de gerencia a proposito: la misma persona no puede dar las dos.';
comment on column public.permisos_usuarios.crm_autorizar_gerencia is
  'Segunda firma del pedido. Solo con ambas el pedido viaja a LIPgo.';
comment on column public.permisos_usuarios.crm_usuarios is
  'Crear usuarios, asignar y cambiar contrasenas, otorgar permisos. Es el permiso mas sensible del sistema.';
comment on column public.permisos_usuarios.crm_parametros is
  'Editar los numeros de los que dependen las reglas de negocio (IVA, vigencias, comisiones, tramos de cartera).';


-- ---------------------------------------------------------------------------
-- Semilla: dar todos los permisos del CRM a los usuarios que hoy administran
-- LIPgo, para que alguien pueda entrar al sistema recien creado. Sin esto, el
-- CRM arranca sin un solo usuario capaz de configurarlo.
--
-- El criterio es "quien ya administra usuarios en LIPgo": si tiene esa llave,
-- ya tiene el nivel de acceso mas alto del sistema actual.
-- ---------------------------------------------------------------------------
do $$
declare
  v_afectados int;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='permisos_usuarios'
       and column_name='gestion_usuarios'
  ) then
    update public.permisos_usuarios
       set crm_dashboard = true, crm_agenda = true,
           crm_prospectos = true, crm_embudo = true, crm_actividades = true,
           crm_cotizaciones = true, crm_pedidos = true,
           crm_autorizar_contabilidad = true, crm_autorizar_gerencia = true,
           crm_clientes = true, crm_listas_precios = true,
           crm_cartera = true, crm_pagos = true, crm_comisiones = true,
           crm_ia_rutas = true, crm_ia_oportunidades = true, crm_reportes = true,
           crm_productos = true, crm_vendedores = true, crm_parametros = true,
           crm_usuarios = true, crm_auditoria = true
     where gestion_usuarios = true;

    get diagnostics v_afectados = row_count;
    raise notice 'Permisos del CRM otorgados a % administrador(es)', v_afectados;

    if v_afectados = 0 then
      raise warning 'NINGUN usuario tiene gestion_usuarios: habra que otorgar los permisos crm_* a mano antes de poder entrar.';
    end if;
  else
    raise warning 'No existe la columna gestion_usuarios: otorgar los permisos crm_* manualmente.';
  end if;
end $$;


-- ============================================================================
-- VERIFICACION
-- ============================================================================

-- 1. Las 22 columnas existen y todas con default false (esperado: 22 filas)
select column_name, column_default, is_nullable
  from information_schema.columns
 where table_schema='public' and table_name='permisos_usuarios'
   and column_name like 'crm\_%'
 order by column_name;

-- 2. Al menos un usuario puede administrar el CRM (esperado: >= 1)
select count(*) as administradores_del_crm
  from public.permisos_usuarios where crm_usuarios = true;

-- 3. Quien puede autorizar pedidos hoy
select p.usuario,
       pu.crm_autorizar_contabilidad as contabilidad,
       pu.crm_autorizar_gerencia     as gerencia
  from public.permisos_usuarios pu
  join public.profiles p on p.id = pu.usuario_id
 where pu.crm_autorizar_contabilidad or pu.crm_autorizar_gerencia
 order by p.usuario;


-- ============================================================================
-- REVERSION (comentada)
-- ----------------------------------------------------------------------------
-- Quitar estas columnas NO afecta a LIPgo (no las conoce), pero deja al CRM
-- sin control de acceso: todos sus modulos quedarian invisibles.
--
--   alter table public.permisos_usuarios
--     drop column if exists crm_dashboard,   drop column if exists crm_agenda,
--     drop column if exists crm_prospectos,  drop column if exists crm_embudo,
--     drop column if exists crm_actividades, drop column if exists crm_cotizaciones,
--     drop column if exists crm_pedidos,     drop column if exists crm_autorizar_contabilidad,
--     drop column if exists crm_autorizar_gerencia, drop column if exists crm_clientes,
--     drop column if exists crm_listas_precios,     drop column if exists crm_cartera,
--     drop column if exists crm_pagos,       drop column if exists crm_comisiones,
--     drop column if exists crm_ia_rutas,    drop column if exists crm_ia_oportunidades,
--     drop column if exists crm_reportes,    drop column if exists crm_productos,
--     drop column if exists crm_vendedores,  drop column if exists crm_parametros,
--     drop column if exists crm_usuarios,    drop column if exists crm_auditoria;
-- ============================================================================
