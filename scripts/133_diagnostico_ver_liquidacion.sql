-- =====================================================================
-- "Ver Liquidación" (Nómina personal) sale vacía. CAUSA RAÍZ IDENTIFICADA
-- leyendo `pg_get_viewdef('public.pagonomina')`.
--
-- `pagonomina` NO es cara por el volumen de datos: las tablas de las que come
-- son minúsculas (cabeceraoc 7.387 filas, registroasistencia 9.686). Es cara
-- por su FORMA. Tres cosas, en orden de gravedad:
--
--  1. CALENDARIO SOBRE TODO EL HISTÓRICO
--     `rango_fechas` toma min/max de TODAS las fechas de cabeceraoc y
--     registroasistencia. `calendario_base` hace `generate_series` de ese rango
--     completo CROSS JOIN con TODAS las personas que existieron alguna vez.
--     Ese producto se reconstruye entero en cada consulta.
--
--  2. LAS VENTANAS BLOQUEAN EL FILTRO DE FECHA
--     `calculo_nomina_base` usa
--        sum(...) OVER (PARTITION BY persona ORDER BY fecha
--                       ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING)
--     Postgres solo empuja un WHERE a través de una función de ventana si el
--     filtro es sobre una columna del PARTITION BY. Aquí es `persona`, no
--     `fecha`. Por eso `where fecha >= ...` se aplica DESPUÉS de calcular las
--     ventanas sobre el calendario completo: acotar por fecha NO evita el
--     trabajo. Esta es la razón de fondo.
--
--  3. LA VISTA TERMINA EN `ORDER BY persona, fecha DESC`
--     Un ORDER BY dentro de una vista ordena el resultado íntegro en cada
--     consulta, sin importar el WHERE ni el LIMIT de afuera. Y no sirve de
--     nada: cada consumidor ordena por su cuenta. Ese sort sobre filas anchas
--     es el candidato número uno del derrame que llenó el disco.
--
--  Extra: el WHERE final tiene cuatro EXISTS correlacionados contra
--  headcount/colaboradores_th y un (select min(hi2.fechainicio) ...) que se
--  evalúan POR CADA FILA del calendario.
--
-- >>> Ninguna consulta de este archivo usa EXPLAIN ANALYZE. `EXPLAIN` a secas
-- >>> NO ejecuta: no puede derramar a disco ni tumbar nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) DIMENSIONAR EL PROBLEMA: ¿de qué tamaño es el calendario que se
--    reconstruye en CADA consulta?
--
--    Solo recorre las dos tablas pequeñas. Es la cifra que explica todo:
--    `filas_calendario` es el número de filas que la vista materializa
--    ANTES de aplicar cualquier filtro de fecha.
-- ---------------------------------------------------------------------
with rango as (
  select min(f) as desde, max(f) as hasta
  from (
    select fechacargue as f from cabeceraoc
    union all
    select fecha       as f from registroasistencia
  ) t
), personas as (
  select count(*) as n
  from (
    select distinct trim(regexp_split_to_table(auxiliares, ',')) as p
    from cabeceraoc
    -- `fincargue` es de tipo `time`: hay que castear para compararlo con ''.
    -- Es el mismo criterio del CTE `transformacion` de la vista.
    where fincargue is not null and fincargue::text <> ''
    union
    select distinct trim(nombre) from registroasistencia
  ) x
)
select rango.desde,
       rango.hasta,
       (rango.hasta - rango.desde + 1)              as dias,
       personas.n                                   as personas,
       (rango.hasta - rango.desde + 1) * personas.n as filas_calendario,
       -- Para contrastar: lo que la vista DEVUELVE al final.
       31887                                        as filas_que_devuelve_aprox
from rango, personas;

-- ---------------------------------------------------------------------
-- 2) EL PLAN, PARA CONFIRMARLO.
--    Es la consulta exacta de la pestaña, ya acotada al mes. Busca el
--    `WindowAgg` y el `Sort` que tiene debajo: sus `rows=` deben coincidir
--    con `filas_calendario` del punto 1, NO con las filas del mes. Eso
--    prueba que el filtro de fecha no entró.
-- ---------------------------------------------------------------------
explain
select fecha, persona, total_liquidado_dia
from public.pagonomina
where fecha >= date_trunc('month', current_date)::date
  and fecha <= current_date
order by fecha desc
limit 1000;

-- ---------------------------------------------------------------------
-- 3) CUÁNTO SE HA DERRAMADO A DISCO Y CON CUÁNTA MEMORIA CUENTA.
--    Solo estadísticas: no ejecuta nada.
-- ---------------------------------------------------------------------
select pg_size_pretty(pg_database_size(current_database())) as tamano_base,
       (select pg_size_pretty(temp_bytes) from pg_stat_database where datname = current_database()) as temporales_acumulados,
       (select temp_files  from pg_stat_database where datname = current_database()) as veces_que_derramo,
       (select stats_reset from pg_stat_database where datname = current_database()) as contador_desde;

select name, setting, unit
from pg_settings
where name in ('work_mem', 'temp_file_limit', 'statement_timeout');

-- =====================================================================
-- LAS SALIDAS POSIBLES, DE MENOR A MAYOR RIESGO
--
-- A) QUITAR EL `ORDER BY` DE LA VISTA.
--    Barato y reversible. El orden de las filas de una vista no es un
--    contrato: en la app, cada consumidor agrega o pide su propio orden
--    (`.order(...)`). Elimina un sort completo sobre filas anchas en CADA
--    consulta. Requiere CREATE OR REPLACE VIEW con la definición actual
--    menos esa línea — no se puede quitar de otra forma.
--
-- B) ACOTAR EL CALENDARIO.
--    Hoy arranca en la fecha más vieja que exista. Si la nómina solo se
--    consulta desde cierto año, `rango_fechas` puede partir de ahí y el
--    calendario se reduce proporcionalmente. CAMBIA QUÉ HISTÓRICO SE VE:
--    es decisión del negocio, no técnica.
--
-- C) MATERIALIZAR.
--    Lo correcto de fondo: los meses cerrados no cambian y se recalculan
--    enteros en cada consulta. Es lo que de verdad resuelve los rangos
--    largos. Toca nómina, facturación, parafiscales y archivo plano —
--    ventana de mantenimiento y pruebas de cuadre antes de cambiar.
--
-- LO YA HECHO EN LA APP (no reemplaza nada de lo anterior): la pestaña
-- arranca acotada al mes en curso y no puede lanzar la consulta abierta.
-- Eso baja de ~32 recálculos completos (paginaba de 1000 en 1000 sobre todo
-- el histórico) a uno o dos. Ayuda, pero el recálculo sigue ahí.
-- =====================================================================
