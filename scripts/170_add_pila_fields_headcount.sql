-- =====================================================================
-- Lleva los campos de Seguridad Social (PILA) a Head Count, donde vive
-- de verdad el resto de la información del trabajador -- pedido del
-- usuario 2026-09-11 tras encontrar que el exportador PILA dependía de
-- una ficha SEPARADA (`parafiscales_estatico`, módulo Parafiscales) que
-- nadie llenaba al contratar a alguien nuevo (3 casos reales quedaron
-- fuera del plano de agosto-2026 por esto: WILLIAM SEGUNDO GUTIERREZ
-- BARROS, CRISTIAN DAVID MENDEZ BERNAL, EDILSON RAMON RODRIGUEZ GARCIA).
--
-- Mandato de este proyecto: una sola fuente por dato, capturada donde
-- realmente se usa por primera vez -- para EPS/AFP/Caja/ciudad, eso es
-- al momento de la contratación, en Head Count, no en una pantalla
-- aparte que solo toca Nómina/Compensación una vez al mes.
--
-- Solo se traen los campos que el exportador REALMENTE lee (verificado
-- en lib/parafiscales-exportador-actions.ts): `proyecto`, `departamento`,
-- `administradora_arl` y `clase_riesgo` de `parafiscales_estatico` NUNCA
-- se leyeron ahí (clase de riesgo usa un valor fijo por Admin/Operativo)
-- -- no se migran, quedarían muertos igual en Head Count.
--
-- Aditivo, idempotente y no destructivo: `parafiscales_estatico` NO se
-- borra (queda como respaldo histórico), solo deja de ser la fuente que
-- lee el exportador.
-- =====================================================================

alter table public.headcount
  add column if not exists ciudad text,
  add column if not exists administradora_pension text,
  add column if not exists administradora_salud text,
  add column if not exists administradora_caja text,
  add column if not exists tipo_cotizante text,
  add column if not exists subtipo_cotizante text,
  add column if not exists centro_trabajo text,
  add column if not exists actividad_economica text;

-- Backfill: todo lo que ya estaba en la ficha separada se trae tal cual,
-- por identificación (TRIM en los dos lados, mismo riesgo de espacios de
-- sobra ya documentado en 059_archivoplano_reemplazo.sql).
update public.headcount h
set
  ciudad = coalesce(h.ciudad, e.ciudad),
  administradora_pension = coalesce(h.administradora_pension, e.administradora_pension),
  administradora_salud = coalesce(h.administradora_salud, e.administradora_salud),
  administradora_caja = coalesce(h.administradora_caja, e.administradora_caja),
  tipo_cotizante = coalesce(h.tipo_cotizante, e.tipo_cotizante),
  subtipo_cotizante = coalesce(h.subtipo_cotizante, e.subtipo_cotizante),
  centro_trabajo = coalesce(h.centro_trabajo, e.centro_trabajo),
  actividad_economica = coalesce(h.actividad_economica, e.actividad_economica)
from public.parafiscales_estatico e
where trim(e.identificacion) = trim(h.identificacion);

NOTIFY pgrst, 'reload schema';
