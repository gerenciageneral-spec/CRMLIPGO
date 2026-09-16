-- Permiso propio para el módulo "Centro de Coordinación" (Operación Lip).
-- Une en una sola pantalla lo que hoy está disperso en Picking, Packing y
-- Control de Toneladas (muelles en vivo, SLA, ritmo, proyección).
ALTER TABLE permisos_usuarios
  ADD COLUMN IF NOT EXISTS centro_coordinacion boolean NOT NULL DEFAULT false;
