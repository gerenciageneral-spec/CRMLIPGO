-- Agrega la columna `dashboardrecepcion` a la tabla `permisos_usuarios`.
-- Este permiso controla el acceso al modulo "Dashboard Despachos/Recepción"
-- dentro del grupo Despachos/Recepción en el sidebar.
--
-- Por defecto FALSE: los usuarios existentes no tendran acceso hasta que
-- un administrador lo habilite manualmente desde "Accesos de Usuario".

ALTER TABLE permisos_usuarios
ADD COLUMN IF NOT EXISTS dashboardrecepcion BOOLEAN NOT NULL DEFAULT FALSE;

-- Comentario de documentacion en la columna (opcional pero recomendado).
COMMENT ON COLUMN permisos_usuarios.dashboardrecepcion IS
  'Permiso para acceder al Dashboard Despachos/Recepción. FALSE por defecto.';
