-- ============================================================================
-- 185_crm_cartera_comisiones.sql
-- ----------------------------------------------------------------------------
-- Cuentas por cobrar con antiguedad (aging) y comisiones de vendedores.
--
-- TOCA DINERO: de aqui sale lo que se le cobra al cliente y lo que se le paga
-- al vendedor. Leer con calma.
--
-- Decision de origen (acordada con el negocio): la cuenta por cobrar nace del
-- PEDIDO DEL CRM autorizado a credito, no de la factura de Siigo. Cuando
-- contabilidad cargue el numero de factura, se guarda en numero_factura, pero
-- la cartera ya existia desde la autorizacion.
--
-- Aditivo e idempotente.
-- ============================================================================


-- ============================================================================
-- CUENTAS POR COBRAR
-- ============================================================================

create table if not exists public.crm_cuentas_cobrar (
  id                bigserial primary key,
  idempresa         int  not null default 1,
  cliente_id        int  not null,
  pedido_id         bigint references public.crm_pedidos(id),
  idpedido_lipgo    int,

  numero_factura    text,                        -- de Siigo, cuando exista
  fecha_factura     date not null default current_date,
  fecha_vencimiento date not null,

  valor_original    numeric(14,2) not null check (valor_original > 0),
  valor_abonado     numeric(14,2) not null default 0 check (valor_abonado >= 0),

  -- Columna GENERADA, no mantenida a mano. Un UPDATE olvidado en una columna
  -- normal deja cartera fantasma que nadie detecta hasta que el cliente
  -- reclama. Aqui el saldo no puede desincronizarse por construccion.
  saldo             numeric(14,2) generated always as (valor_original - valor_abonado) stored,

  estado            text not null default 'pendiente'
                    check (estado in ('pendiente','parcial','pagada','anulada','incobrable')),

  vendedor_id       int,
  observaciones     text,
  creado_por        text,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);

comment on table public.crm_cuentas_cobrar is
  'Cartera. Nace con el pedido autorizado a credito; el numero de factura de Siigo se agrega despues.';
comment on column public.crm_cuentas_cobrar.saldo is
  'GENERADA: valor_original - valor_abonado. No se actualiza a mano, no puede quedar inconsistente.';

create index if not exists ix_crm_cxc_cliente on public.crm_cuentas_cobrar (idempresa, cliente_id, estado);
create index if not exists ix_crm_cxc_venc    on public.crm_cuentas_cobrar (idempresa, fecha_vencimiento)
  where estado in ('pendiente','parcial');
create index if not exists ix_crm_cxc_pedido  on public.crm_cuentas_cobrar (pedido_id);


-- ============================================================================
-- PAGOS
-- ============================================================================

create table if not exists public.crm_pagos (
  id               bigserial primary key,
  idempresa        int not null default 1,
  cuenta_cobrar_id bigint not null references public.crm_cuentas_cobrar(id) on delete cascade,
  fecha_pago       date not null default current_date,
  valor            numeric(14,2) not null check (valor > 0),
  medio_pago       text,                         -- efectivo|transferencia|cheque|consignacion
  referencia       text,
  soporte_url      text,
  observacion      text,
  registrado_por   text,
  creado_en        timestamptz not null default now()
);

create index if not exists ix_crm_pagos_cuenta on public.crm_pagos (cuenta_cobrar_id, fecha_pago);


-- El abono es la UNICA fuente de verdad del saldo: cada insert, update o
-- delete de un pago recalcula la cuenta. Asi no hay forma de que el abonado
-- diga una cosa y la suma de pagos otra.
create or replace function public.crm_recalcular_cxc() returns trigger
language plpgsql
as $$
declare
  v_cuenta bigint;
  v_total  numeric(14,2);
  v_orig   numeric(14,2);
begin
  v_cuenta := coalesce(new.cuenta_cobrar_id, old.cuenta_cobrar_id);

  select coalesce(sum(valor), 0) into v_total
    from public.crm_pagos where cuenta_cobrar_id = v_cuenta;

  select valor_original into v_orig
    from public.crm_cuentas_cobrar where id = v_cuenta;

  update public.crm_cuentas_cobrar
     set valor_abonado  = v_total,
         estado = case
                    when estado in ('anulada','incobrable') then estado  -- no resucitar
                    when v_total >= v_orig then 'pagada'
                    when v_total > 0       then 'parcial'
                    else 'pendiente'
                  end,
         actualizado_en = now()
   where id = v_cuenta;

  return null;
