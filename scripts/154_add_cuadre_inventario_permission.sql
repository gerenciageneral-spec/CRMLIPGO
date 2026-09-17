-- Migración idempotente: separa el permiso de "Cuadre de Inventario" (Cuadre y
-- Correcciones de Inventario, el que SI ajusta stock real al cerrar el mes)
-- del permiso compartido `auditoria_inventario` (que sigue gobernando "Panel
-- LIP Inventario" y "Auditoría de Inventario", ambos de solo lectura).
--
-- Antes, los tres modulos compartian `auditoria_inventario` -- eso impedia
-- otorgar acceso a Cuadre de Inventario sin tambien dar los otros dos, y en
-- la pantalla de Gestion de Usuarios solo se podia ver/marcar UNA casilla
-- para los tres (se pisaban por tener la misma llave).
--
-- El backfill preserva a los usuarios que YA tienen acceso hoy (via
-- auditoria_inventario) -- no pierden a Cuadre de Inventario con este cambio.

ALTER TABLE public.permisos_usuarios
  ADD COLUMN IF NOT EXISTS cuadre_inventario boolean NOT NULL DEFAULT false;

UPDATE public.permisos_usuarios
  SET cuadre_inventario = true
  WHERE auditoria_inventario = true;
