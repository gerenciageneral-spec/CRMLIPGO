-- ============================================================================
-- PROGRAMACIÓN DEL PERSONAL — turnos nombrados, equipos y demanda
-- ----------------------------------------------------------------------------
-- El módulo de Programación de Turnos hoy es "una fecha, dos tablas planas":
-- se elige un día, se marcan personas y se insertan filas en
-- `registroasistencia`. No existe el concepto de quincena, ni de turno con
-- nombre, ni de equipo, ni de cuánta gente se necesita por puesto.
--
-- Esto agrega lo mínimo para que esas tres vistas tengan de dónde leer, SIN
-- tocar cómo se programa hoy: `registroasistencia` no se modifica, y el módulo
-- actual sigue funcionando igual.
--
-- LO QUE ESTE SCRIPT **NO** HACE, A PROPÓSITO
--  · No calcula horas nocturnas. Las columnas `hen`/`hef`/`hn` existen, las
--    consumen `pagonomina` y `facturacionturnos`, y hoy valen 0 porque el
--    trigger solo escribe `hed`/`hedf`. Empezar a poblarlas subiría nómina Y
--    facturación al cliente de golpe. Va aparte, con previsualización en pesos.
--    Por eso aquí el turno guarda su ventana horaria pero NADIE la liquida.
--  · No agrega un estado borrador/publicado. Escribir en `registroasistencia`
--    dispara el trigger de horas extra y entra a nómina de inmediato; un
--    "publicar" real exige un área de borrador que es otra entrega.
--
-- Aditivo e idempotente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — DEFINICIÓN DE TURNOS CON NOMBRE
-- ----------------------------------------------------------------------------
-- Hoy nadie declara "T1 = mañana, 06:00 a 14:00". Las horas se escriben a mano
-- en cada fila de programación y los "06:00"/"14:00" del formulario son
-- literales de la pantalla, no configuración.
--
-- OJO: esto NO es `horario_tolva`. Esa tabla sirve para clasificar ingresos de
-- producción en la Liquidación de Tolva, tiene CHECK (turno IN (1,2)) --no
-- admite un tercer turno-- y explícitamente no afecta el horario de la persona.

create table if not exists public.turnos_definicion (
  id serial primary key,
  idempresa int not null,
  -- Código corto que se ve en la grilla: T1, T2, T3, AD...
  codigo text not null,
  nombre text not null,
  hora_inicio time not null,
  hora_fin time not null,
  -- Minutos de descanso no remunerado. El administrativo suele tener 60.
  descanso_min int not null default 0,
  -- Color de la celda en la grilla.
  color text,
  -- Turno del personal ADMINISTRATIVO. Se marca aparte porque el administrativo
  -- no marca en portería y hoy está excluido del selector de programación.
  es_administrativo boolean not null default false,
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz default now()
);

create unique index if not exists uq_turnos_def_codigo
  on public.turnos_definicion (idempresa, codigo);
create index if not exists idx_turnos_def_emp
  on public.turnos_definicion (idempresa, activo);

comment on table public.turnos_definicion is
  'Turnos con nombre por empresa (T1 mañana, T2 tarde...). NO se usa para liquidar: las horas siguen saliendo de registroasistencia. Ver scripts/176_add_programacion_turnos_quincena.sql';
comment on column public.turnos_definicion.hora_fin is
  'Si hora_fin < hora_inicio el turno cruza la medianoche (p. ej. 22:00-06:00).';


-- ----------------------------------------------------------------------------
-- PASO 2 — EQUIPOS
-- ----------------------------------------------------------------------------
-- `headcount` no tiene ninguna columna de equipo. Hoy la gente solo se agrupa
-- por empresa y por puesto.
--
-- El equipo es una tabla aparte y no una columna en headcount porque una
-- persona puede cambiar de equipo sin que eso sea un cambio en su vínculo
-- laboral, y porque así el histórico de headcount no se toca.

create table if not exists public.equipos_trabajo (
  id serial primary key,
  idempresa int not null,
  nombre text not null,
  area text,
  -- Patrón de rotación aplicado por defecto al equipo (ver PASO 3).
  patron_id int,
  color text,
  activo boolean not null default true,
  created_at timestamptz default now()
);

create unique index if not exists uq_equipos_nombre
  on public.equipos_trabajo (idempresa, nombre);

