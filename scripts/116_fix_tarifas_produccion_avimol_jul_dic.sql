-- Alinea el maestro tarifasoperacion (Avimol, id2, vigencia jul-dic 2026) con el
-- cuadro real de Acuerdo de Volúmenes que entregó gerencia. El maestro tenía 3 de
-- las 4 tarifas de producción desincronizadas del cuadro (posible error de
-- digitación al cargar el ajuste de julio). Ejecutado en vivo el 2026-08-02 vía
-- server action (ver historial de conversación) — este script documenta el mismo
-- cambio para reproducirlo en otros entornos.
--
--   Operación                       | Maestro (antes) | Cuadro (correcto)
--   Estibado PT ordinario  (id 57)  | $8.271           | $8.561
--   Estibado PT Festivo    (id 58)  | $15.715          | $15.410
--   Salvado (Subprod. Ord.)(id 59)  | $11.926          | $11.926  (ya coincidía, sin cambio)
--   Salvado Festivo        (id 60)  | $22.659          | $21.467

update public.tarifasoperacion set tarifa = 8561 where id = 57;  -- Estibado PT ordinario
update public.tarifasoperacion set tarifa = 15410 where id = 58; -- Estibado PT Festivo
update public.tarifasoperacion set tarifa = 21467 where id = 60; -- Salvado Festivo

-- Verificación
select id, operacion, producto, tarifa, fechainicio, fechafin
from public.tarifasoperacion
where empresaid = 2
  and operacion in ('Estibado PT', 'Estibado PT Festivo', 'Salvado', 'Salvado Festivo')
order by operacion, fechainicio;
