-- =====================================================================
-- Vista `solicitud_horas_extras`: programacion de horas extra POR PERSONA.
--
-- PROBLEMA QUE CORRIGE
-- La vista ya explotaba el campo `solicitudesturnos.personal` en una fila
-- por persona, pero repetia `s.cantidad` COMPLETA en cada fila. Si el
-- cliente pedia 6 horas extra y el coordinador asignaba 3 personas, la
-- vista devolvia 3 filas de 6 horas = 18 horas programadas en vez de 6, y
-- el modulo "Aprobacion horas Extra" le mostraba 6 horas a cada persona.
--
-- Ahora las horas se REPARTEN entre el personal asignado: 6 entre 3 -> 2
-- para cada uno. El reparto es en enteros con el residuo para las
-- primeras personas, de modo que la suma cuadre exactamente con lo
-- solicitado y no aparezcan fracciones de hora: 7 entre 3 -> 3, 2 y 2.
--
-- Ademas se expone `identificacion_empleado`. El cruce contra
-- `registroasistencia` se hacia solo por nombre, que falla en silencio
-- ante cualquier diferencia de tildes u ortografia. La cedula viaja en la
-- nueva columna `solicitudesturnos.personal_identificaciones`, que la
-- aprobacion escribe en el MISMO orden que `personal`. Para las
-- solicitudes aprobadas antes de este cambio queda NULL y la API cae al
-- cruce por nombre (ver app/api/extra-hours/route.ts).
--
-- Al ser una VISTA, el arreglo aplica retroactivamente a todas las
-- solicitudes ya aprobadas: no hace falta backfill de las horas.
--
-- Se usa DROP + CREATE y no CREATE OR REPLACE porque hay que agregar una
-- columna y el tipo de `cantidad` cambia a integer; CREATE OR REPLACE VIEW
-- no permite cambiar tipos de columnas existentes. El DROP va SIN CASCADE
-- a proposito: si algo dependiera de esta vista, el script falla en vez de
-- romperlo en silencio.
--
-- ---------------------------------------------------------------------
-- ROLLBACK (definicion anterior, por si hay que volver atras):
--
--   create view public.solicitud_horas_extras as
--    SELECT s.fecharequerida,
--       s.idempresa,
--       s.puesto,
--       s.cantidad,
--       TRIM(BOTH FROM persona.persona) AS nombre_empleado
--      FROM solicitudesturnos s,
--       LATERAL unnest(string_to_array(s.personal, ','::text)) persona(persona)
--     WHERE s.tipo = 'Horas Extra'::text AND s.estado = 'aprobado'::text;
-- ---------------------------------------------------------------------
-- =====================================================================

-- 1) Cedulas del personal asignado, en el mismo orden que `personal`.
alter table public.solicitudesturnos
  add column if not exists personal_identificaciones text;

comment on column public.solicitudesturnos.personal_identificaciones is
  'Cedulas del personal asignado, separadas por coma y en el MISMO orden que `personal`. La escribe la aprobacion del coordinador; alimenta solicitud_horas_extras.identificacion_empleado.';

-- 2) Vista con el reparto de horas.
drop view if exists public.solicitud_horas_extras;

create view public.solicitud_horas_extras as
with aprobadas as (
  select
    s.id             as id_solicitud,
    s.fecharequerida,
    s.idempresa,
    s.puesto,
    -- Las horas extra se programan en horas completas, no en fracciones.
    round(s.cantidad)::int as horas,
    -- Los dos arreglos se construyen SIN filtrar vacios para que sus
    -- indices queden alineados entre si (la cedula de la posicion N
    -- corresponde al nombre de la posicion N). Las filas con nombre vacio
    -- se descartan al final.
    string_to_array(s.personal, ',')                  as personas,
    string_to_array(s.personal_identificaciones, ',') as cedulas
  from public.solicitudesturnos s
  where s.tipo = 'Horas Extra'
    and s.estado = 'aprobado'
),
repartido as (
  select
    a.id_solicitud,
    a.fecharequerida,
    a.idempresa,
    a.puesto,
    btrim(p.persona)      as nombre_empleado,
    btrim(a.cedulas[p.ord]) as identificacion_empleado,
    -- Reparto entero: base para todos y una hora extra para las primeras
    -- `horas % n` personas.
    (a.horas / cardinality(a.personas))
      + case when p.ord <= (a.horas % cardinality(a.personas)) then 1 else 0 end
                          as cantidad
  from aprobadas a
  cross join lateral unnest(a.personas) with ordinality as p(persona, ord)
  where a.personas is not null
    and cardinality(a.personas) > 0
    and a.horas > 0
)
select
  id_solicitud,
  fecharequerida,
  idempresa,
  puesto,
  nombre_empleado,
  identificacion_empleado,
  cantidad
from repartido
-- Con menos horas que personas alguien queda en 0 (2 horas entre 3): no se
-- programa a quien no le tocaron horas.
where cantidad > 0
  and nombre_empleado <> '';

-- =====================================================================
-- VERIFICACION
-- =====================================================================

-- a) Estructura de la vista.
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'solicitud_horas_extras'
 order by ordinal_position;

-- b) Control clave: para cada solicitud, lo programado debe sumar
--    exactamente lo solicitado. `diferencia` tiene que dar 0 en todas las
--    filas. Si alguna no da 0, hay que revisarla antes de dar por bueno el
--    cambio.
select
  s.id,
  s.fecharequerida,
  s.cantidad                    as horas_solicitadas,
  count(v.*)                    as personas_programadas,
  coalesce(sum(v.cantidad), 0)  as horas_programadas,
  coalesce(sum(v.cantidad), 0) - round(s.cantidad)::int as diferencia
from public.solicitudesturnos s
left join public.solicitud_horas_extras v on v.id_solicitud = s.id
where s.tipo = 'Horas Extra' and s.estado = 'aprobado'
group by s.id, s.fecharequerida, s.cantidad
order by abs(coalesce(sum(v.cantidad), 0) - round(s.cantidad)::int) desc, s.id desc
limit 50;
