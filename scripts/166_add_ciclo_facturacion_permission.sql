-- Permisos del módulo "Ciclo de Facturación" (Gestión Financiera › Facturación).
-- Sin un rol de usuario real en el sistema (todo es permisos booleanos por
-- módulo), se usan TRES permisos:
--   · ciclo_facturacion             -> ve el módulo/menú (visibilidad general;
--     el mapa de permisos de la app solo soporta UNA llave por módulo, así que
--     la visibilidad no puede depender directamente de "jefe O coordinador").
--   · ciclo_facturacion_jefe        -> envía anexo, sube factura, cierra, corrige.
--   · ciclo_facturacion_coordinador -> sube anexo firmado, sube factura firmada.
-- Una misma persona puede tener cualquier combinación (ej. jefe = ve + actúa
-- sus pasos; alguien de solo consulta = ve sin ninguno de los otros dos).
-- Información financiera sensible; default false, se entrega desde Gestión de
-- Usuarios. Aditivo e idempotente.

alter table public.permisos_usuarios
  add column if not exists ciclo_facturacion boolean not null default false;

alter table public.permisos_usuarios
  add column if not exists ciclo_facturacion_jefe boolean not null default false;

alter table public.permisos_usuarios
  add column if not exists ciclo_facturacion_coordinador boolean not null default false;