-- Quién está en cada equipo. Se guarda la identificación --no el id de
-- headcount-- porque es la llave con la que se programa en registroasistencia.
create table if not exists public.equipos_integrantes (
  id serial primary key,
  equipo_id int not null references public.equipos_trabajo(id) on delete cascade,
  identificacion text not null,
  created_at timestamptz default now()
);

-- Una persona en un solo equipo a la vez dentro de la misma empresa: si
-- estuviera en dos, un patrón la programaría dos veces el mismo día.
create unique index if not exists uq_equipos_integrante
  on public.equipos_integrantes (equipo_id, identificacion);
create index if not exists idx_equipos_integrante_ident
  on public.equipos_integrantes (identificacion);


-- ----------------------------------------------------------------------------
-- PASO 3 — PATRONES DE ROTACIÓN
-- ----------------------------------------------------------------------------
-- La secuencia se guarda como un arreglo de códigos de turno que se repite:
--   5x2 diurno     -> {T1,T1,T1,T1,T1,D,D}
--   6x1 rotativo   -> {T1,T1,T2,T2,T3,T3,D}
--   4x3 comprimido -> {T1,T1,T1,T1,D,D,D}
-- 'D' = descanso. El largo del arreglo es el ciclo: 7 = semanal, pero puede ser
-- cualquier otro.

create table if not exists public.patrones_rotacion (
  id serial primary key,
  idempresa int not null,
  nombre text not null,
  descripcion text,
  -- Códigos de turnos_definicion.codigo, o 'D' para descanso.
  secuencia text[] not null,
  -- Horas semanales de referencia. Informativo: NO se valida contra la ley
  -- porque el sistema todavía no calcula la jornada real de nadie.
  horas_semana numeric,
  activo boolean not null default true,
  created_at timestamptz default now()
);

create unique index if not exists uq_patrones_nombre
  on public.patrones_rotacion (idempresa, nombre);

comment on column public.patrones_rotacion.horas_semana is
  'Referencia declarada, no calculada. El sistema no valida el límite semanal.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_equipos_patron'
  ) then
    alter table public.equipos_trabajo
      add constraint fk_equipos_patron
      foreign key (patron_id) references public.patrones_rotacion(id) on delete set null;
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- PASO 4 — DEMANDA POR PUESTO Y TURNO
-- ----------------------------------------------------------------------------
-- Cuánta gente se necesita. Hoy lo más parecido es PLANTA_ACORDADA, una
-- constante de TypeScript con el total por proyecto: no distingue día, ni
-- turno, ni puesto.
--
-- `fecha` en NULL = demanda BASE, la que aplica todos los días. Con fecha = un
-- día concreto se sobreescribe solo ese día (un pico de volumen, un festivo).
-- Así no hay que sembrar una fila por día del año.

create table if not exists public.demanda_puesto (
  id serial primary key,
  idempresa int not null,
  puesto text not null,
  turno_codigo text not null,
  fecha date,
  requeridos int not null default 0,
  nota text,
  actualizado_por text,
  updated_at timestamptz default now()
);

-- En Postgres NULL <> NULL: un unique que incluya `fecha` NO impediría dos
-- filas base duplicadas, y con dos la resolución sería no determinista. Por eso
-- van DOS índices parciales. Mismo caso que ya nos mordió en las políticas de
-- horas extra.
create unique index if not exists uq_demanda_con_fecha
  on public.demanda_puesto (idempresa, puesto, turno_codigo, fecha)
  where fecha is not null;

create unique index if not exists uq_demanda_base
  on public.demanda_puesto (idempresa, puesto, turno_codigo)
  where fecha is null;

create index if not exists idx_demanda_emp
  on public.demanda_puesto (idempresa, fecha);

comment on column public.demanda_puesto.fecha is
  'NULL = demanda base de todos los días. Con fecha = excepción solo de ese día.';


-- ----------------------------------------------------------------------------
-- PASO 5 — SEMILLA DE TURNOS
-- ----------------------------------------------------------------------------
-- Los cuatro turnos de la maqueta, para las 4 empresas. Se siembran para que la
-- pantalla abra con algo utilizable; se editan desde la interfaz.
--
-- Las horas son las del planteamiento (T1 06-14, T2 14-22, T3 22-06, AD 08-17
-- con 60 min). Si en tu operación son otras, se cambian en la pestaña de
-- horarios y se recalcula la grilla.

