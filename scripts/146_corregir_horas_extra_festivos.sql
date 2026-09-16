-- ============================================================================
-- Horas extra en DÍA FESTIVO: se estaban pagando como ORDINARIAS
--
-- EL PROBLEMA
--   `calcular_y_asignar_horas_extras()` decidía el tipo de hora extra mirando
--   SOLO el día de la semana:
--
--       dia_semana := EXTRACT(ISODOW FROM NEW.fecha);
--       IF dia_semana = 7 THEN  NEW.hedf := ...   -- domingo
--       ELSE                    NEW.hed  := ...   -- todo lo demas
--
--   Nunca consultaba la tabla `festivos`. Un festivo que cae entre lunes y
--   sábado -- el 17-ago-2026, traslado de la Asunción, es lunes -- entraba en
--   `hed` (extra diurna ORDINARIA, recargo 25%) en vez de `hedf` (extra diurna
--   FESTIVA, recargo 115%). Se le paga al trabajador MENOS de lo que le
--   corresponde.
--
--   Solo fallan los festivos de lunes a sábado. Los domingos siempre estuvieron
--   bien, y un festivo que cae domingo tambien, por el ISODOW = 7.
--
--   EL ALCANCE ES MAYOR QUE UN DIA: en 2026 los DIECIOCHO festivos de Colombia
--   caen entre lunes y sábado -- ninguno cae domingo. Es decir, TODAS las horas
--   extra trabajadas en festivo durante 2026 se clasificaron como ordinarias,
--   no solo las del 17 de agosto. La consulta 2b muestra el total real.
--
-- QUE HAY QUE CORRER, EN ORDEN
--   1. Las consultas 1 y 2 de aquí, para confirmar el diagnóstico.
--   2. scripts/049_fn_calcular_y_asignar_horas_extras.sql -- reemplaza la función
--      para que consulte `festivos`. Arregla lo que venga DE AHORA EN ADELANTE.
--   3. El PASO 3 de este archivo -- recalcula lo YA REGISTRADO. Está comentado.
--
-- ESTE SCRIPT NO MODIFICA NADA POR SÍ SOLO.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) LO PRIMERO: ¿ESTÁ EL 17 DE AGOSTO EN LA TABLA DE FESTIVOS?
--
--    Si NO está, arreglar la función no sirve de nada: seguiría sin
--    reconocerlo. Primero hay que cargarlo (ver el bloque del final).
--    Lista los festivos de 2026 y marca cuáles caen entre lunes y sábado, que
--    son exactamente los que el cálculo viejo se perdía.
-- ----------------------------------------------------------------------------
select f.fecha,
       to_char(f.fecha, 'TMDay')                as dia,
       extract(isodow from f.fecha)             as isodow,
       case when extract(isodow from f.fecha) = 7
            then 'domingo — el cálculo viejo YA lo tomaba bien'
            else 'lun–sáb — el cálculo viejo lo pagaba como ORDINARIA'
       end                                      as diagnostico
  from public.festivos f
 where f.fecha >= date '2026-01-01'
   and f.fecha <  date '2027-01-01'
 order by f.fecha;

-- ----------------------------------------------------------------------------
-- 2) A QUIÉN LE AFECTÓ: filas con horas extra cargadas a `hed` en un día que
--    era festivo. Estas son las que se pagaron al 25% debiendo ir al 115%.
--
--    Cada hora aquí se reconoció con 25% de recargo debiendo llevar 115%: son
--    90 puntos porcentuales de la hora ordinaria por cada hora mal clasificada.
-- ----------------------------------------------------------------------------
select r.fecha,
       to_char(r.fecha, 'TMDay')  as dia,
       r.idempresa,
       r.nombre,
       r.identificacion,
       r.puesto,
       r.aprobado,
       r.hed                      as horas_como_ordinaria,
       r.hedf                     as horas_como_festiva,
       'hed 25% -> hedf 115%'     as correccion
  from public.registroasistencia r
  join public.festivos f on f.fecha = r.fecha
 where coalesce(r.hed, 0) > 0
   and extract(isodow from r.fecha) <> 7
 order by r.fecha desc, r.nombre;

-- ----------------------------------------------------------------------------
-- 2b) EL RESUMEN: cuántas horas y cuántas personas, por festivo. Es el tamaño
--     real del problema y lo que hay que mirar antes de decidir el recálculo.
-- ----------------------------------------------------------------------------
select r.fecha,
       to_char(r.fecha, 'TMDay')                            as dia,
       count(*)                                             as filas,
       count(distinct r.identificacion)                     as personas,
       round(sum(coalesce(r.hed, 0)), 2)                    as horas_mal_clasificadas,
       count(*) filter (
         where lower(trim(coalesce(r.aprobado::text, ''))) = 'aprobado'
       )                                                    as filas_aprobadas
  from public.registroasistencia r
  join public.festivos f on f.fecha = r.fecha
 where coalesce(r.hed, 0) > 0
   and extract(isodow from r.fecha) <> 7
 group by r.fecha
 order by r.fecha desc;

