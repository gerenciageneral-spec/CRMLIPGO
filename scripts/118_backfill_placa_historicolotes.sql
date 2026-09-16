-- =====================================================================
-- Backfill RETROACTIVO de historicolotes.placa para las aprobaciones ya
-- hechas antes de capturar este campo. Cruza por ordendecargue = ocargue
-- contra citasvehiculos (que es donde queda la placa del vehículo que
-- efectivamente llegó a esa orden).
--
-- Correr DESPUÉS de scripts/117_add_placa_historicolotes.sql.
--
-- OJO: citasvehiculos.ocargue no tiene una restricción UNIQUE en la base
-- (se limpia a NULL sin filtrar por id al eliminar una orden — ver
-- lib/orders-actions.tsx). Si una orden llegó a tener más de una cita con
-- el mismo ocargue, se toma la más reciente (mayor id), que es la más
-- probable de ser la vigente.
-- =====================================================================

-- 1) Diagnóstico: ¿hay ocargue repetidos en citasvehiculos? (informativo,
--    no bloquea el backfill — el paso 2 ya resuelve el empate por id)
select ocargue, count(*) as filas
  from public.citasvehiculos
 where ocargue is not null
 group by ocargue
having count(*) > 1
 order by count(*) desc;

-- 2) Backfill: toma la fila MÁS RECIENTE (mayor id) de citasvehiculos por
--    cada ocargue, y solo llena historicolotes.placa donde está vacía.
with citas_dedup as (
  select distinct on (ocargue) ocargue, placa
    from public.citasvehiculos
   where ocargue is not null
     and placa is not null
   order by ocargue, id desc
)
update public.historicolotes hl
   set placa = cd.placa
  from citas_dedup cd
 where hl.ordendecargue = cd.ocargue
   and hl.placa is null;

-- 3) Verificación: cuántos registros quedaron con placa vs sin ella. Los
--    "sin_placa" son órdenes cuya cita en citasvehiculos ya no existe (se
--    borró la orden y se limpió `ocargue`) o nunca tuvo vehículo asignado
--    por ese flujo — es un hueco esperado del histórico, no un error del
--    script.
select
  count(*) filter (where placa is not null) as con_placa,
  count(*) filter (where placa is null)     as sin_placa,
  count(*)                                   as total
  from public.historicolotes;
