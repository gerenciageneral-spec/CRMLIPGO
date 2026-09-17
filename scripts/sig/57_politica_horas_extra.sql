-- ============================================================================
-- 57 — POLÍTICAS DE HORAS EXTRA POR PUESTO
-- ----------------------------------------------------------------------------
-- Hasta hoy la regla de horas extra vive QUEMADA en la función trigger
-- `calcular_y_asignar_horas_extras()`: los literales `- 1.0 - 7.0` (1h de
-- descanso + 7h de jornada) y una excepción escrita a mano:
--
--     es_sabado_distribucion_turno := (dia_semana = 6 AND TRIM(NEW.puesto) = 'Distribución Turno');
--
-- Cada vez que un puesto necesita otra regla hay que editar la función y correr
-- un script retroactivo. Ya pasó dos veces (fix_horas_extra_sabado_distribucion
-- _turno.sql y 092_recalcular_horas_extra_retroactivo_16jul.sql), y la cabecera de
-- la propia función lo admite.
--
-- Este script mueve esa regla a DATOS, para poder configurarla desde la pestaña
-- "Políticas de horas extra" de Tabla Asistencia.
--
-- ORDEN DE EJECUCIÓN — IMPORTANTE
--   PASO 1 (este archivo, hasta el PASO 4): crea la tabla, la semilla y las
--          funciones nuevas. NO toca el trigger. Es inofensivo: nada cambia
--          todavía porque el trigger sigue usando su lógica vieja.
--   PASO 5: la PRUEBA DE EQUIVALENCIA. Compara la función nueva contra lo ya
--          calculado sobre datos reales. DEBE DAR 0 DISCREPANCIAS.
--          Si no da 0, NO SEGUIR: la política no reproduce el comportamiento
--          actual y hay que revisar antes de reemplazar nada.
--   PASO 6: solo después de que el paso 5 dé 0, reemplazar el trigger.
--
-- Aditivo e idempotente: correrlo dos veces es inofensivo.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — LA TABLA DE POLÍTICAS
--
-- Una sola tabla, no dos. `dia_semana NULL` funciona como comodín ("todos los
-- días"), lo que evita una tabla aparte de excepciones y permite que el trigger
-- resuelva con UNA consulta en vez de dos.
-- ----------------------------------------------------------------------------
create table if not exists public.politica_horas_extra (
  id                      bigint generated always as identity primary key,

  -- '*' es la política POR DEFECTO: aplica a cualquier puesto sin política
  -- propia. Sin ella habría que crear una fila por cada puesto de
  -- `tarifasturnos` solo para reproducir lo que hoy hace un literal, y
  -- cualquier puesto nuevo quedaría sin regla.
  puesto                  text        not null,

  -- Desde cuándo rige. Se compara contra `registroasistencia.fecha` (el día
  -- trabajado), NO contra la fecha en que se edita el registro.
  fecha_desde             date        not null,

  -- ISODOW: 1=lunes … 7=domingo. NULL = la política base del puesto.
  dia_semana              smallint,

  -- --- Parámetros del cálculo ---
  -- A partir de cuántas horas trabajadas empieza a contar la hora extra.
  umbral_horas            numeric     not null default 7.0,
  -- Horas de descanso que se descuentan del total trabajado.
  horas_descanso          numeric     not null default 1.0,
  -- Si NO es null, el descanso SOLO se descuenta cuando el total supera este
  -- valor. Es el `> 6.0` que hoy está quemado en el caso sábado/Distribución
  -- Turno: en un turno corto no se descuenta almuerzo.
  descanso_desde_horas    numeric,
  -- Minutos que se puede quedar de más sin que cuenten como extra.
  tolerancia_salida_min   integer     not null default 45,
  -- Si el resultado es menor a esto, se lleva a 0. Evita pagar 0,01 h por
  -- quedarse 46 minutos.
  minimo_extra_horas      numeric     not null default 0,
  -- Tope POR FILA (por turno), no por día: el trigger corre FOR EACH ROW y
  -- "Auxiliar Mixto" tiene DOS filas el mismo día (columna `turno` 1 y 2), así
  -- que un tope "diario" se aplicaría dos veces. NULL = sin tope.
  tope_extra_turno_horas  numeric,
  -- 'truncar'  = recorta decimales (TRUNC a 2), el comportamiento de hoy.
  -- 'redondear'= redondea a 2 decimales.
  -- 'bloque'   = redondea hacia abajo a bloques de `redondeo_bloque_min`.
  redondeo_modo           text        not null default 'truncar',
  redondeo_bloque_min     integer,

  -- RESERVADO — todavía sin uso en el cálculo. Calcular hen/hef/hn automático
  -- es una entrega aparte: hoy valen 0 y tanto `pagonomina` como
  -- `facturacionturnos` ya los consumen, así que empezar a poblarlos subiría
  -- nómina Y facturación de golpe. La columna se crea desde ya para no tener
  -- que migrar el modelo dos veces.
  ventana_nocturna_desde  time,
  ventana_nocturna_hasta  time,

  activa                  boolean     not null default true,
  -- Por qué existe esta fila. Para que dentro de un año se pueda explicar.
  nota                    text,
  actualizado_at          timestamptz not null default now(),
  actualizado_por         text,

  constraint politica_horas_extra_dia_valido
    check (dia_semana is null or dia_semana between 1 and 7),
  constraint politica_horas_extra_redondeo_valido
    check (redondeo_modo in ('truncar', 'redondear', 'bloque')),
  -- Si el modo es 'bloque', el tamaño del bloque es obligatorio: sin él el
  -- cálculo no está definido.
  constraint politica_horas_extra_bloque_coherente
    check (redondeo_modo <> 'bloque' or coalesce(redondeo_bloque_min, 0) > 0)
);

-- UNICIDAD — el detalle que rompe en silencio si se hace mal.
--
-- En Postgres NULL <> NULL, así que una PK compuesta con `dia_semana` nullable
-- NO impediría dos filas comodín duplicadas para el mismo puesto y fecha. Con
-- dos filas empatadas, el `limit 1` de la resolución se vuelve NO DETERMINISTA:
-- el cálculo cambiaría solo, según el plan de ejecución. Por eso van dos
-- índices parciales en vez de una restricción sola.
create unique index if not exists ux_politica_horas_extra_dia
  on public.politica_horas_extra (puesto, fecha_desde, dia_semana)
  where dia_semana is not null;

create unique index if not exists ux_politica_horas_extra_base
  on public.politica_horas_extra (puesto, fecha_desde)
  where dia_semana is null;

-- Índice de lectura del trigger. La tabla tiene decenas de filas y cabe entera
-- en memoria; esto es por prolijidad, no por necesidad.
create index if not exists ix_politica_horas_extra_lookup
  on public.politica_horas_extra (puesto, fecha_desde desc)
  where activa;

comment on table public.politica_horas_extra is
  'Reglas de generación de horas extra por puesto y día. Reemplaza los literales que estaban quemados en calcular_y_asignar_horas_extras().';
comment on column public.politica_horas_extra.puesto is
  'Puesto tal como se escribe en registroasistencia.puesto. El valor ''*'' es la política por defecto para los puestos sin regla propia.';
comment on column public.politica_horas_extra.fecha_desde is
  'Vigencia. Se compara contra la FECHA TRABAJADA (registroasistencia.fecha), no contra la fecha de edición.';
comment on column public.politica_horas_extra.dia_semana is
  'ISODOW 1=lunes..7=domingo. NULL = política base del puesto (todos los días).';
comment on column public.politica_horas_extra.descanso_desde_horas is
  'Si no es null, el descanso solo se descuenta cuando el total trabajado supera este valor (turno corto sin almuerzo).';
comment on column public.politica_horas_extra.tope_extra_turno_horas is
  'Tope POR TURNO, no por día: el trigger corre por fila y Auxiliar Mixto tiene dos filas el mismo día.';
comment on column public.politica_horas_extra.ventana_nocturna_desde is
  'RESERVADO. El cálculo automático de hen/hef/hn es una entrega aparte; hoy esta columna no se usa.';
comment on column public.politica_horas_extra.ventana_nocturna_hasta is
  'RESERVADO. Ver ventana_nocturna_desde.';


-- ----------------------------------------------------------------------------
-- PASO 2 — SEMILLA: reproduce EXACTAMENTE el comportamiento de hoy
--
-- `fecha_desde = '1900-01-01'` es deliberado. La política tiene que cubrir TODO
-- el histórico: si arrancara en la fecha de despliegue, recalcular agosto no
-- encontraría política y daría un número distinto al que dio el trigger en su
-- momento.
--
-- `where not exists` en vez de `on conflict`: si alguien ya ajustó estas filas
-- desde la interfaz, no se pisan.
-- ----------------------------------------------------------------------------

-- La política general: 1h de descanso + 7h de jornada = extra a partir de 8h.
insert into public.politica_horas_extra
  (puesto, fecha_desde, dia_semana, umbral_horas, horas_descanso,
   tolerancia_salida_min, redondeo_modo, nota)
select '*', date '1900-01-01', null, 7.0, 1.0, 45, 'truncar',
       'Política general. Reproduce los literales que estaban en la función trigger.'
 where not exists (
   select 1 from public.politica_horas_extra
    where puesto = '*' and fecha_desde = date '1900-01-01' and dia_semana is null
 );

-- La excepción del sábado, que hoy está quemada por nombre de puesto.
insert into public.politica_horas_extra
  (puesto, fecha_desde, dia_semana, umbral_horas, horas_descanso,
   descanso_desde_horas, tolerancia_salida_min, redondeo_modo, nota)
select 'Distribución Turno', date '1900-01-01', 6, 4.5, 1.0, 6.0, 45, 'truncar',
       'Jornada reducida de sábado. Confirmada por el usuario el 2026-08-28; venía quemada en la función trigger.'
 where not exists (
   select 1 from public.politica_horas_extra
    where puesto = 'Distribución Turno' and fecha_desde = date '1900-01-01' and dia_semana = 6
 );


-- ----------------------------------------------------------------------------
-- PASO 3 — BLINDAJE DEL AJUSTE MANUAL
--
-- BUG PREEXISTENTE que este script arregla de paso:
-- `app/api/extra-hours/route.ts` hace `update registroasistencia set hed = X`
-- para el ajuste manual. El trigger es BEFORE UPDATE FOR EACH ROW SIN cláusula
-- WHEN, así que se dispara en ese UPDATE, recalcula desde los cuatro tiempos
-- --que no cambiaron-- y SOBRESCRIBE el valor escrito a mano antes de guardarlo.
-- El ajuste manual solo "funciona" hoy en hen/hef/hn, que el trigger no toca.
--
-- Con esta bandera el trigger respeta lo que una persona decidió a mano.
-- ----------------------------------------------------------------------------
alter table public.registroasistencia
  add column if not exists extras_manual boolean not null default false;

comment on column public.registroasistencia.extras_manual is
  'Las horas extra de esta fila se fijaron a mano y el trigger no debe recalcularlas. Se limpia sola si cambia la marcación (horaingreso/horasalida).';

-- Respaldo de los recálculos retroactivos. Hoy cada script de corrección crea
-- su propia tabla `respaldo_*` a mano; esta es la única y permanente, con
-- `lote_id` para poder revertir un recálculo puntual.
create table if not exists public.respaldo_recalculo_extras (
  id              bigint generated always as identity primary key,
  lote_id         uuid        not null,
  registro_id     bigint      not null,
  fecha           date,
  nombre          text,
  identificacion  text,
  puesto          text,
  aprobado        text,
  hed             numeric,
  hedf            numeric,
  hen             numeric,
  hef             numeric,
  hn              numeric,
  respaldado_en   timestamptz not null default now(),
  motivo          text
);

create index if not exists ix_respaldo_recalculo_extras_lote
  on public.respaldo_recalculo_extras (lote_id);

comment on table public.respaldo_recalculo_extras is
  'Foto de las horas extra ANTES de cada recálculo retroactivo. Permite revertir un lote completo.';


-- ----------------------------------------------------------------------------
-- PASO 4 — LAS FUNCIONES
--
-- Van SEPARADAS del trigger a propósito: la misma función la usan el trigger,
-- la previsualización del recálculo y el simulador de la interfaz. Si estuvieran
-- duplicadas, la previsualización podría mentir sobre lo que hará el UPDATE, que
-- es justo el riesgo que hay que eliminar.
-- ----------------------------------------------------------------------------

-- Devuelve la fila de política que gana para un puesto y una fecha.
--
-- Prioridad, de mayor a menor:
--   1. puesto propio + día concreto
--   2. puesto propio + base
--   3. '*' + día concreto
--   4. '*' + base
--
-- La fila ganadora aporta TODOS sus valores; no hay mezcla de campos entre
-- filas. Así "qué política se aplicó a esta asistencia" tiene una respuesta
-- única y auditable.
create or replace function public.resolver_politica_horas_extra(
  p_puesto text,
  p_fecha  date
)
returns public.politica_horas_extra
language sql
stable
parallel safe
as $function$
  select p.*
    from public.politica_horas_extra p
   where p.activa
     and p.fecha_desde <= p_fecha
     and (p.puesto = trim(coalesce(p_puesto, '')) or p.puesto = '*')
     and (p.dia_semana = extract(isodow from p_fecha)::smallint or p.dia_semana is null)
   order by (p.puesto <> '*')          desc,
            (p.dia_semana is not null) desc,
            p.fecha_desde              desc,
            p.id                       desc
   limit 1;
$function$;

comment on function public.resolver_politica_horas_extra(text, date) is
  'Política de horas extra vigente para un puesto en una fecha. La usan el trigger, la previsualización del recálculo y el simulador.';


-- Toda la aritmética del cálculo, en un solo lugar.
--
-- El recálculo retroactivo llama a ESTA función en vez de reimplementar la
-- fórmula en un CTE, como hace hoy 092_recalcular_horas_extra_retroactivo_16jul.sql
-- --que además quedó con `interval '30 minutes'` donde el trigger usa 45--.
-- Es la prueba de por qué no hay que duplicarla.
create or replace function public.calcular_extras_con_politica(
  p_hora_ingreso        time,
  p_hora_entrada_prog   time,
  p_hora_salida         time,
  p_hora_salida_prog    time,
  p_fecha               date,
  p_puesto              text
)
returns numeric
language plpgsql
stable
parallel safe
as $function$
DECLARE
    pol                     public.politica_horas_extra;
    hora_inicio_efectiva    time;
    hora_fin_efectiva       time;
    intervalo_trabajado     interval;
    intervalo_exceso_salida interval;
    horas_totales           numeric;
    horas_extras            numeric;
    descuenta_descanso      boolean;
    -- Los valores efectivos. Si no hay política, caen a los literales de
    -- siempre: NUNCA a 0 ni a null, que borraría horas reales en silencio.
    v_umbral                numeric;
    v_descanso              numeric;
    v_descanso_desde        numeric;
    v_tolerancia            integer;
    v_minimo                numeric;
    v_tope                  numeric;
    v_redondeo              text;
    v_bloque                integer;
BEGIN
    IF p_hora_ingreso IS NULL OR p_hora_entrada_prog IS NULL
       OR p_hora_salida IS NULL OR p_hora_salida_prog IS NULL
       OR p_fecha IS NULL THEN
        RETURN NULL;
    END IF;

    pol := public.resolver_politica_horas_extra(p_puesto, p_fecha);

    -- COALESCE campo por campo. Aunque alguien borre la fila '*' por error, el
    -- sistema sigue calculando exactamente como antes de este script.
    v_umbral         := coalesce(pol.umbral_horas,          7.0);
    v_descanso       := coalesce(pol.horas_descanso,        1.0);
    v_descanso_desde := pol.descanso_desde_horas;               -- null = siempre descuenta
    v_tolerancia     := coalesce(pol.tolerancia_salida_min,  45);
    v_minimo         := coalesce(pol.minimo_extra_horas,     0);
    v_tope           := pol.tope_extra_turno_horas;             -- null = sin tope
    v_redondeo       := coalesce(pol.redondeo_modo,   'truncar');
    v_bloque         := pol.redondeo_bloque_min;

    -- 1) Inicio efectivo: llegar antes no cuenta.
    IF p_hora_ingreso < p_hora_entrada_prog THEN
        hora_inicio_efectiva := p_hora_entrada_prog;
    ELSE
        hora_inicio_efectiva := p_hora_ingreso;
    END IF;

    -- 2) Fin efectivo, con la tolerancia de salida.
    intervalo_exceso_salida := p_hora_salida - p_hora_salida_prog;

    -- Cruce de medianoche.
    IF intervalo_exceso_salida < interval '-12 hours' THEN
        intervalo_exceso_salida := intervalo_exceso_salida + interval '24 hours';
    ELSIF intervalo_exceso_salida > interval '12 hours' THEN
        intervalo_exceso_salida := intervalo_exceso_salida - interval '24 hours';
    END IF;

    IF intervalo_exceso_salida >= interval '0'
       AND intervalo_exceso_salida < make_interval(mins => v_tolerancia) THEN
        hora_fin_efectiva := p_hora_salida_prog;
    ELSE
        hora_fin_efectiva := p_hora_salida;
    END IF;

    -- 3) Horas trabajadas.
    intervalo_trabajado := hora_fin_efectiva - hora_inicio_efectiva;
    IF intervalo_trabajado < interval '0' THEN
        intervalo_trabajado := intervalo_trabajado + interval '24 hours';
    END IF;

    horas_totales := extract(epoch from intervalo_trabajado) / 3600.0;

    -- 4) Descanso: siempre, o solo si el turno pasa de cierto largo.
    descuenta_descanso := (v_descanso_desde IS NULL) OR (horas_totales > v_descanso_desde);

    horas_extras := horas_totales - v_umbral;
    IF descuenta_descanso THEN
        horas_extras := horas_extras - v_descanso;
    END IF;

    IF horas_extras < 0 THEN
        horas_extras := 0;
    END IF;

    -- 5) Redondeo.
    IF v_redondeo = 'bloque' AND coalesce(v_bloque, 0) > 0 THEN
        -- Hacia abajo, al bloque completo: 1h47 con bloques de 30 min -> 1h30.
        horas_extras := floor(horas_extras * 60.0 / v_bloque) * v_bloque / 60.0;
    ELSIF v_redondeo = 'redondear' THEN
        horas_extras := round(horas_extras, 2);
    ELSE
        -- 'truncar' recorta decimales, NO redondea a bloques. Es lo que hace
        -- hoy TRUNC(x, 2) y hay que conservarlo para no mover un centavo.
        horas_extras := trunc(horas_extras, 2);
    END IF;

    -- 6) Mínimo: por debajo de esto no se genera nada.
    IF horas_extras < v_minimo THEN
        horas_extras := 0;
    END IF;

    -- 7) Tope por turno.
    IF v_tope IS NOT NULL AND horas_extras > v_tope THEN
        horas_extras := v_tope;
    END IF;

    RETURN horas_extras;
