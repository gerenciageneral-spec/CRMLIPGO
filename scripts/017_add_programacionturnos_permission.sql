-- =====================================================================
-- Migración: agregar permiso `programacionturnos` a `permisos_usuarios`
-- =====================================================================
-- El módulo "Programación de turnos" (RRHH Lip) está protegido por el
-- permiso `programacionturnos`. Si la columna no existe en la tabla
-- `permisos_usuarios`, el endpoint `/api/user-modules` lo trata como
-- "no permitido" para todos los usuarios y el sidebar lo oculta.
--
-- Este script:
--   1) Añade la columna boolean (default false) si aún no existe.
--      Idempotente: usa ADD COLUMN IF NOT EXISTS para que se pueda
--      ejecutar varias veces sin error.
--   2) Activa el permiso para los usuarios que ya tienen acceso al
--      módulo "Turnos" (`gestionturnos = true`). Asumimos que quien
--      gestiona los turnos también debería poder programarlos. Ajusta
--      este UPDATE si tu política es diferente (por ejemplo, activar
--      solo a usuarios con rol 'admin').
-- =====================================================================

ALTER TABLE public.permisos_usuarios
  ADD COLUMN IF NOT EXISTS programacionturnos boolean NOT NULL DEFAULT false;

-- Heredar el permiso de quienes ya gestionan turnos. Comenta o ajusta
-- esta línea si prefieres activar el permiso manualmente desde la UI
-- de "Gestión de usuarios y permisos".
UPDATE public.permisos_usuarios
SET programacionturnos = true
WHERE gestionturnos = true
  AND programacionturnos = false;
