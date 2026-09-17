-- =====================================================================
-- Permiso del módulo "Cargos Fijos" (Gestión Financiera).
--
-- Sin esta columna, /api/user-modules trata el módulo como NO permitido
-- para todos y el sidebar lo oculta.
--
-- IMPORTANTE: correr este ALTER TABLE **antes** de abrir Gestión de
-- Usuarios. El árbol de permisos manda TODAS las columnas del mapa en un
-- solo UPDATE (lib/permissions-actions.ts), así que si la columna no
-- existe, guardar permisos falla para cualquier usuario.
--
-- Aditivo e idempotente.
-- =====================================================================

alter table public.permisos_usuarios
  add column if not exists cargos_fijos boolean not null default false;

-- Siembra opcional: darlo a quienes ya administran Cuadro de Control de
-- Facturación, que es el módulo hermano. Descomentar si aplica.
-- update public.permisos_usuarios set cargos_fijos = true where cuadro_facturacion = true;

-- Verificación:
-- select count(*) filter (where cargos_fijos) as con_permiso,
--        count(*) as total
--   from public.permisos_usuarios;
