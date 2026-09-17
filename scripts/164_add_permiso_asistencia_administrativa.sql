-- Permiso propio para el módulo "Asistencia Administrativa" (Relaciones
-- Laborales y Ausentismo). Independiente de "novedades_personal" y "visor":
-- este módulo puede insertar/corregir filas de MESES YA CERRADOS de nómina
-- (a diferencia de esos dos, que solo tocan hoy o el futuro), así que se
-- gestiona aparte en Gestión de Usuarios.
ALTER TABLE permisos_usuarios
  ADD COLUMN IF NOT EXISTS asistencia_administrativa boolean NOT NULL DEFAULT false;