-- ============================================================================
-- PASO 3 — RECÁLCULO DE LO YA REGISTRADO
--
-- Descomentar SOLO después de:
--   a) haber corrido scripts/049_fn_calcular_y_asignar_horas_extras.sql, y
--   b) haber revisado la consulta 2b.
--
-- NO recalcula las horas: la cantidad ya está bien, lo único que estaba mal es
-- en qué columna quedó. Mueve el valor de `hed` a `hedf`, que es exactamente
-- lo que hará la función corregida de ahora en adelante.
--
-- Se limita a los festivos de lunes a sábado: el domingo nunca estuvo mal.
-- ============================================================================

-- begin;
--
-- create temporary table tmp_extras_festivas as
-- select r.id, r.fecha, r.nombre, r.identificacion, r.aprobado,
--        r.hed as hed_antes, r.hedf as hedf_antes
--   from public.registroasistencia r
--   join public.festivos f on f.fecha = r.fecha
--  where coalesce(r.hed, 0) > 0
--    and extract(isodow from r.fecha) <> 7;
--
-- update public.registroasistencia r
--    set hedf = coalesce(r.hedf, 0) + r.hed,
--        hed  = 0
--   from tmp_extras_festivas t
--  where r.id = t.id;
--
-- -- Verificar ANTES de confirmar: debe coincidir con la consulta 2b.
-- select count(*)                          as filas_corregidas,
--        count(distinct identificacion)    as personas,
--        round(sum(hed_antes), 2)          as horas_movidas_a_festiva
--   from tmp_extras_festivas;
--
-- -- Y que no quede ninguna: esto tiene que dar 0.
-- select count(*) as deberia_ser_cero
--   from public.registroasistencia r
--   join public.festivos f on f.fecha = r.fecha
--  where coalesce(r.hed, 0) > 0
--    and extract(isodow from r.fecha) <> 7;
--
-- commit;    -- o  rollback;  si los numeros no cuadran
-- ============================================================================

-- ============================================================================
-- SI FALTAN FESTIVOS EN LA TABLA
--
-- Si la consulta 1 no muestra el 17-ago-2026, la tabla `festivos` está
-- incompleta y hay que cargarlo antes de nada. Estos son los festivos de
-- Colombia de 2026; el insert no duplica lo que ya esté.
--
-- VERIFICARLOS contra el calendario oficial antes de correr esto.
--
-- Los 18 festivos de Colombia en 2026. Calculados, no copiados: Pascua 2026 es
-- el 5 de abril, y los trasladables se corren al lunes siguiente (Ley Emiliani).
--
-- insert into public.festivos (fecha)
-- select f::date from (values
--   ('2026-01-01'),  -- Año Nuevo                 jueves
--   ('2026-01-12'),  -- Reyes Magos               lunes  (desde el 6, martes)
--   ('2026-03-23'),  -- San José                  lunes  (desde el 19, jueves)
--   ('2026-04-02'),  -- Jueves Santo              jueves
--   ('2026-04-03'),  -- Viernes Santo             viernes
--   ('2026-05-01'),  -- Día del Trabajo           viernes
--   ('2026-05-18'),  -- Ascensión                 lunes  (desde el 14, jueves)
--   ('2026-06-08'),  -- Corpus Christi            lunes  (desde el 4, jueves)
--   ('2026-06-15'),  -- Sagrado Corazón           lunes  (desde el 12, viernes)
--   ('2026-06-29'),  -- San Pedro y San Pablo     lunes
--   ('2026-07-20'),  -- Independencia             lunes
--   ('2026-08-07'),  -- Batalla de Boyacá         viernes
--   ('2026-08-17'),  -- Asunción                  lunes  (desde el 15, sábado)
--   ('2026-10-12'),  -- Día de la Raza            lunes
--   ('2026-11-02'),  -- Todos los Santos          lunes  (desde el 1, domingo)
--   ('2026-11-16'),  -- Indep. de Cartagena       lunes  (desde el 11, miércoles)
--   ('2026-12-08'),  -- Inmaculada Concepción     martes
--   ('2026-12-25')   -- Navidad                   viernes
-- ) as v(f)
-- where not exists (select 1 from public.festivos x where x.fecha = f::date);
-- ============================================================================