END;
$function$;

comment on function public.calcular_extras_con_politica(time, time, time, time, date, text) is
  'Horas extra de una jornada según la política vigente. Única implementación de la fórmula: la usan el trigger y el recálculo retroactivo.';


-- Calcula en LOTE las horas extra de un conjunto de filas de asistencia.
--
-- La usa la previsualizacion del recalculo retroactivo. Existe para que el
-- numero lo produzca SIEMPRE Postgres con la misma funcion del trigger: si el
-- servidor de la aplicacion replicara la formula, la previsualizacion podria
-- mostrar un resultado y el UPDATE escribir otro.
create or replace function public.calcular_extras_lote(p_ids bigint[])
returns table (id bigint, horas_extra numeric)
language sql
stable
as $function$
  select r.id,
         public.calcular_extras_con_politica(
           r.horaingreso, r.horaentradaprogramada,
           r.horasalida,  r.horasalidaprogramada,
           r.fecha,       r.puesto
         )
    from public.registroasistencia r
   where r.id = any(p_ids);
$function$;

comment on function public.calcular_extras_lote(bigint[]) is
  'Horas extra de varias filas de asistencia, con la misma funcion que usa el trigger. Alimenta la previsualizacion del recalculo.';


-- ============================================================================
-- PASO 5 — PRUEBA DE EQUIVALENCIA  ***EL PASO QUE DECIDE SI SE SIGUE***
--
-- Compara la función nueva contra lo que YA está calculado en la tabla, sobre
-- datos reales. El trigger todavía NO se ha tocado, así que esto es solo
-- lectura.
--
--   discrepancias DEBE DAR 0.
--
-- Si no da 0: NO correr el PASO 6. Significa que la política no reproduce el
-- comportamiento actual y hay que revisar la semilla antes de reemplazar nada.
--
-- (Se comparan solo las filas que el trigger sí calcula: especialidad='true' y
-- los cuatro tiempos presentes. `extras_manual` todavía no existe en ninguna
-- fila, así que no contamina la comparación.)
-- ============================================================================
select count(*)                                as filas_evaluadas,
       count(*) filter (where difiere)         as discrepancias,
       round(max(abs(nuevo - viejo)), 4)       as maxima_diferencia
  from (
    select r.id,
           public.calcular_extras_con_politica(
             r.horaingreso, r.horaentradaprogramada,
             r.horasalida,  r.horasalidaprogramada,
             r.fecha,       r.puesto
           )                                                   as nuevo,
           greatest(coalesce(r.hed, 0), coalesce(r.hedf, 0))    as viejo,
           public.calcular_extras_con_politica(
             r.horaingreso, r.horaentradaprogramada,
             r.horasalida,  r.horasalidaprogramada,
             r.fecha,       r.puesto
           ) is distinct from
           greatest(coalesce(r.hed, 0), coalesce(r.hedf, 0))    as difiere
      from public.registroasistencia r
     where r.fecha between date '2026-07-17' and date '2026-08-31'
       and lower(r.especialidad) = 'true'
       and r.horaingreso is not null
       and r.horasalida is not null
       and r.horaentradaprogramada is not null
       and r.horasalidaprogramada is not null
  ) x;

