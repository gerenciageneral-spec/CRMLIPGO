-- =====================================================================
-- Agrega `fecha_aprobacion` a solicitudes_trabajadores: la tabla solo
-- guardaba `fecha_solicitud` (cuándo se PIDIÓ), no cuándo se APROBÓ. Para
-- que el anticipo de nómina caiga en la quincena correcta del archivo
-- plano (Siigo), se necesita la fecha real de aprobación, no la de la
-- solicitud (alguien puede pedir el 14 y aprobarse el 17 -> quincena
-- distinta).
--
-- La puebla lib/gestion-solicitudes-actions.ts:aprobarSolicitud desde este
-- cambio en adelante. Las aprobadas ANTES de correr este script quedan con
-- fecha_aprobacion = NULL (no entran al archivo plano por esa rama hasta
-- que se corrija a mano si hace falta facturarlas retroactivamente).
-- =====================================================================

alter table public.solicitudes_trabajadores add column if not exists fecha_aprobacion date;

-- Verificación
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'solicitudes_trabajadores' and column_name = 'fecha_aprobacion';
