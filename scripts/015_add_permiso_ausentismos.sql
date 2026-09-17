-- Permiso propio para el submódulo "Ausentismos" (Relaciones Laborales).
-- Antes compartía el permiso de "Novedades de personal"; ahora se controla
-- de forma independiente en Accesos de Usuario.
ALTER TABLE permisos_usuarios
  ADD COLUMN IF NOT EXISTS ausentismos boolean NOT NULL DEFAULT false;