-- Si hubo discrepancias, esta consulta muestra CUÁLES, para diagnosticar.
select r.fecha,
       to_char(r.fecha, 'TMDay')  as dia,
       r.nombre,
       r.puesto,
       r.horaingreso, r.horaentradaprogramada,
       r.horasalida,  r.horasalidaprogramada,
       r.hed          as hed_guardado,
       r.hedf         as hedf_guardado,
       public.calcular_extras_con_politica(
         r.horaingreso, r.horaentradaprogramada,
         r.horasalida,  r.horasalidaprogramada,
         r.fecha,       r.puesto
       )              as calculado_nuevo
  from public.registroasistencia r
 where r.fecha between date '2026-07-17' and date '2026-08-31'
   and lower(r.especialidad) = 'true'
   and r.horaingreso is not null
   and r.horasalida is not null
   and r.horaentradaprogramada is not null
   and r.horasalidaprogramada is not null
   and public.calcular_extras_con_politica(
         r.horaingreso, r.horaentradaprogramada,
         r.horasalida,  r.horasalidaprogramada,
         r.fecha,       r.puesto
       ) is distinct from greatest(coalesce(r.hed, 0), coalesce(r.hedf, 0))
 order by r.fecha, r.nombre
 limit 100;


-- ============================================================================
-- PASO 6 — REEMPLAZAR EL TRIGGER
--
-- *** CORRER SOLO SI EL PASO 5 DIO 0 DISCREPANCIAS ***
--
-- La función queda reducida a: guarda -> llamar al cálculo -> clasificar
-- hed/hedf. Toda la aritmética vive ahora en calcular_extras_con_politica.
-- ============================================================================
create or replace function public.calcular_y_asignar_horas_extras()
returns trigger
language plpgsql
as $function$
DECLARE
    horas_extras NUMERIC;
    es_festivo   BOOLEAN;
    dia_semana   INTEGER;
