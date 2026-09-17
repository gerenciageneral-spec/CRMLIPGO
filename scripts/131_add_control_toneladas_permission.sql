-- Permiso del módulo "Control de Toneladas" (Operación LIP).
-- Vista operativa del coordinador: toneladas por día y acumuladas por
-- trabajador (misma fórmula que ya usa nómina para pagar destajo), para
-- gestionar personal — quién mueve menos tonelaje, quién es más eficiente
-- vs. la Meta configurada, qué vehículos y órdenes atendió cada uno.
-- No es un módulo de pago (no modifica nómina), pero muestra datos de
-- desempeño individual del personal: default false, se entrega desde
-- Gestión de Usuarios. Aditivo e idempotente.

alter table public.permisos_usuarios
  add column if not exists control_toneladas boolean not null default false;

-- Siembra opcional: dar el módulo nuevo a quienes ya coordinan la operación
-- (mismo perfil que "Panel LIP Operación", permiso `sig_matriz`). Descomentar
-- si aplica — revisar antes que ese permiso no esté compartido con otro rol.
-- UPDATE public.permisos_usuarios SET control_toneladas = true WHERE sig_matriz = true;
