-- =====================================================================
-- `registroasistencia.horaingreso` vacío aunque la persona SÍ marcó.
--
-- SÍNTOMA: en Tabla Asistencia se ve la hora de llegada —que sale de
-- `asistencia.hora`— pero en `registroasistencia` esa persona aparece sin
-- `horaingreso`.
--
-- DOS CAUSAS, las dos ya corregidas en la app:
--
--  1. DOBLE JORNADA. `/api/attendance/register` buscaba la fila con
--     `.limit(1)` y actualizaba solo esa. Un "Auxiliar Mixto" con Turno 1 y
--     Turno 2 tiene DOS filas el mismo día: una quedaba con la hora y la otra
--     vacía — y sin ORDER BY, cuál se llenaba era arbitrario.
--
--  2. PROGRAMAR DESPUÉS DE MARCAR. "Programación de turnos" creaba la fila sin
--     `horaingreso`. Si se programaba a alguien EL MISMO DÍA, después de que ya
--     había marcado, el endpoint de marcación ya había pasado y nada volvía a
--     llenarla: quedaba vacía para siempre.
--
-- Este script REPARA lo ya ocurrido. `asistencia` conserva la marcación real, de
-- modo que la hora se puede recuperar con certeza — no se inventa nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) DIMENSIONAR: ¿a cuántos les pasa, y desde cuándo?
--    Correr esto primero y revisar antes de reparar.
-- ---------------------------------------------------------------------
select r.fecha,
       count(*) as filas_sin_horaingreso
from public.registroasistencia r
join public.asistencia a
  on a.idempresa      = r.idempresa
 and a.identificacion = r.identificacion
 and a.fecha          = r.fecha
where r.horaingreso is null
  and a.hora is not null
  -- Una fila con novedad significa que la persona NO trabajó: ahí `horaingreso`
  -- vacío es lo correcto y no debe tocarse.
  and coalesce(trim(r.asistencia), '') = ''
group by r.fecha
order by r.fecha desc;

-- ---------------------------------------------------------------------
-- 2) EL DETALLE, para revisar casos concretos antes de escribir.
-- ---------------------------------------------------------------------
select r.id,
       r.fecha,
       r.identificacion,
       r.nombre,
       r.puesto,
       r.turno,
       r.horaingreso    as hora_en_registroasistencia,
       a.hora           as hora_real_marcada,
       (r.foto_ingreso is null) as sin_foto
from public.registroasistencia r
join public.asistencia a
  on a.idempresa      = r.idempresa
 and a.identificacion = r.identificacion
 and a.fecha          = r.fecha
where r.horaingreso is null
  and a.hora is not null
  and coalesce(trim(r.asistencia), '') = ''
order by r.fecha desc, r.nombre
limit 200;

-- ---------------------------------------------------------------------
-- 3) LA REPARACIÓN.
--
--    Copia la hora REAL de `asistencia` a las filas que quedaron vacías. Solo
--    toca filas sin `horaingreso` y sin novedad, así que:
--      · es idempotente (correrlo dos veces da lo mismo),
--      · nunca pisa una hora ya registrada,
--      · nunca le pone hora de llegada a alguien que estuvo ausente.
--
--    Descomentar para ejecutar.
-- ---------------------------------------------------------------------
-- update public.registroasistencia r
--    set horaingreso  = a.hora,
--        foto_ingreso = coalesce(r.foto_ingreso, a.foto_ingreso)
--   from public.asistencia a
--  where a.idempresa      = r.idempresa
--    and a.identificacion = r.identificacion
--    and a.fecha          = r.fecha
--    and r.horaingreso is null
--    and a.hora is not null
--    and coalesce(trim(r.asistencia), '') = '';

-- ---------------------------------------------------------------------
-- 4) VERIFICAR: después de reparar, la consulta 1 debe devolver 0 filas.
-- ---------------------------------------------------------------------

-- =====================================================================
-- POR QUÉ IMPORTA MÁS ALLÁ DE LA PANTALLA
--
-- `horaingreso` no es solo informativo: es lo que filtra Picking/Packing para
-- decidir quién está disponible (`horaingreso IS NOT NULL`, ver
-- lib/picking-actions.ts). Una persona presente con la hora vacía NO aparecía
-- en esos selectores, aunque estuviera trabajando.
-- =====================================================================
