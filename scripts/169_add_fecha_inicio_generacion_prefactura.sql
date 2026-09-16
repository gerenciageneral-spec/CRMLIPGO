-- ============================================================================
-- Fecha de inicio por proyecto para la auto-generación de prefacturas
-- ----------------------------------------------------------------------------
-- Sin esto, la auto-generación de un proyecto que NUNCA ha tenido una
-- prefactura se quedaba omitida para siempre (a propósito: nunca se adivina
-- una fecha de arranque) -- exigiendo que alguien generara la PRIMERA
-- prefactura a mano en Cuadro de Control / Prefactura de Producción antes de
-- poder prender la automatización. Con `fecha_inicio`, el Jefe decide esa
-- fecha una sola vez, explícita, desde el propio panel de Ciclo de
-- Facturación -- sin depender nunca de entrar a esos otros módulos.
-- ============================================================================

alter table public.condiciones_generacion_prefactura
  add column if not exists fecha_inicio date;
