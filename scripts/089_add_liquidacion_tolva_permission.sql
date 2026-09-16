-- Permiso del submódulo "Liquidación Tolva del día" (Producción).
ALTER TABLE public.permisos_usuarios
  ADD COLUMN IF NOT EXISTS liquidacion_tolva boolean NOT NULL DEFAULT false;

-- Otórgaselo a quien ya administra Aprobación de ingreso de producción:
-- UPDATE public.permisos_usuarios SET liquidacion_tolva = true WHERE aprobacion_produccion = true;
