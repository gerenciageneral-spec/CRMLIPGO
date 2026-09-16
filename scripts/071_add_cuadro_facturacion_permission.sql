-- Permiso del "Cuadro de Control de Facturación" (pestaña dentro de Gestión de
-- Facturas). No todos manejan la facturación de la empresa; default false. Se
-- entrega desde Gestión de Usuarios. Aditivo e idempotente.

alter table public.permisos_usuarios
  add column if not exists cuadro_facturacion boolean not null default false;