end $$;

drop trigger if exists trg_crm_pagos_recalcular on public.crm_pagos;
create trigger trg_crm_pagos_recalcular
  after insert or update or delete on public.crm_pagos
  for each row execute function public.crm_recalcular_cxc();


-- ============================================================================
-- AGING
-- ----------------------------------------------------------------------------
-- Los tramos NO estan escritos aqui: se leen de crm_parametros. Cambiar
-- cartera.rango_1_hasta en la pantalla de Parametrizacion reclasifica el aging
-- sin tocar una linea de codigo ni volver a desplegar.
-- ============================================================================

create or replace view public.crm_cartera_aging as
with p as (
  select
    idempresa,
    max(case when clave = 'cartera.rango_1_hasta' then valor::int end) as r1,
    max(case when clave = 'cartera.rango_2_hasta' then valor::int end) as r2,
    max(case when clave = 'cartera.rango_3_hasta' then valor::int end) as r3
  from public.crm_parametros
  where vigente_hasta is null
  group by idempresa
)
select
  c.id,
  c.idempresa,
  c.cliente_id,
  cl.nombre                       as cliente_nombre,
  c.pedido_id,
  c.numero_factura,
  c.fecha_factura,
  c.fecha_vencimiento,
  c.valor_original,
  c.valor_abonado,
  c.saldo,
  c.estado,
  c.vendedor_id,
  (current_date - c.fecha_vencimiento) as dias_vencido,
  case
    when current_date <= c.fecha_vencimiento                       then 'Corriente'
    when current_date - c.fecha_vencimiento <= coalesce(p.r1, 30)  then format('1-%s',   coalesce(p.r1,30))
    when current_date - c.fecha_vencimiento <= coalesce(p.r2, 60)  then format('%s-%s',  coalesce(p.r1,30)+1, coalesce(p.r2,60))
    when current_date - c.fecha_vencimiento <= coalesce(p.r3, 90)  then format('%s-%s',  coalesce(p.r2,60)+1, coalesce(p.r3,90))
    else format('Mas de %s', coalesce(p.r3, 90))
  end as tramo_aging,
  case
    when current_date <= c.fecha_vencimiento                      then 0
    when current_date - c.fecha_vencimiento <= coalesce(p.r1, 30) then 1
    when current_date - c.fecha_vencimiento <= coalesce(p.r2, 60) then 2
    when current_date - c.fecha_vencimiento <= coalesce(p.r3, 90) then 3
    else 4
  end as tramo_orden
from public.crm_cuentas_cobrar c
left join p  on p.idempresa = c.idempresa
left join public.clientes cl on cl.id = c.cliente_id
where c.estado in ('pendiente','parcial');

comment on view public.crm_cartera_aging is
  'Cartera pendiente clasificada por antiguedad. Los tramos salen de crm_parametros: cambiarlos alli reclasifica todo sin desplegar.';


-- ============================================================================
-- COMISIONES
-- ============================================================================

-- Reglas: de lo general a lo particular. Gana la de mayor prioridad entre las
-- vigentes que apliquen.
create table if not exists public.crm_reglas_comision (
  id             serial primary key,
  idempresa      int  not null default 1,
  nombre         text not null,
  ambito         text not null check (ambito in ('global','vendedor','categoria','producto','cliente')),
  ambito_valor   text,                           -- null si global
  porcentaje     numeric(6,3) not null check (porcentaje between 0 and 100),
  base           text not null default 'subtotal' check (base in ('subtotal','total')),
  momento        text not null default 'recaudo' check (momento in ('recaudo','despacho','autorizacion')),
  monto_minimo   numeric(14,2) not null default 0,
  vigente_desde  date not null default current_date,
  vigente_hasta  date,
  prioridad      int  not null default 0,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now()
);

comment on column public.crm_reglas_comision.prioridad is
  'Ante varias reglas aplicables gana la de mayor prioridad. Permite excepciones sin borrar la regla general.';
comment on column public.crm_reglas_comision.momento is
  'Cuando se causa: recaudo (al pagar el cliente), despacho o autorizacion. El valor por defecto sale del parametro comision.momento_causacion.';

create index if not exists ix_crm_reglas_com on public.crm_reglas_comision (idempresa, ambito, activo);


