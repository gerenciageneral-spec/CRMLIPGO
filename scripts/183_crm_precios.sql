-- ============================================================================
-- 183_crm_precios.sql
-- ----------------------------------------------------------------------------
-- Listas de precios personalizadas: por producto o para todos, con numeros
-- manuales o con porcentajes de descuento. Desde el panel de clientes se le
-- asigna una lista a cada cliente.
--
-- TOCA DINERO: lo que salga de aqui es lo que se le cobra al cliente en la
-- cotizacion y en el pedido. Merece lectura con calma.
--
-- Aditivo e idempotente.
-- ============================================================================


-- ============================================================================
-- LISTAS
-- ----------------------------------------------------------------------------
-- Tres formas de armar una lista:
--   manual           -> cada producto con su precio escrito a mano
--   descuento_global -> un % sobre el precio base, para todo el catalogo
--   mixta            -> % global + excepciones por producto (la mas usada)
-- ============================================================================

create table if not exists public.crm_listas_precios (
  id               serial primary key,
  idempresa        int  not null default 1,
  nombre           text not null,
  descripcion      text,
  tipo             text not null default 'manual'
                   check (tipo in ('manual','descuento_global','mixta')),
  descuento_global numeric(6,3) not null default 0
                   check (descuento_global between 0 and 100),
  vigente_desde    date not null default current_date,
  vigente_hasta    date,
  es_default       boolean not null default false,
  activo           boolean not null default true,
  creado_por       text,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  unique (idempresa, nombre)
);

comment on table public.crm_listas_precios is
  'Listas de precios por cliente. El precio final lo resuelve una unica funcion en el codigo (resolverPrecio), no cada modulo por su cuenta.';
comment on column public.crm_listas_precios.es_default is
  'Lista que se aplica al cliente que no tiene ninguna asignada.';

-- Solo una lista por defecto por empresa: con dos, el precio del cliente sin
-- lista dependeria del orden de lectura.
create unique index if not exists ux_crm_lista_default
  on public.crm_listas_precios (idempresa)
  where es_default and activo;


-- ============================================================================
-- DETALLE
-- ----------------------------------------------------------------------------
-- El CHECK de exclusividad es deliberado: o precio manual o porcentaje, nunca
-- los dos. Si se permitieran ambos habria que decidir en el codigo cual gana,
-- y esa decision implicita es una fuente garantizada de precios equivocados
-- que solo se descubren cuando el cliente reclama la factura.
-- ============================================================================

create table if not exists public.crm_lista_precio_detalle (
  id              bigserial primary key,
  idempresa       int not null default 1,
  lista_id        int not null references public.crm_listas_precios(id) on delete cascade,
  producto_id     int  not null,
  producto_nombre text,
  precio_manual   numeric(14,2) check (precio_manual >= 0),
  descuento_pct   numeric(6,3)  check (descuento_pct between 0 and 100),
  precio_minimo   numeric(14,2) check (precio_minimo >= 0),
  creado_en       timestamptz not null default now(),

  unique (lista_id, producto_id),

  constraint crm_lpd_uno_u_otro check (
    (precio_manual is not null and descuento_pct is null) or
    (precio_manual is null     and descuento_pct is not null)
  )
);

comment on column public.crm_lista_precio_detalle.precio_minimo is
  'Piso absoluto: ni con el descuento maximo del vendedor se baja de aqui. Es la ultima defensa del margen.';

create index if not exists ix_crm_lpd_lista    on public.crm_lista_precio_detalle (lista_id);
create index if not exists ix_crm_lpd_producto on public.crm_lista_precio_detalle (idempresa, producto_id);


-- La lista asignada al cliente (la columna la creo el script 181).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clientes_lista_precio_fk'
  ) then
    -- NOT VALID: la tabla clientes tiene historico y una validacion completa
    -- podria fallar el script. La restriccion aplica a lo nuevo; lo viejo se
    -- valida aparte con VALIDATE CONSTRAINT cuando se confirme que no hay
    -- huerfanos.
    alter table public.clientes
      add constraint clientes_lista_precio_fk
      foreign key (lista_precio_id) references public.crm_listas_precios(id)
      not valid;
  end if;
end $$;


-- Lista por defecto, para que el sistema tenga con que trabajar desde el dia uno.
insert into public.crm_listas_precios (idempresa, nombre, descripcion, tipo, es_default, creado_por)
values (1, 'General', 'Precio base sin descuento. Se aplica al cliente que no tiene lista asignada.', 'descuento_global', true, 'sistema')
on conflict (idempresa, nombre) do nothing;