BEGIN
    -- Si la marcación cambió, lo que haya fijado una persona a mano deja de
    -- ser válido: son horas distintas. La bandera se limpia y se recalcula.
    IF TG_OP = 'UPDATE' AND NEW.extras_manual THEN
        IF NEW.horaingreso IS DISTINCT FROM OLD.horaingreso
           OR NEW.horasalida IS DISTINCT FROM OLD.horasalida
           OR NEW.horaentradaprogramada IS DISTINCT FROM OLD.horaentradaprogramada
           OR NEW.horasalidaprogramada IS DISTINCT FROM OLD.horasalidaprogramada THEN
            NEW.extras_manual := false;
        END IF;
    END IF;

    -- Ajuste manual: alguien ya decidió estas horas. No se tocan.
    -- Sin esta salida, el UPDATE del ajuste manual dispara este mismo trigger y
    -- pisa el valor recién escrito.
    IF NEW.extras_manual THEN
        RETURN NEW;
    END IF;

    IF LOWER(NEW.especialidad) = 'true'
       AND NEW.horasalida IS NOT NULL
       AND NEW.horaingreso IS NOT NULL
       AND NEW.horaentradaprogramada IS NOT NULL
       AND NEW.horasalidaprogramada IS NOT NULL THEN

        horas_extras := public.calcular_extras_con_politica(
            NEW.horaingreso, NEW.horaentradaprogramada,
            NEW.horasalida,  NEW.horasalidaprogramada,
            NEW.fecha,       NEW.puesto
        );

        IF horas_extras IS NULL THEN
            horas_extras := 0;
        END IF;

        -- Domingo o festivo -> extra festiva (hedf); el resto -> ordinaria (hed).
        -- El festivo se consulta contra `festivos`, la MISMA tabla que usan
        -- pagonomina y facturacionturnos, para que las tres no discrepen.
        dia_semana := EXTRACT(ISODOW FROM NEW.fecha);

        SELECT EXISTS (
            SELECT 1 FROM public.festivos f WHERE f.fecha = NEW.fecha
        ) INTO es_festivo;

        IF dia_semana = 7 OR es_festivo THEN
            NEW.hedf := horas_extras;
            NEW.hed  := 0;
        ELSE
            NEW.hed  := horas_extras;
            NEW.hedf := 0;
        END IF;

    END IF;

    RETURN NEW;