create table if not exists public.crm_comisiones (
  id               bigserial primary key,
  idempresa        int  not null default 1,
  vendedor_id      int  not null,
  pedido_id        bigint references public.crm_pedidos(id),
  cuenta_cobrar_id bigint references public.crm_cuentas_cobrar(id),
  regla_id         int references public.crm_reglas_comision(id),

  periodo          text not null,                -- '2026-09'
  base_calculo     numeric(14,2) not null,
  -- CONGELADO al liquidar: si se leyera de la regla vigente, cambiar la tasa
  -- reescribiria el pasado y el vendedor cobraria distinto de lo liquidado.
  porcentaje       numeric(6,3)  not null,
  valor            numeric(14,2) not null,

  estado           text not null default 'pendiente'
                   check (estado in ('pendiente','aprobada','pagada','anulada')),
  liquidado_por    text,
  liquidado_en     timestamptz,
  observaciones    text,
  creado_en        timestamptz not null default now()
);

comment on column public.crm_comisiones.porcentaje is
  'Tasa con la que se liquido, copiada de la regla. Es un hecho historico: no se recalcula.';

create index if not exists ix_crm_com_vendedor on public.crm_comisiones (idempresa, vendedor_id, periodo);
create index if not exists ix_crm_com_estado   on public.crm_comisiones (idempresa, estado);

-- Una comision por vendedor y cuenta por cobrar: evita liquidar dos veces el
-- mismo recaudo si alguien corre el proceso dos veces.
create unique index if not exists ux_crm_com_cuenta
  on public.crm_comisiones (vendedor_id, cuenta_cobrar_id)
  where cuenta_cobrar_id is not null;


-- Regla general inicial, tomando el porcentaje del parametro.
insert into public.crm_reglas_comision (idempresa, nombre, ambito, porcentaje, base, momento, prioridad)
select 1, 'General', 'global',
       coalesce((select valor::numeric from public.crm_parametros
                  where idempresa=1 and clave='comision.porcentaje_default' and vigente_hasta is null), 2.5),
       coalesce((select valor from public.crm_parametros
                  where idempresa=1 and clave='comision.base' and vigente_hasta is null), 'subtotal'),
       coalesce((select valor from public.crm_parametros
                  where idempresa=1 and clave='comision.momento_causacion' and vigente_hasta is null), 'recaudo'),
       0
where not exists (
  select 1 from public.crm_reglas_comision where idempresa=1 and nombre='General'
);


drop trigger if exists trg_crm_cxc_touch on public.crm_cuentas_cobrar;
create trigger trg_crm_cxc_touch before update on public.crm_cuentas_cobrar
  for each row execute function public.crm_touch_actualizado();


-- ============================================================================
-- VERIFICACION
-- ============================================================================

-- 1. Tablas creadas con idempresa (esperado: 4 filas, todas 't')
select t.table_name, (c.column_name is not null) as tiene_idempresa
  from information_schema.tables t
  left join information_schema.columns c
    on c.table_schema='public' and c.table_name=t.table_name and c.column_name='idempresa'
 where t.table_schema='public'
   and t.table_name in ('crm_cuentas_cobrar','crm_pagos','crm_comisiones','crm_reglas_comision')
 order by t.table_name;

-- 2. saldo es columna GENERADA (esperado: is_generated = ALWAYS)
select column_name, is_generated, generation_expression
  from information_schema.columns
 where table_schema='public' and table_name='crm_cuentas_cobrar' and column_name='saldo';

-- 3. La vista de aging responde
select * from public.crm_cartera_aging limit 5;

-- 4. La regla general quedo sembrada (esperado: 1 fila)
select nombre, ambito, porcentaje, base, momento from public.crm_reglas_comision where idempresa=1;


-- ============================================================================
-- REVERSION (comentada)
-- ----------------------------------------------------------------------------
-- Borra la cartera y los pagos registrados, que es informacion contable: si ya
-- se recibio plata y se registro aqui, esto la pierde. Exportar antes.
--
--   drop trigger if exists trg_crm_cxc_touch       on public.crm_cuentas_cobrar;
--   drop trigger if exists trg_crm_pagos_recalcular on public.crm_pagos;
--   drop function if exists public.crm_recalcular_cxc();
--   drop view  if exists public.crm_cartera_aging;
--   drop table if exists public.crm_comisiones;
--   drop table if exists public.crm_reglas_comision;
--   drop table if exists public.crm_pagos;
--   drop table if exists public.crm_cuentas_cobrar;
-- ============================================================================
