-- =====================================================================
-- CARGOS FIJOS GENERADOS — un registro por concepto × proyecto × mes,
-- con el MISMO patrón de estado que Gestión de Facturas: lo que de verdad
-- determina "facturado" es `facturasiigo` (la URL del soporte subido), no
-- `estadofactura` (que solo dice si ya se solicitó). Ver
-- lib/facturacion-control-actions.ts:categoriaDeFactura, replicado en
-- lib/cargos-fijos-actions.ts para no crear un tercer criterio.
--
-- `origen_tipo`+`origen_id` apuntan a la fila de configuración
-- (montacargas_alquiler o cargos_fijos_proyecto) de la que nació este
-- cargo del mes, para poder auditar de dónde salió el valor.
--
-- El `unique` evita duplicar el cargo de un mes si se corre la generación
-- dos veces (mismo patrón idempotente que "Registrar Tolva").
-- =====================================================================

create table if not exists public.cargos_fijos_generados (
  id bigint generated always as identity primary key,
  idempresa integer not null,
  origen_tipo text not null check (origen_tipo in ('montacargas', 'proyecto')),
  origen_id bigint not null,
  concepto text not null,
  periodo date not null, -- primer día del mes, ej. 2026-08-01
  valor numeric not null,
  tipo text not null check (tipo in ('ingreso', 'gasto')),
  estadofactura text,
  facturasiigo text,
  creado_en timestamptz not null default now(),
  unique (origen_tipo, origen_id, periodo)
);

create index if not exists cargos_fijos_generados_periodo_idx
  on public.cargos_fijos_generados (idempresa, periodo);

comment on table public.cargos_fijos_generados is
  'Cargo fijo YA GENERADO para un mes concreto, con su propio estado de facturación (facturasiigo manda, igual que Gestión de Facturas).';
