-- =====================================================================
-- Migración: agregar permiso `montacargasdia` a `permisos_usuarios`
-- =====================================================================
-- El módulo "Montacargas y personal día" (Gestión de Inventario) está
-- protegido por el permiso `montacargasdia`. Si la columna no existe en
-- la tabla `permisos_usuarios`, el endpoint `/api/user-modules` lo trata
-- como "no permitido" para todos los usuarios y el sidebar lo oculta.
--
-- Idempotente: usa ADD COLUMN IF NOT EXISTS para que se pueda ejecutar
-- varias veces sin error.
-- =====================================================================

ALTER TABLE public.permisos_usuarios
  ADD COLUMN IF NOT EXISTS montacargasdia boolean NOT NULL DEFAULT false;
