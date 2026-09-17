-- ============================================================================
-- PREFACTURA DE PRODUCCIÓN — extensión de `public.prefacturas`
-- ----------------------------------------------------------------------------
-- Se REUTILIZA la tabla que ya existe (Cuadro de Control de Facturación) en vez
-- de crear una nueva: el ciclo de vida es idéntico (borrador -> aprobada, con
-- soporte congelado en jsonb) y duplicar la tabla obligaría a mantener dos veces
-- el mismo código de guardar/aprobar/eliminar.
--
-- Lo que cambia entre las dos es SOLO de dónde salen las líneas:
--   · 'cuadro_control' -> órdenes de cargue (vista `facturacion`)
--   · 'produccion'     -> Avimol: tonelaje de tolva (Salvado / Estibado PT) +
--                         horas extra por puesto
--                         Indupan: órdenes con tipooperacion Tolva / Tolva f
--
-- Aditivo e idempotente. La tabla estaba VACÍA al momento de este cambio
-- (0 filas), así que el default 'cuadro_control' no reetiqueta nada real.
-- ============================================================================

-- DISCRIMINADOR. Sin esto, listar las prefacturas de Avimol (idempresa 2)
-- devolvería mezcladas las del Cuadro de Control con las de producción.
alter table public.prefacturas
  add column if not exists origen text not null default 'cuadro_control';

-- QUIÉN APROBÓ. El flujo original solo tocaba `updated_at` al cambiar de
-- estado, así que no quedaba rastro de quién aprobó una prefactura que se le
-- cobra a un cliente. Aquí sí se registra.
alter table public.prefacturas
  add column if not exists aprobado_por text;

alter table public.prefacturas
  add column if not exists aprobado_en timestamptz;

-- Acceso real de la pantalla: las prefacturas de un proyecto y un origen,
-- de la más reciente a la más vieja.
create index if not exists idx_prefacturas_origen
  on public.prefacturas (idempresa, origen, created_at desc);

-- Verificación:
--   select column_name from information_schema.columns
--    where table_name = 'prefacturas'
--      and column_name in ('origen','aprobado_por','aprobado_en');