drop trigger if exists trg_crm_listas_touch on public.crm_listas_precios;
create trigger trg_crm_listas_touch
  before update on public.crm_listas_precios
  for each row execute function public.crm_touch_actualizado();


-- ============================================================================
-- RESOLUCION DE PRECIO
-- ----------------------------------------------------------------------------
-- Vive en la base y no solo en TypeScript para que el precio sea el mismo lo
-- consulte quien lo consulte: la cotizacion, el pedido, un reporte o una
-- consulta manual. El orden de precedencia es estricto:
--
--   1. precio_manual del detalle          (lo mas especifico manda)
--   2. base menos descuento_pct del detalle
--   3. base menos descuento_global de la lista
--   4. precio base del producto           (sin lista o sin coincidencia)
--   y al final, nunca por debajo de precio_minimo.
-- ============================================================================

create or replace function public.crm_resolver_precio(
  p_idempresa   int,
  p_producto_id int,
  p_lista_id    int
) returns numeric
language plpgsql
stable
as $$
declare
  v_base    numeric(14,2);
  v_det     record;
  v_lista   record;
  v_precio  numeric(14,2);
begin
  select coalesce(precio_base, 0) into v_base
    from public.productos where id = p_producto_id;

  if v_base is null then
    return 0;
  end if;

  if p_lista_id is null then
    return v_base;
  end if;

  select * into v_lista
    from public.crm_listas_precios
   where id = p_lista_id and activo
     and (vigente_hasta is null or vigente_hasta >= current_date);

  if not found then
    return v_base;   -- lista inactiva o vencida: se cobra el base
  end if;

  select * into v_det
    from public.crm_lista_precio_detalle
   where lista_id = p_lista_id and producto_id = p_producto_id;

  if found then
    if v_det.precio_manual is not null then
      v_precio := v_det.precio_manual;
    else
      v_precio := v_base * (1 - v_det.descuento_pct / 100.0);
    end if;

    if v_det.precio_minimo is not null then
      v_precio := greatest(v_precio, v_det.precio_minimo);
    end if;
  else
    v_precio := v_base * (1 - v_lista.descuento_global / 100.0);
  end if;

  return round(v_precio, 2);
end $$;

comment on function public.crm_resolver_precio(int, int, int) is
  'Precio final de un producto para una lista. Fuente unica de verdad: cotizaciones y pedidos llaman aqui, no calculan por su cuenta.';


-- ============================================================================
-- VERIFICACION
-- ============================================================================

-- 1. La lista por defecto existe (esperado: 1 fila, 'General')
select id, nombre, tipo, descuento_global, es_default
  from public.crm_listas_precios where idempresa = 1;

-- 2. El CHECK de exclusividad muerde. Ambas deben FALLAR:
-- insert into public.crm_lista_precio_detalle (lista_id, producto_id, precio_manual, descuento_pct)
--   values (1, 1, 1000, 10);   -- los dos -> error
-- insert into public.crm_lista_precio_detalle (lista_id, producto_id)
--   values (1, 1);             -- ninguno  -> error

-- 3. La funcion responde (sin lista devuelve el precio base del producto).
--    OJO: `productos.activo` es TEXT en esta base y guarda 'true'/'false', no
--    un boolean. Por eso se compara contra texto en vez de usarlo como
--    condicion directa, que fallaria con "argument of WHERE must be boolean".
-- select p.id, p.nombre, p.precio_base,
--        public.crm_resolver_precio(1, p.id, null) as sin_lista,
--        public.crm_resolver_precio(1, p.id, 1)    as lista_general
--   from public.productos p
--  where p.id_empresa = 1
--    and lower(trim(p.activo::text)) in ('true','t','si','1')
--  limit 5;

-- 4. La FK de clientes quedo creada (esperado: 1 fila, convalidated = false)
select conname, convalidated
  from pg_constraint where conname = 'clientes_lista_precio_fk';


-- ============================================================================
-- REVERSION (comentada)
-- ----------------------------------------------------------------------------
-- Borra las listas y sus precios. Las cotizaciones y pedidos YA EMITIDOS no se
-- ven afectados: guardan el precio con el que se emitieron, no una referencia
-- a la lista. Esa es justamente la razon de congelarlo alli.
--
--   drop function if exists public.crm_resolver_precio(int, int, int);
--   alter table public.clientes drop constraint if exists clientes_lista_precio_fk;
--   drop table if exists public.crm_lista_precio_detalle;
--   drop table if exists public.crm_listas_precios;
-- ============================================================================
