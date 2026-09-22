-- ============================================================================
-- 188_crm_vendedores.sql
-- ----------------------------------------------------------------------------
-- Informacion comercial detallada del vendedor, y el CIERRE de la fase de
-- datos: la verificacion de que toda tabla crm_* quedo preparada para
-- multiempresa.
--
-- La tabla `vendedores` ya existe y la usa LIPgo (el pedido guarda el nombre
-- del vendedor). No se le agregan columnas: lo comercial va en una tabla
-- aparte 1:1, para que LIPgo no vea cambiar la suya.
--
-- Aditivo e idempotente.
-- ============================================================================

create table if not exists public.crm_vendedores_detalle (
  vendedor_id        int primary key,            -- = vendedores.idvendedor
  idempresa          int  not null default 1,

  -- Vinculo con el login: permite que un vendedor entre al CRM y vea
  -- unicamente sus prospectos, sus cotizaciones y su cartera.
  usuario_id         uuid,

  zona               text,
  ciudad_base        text,
  meta_mensual       numeric(14,2) not null default 0,
  comision_propia    numeric(6,3) check (comision_propia between 0 and 100),

  fecha_ingreso      date,
  fecha_retiro       date,
  telefono           text,
  email              text,
  foto_url           text,

  -- Ubicacion desde donde arrancan sus rutas
  latitud            numeric(10,7),
  longitud           numeric(10,7),

  observaciones      text,
  activo             boolean not null default true,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now()
);

comment on table public.crm_vendedores_detalle is
  'Datos comerciales del vendedor. Tabla aparte de `vendedores` para no modificar una tabla que LIPgo ya usa.';
comment on column public.crm_vendedores_detalle.usuario_id is
  'profiles.id del vendedor. Si esta, el CRM le muestra solo lo suyo.';
comment on column public.crm_vendedores_detalle.comision_propia is
  'Tasa individual. Si es NULL se aplica la regla de crm_reglas_comision que corresponda.';
comment on column public.crm_vendedores_detalle.latitud is
  'Punto de partida de sus rutas. Sin esto, el planificador arranca desde la primera parada.';

create index if not exists ix_crm_vend_usuario on public.crm_vendedores_detalle (usuario_id)
  where usuario_id is not null;
create index if not exists ix_crm_vend_empresa on public.crm_vendedores_detalle (idempresa) where activo;

-- Un usuario no puede ser dos vendedores: sin esto, "mis prospectos" no
-- sabria cual de los dos mostrar.
create unique index if not exists ux_crm_vend_usuario_unico
  on public.crm_vendedores_detalle (usuario_id)
  where usuario_id is not null and activo;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_vend_detalle_fk') then
    alter table public.crm_vendedores_detalle
      add constraint crm_vend_detalle_fk
      foreign key (vendedor_id) references public.vendedores(idvendedor)
      not valid;   -- la tabla vendedores tiene historico; se valida aparte
  end if;
end $$;

drop trigger if exists trg_crm_vend_touch on public.crm_vendedores_detalle;
create trigger trg_crm_vend_touch before update on public.crm_vendedores_detalle
  for each row execute function public.crm_touch_actualizado();


-- Alta de los vendedores que ya existen, para que el modulo no arranque vacio.
--
-- OJO CON `vendedores.activo`: en esta base es TEXT, no boolean, y guarda las
-- cadenas 'true'/'false'. Un coalesce(v.activo, true) falla con
-- "COALESCE types text and boolean cannot be matched", que es justo el error
-- que aparecio al correr este script la primera vez.
--
-- Se castea a texto y se compara contra la lista de valores que significan
-- "si" en las distintas convenciones que conviven en la base: la columna pudo
-- crearse como texto, como boolean o como 'SI'/'NO' segun quien la creara y
-- cuando. Se normaliza aqui, una vez, en lugar de confiar en que siempre sea
-- lo mismo.
insert into public.crm_vendedores_detalle (vendedor_id, idempresa, activo)
select
  v.idvendedor,
  1,
  coalesce(lower(trim(v.activo::text)) in ('true', 't', 'si', 'sí', '1', 'y', 'yes'), true)
  from public.vendedores v
 where not exists (
   select 1 from public.crm_vendedores_detalle d where d.vendedor_id = v.idvendedor
 );


-- ============================================================================
-- VERIFICACION DE LA FASE COMPLETA (scripts 181 a 188)
-- ============================================================================

-- 1. TODA tabla crm_* debe tener idempresa.
--    ESPERADO: CERO FILAS. Si aparece alguna, falta prepararla para
--    multiempresa y hay que corregirlo ANTES de construir sus modulos:
--    agregar la columna despues, con datos dentro, es mucho mas caro.
select t.table_name as tabla_sin_idempresa
  from information_schema.tables t
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name   = t.table_name
   and c.column_name  = 'idempresa'
 where t.table_schema = 'public'
   and t.table_name like 'crm\_%'
   and t.table_type = 'BASE TABLE'
   and c.column_name is null
   -- crm_consecutivos lleva idempresa dentro de su PK compuesta, no suelta
   and t.table_name <> 'crm_consecutivos'
 order by t.table_name;

-- 2. Inventario de lo creado (esperado: 17 tablas crm_*)
select t.table_name,
       (select count(*) from information_schema.columns c
         where c.table_schema='public' and c.table_name=t.table_name) as columnas
  from information_schema.tables t
 where t.table_schema='public' and t.table_name like 'crm\_%' and t.table_type='BASE TABLE'
 order by t.table_name;

-- 3. Las funciones del CRM (esperado: 8)
select routine_name
  from information_schema.routines
 where routine_schema='public' and routine_name like 'crm\_%'
 order by routine_name;

-- 4. Ninguna fila sin empresa en las tablas con datos sembrados
select 'crm_parametros' as tabla, count(*) as filas_sin_empresa
  from public.crm_parametros where idempresa is null
union all select 'crm_etapas', count(*) from public.crm_etapas where idempresa is null
union all select 'crm_listas_precios', count(*) from public.crm_listas_precios where idempresa is null
union all select 'crm_reglas_comision', count(*) from public.crm_reglas_comision where idempresa is null
union all select 'crm_vendedores_detalle', count(*) from public.crm_vendedores_detalle where idempresa is null;

-- 5. CONTROL DE QUE NO SE ROMPIO LIPGO: sus tablas siguen intactas y con datos
select 'pedidoscabecera' as tabla, count(*) as filas from public.pedidoscabecera
union all select 'pedidosdetalle', count(*) from public.pedidosdetalle
union all select 'clientes',       count(*) from public.clientes
union all select 'productos',      count(*) from public.productos;


-- ============================================================================
-- REVERSION (comentada)
-- ============================================================================
--   drop trigger if exists trg_crm_vend_touch on public.crm_vendedores_detalle;
--   drop table if exists public.crm_vendedores_detalle;
-- ============================================================================
