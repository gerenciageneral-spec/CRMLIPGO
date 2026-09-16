-- =====================================================================
-- DIAGNOSTICO: por que el modulo "Aprobacion horas Extra" muestra todo
-- como "Hora extra no programada".
--
-- Parametrizado para:  fecha = 2026-08-03   ·   empresa = 2
--
-- El modulo (app/api/extra-hours/route.ts) cruza:
--     registroasistencia.fecha      <-> solicitud_horas_extras.fecharequerida
--     registroasistencia.idempresa  <-> solicitud_horas_extras.idempresa
--     registroasistencia.nombre     <-> solicitud_horas_extras.nombre_empleado
--
-- Si CUALQUIERA de los tres no coincide, la fila sale como no programada.
-- Este script aisla cual de los tres esta fallando.
--
-- Correr los pasos EN ORDEN. Cada uno descarta una causa.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 1. ¿Existen solicitudes aprobadas de Horas Extra ese dia?
--
--   VACIO  -> el problema esta ANTES del cruce: no se aprobo nada para
--             esa fecha/empresa, o quedo con otra fecha. Revisar
--             "Aprobar Turnos". No sigas al paso 2.
--   FILAS  -> continuar. Mira la columna `personas_asignadas`: si es 0,
--             se aprobo sin asignar personal y la vista no puede repartir.
-- ---------------------------------------------------------------------
select
  s.id,
  s.fecharequerida,
  s.idempresa,
  s.tipo,
  s.estado,
  s.cantidad                        as horas_solicitadas,
  s.personal,
  s.personal_identificaciones,
  coalesce(cardinality(string_to_array(s.personal, ',')), 0) as personas_asignadas
from public.solicitudesturnos s
where s.tipo = 'Horas Extra'
  and s.estado = 'aprobado'
  and s.fecharequerida = '2026-08-03'
  and s.idempresa = 2;


-- ---------------------------------------------------------------------
-- PASO 2. ¿Que esta produciendo la vista?
--
--   VACIO con paso 1 lleno -> el problema esta en la VISTA (personal
--                             vacio, cantidad 0, o el reparto dejo todo
--                             en 0).
--   FILAS                  -> el reparto funciona. El problema es el
--                             cruce contra asistencia (paso 4).
-- ---------------------------------------------------------------------
select *
from public.solicitud_horas_extras
where fecharequerida = '2026-08-03'
  and idempresa = 2
order by nombre_empleado;


-- ---------------------------------------------------------------------
-- PASO 3. ¿Que registros de asistencia con horas extra hay ese dia?
--
--   El modulo solo trae los que tienen especialidad = 'true'. Si esto
--   sale vacio el modulo no mostraria NADA (no es el caso reportado,
--   asi que deberia traer filas).
-- ---------------------------------------------------------------------
select
  r.id,
  r.fecha,
  r.idempresa,
  r.nombre,
  r.identificacion,
  r.especialidad,
  r.hed, r.hedf, r.hen, r.hef, r.hn
from public.registroasistencia r
where r.fecha = '2026-08-03'
  and r.idempresa = 2
  and r.especialidad = 'true'
order by r.nombre;


-- ---------------------------------------------------------------------
-- PASO 4. EL CRUCE. Esta es la consulta que responde la pregunta.
--
--   Por cada persona con horas extra ejecutadas, dice si encuentra su
--   programacion y, si no, POR QUE:
--
--     'CRUZA por cedula'   -> todo bien
--     'CRUZA por nombre'   -> bien, pero sin cedula (aprobacion vieja)
--     'NOMBRE NO COINCIDE' -> hay programacion ese dia, pero el nombre
--                             esta escrito distinto en registroasistencia
--                             vs el personal elegido en Aprobar Turnos
--     'SIN PROGRAMACION'   -> no hay ninguna programacion ese dia
-- ---------------------------------------------------------------------
with ejecutadas as (
  select
    r.nombre,
    r.identificacion,
    lower(btrim(regexp_replace(r.nombre, '\s+', ' ', 'g'))) as nombre_norm,
    coalesce(nullif(btrim(r.hed::text), '')::numeric, 0)
      + coalesce(nullif(btrim(r.hedf::text), '')::numeric, 0)
      + coalesce(nullif(btrim(r.hen::text), '')::numeric, 0)
      + coalesce(nullif(btrim(r.hef::text), '')::numeric, 0)
      + coalesce(nullif(btrim(r.hn::text), '')::numeric, 0) as horas_ejecutadas
  from public.registroasistencia r
  where r.fecha = '2026-08-03'
    and r.idempresa = 2
    and r.especialidad = 'true'
),
programadas as (
  select
    v.nombre_empleado,
    max(v.identificacion_empleado) as identificacion_empleado,
    lower(btrim(regexp_replace(v.nombre_empleado, '\s+', ' ', 'g'))) as nombre_norm,
    sum(v.cantidad) as horas_programadas
  from public.solicitud_horas_extras v
  where v.fecharequerida = '2026-08-03'
    and v.idempresa = 2
  group by v.nombre_empleado
),
hay_programacion as (
  select count(*) > 0 as existe from programadas
)
select
  e.nombre                  as nombre_en_asistencia,
  e.identificacion          as cedula_en_asistencia,
  p.nombre_empleado         as nombre_en_programacion,
  p.identificacion_empleado as cedula_en_programacion,
  e.horas_ejecutadas,
  p.horas_programadas,
  case
    when p.nombre_norm is not null
         and p.identificacion_empleado is not null
         and btrim(p.identificacion_empleado) = btrim(e.identificacion) then 'CRUZA por cedula'
    when p.nombre_norm is not null                                      then 'CRUZA por nombre'
    when (select existe from hay_programacion)                          then 'NOMBRE NO COINCIDE'
    else 'SIN PROGRAMACION'
  end as resultado
from ejecutadas e
left join programadas p on p.nombre_norm = e.nombre_norm
order by resultado, e.nombre;


-- ---------------------------------------------------------------------
-- PASO 5. Si el paso 4 dice 'NOMBRE NO COINCIDE', esto pone los dos
--         listados lado a lado para ver la diferencia exacta de
--         escritura (tildes, segundo apellido, iniciales, etc.).
-- ---------------------------------------------------------------------
select 'asistencia'   as origen, r.nombre, r.identificacion
from public.registroasistencia r
where r.fecha = '2026-08-03' and r.idempresa = 2 and r.especialidad = 'true'
union all
select 'programacion', v.nombre_empleado, v.identificacion_empleado
from public.solicitud_horas_extras v
where v.fecharequerida = '2026-08-03' and v.idempresa = 2
order by nombre, origen;


-- ---------------------------------------------------------------------
-- PASO 6. Control del reparto: lo programado debe sumar exactamente lo
--         solicitado. `diferencia` tiene que dar 0 en todas las filas.
-- ---------------------------------------------------------------------
select
  s.id,
  s.fecharequerida,
  s.cantidad                                            as horas_solicitadas,
  count(v.*)                                            as personas_programadas,
  coalesce(sum(v.cantidad), 0)                          as horas_programadas,
  coalesce(sum(v.cantidad), 0) - round(s.cantidad)::int as diferencia
from public.solicitudesturnos s
left join public.solicitud_horas_extras v on v.id_solicitud = s.id
where s.tipo = 'Horas Extra'
  and s.estado = 'aprobado'
  and s.idempresa = 2
group by s.id, s.fecharequerida, s.cantidad
order by abs(coalesce(sum(v.cantidad), 0) - round(s.cantidad)::int) desc, s.id desc
limit 50;
