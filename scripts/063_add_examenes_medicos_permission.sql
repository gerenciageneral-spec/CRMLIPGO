-- =====================================================================
-- Permiso PROPIO para el submódulo «Examenes Médicos» (SST).
-- Antes compartía el permiso de la Matriz 0312 (sst_autoevaluacion), por lo
-- que no se podía otorgar por separado en Gestión de Usuarios. Ahora tiene su
-- propia columna y aparece como un ítem independiente bajo SST.
--
-- Backfill: se activa para quienes YA auditan la matriz 0312 (sst_autoevaluacion)
-- para no quitarles el acceso a los exámenes que hoy pueden abrir. A partir de
-- aquí se administra de forma independiente en Gestión de Usuarios.
-- Aditivo e idempotente.
-- =====================================================================

alter table public.permisos_usuarios
  add column if not exists examenes_medicos boolean not null default false;

-- Conserva el acceso actual (quien audita la matriz mantiene exámenes).
update public.permisos_usuarios
   set examenes_medicos = true
 where coalesce(sst_autoevaluacion, false) = true
   and coalesce(examenes_medicos, false) = false;

notify pgrst, 'reload schema';
