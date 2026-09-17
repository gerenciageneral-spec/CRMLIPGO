-- =====================================================================
-- Campo `facturar` en cabeceraoc: decisión de Picking/Packing para NO cobrar una
-- orden cuando LIP no prestó el servicio.
--   · CARGUE en Picking      → se desmarca si el personal que carga NO es de LIP.
--   · DISTRIBUCIÓN en Packing → se desmarca si el conductor va solo (sin auxiliares).
--   · null / true  → SÍ se factura (por defecto encendido)
--   · false        → NO se factura (no aparece en Gestión de Facturas)
-- Aditivo e idempotente.
-- =====================================================================

alter table public.cabeceraoc
  add column if not exists facturar boolean;

-- Registro/auditoría de los cambios del check "Facturar" (sobre todo las
-- DESACTIVACIONES) para análisis posterior: quién, cuándo, qué orden y por qué.
create table if not exists public.facturar_registro (
  id bigserial primary key,
  orden_id int,
  ordendecargue text,
  idempresa int,
  tipooperacion text,
  placa text,
  facturar boolean,          -- valor NUEVO: false = desactivada, true = reactivada
  usuario text,
  motivo text,
  modulo text,               -- 'Picking' | 'Packing'
  created_at timestamptz default now()
);

create index if not exists idx_facturar_registro_orden on public.facturar_registro (orden_id);
create index if not exists idx_facturar_registro_fecha on public.facturar_registro (created_at);
