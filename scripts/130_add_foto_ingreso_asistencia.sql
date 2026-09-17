-- =====================================================================
-- `asistencia.foto_ingreso`: guardar la foto DONDE SIEMPRE HAY FILA.
--
-- EL BUG QUE CORRIGE
-- El módulo de asistencia usa DOS tablas:
--
--   · `asistencia`          — el EVENTO de marcación. Se crea siempre que
--                             alguien marca. Tiene `hora`.
--   · `registroasistencia`  — la fila de TURNO/NOVEDAD del día, que crea el
--                             supervisor en Tabla Asistencia. Tiene
--                             `horaingreso` y `foto_ingreso`.
--
-- `/api/attendance/register` subía la foto al bucket y después buscaba la fila
-- de `registroasistencia` para escribirle la URL. Cuando la persona marcaba
-- ANTES de que el supervisor le asignara turno, esa fila no existía todavía y
-- la URL simplemente SE DESCARTABA: la imagen quedaba huérfana en el bucket,
-- sin nada que la referenciara. Y `horaingreso` nunca se escribía.
--
-- De ahí los tres síntomas reportados, que son el mismo problema:
--   1. La marcación no queda con foto.
--   2. Tabla Asistencia SÍ muestra hora de entrada — porque la lee de
--      `asistencia.hora`, no de `registroasistencia`.
--   3. En `registroasistencia` no aparece la hora de entrada.
--
-- LA COLUMNA
-- La foto pasa a guardarse en `asistencia`, que es la tabla que SIEMPRE tiene
-- fila cuando alguien marca. `registroasistencia.foto_ingreso` se conserva y se
-- sigue llenando cuando la fila existe; cuando no, la app la copia desde aquí
-- al momento en que el supervisor asigna el turno.
-- =====================================================================

alter table public.asistencia
  add column if not exists foto_ingreso text;

comment on column public.asistencia.foto_ingreso is
  'URL pública de la foto tomada al marcar el ingreso. Vive aquí —y no solo en '
  'registroasistencia— porque esta tabla siempre tiene fila cuando alguien '
  'marca, mientras que la de registroasistencia puede no existir todavía.';

-- =====================================================================
-- VERIFICACIÓN
-- =====================================================================

-- 1) La columna quedó.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'asistencia'
  and column_name = 'foto_ingreso';

-- 2) Marcaciones de hoy y si traen foto. Después de desplegar, toda fila
--    nueva debe salir con `foto_ingreso` con valor.
select a.identificacion,
       a.hora,
       (a.foto_ingreso is not null) as tiene_foto,
       r.horaingreso,
       (r.id is null)               as sin_fila_de_turno
from public.asistencia a
left join public.registroasistencia r
       on r.idempresa      = a.idempresa
      and r.identificacion = a.identificacion
      and r.fecha          = a.fecha
where a.fecha = (now() at time zone 'America/Bogota')::date
order by a.hora desc;

-- 3) EL DAÑO HISTÓRICO — cuántas marcaciones quedaron sin foto y sin hora en
--    la fila de turno. No se puede reparar: las fotos viejas se subieron al
--    bucket sin dejar rastro de a qué marcación pertenecían.
select a.fecha,
       count(*)                                        as marcaciones,
       count(*) filter (where r.id is null)            as sin_fila_de_turno,
       count(*) filter (where r.id is not null
                          and r.horaingreso is null)   as fila_sin_horaingreso,
       count(*) filter (where r.foto_ingreso is null)  as sin_foto
from public.asistencia a
left join public.registroasistencia r
       on r.idempresa      = a.idempresa
      and r.identificacion = a.identificacion
      and r.fecha          = a.fecha
where a.fecha >= (now() at time zone 'America/Bogota')::date - 30
group by a.fecha
order by a.fecha desc;
