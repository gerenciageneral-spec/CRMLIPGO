-- Permiso del submódulo "Revisión de nómina" (Gestión Humana › Nómina).
-- La clave debe coincidir con MODULE_PERMISSION_MAP["Revisión de nómina"] = 'revision_nomina'.
ALTER TABLE public.permisos_usuarios
  ADD COLUMN IF NOT EXISTS revision_nomina boolean NOT NULL DEFAULT false;

-- Otórgaselo a quien ya administra nómina/parafiscales (ajusta el filtro a tu gusto):
-- UPDATE public.permisos_usuarios SET revision_nomina = true WHERE parafiscales = true;
