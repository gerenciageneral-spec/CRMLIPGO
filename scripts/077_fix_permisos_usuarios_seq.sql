-- ---------------------------------------------------------------------------
-- Resincroniza la secuencia SERIAL de `permisos_usuarios.id`.
--
-- Síntoma: al crear un usuario desde la app fallaba con
--   "duplicate key value violates unique constraint permisos_usuarios_pkey" (23505).
-- Causa: la secuencia (nextval) quedó ATRÁS del MAX(id) real porque en el
--   pasado se insertaron filas con id explícito, sin avanzar la secuencia.
--
-- El código ya es robusto (inserta con id explícito = max+1 + reintento), así
-- que esto es una limpieza permanente OPCIONAL para dejar la secuencia sana.
-- Correr una vez en el SQL editor de Supabase.
-- ---------------------------------------------------------------------------
SELECT setval(
  pg_get_serial_sequence('permisos_usuarios', 'id'),
  COALESCE((SELECT MAX(id) FROM permisos_usuarios), 1),
  true
);
