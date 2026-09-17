-- ============================================================================
-- CICLO DE FACTURACIÓN — anexo enviado → anexo firmado → factura enviada →
-- factura firmada → cierre, más CARTERA/COBRO (arranca en el cierre).
-- ----------------------------------------------------------------------------
-- Hoy una prefactura llega a `estado = 'aprobada'` y ahí termina todo rastro:
-- nadie sabe si el anexo se le envió al cliente, si lo firmó, si ya se le
-- mandó la factura real, si el cliente la firmó, ni si pagó. Este script
-- agrega ambas capas encima del ciclo de vida que ya existe
-- (borrador -> aprobada), sin tocarlo:
--
--   1) CICLO DOCUMENTAL (`estado_ciclo` + `prefactura_ciclo_eventos`):
--      pendiente_anexo -> pendiente_firma_anexo -> pendiente_factura ->
--      pendiente_firma_factura -> pendiente_cierre -> cerrado.
--      `prefactura_ciclo_eventos` es un log APPEND-ONLY: nunca se borra ni se
--      sobreescribe, para que una corrección quede registrada (no oculta) --
--      la fila más reciente de cada tipo de evento es la vigente.
--
--   2) CARTERA/COBRO (`dias_plazo`/`fecha_vencimiento`/`estado_cobro` +
--      `prefactura_pagos` + `condiciones_pago_owner`): arranca en el momento
--      del CIERRE (paso 5), no en la aprobación -- solo cuando la factura ya
--      fue firmada por el cliente tiene sentido empezar a contar el plazo de
--      pago. `valor_pagado`/`estado_cobro`/`fecha_ultimo_pago` son CACHÉ,
--      recalculados por cada abono en `prefactura_pagos` (para listar cartera
--      rápido sin sumar pagos en cada carga).
--
-- Aditivo e idempotente (seguro de re-correr).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) CICLO DOCUMENTAL
-- ----------------------------------------------------------------------------

alter table public.prefacturas
  add column if not exists estado_ciclo text not null default 'pendiente_anexo';

do $$ begin
  alter table public.prefacturas
    add constraint prefacturas_estado_ciclo_chk
    check (estado_ciclo in (
      'pendiente_anexo', 'pendiente_firma_anexo', 'pendiente_factura',
      'pendiente_firma_factura', 'pendiente_cierre', 'cerrado'
    ));
exception when duplicate_object then null;
end $$;

alter table public.prefacturas
  add column if not exists ciclo_actualizado_en timestamptz;

create table if not exists public.prefactura_ciclo_eventos (
  id bigserial primary key,
  prefactura_id bigint not null references public.prefacturas(id) on delete cascade,
  evento text not null,
  archivo_url text,
  archivo_nombre text,
  usuario text not null,
  nota text,
  created_at timestamptz default now()
);

do $$ begin
  alter table public.prefactura_ciclo_eventos
    add constraint prefactura_ciclo_eventos_evento_chk
    check (evento in (
      'anexo_enviado', 'anexo_firmado', 'factura_enviada', 'factura_firmada',
      'cierre', 'correccion_solicitada'
    ));
exception when duplicate_object then null;
end $$;

create index if not exists idx_prefactura_ciclo_eventos_prefactura
  on public.prefactura_ciclo_eventos (prefactura_id, created_at);

-- ----------------------------------------------------------------------------
-- 2) CARTERA / COBRO
-- ----------------------------------------------------------------------------

alter table public.prefacturas
  add column if not exists dias_plazo integer;

alter table public.prefacturas
  add column if not exists fecha_vencimiento date;

-- Referencia libre al número/soporte de la factura real de Siigo -- mismo
-- espíritu que cabeceraoc.facturasiigo, pero a nivel de PREFACTURA.
alter table public.prefacturas
  add column if not exists numero_factura_siigo text;

alter table public.prefacturas
  add column if not exists valor_pagado numeric not null default 0;

alter table public.prefacturas
  add column if not exists estado_cobro text not null default 'pendiente';

do $$ begin
  alter table public.prefacturas
    add constraint prefacturas_estado_cobro_chk
    check (estado_cobro in ('pendiente', 'parcial', 'pagada'));
exception when duplicate_object then null;
end $$;

alter table public.prefacturas
  add column if not exists fecha_ultimo_pago date;

-- HISTORIAL DE PAGOS/ABONOS. Tabla aparte (no un solo campo fecha_pago) porque
-- un owner puede pagar una factura en varios abonos.
create table if not exists public.prefactura_pagos (
  id bigserial primary key,
  prefactura_id bigint not null references public.prefacturas(id) on delete cascade,
  fecha date not null,
  valor numeric not null check (valor > 0),
  observacion text,
  usuario text,
  created_at timestamptz default now()
);

create index if not exists idx_prefactura_pagos_prefactura
  on public.prefactura_pagos (prefactura_id);

-- CONDICIÓN DE PAGO POR OWNER. Configurable (no hardcodeada). Default 30 días
-- para cualquier owner sin fila propia.
create table if not exists public.condiciones_pago_owner (
  owner text primary key,
  dias_plazo integer not null default 30,
  activo boolean not null default true
);

-- Acceso real de la pantalla de Ciclo/Cartera: primero lo más urgente.
create index if not exists idx_prefacturas_ciclo
  on public.prefacturas (estado, estado_ciclo, ciclo_actualizado_en);

create index if not exists idx_prefacturas_cobro
  on public.prefacturas (estado, estado_cobro, fecha_vencimiento);

-- Verificación:
--   select column_name from information_schema.columns
--    where table_name = 'prefacturas'
--      and column_name in ('estado_ciclo','ciclo_actualizado_en','dias_plazo',
--                           'fecha_vencimiento','numero_factura_siigo',
--                           'valor_pagado','estado_cobro','fecha_ultimo_pago');
--   select * from public.prefactura_ciclo_eventos limit 5;
--   select * from public.prefactura_pagos limit 5;
--   select * from public.condiciones_pago_owner;
