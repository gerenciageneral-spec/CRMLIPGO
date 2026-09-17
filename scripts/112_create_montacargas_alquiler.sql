-- =====================================================================
-- ALQUILER DE MONTACARGAS — maestro de costo/facturación por equipo.
--
-- Cada montacarga de `sst_equipos` (tipo='montacargas') se renta a un
-- proveedor. Lo que LIP paga y lo que LIP factura son DOS valores
-- independientes, porque no siempre coinciden:
--
--   · ID1 (Indupan) y ID3 (Funza): se paga el alquiler Y se factura aparte
--     al cliente (valor_facturado > 0).
--   · ID2 (Avimol): se paga el alquiler, pero ese valor va EMBEBIDO en la
--     facturación general del proyecto — no se factura aparte
--     (valor_facturado = NULL).
--   · ID4 (Medellín): no aplica — no tiene montacargas propios en el
--     maestro (confirmado: 0 filas en sst_equipos para id4).
--
-- VIGENCIA por rango de fechas, igual que tarifasoperacion: tanto el pago
-- como la facturación se ajustan una vez al año por IPC. El reajuste se
-- agrega como una fila NUEVA con su propio fechainicio; la fila vieja se
-- cierra con fechafin, sin perder el histórico de lo que se pagó/facturó
-- antes del ajuste.
--
-- Se referencia sst_equipos (no se duplica el maestro de equipos): el
-- proyecto de cada fila sale de sst_equipos.idempresa.
-- =====================================================================

create table if not exists public.montacargas_alquiler (
  id bigint generated always as identity primary key,
  equipo_id bigint not null references public.sst_equipos(id),
  proveedor text not null,
  valor_pagado numeric not null,
  -- NULL = no se factura aparte (caso ID2): el costo sigue contando como
  -- gasto de LIP, pero no genera un ingreso reconocido en el Estado de
  -- Resultados.
  valor_facturado numeric,
  fechainicio date not null,
  fechafin date not null,
  creado_en timestamptz not null default now(),
  constraint montacargas_alquiler_vigencia_chk check (fechafin >= fechainicio)
);

create index if not exists montacargas_alquiler_equipo_idx
  on public.montacargas_alquiler (equipo_id, fechainicio);

comment on table public.montacargas_alquiler is
  'Costo y facturación mensual de alquiler de montacargas, por equipo y vigencia. Se ajusta anual por IPC.';
comment on column public.montacargas_alquiler.valor_facturado is
  'NULL = este proyecto NO factura el alquiler aparte (va embebido en la facturación general, caso ID2).';

-- =====================================================================
-- Semilla — PENDIENTE: reemplazar 0 por el valor real pagado/facturado
-- por equipo y proveedor. Se deja la fila creada con placeholders para
-- que el módulo nuevo ya tenga qué mostrar; edítala desde la UI de
-- Cargos Fijos o corriendo un UPDATE directo.
-- =====================================================================
insert into public.montacargas_alquiler (equipo_id, proveedor, valor_pagado, valor_facturado, fechainicio, fechafin)
select e.id, 'Por definir', 0, case when e.idempresa = 2 then null else 0 end, '2026-01-01', '2026-12-31'
  from public.sst_equipos e
 where e.tipo = 'montacargas'
   and e.activo = true
   and e.idempresa in (1, 2, 3)
 order by e.idempresa, e.identificacion;

-- Verificación: debe dar 6 filas (2 por proyecto en id1/2/3, 0 en id4).
select m.id, e.idempresa, e.identificacion, m.proveedor, m.valor_pagado, m.valor_facturado
  from public.montacargas_alquiler m
  join public.sst_equipos e on e.id = m.equipo_id
 order by e.idempresa, e.identificacion;
