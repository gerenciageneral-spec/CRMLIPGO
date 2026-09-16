-- ============================================================================
-- VERIFICACIÓN — módulo "Operación del día"
-- ----------------------------------------------------------------------------
-- Solo lecturas. Reproduce en SQL los mismos criterios del panel, para poder
-- contrastar cifra por cifra lo que muestra la pantalla contra la base.
--
-- ANTES DE CORRER: reemplazar los `1` de `idempresa = 1` por el id de la
-- empresa que se está mirando, y las fechas por el día y la quincena en curso.
--   1 = Harinera Indupan · 2 = Avimol · 3 = Cedi Funza · 4 = Cedi Medellín
--
-- (No se usa `\set` porque es sintaxis de psql y el editor SQL de Supabase no
-- la interpreta: dejaría las consultas sin el filtro de empresa, que es
-- justamente lo que no puede faltar acá.)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) EL PERMISO QUEDÓ CREADO
-- ----------------------------------------------------------------------------
select count(*) filter (where operacion_dia)  as ven_el_panel,
       count(*) filter (where revision_nomina) as ven_revision_nomina,
       count(*)                                as total_usuarios
from public.permisos_usuarios;


-- ----------------------------------------------------------------------------
-- 2) PERSONAL ACTIVO — el número de la cabecera
-- ----------------------------------------------------------------------------
-- Operativos activos. Administrativos fuera con `not admin is true` (no
-- `admin <> true`: en Postgres eso descarta los NULL, que son la mayoría), y
-- cuentas de prueba fuera.
select count(*) as personal_activo
from public.headcount
where idempresa = 1
  and estado = 'Activo'
  and (admin is not true)
  and nombre !~* 'prueba';

-- Desglose, por si el número sorprende:
select count(*) filter (where admin is true)      as administrativos_excluidos,
       count(*) filter (where nombre ~* 'prueba') as cuentas_prueba_excluidas,
       count(*) filter (where estado <> 'Activo') as no_activos
from public.headcount
where idempresa = 1;


-- ----------------------------------------------------------------------------
-- 3) COBERTURA DE LA QUINCENA — el anillo
-- ----------------------------------------------------------------------------
-- Cubierto = tiene puesto y NO tiene novedad. Una fila con novedad estaba
-- programada pero no se cubrió: es lo que el indicador castiga.
--
-- Cambiar el rango por la quincena en curso (1-15 o 16-fin de mes).
with q as (
  select date '2026-09-01' as desde, date '2026-09-15' as hasta
),
filas as (
  select r.*
  from public.registroasistencia r, q
  where r.idempresa = 1
    and r.fecha between q.desde and q.hasta
    and coalesce(r.nombre, '') !~* 'prueba'
)
select count(*) filter (where puesto is not null or asistencia is not null) as programados,
       count(*) filter (where puesto is not null and asistencia is null)    as cubiertos,
       round(
         100.0 * count(*) filter (where puesto is not null and asistencia is null)
         / nullif(count(*) filter (where puesto is not null or asistencia is not null), 0)
       ) as pct_cobertura,
       count(distinct fecha) as dias_con_programacion
from filas;

-- ¿Qué novedades están bajando la cobertura?
with q as (select date '2026-09-01' as desde, date '2026-09-15' as hasta)
select r.asistencia as novedad, count(*) as veces
from public.registroasistencia r, q
where r.idempresa = 1
  and r.fecha between q.desde and q.hasta
  and r.asistencia is not null
  and coalesce(r.nombre, '') !~* 'prueba'
group by r.asistencia
order by veces desc;


-- ----------------------------------------------------------------------------
-- 4) COBERTURA DE HOY — las tarjetas por turno
-- ----------------------------------------------------------------------------
-- OJO: la marcación real vive en `asistencia` (el kiosco), NO en
-- registroasistencia.horaingreso, que es un sync best-effort y queda vacío si
-- se programa a alguien después de que marcó.
--
-- Cambiar la fecha por el día que se está mirando.
with d as (select date '2026-09-16' as dia),
prog as (
  select r.identificacion, r.nombre, r.puesto, r.asistencia, r.turno
  from public.registroasistencia r, d
  where r.idempresa = 1
    and r.fecha = d.dia
    and (r.puesto is not null or r.asistencia is not null)
    and coalesce(r.nombre, '') !~* 'prueba'
),
marco as (
  select distinct trim(a.identificacion) as identificacion
  from public.asistencia a, d
  where a.idempresa = 1 and a.fecha = d.dia
)
select coalesce(p.turno::text, 'jornada única') as turno,
       count(*) as programados,
       count(*) filter (
         where p.puesto is not null and p.asistencia is null
           and trim(p.identificacion) in (select identificacion from marco)
       ) as presentes,
       count(*) filter (
         where p.puesto is not null and p.asistencia is null
           and trim(p.identificacion) not in (select identificacion from marco)
       ) as sin_marcar,
       count(*) filter (where p.asistencia is not null) as con_novedad
from prog p
group by p.turno
order by p.turno nulls last;

-- TOTAL por PERSONA (no por fila): Auxiliar Mixto tiene 2 filas el mismo día
-- (turno 1 y 2) y contarlas duplicaría la plantilla. Este número debe coincidir
-- con la tarjeta "Total" del panel.
with d as (select date '2026-09-16' as dia),
prog as (
  select distinct trim(r.identificacion) as identificacion
  from public.registroasistencia r, d
  where r.idempresa = 1
    and r.fecha = d.dia
    and (r.puesto is not null or r.asistencia is not null)
    and coalesce(r.nombre, '') !~* 'prueba'
)
select count(*) as personas_en_operacion from prog;


-- ----------------------------------------------------------------------------
-- 5) BANDEJA DEL DÍA — de dónde sale cada renglón
-- ----------------------------------------------------------------------------
select 'solicitudes de turnos/horas extra pendientes' as renglon, count(*) as n
from public.solicitudesturnos where idempresa = 1 and estado = 'pendiente'
union all
select 'ausentismos en borrador', count(*)
from public.ausentismosst where idempresa = 1 and estado_registro = 'BORRADOR'
union all
-- Los incidentes SST NO se filtran por empresa: son transversales a LIP, misma
-- información para todos los proyectos (igual que en Investigación AT).
select 'accidentes de los últimos 7 días (todos los proyectos)', count(*)
from public.sst_incidentes
where tipo = 'accidente' and fecha_evento >= current_date - 7;


-- ----------------------------------------------------------------------------
-- 6) SOLICITUDES DE PERSONAL
-- ----------------------------------------------------------------------------
select cargo, proyecto, headcount as vacantes, estado,
       aprobacion_rrhh, aprobacion_operaciones
from public.vacantes
where idempresa = 1
order by created_at desc
limit 10;
