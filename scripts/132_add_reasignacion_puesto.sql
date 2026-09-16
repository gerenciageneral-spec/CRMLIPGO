-- =====================================================================
-- `reasignacion_puesto_log`: rastro de los cambios de puesto del día.
--
-- Hasta ahora el puesto del día NO se podía cambiar: "Tabla Asistencia"
-- rechazaba reasignar a alguien que ya tuviera asignación ("ya tienen asignación
-- hoy") y "Programación de turnos" rechazaba el duplicado. En la práctica sí
-- ocurre —una persona de turno fijo se pasa a cargue y descargue a media
-- jornada— y no había forma de reflejarlo.
--
-- El cambio tiene consecuencias de plata: `puesto` decide quién aparece en los
-- selectores de Picking/Packing, y `especialidad` cambia cómo `pagonomina`
-- liquida ese día. Por eso el cambio EXIGE un motivo escrito y queda registrado
-- aquí: quién lo hizo, cuándo, de qué puesto a cuál y por qué.
--
-- Correr ANTES de desplegar: sin esta tabla el server action falla al registrar
-- el motivo y el cambio se rechaza.
-- =====================================================================

create table if not exists public.reasignacion_puesto_log (
  id                bigserial primary key,
  fecha             date        not null,
  idempresa         integer     not null,
  identificacion    text        not null,
  nombre            text,
  puesto_anterior   text,
  puesto_nuevo      text        not null,
  -- Grupo del puesto nuevo: 'operaciones' o 'especialidades'. Es lo que decide
  -- `especialidad` y `horasturno` en registroasistencia, y si la persona lleva
  -- fila en `asignacionpersonal`.
  tipo_nuevo        text        not null,
  motivo            text        not null,
  usuario           text,
  creado            timestamptz not null default now()
);

-- Consulta típica: "qué cambió hoy en esta empresa".
create index if not exists idx_reasignacion_puesto_fecha_empresa
  on public.reasignacion_puesto_log (fecha desc, idempresa);

-- Consulta típica: historial de una persona.
create index if not exists idx_reasignacion_puesto_identificacion
  on public.reasignacion_puesto_log (identificacion, fecha desc);

comment on table public.reasignacion_puesto_log is
  'Cambios de puesto del día hechos desde Tabla Asistencia. Cada fila exige un '
  'motivo escrito: el puesto decide quién puede asignarse en Picking/Packing y '
  'cómo liquida pagonomina ese día.';

-- =====================================================================
-- VERIFICACIÓN
-- =====================================================================

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'reasignacion_puesto_log'
order by ordinal_position;

-- Los cambios de hoy, una vez se empiece a usar.
select fecha, identificacion, nombre, puesto_anterior, puesto_nuevo, motivo, usuario, creado
from public.reasignacion_puesto_log
where fecha = (now() at time zone 'America/Bogota')::date
order by creado desc;