END;
$function$;

-- El trigger en sí no cambia de forma; se recrea por si acaso no existiera.
drop trigger if exists trg_calcular_horas_extras on public.registroasistencia;
create trigger trg_calcular_horas_extras
  before insert or update on public.registroasistencia
  for each row execute function public.calcular_y_asignar_horas_extras();


-- ----------------------------------------------------------------------------
-- PASO 7 — VERIFICACIÓN
-- ----------------------------------------------------------------------------

-- 7a) La tabla y la columna nueva existen.
select column_name, data_type, column_default, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'politica_horas_extra'
 order by ordinal_position;

select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'registroasistencia'
   and column_name = 'extras_manual';

-- 7b) Las dos filas de la semilla.
select puesto, fecha_desde, dia_semana, umbral_horas, horas_descanso,
       descanso_desde_horas, tolerancia_salida_min, redondeo_modo, nota
  from public.politica_horas_extra
 order by puesto, fecha_desde, dia_semana nulls first;

-- 7c) EL CASO CONOCIDO. Estos cuatro valores deben dar exactamente:
--        0.50  ·  1.50  ·  0.00  ·  0.00
--     Un sábado (2026-08-29) y un lunes (2026-08-31) para el contraste.
select 'sábado 06:00-11:00 (5h, no supera 6h -> sin descanso)' as caso,
       public.calcular_extras_con_politica(
         time '06:00', time '06:00', time '11:00', time '11:00',
         date '2026-08-29', 'Distribución Turno') as resultado,
       0.50 as esperado
