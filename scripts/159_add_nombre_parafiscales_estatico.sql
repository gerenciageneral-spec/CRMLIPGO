-- =====================================================================
-- parafiscales_estatico: faltaban los 4 campos de nombre exactos como los
-- espera el archivo de carga (Primer/Segundo Apellido, Primer/Segundo
-- Nombre, por separado -- no siempre coinciden con partir headcount.nombre
-- a ciegas, ej. apellidos compuestos). Aditivo e idempotente.
-- =====================================================================

alter table public.parafiscales_estatico
  add column if not exists apellido1 text,
  add column if not exists apellido2 text,
  add column if not exists nombre1 text,
  add column if not exists nombre2 text;

NOTIFY pgrst, 'reload schema';
