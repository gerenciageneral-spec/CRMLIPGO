-- Permiso del módulo "Bonos" (Compensación). Registra y aprueba bonos
-- operativos/administrativos que llegan al trabajador por el archivo plano.
-- Un solo permiso cubre registrar y aprobar (la trazabilidad de quién hizo
-- qué queda en la propia tabla: creado_por / aprobado_por).
-- Impacta la liquidación; default false y se entrega desde Gestión de Usuarios.
-- Aditivo e idempotente.
--
-- IMPORTANTE: correr este ALTER TABLE ANTES de abrir Gestión de Usuarios. El
-- árbol de permisos manda TODAS las columnas del mapa en un solo UPDATE, así
-- que si la columna no existe, guardar permisos falla.

alter table public.permisos_usuarios
  add column if not exists bonos boolean not null default false;

-- Siembra opcional: darlo a quienes ya revisan nómina. Descomentar si aplica.
-- UPDATE public.permisos_usuarios SET bonos = true WHERE revision_nomina = true;
