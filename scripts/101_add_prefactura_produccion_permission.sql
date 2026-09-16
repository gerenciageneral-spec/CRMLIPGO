-- Permiso del módulo "Prefactura de Producción" (Gestión Financiera › Facturación).
-- Emite la prefactura de lo que se cobra por PRODUCCIÓN, con selector de proyecto:
--   · Avimol (id 2)  -> Salvado y Estibado PT por tonelaje (con sus variantes de
--                       festivo) + horas extra por puesto.
--   · Indupan (id 1) -> órdenes con tipooperacion Tolva / Tolva f.
-- Es un documento que se le cobra al cliente y tiene ciclo de vida
-- (borrador -> aprobada). Información financiera sensible; default false y se
-- entrega desde Gestión de Usuarios.
-- Aditivo e idempotente. Requiere antes scripts/100_add_prefactura_produccion.sql.

alter table public.permisos_usuarios
  add column if not exists prefactura_produccion boolean not null default false;

-- Siembra opcional: dárselo a quienes ya manejan el Cuadro de Control de
-- Facturación (mismo perfil financiero). Descomentar si aplica.
-- UPDATE public.permisos_usuarios SET prefactura_produccion = true WHERE cuadro_facturacion = true;