union all
select 'sábado 06:00-13:00 (7h, supera 6h -> con descanso)',
       public.calcular_extras_con_politica(
         time '06:00', time '06:00', time '13:00', time '13:00',
         date '2026-08-29', 'Distribución Turno'),
       1.50
union all
select 'lunes 06:00-13:00 (cae en la política general)',
       public.calcular_extras_con_politica(
         time '06:00', time '06:00', time '13:00', time '13:00',
         date '2026-08-31', 'Distribución Turno'),
       0.00
union all
select 'sábado 06:00-11:00, otro puesto (política general)',
       public.calcular_extras_con_politica(
         time '06:00', time '06:00', time '11:00', time '11:00',
         date '2026-08-29', 'Cargue/Descargue'),
       0.00;

-- 7d) Qué política gana en cada caso. Sirve para depurar si 7c no cuadra.
select 'Distribución Turno · sábado' as caso,
       (public.resolver_politica_horas_extra('Distribución Turno', date '2026-08-29')).puesto,
       (public.resolver_politica_horas_extra('Distribución Turno', date '2026-08-29')).dia_semana,
       (public.resolver_politica_horas_extra('Distribución Turno', date '2026-08-29')).umbral_horas
union all
select 'Distribución Turno · lunes',
       (public.resolver_politica_horas_extra('Distribución Turno', date '2026-08-31')).puesto,
       (public.resolver_politica_horas_extra('Distribución Turno', date '2026-08-31')).dia_semana,
       (public.resolver_politica_horas_extra('Distribución Turno', date '2026-08-31')).umbral_horas;


-- ============================================================================
-- PARA DEVOLVER TODO
--
-- Restaura la función anterior (con los literales quemados) y deja la tabla en
-- pie sin efecto. La columna `extras_manual` puede quedarse: es inofensiva.
--
--   create or replace function public.calcular_y_asignar_horas_extras()
--   ... ver scripts/049_fn_calcular_y_asignar_horas_extras.sql en el commit anterior
--
-- Para revertir un recálculo retroactivo concreto:
--
--   update public.registroasistencia r
--      set hed = b.hed, hedf = b.hedf, hen = b.hen, hef = b.hef, hn = b.hn
--     from public.respaldo_recalculo_extras b
--    where r.id = b.registro_id
--      and b.lote_id = '<uuid del lote>';
-- ============================================================================
