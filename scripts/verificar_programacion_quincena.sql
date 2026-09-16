-- ============================================================================
-- VERIFICACIÓN — vista de quincena de Programación del Personal
-- ----------------------------------------------------------------------------
-- Solo lecturas. Responde la pregunta práctica: al abrir la vista, ¿qué se va a
-- ver y qué va a quedar vacío?
--
-- ANTES DE CORRER: reemplazar el `1` de `idempresa = 1` por la empresa que se
-- está mirando, y las fechas por la quincena en curso.
--   1 = Harinera Indupan · 2 = Avimol · 3 = Cedi Funza · 4 = Cedi Medellín
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) LO QUE EL SCRIPT DEJÓ CREADO
-- ----------------------------------------------------------------------------
select 'turnos definidos'   as que, count(*) as n from public.turnos_definicion
union all
select 'patrones',                   count(*) from public.patrones_rotacion
union all
select 'equipos (vacío a propósito)', count(*) from public.equipos_trabajo
union all
select 'demanda (vacía a propósito)', count(*) from public.demanda_puesto;

-- Detalle de los turnos de una empresa, con sus horas.
select codigo, nombre,
       to_char(hora_inicio, 'HH24:MI') as inicio,
       to_char(hora_fin, 'HH24:MI')    as fin,
       descanso_min,
       round(
         (extract(epoch from
           case when hora_fin > hora_inicio then hora_fin - hora_inicio
                else (hora_fin + interval '24 hours') - hora_inicio end
         ) / 60 - descanso_min) / 60.0, 1
       ) as horas_netas,
       es_administrativo
from public.turnos_definicion
where idempresa = 1
order by orden;


-- ----------------------------------------------------------------------------
-- 2) ¿LA GRILLA VA A RECONOCER LOS TURNOS YA PROGRAMADOS?
-- ----------------------------------------------------------------------------
-- La vista reconoce el turno comparando el horario de cada fila de
-- `registroasistencia` contra los turnos definidos. Lo que NO coincida se
-- muestra igual, pero con la hora en vez del código.
--
-- Esta consulta dice cuántas filas van a reconocerse y cuántas no.
-- Cambiar el rango por la quincena en curso.
with q as (select date '2026-09-16' as desde, date '2026-09-30' as hasta),
prog as (
  select r.horaentradaprogramada as ini, r.horasalidaprogramada as fin, count(*) as filas
  from public.registroasistencia r, q
  where r.idempresa = 1
    and r.fecha between q.desde and q.hasta
    and r.puesto is not null
    and r.asistencia is null
  group by 1, 2
)
-- El cruce se hace normalizando ambos lados a HH:MM. `registroasistencia`
-- guarda la hora como texto ('06:00') y `turnos_definicion` como `time`
-- ('06:00:00'): comparar sin normalizar no casaría ninguna fila.
select p.ini, p.fin, p.filas,
       coalesce(t.codigo, '-- sin turno equivalente --') as se_reconoce_como
from prog p
left join public.turnos_definicion t
       on t.idempresa = 1
      and to_char(t.hora_inicio, 'HH24:MI') = substring(coalesce(p.ini, '') from 1 for 5)
      and to_char(t.hora_fin,    'HH24:MI') = substring(coalesce(p.fin, '') from 1 for 5)
order by p.filas desc;

-- Si arriba aparecen horarios "sin turno equivalente" con muchas filas, vale la
-- pena crear ese turno --o ajustar el existente-- desde la pantalla: la grilla
-- se lee mucho mejor con códigos que con horas sueltas.


-- ----------------------------------------------------------------------------
-- 3) LO QUE VA A MOSTRAR LA GRILLA
-- ----------------------------------------------------------------------------
with q as (select date '2026-09-16' as desde, date '2026-09-30' as hasta)
select count(distinct r.identificacion)                          as personas_con_algo,
       count(*) filter (where r.puesto is not null and r.asistencia is null) as turnos,
       count(*) filter (where r.asistencia is not null)          as novedades,
       count(distinct r.fecha)                                   as dias_con_programacion
from public.registroasistencia r, q
where r.idempresa = 1
  and r.fecha between q.desde and q.hasta
  and coalesce(r.nombre, '') !~* 'prueba';

-- Personal activo que aparecerá como filas de la grilla (incluye
-- administrativos: la vista de quincena sí los muestra).
select count(*) filter (where admin is true)  as administrativos,
       count(*) filter (where admin is not true) as operativos,
       count(*) as total_filas_en_la_grilla
from public.headcount
where idempresa = 1 and estado = 'Activo' and nombre !~* 'prueba';


-- ----------------------------------------------------------------------------
-- 4) FESTIVOS DE LA QUINCENA — la grilla los marca en ámbar
-- ----------------------------------------------------------------------------
select fecha, to_char(fecha, 'TMDay') as dia
from public.festivos
where fecha between date '2026-09-16' and date '2026-09-30'
order by fecha;

-- Si sale vacío puede ser correcto (no todos los meses tienen festivo) o puede
-- ser que falte cargarlos. Para confirmar, cuántos hay en todo el año:
select extract(year from fecha)::int as anio, count(*) as festivos
from public.festivos
group by 1 order by 1 desc limit 3;


-- ----------------------------------------------------------------------------
-- 5) PARA EMPEZAR A USAR COBERTURA
-- ----------------------------------------------------------------------------
-- Los puestos reales contra los que definir la demanda. Salen de
-- `tarifasturnos`, el mismo catálogo que ya usa la programación diaria.
select puesto, count(*) as veces_programado
from public.registroasistencia
where idempresa = 1
  and puesto is not null
  and fecha >= current_date - 60
group by puesto
order by veces_programado desc;

-- Con eso a la vista, la demanda se define desde la pantalla (Cobertura →
-- "requiere N · cambiar"). También se puede sembrar acá; ejemplo:
--
--   insert into public.demanda_puesto (idempresa, puesto, turno_codigo, requeridos)
--   values (1, 'Cargue', 'T1', 14)
--   on conflict do nothing;
