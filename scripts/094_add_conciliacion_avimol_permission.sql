-- Permiso del módulo "Conciliación Avimol" (Gestión Financiera › Facturación).
-- Cruza, día por día, lo que se COBRA a Avimol por producción (ingresos de
-- tolva × tarifa por tonelada de tarifasoperacion) contra lo que se PAGA en
-- turnos de Estibado PT y Salvado (pagonomina). Información financiera
-- sensible; default false y se entrega desde Gestión de Usuarios.
-- Aditivo e idempotente.

alter table public.permisos_usuarios
  add column if not exists conciliacion_avimol boolean not null default false;

-- Siembra opcional: dar el módulo nuevo a quienes ya manejan el Cuadro de
-- Control de Facturación (mismo perfil financiero). Descomentar si aplica.
-- UPDATE public.permisos_usuarios SET conciliacion_avimol = true WHERE cuadro_facturacion = true;
