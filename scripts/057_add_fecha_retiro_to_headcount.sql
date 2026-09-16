-- =====================================================================
-- Agrega la columna fecha_retiro a headcount.
-- Se llena automáticamente al marcar la novedad "Retiro" en el Visor de
-- Asistencia / Novedades de Personal (con la fecha de esa novedad), y es
-- editable en el formulario "Editar Persona". Aditivo e idempotente.
-- =====================================================================

alter table headcount add column if not exists fecha_retiro date;

-- Realtime (mismo patrón que otras columnas añadidas a headcount).
alter table headcount replica identity full;
