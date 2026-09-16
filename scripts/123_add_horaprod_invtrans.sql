-- =====================================================================
-- `invtrans.horaprod`: HORA REAL de produccion de cada ingreso.
--
-- PROBLEMA QUE CORRIGE
-- "Liquidación Tolva del día" reparte las toneladas aprobadas entre
-- Turno 1 y Turno 2 segun la hora de `invtrans.creado`. Pero `creado` no
-- es la hora en que se PRODUJO: es la hora en que se REGISTRO el ingreso.
--
-- Cuando la produccion de un dia se registraba al dia siguiente, el
-- modulo detectaba que `creado` caia en otra fecha que `fechaprod`, la
-- marcaba como "aprobacion atrasada" y NO la asignaba a ningun turno. Esa
-- produccion desaparecia de la liquidacion, y la pantalla exigia una
-- "revision manual" que no ofrecia ninguna forma de resolver: quedaba
-- bloqueada.
--
-- Con esta columna la hora de produccion se captura en el formulario de
-- Ingreso de Producción, por linea/lote. La fecha de registro deja de
-- importar: el turno se decide con `fechaprod` + `horaprod`, que es el
-- dato real.
--
-- POR QUE TEXT Y NO TIME
-- Se guarda como texto normalizado "HH:MM". En este proyecto ya hay
-- columnas de hora declaradas como TIMESTAMPTZ a las que el codigo les
-- escribe strings "HH:MM:SS" (ver `asistencia.hora` y el comentario en
-- lib/preoperacional-actions.ts), y esa ambiguedad obliga a normalizar a
-- la defensiva en cada lectura. Un TEXT "HH:MM" se compara y se parsea
-- igual en SQL y en JS, sin depender de coerciones ni de zona horaria.
--
-- RETROCOMPATIBLE: los ingresos ya registrados quedan con horaprod NULL.
-- Para esos, Liquidación Tolva cae a la hora de `creado` (ignorando ya la
-- fecha) y los marca como "hora estimada" para que se puedan verificar.
--
-- Correr en Supabase ANTES de desplegar: el formulario de ingreso ya
-- escribe esta columna.
-- =====================================================================

alter table public.invtrans
  add column if not exists horaprod text;

comment on column public.invtrans.horaprod is
  'Hora real de produccion del lote, formato "HH:MM" (hora Colombia). La captura el formulario de Ingreso de Producción. Junto con `fechaprod` determina el turno en Liquidación Tolva; NO usar `creado`, que es la hora de registro.';

-- Liquidación Tolva consulta por (idempresa, fechaprod) y luego reparte
-- por horaprod.
create index if not exists invtrans_fechaprod_empresa_idx
  on public.invtrans (idempresa, fechaprod);

-- Verificacion
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'invtrans'
   and column_name in ('fechaprod', 'horaprod', 'creado')
 order by column_name;

-- Cuantos ingresos de produccion quedarian sin hora (caen al fallback).
select
  count(*) filter (where horaprod is null) as sin_horaprod,
  count(*) filter (where horaprod is not null) as con_horaprod,
  count(*) as total
from public.invtrans
where tipomov = 'Entrada'
  and origen ilike '%ingreso producci%';