insert into public.turnos_definicion
  (idempresa, codigo, nombre, hora_inicio, hora_fin, descanso_min, color, es_administrativo, orden)
select e.id, v.codigo, v.nombre, v.ini::time, v.fin::time, v.desc_min, v.color, v.admin, v.orden
from (values (1),(2),(3),(4)) as e(id)
cross join (values
  ('T1', 'Turno 1 · mañana', '06:00', '14:00',  0, '#7dd3fc', false, 1),
  ('T2', 'Turno 2 · tarde',  '14:00', '22:00',  0, '#0d9488', false, 2),
  ('T3', 'Turno 3 · noche',  '22:00', '06:00',  0, '#0f3b3b', false, 3),
  ('AD', 'Administrativo',   '08:00', '17:00', 60, '#94a3b8', true,  4)
) as v(codigo, nombre, ini, fin, desc_min, color, admin, orden)
on conflict do nothing;


-- ----------------------------------------------------------------------------
-- PASO 6 — SEMILLA DE PATRONES
-- ----------------------------------------------------------------------------
insert into public.patrones_rotacion (idempresa, nombre, descripcion, secuencia, horas_semana)
select e.id, v.nombre, v.descripcion, v.secuencia::text[], v.horas
from (values (1),(2),(3),(4)) as e(id)
cross join (values
  ('5x2 diurno',     'Lunes a viernes en jornada fija. Sin recargo nocturno.', '{T1,T1,T1,T1,T1,D,D}', 40),
  ('4x3 comprimido', 'Cuatro jornadas largas. Tres días de descanso.',          '{T1,T1,T1,T1,D,D,D}', 42),
  ('6x1 rotativo',   'Rota los tres turnos. Genera recargo nocturno.',          '{T1,T1,T2,T2,T3,T3,D}', 42),
  ('Continuo 24/7',  'Cobertura permanente. Exige descanso compensatorio dominical.', '{T1,T2,T3,D,T1,T2,T3}', 42)
) as v(nombre, descripcion, secuencia, horas)
on conflict do nothing;


-- ----------------------------------------------------------------------------
-- PASO 7 — VERIFICACIÓN (solo lecturas)
-- ----------------------------------------------------------------------------

-- 7a) Turnos sembrados por empresa. Deben ser 4 por empresa.
select idempresa, count(*) as turnos,
       string_agg(codigo || ' ' || to_char(hora_inicio,'HH24:MI') || '-' || to_char(hora_fin,'HH24:MI'), ' · ' order by orden) as detalle
from public.turnos_definicion
group by idempresa order by idempresa;

-- 7b) Patrones sembrados. Deben ser 4 por empresa.
select idempresa, nombre, array_to_string(secuencia, ' ') as secuencia, horas_semana
from public.patrones_rotacion
order by idempresa, nombre;

-- 7c) Equipos y demanda arrancan VACÍOS a propósito: no se puede adivinar en
--     qué equipo va cada persona ni cuánta gente requiere cada puesto. Se
--     capturan desde la pantalla.
select (select count(*) from public.equipos_trabajo)   as equipos,
       (select count(*) from public.demanda_puesto)    as demandas;

-- 7d) Los puestos reales contra los que se puede definir demanda.
--     Salen de tarifasturnos, que es el catálogo que ya usa la programación.
select distinct puesto from public.tarifasturnos where puesto is not null order by 1;

-- 7e) ¿Hay festivos cargados para la quincena en curso? La grilla los marca.
--     Si esto sale vacío, la grilla mostrará los domingos pero no los festivos.
select fecha from public.festivos
where fecha between date_trunc('month', current_date)
                and (date_trunc('month', current_date) + interval '1 month - 1 day')
order by fecha;


-- ----------------------------------------------------------------------------
-- REVERSIÓN
-- ----------------------------------------------------------------------------
-- Todo es aditivo y nada más lo lee: borrarlo devuelve el módulo al estado
-- anterior. `registroasistencia` no se toca en ningún momento.
--
--   drop table if exists public.demanda_puesto;
--   drop table if exists public.equipos_integrantes;
--   drop table if exists public.equipos_trabajo;
--   drop table if exists public.patrones_rotacion;
--   drop table if exists public.turnos_definicion;
