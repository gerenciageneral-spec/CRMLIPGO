-- =====================================================================
-- Columna `owner` en `prefacturas` -- hasta hoy el owner solo vivía DENTRO
-- del JSON `lineas` (no consultable). Necesaria para que la generación
-- automática del Ciclo de Facturación (lib/ciclo-facturacion-actions.ts,
-- generarPrefacturaAhora) pueda calcular el período contiguo POR OWNER, no
-- solo por proyecto -- un mismo idempresa (ej. Indupan) factura a varios
-- clientes reales (INDUPAN, AVIMOL, Molinos del Atlántico) que comparten el
-- mismo sitio físico, y cada uno necesita su propio anexo/factura/cierre,
-- nunca mezclados. Confirmado por el usuario 2026-09-11.
--
-- Aditivo e idempotente. Backfill desde `lineas` para el historial ya
-- guardado (toma el owner de la PRIMERA línea -- si la prefactura ya mezcla
-- owners, `ownerMezclado` en la app lo sigue marcando igual, esto no cambia
-- ese comportamiento, solo hace consultable el caso normal de un solo owner).
-- =====================================================================

alter table public.prefacturas
  add column if not exists owner text;

update public.prefacturas
set owner = trim(both from (lineas->0->>'owner'))
where owner is null
  and jsonb_typeof(lineas) = 'array'
  and jsonb_array_length(lineas) > 0;

create index if not exists idx_prefacturas_owner on public.prefacturas (idempresa, origen, owner);

NOTIFY pgrst, 'reload schema';
