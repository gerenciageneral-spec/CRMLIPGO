-- =====================================================================
-- "Ver Liquidación" salía vacía. CAUSA: UNA FECHA MAL DIGITADA.
--
-- La vista `pagonomina` arma un calendario persona×día con el rango entre la
-- fecha MÍNIMA y la MÁXIMA de `cabeceraoc.fechacargue` + `registroasistencia.fecha`,
-- y lo cruza con TODAS las personas. Medido:
--
--     desde       2026-01-05
--     hasta      62026-08-06   <-- año 62026
--     días       21.914.764
--     personas          170
--     filas       3.725.509.880
--
-- Un registro con el año 62026 (un 6 de más al teclear) hace que la vista
-- intente materializar 3.725 MILLONES de filas en cada consulta. De ahí el
-- timeout, y de ahí el "No space left on device": los archivos temporales
-- llenaron el disco.
--
-- Con el rango correcto son ~214 días × 170 personas ≈ 36.000 filas.
--
-- NO hay que rediseñar la vista: hay que corregir el dato.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ENCONTRAR EL O LOS REGISTROS. Corre esto PRIMERO y revisa qué sale.
--    Se buscan fechas imposibles en las dos tablas que alimentan el rango.
-- ---------------------------------------------------------------------
select 'cabeceraoc'                as tabla,
       id::text                    as id,
       ordendecargue::text         as referencia,
       fechacargue::text           as fecha_mala,
       idempresa::text             as empresa
from public.cabeceraoc
where fechacargue > current_date + interval '1 year'
   or fechacargue < date '2015-01-01'

union all

select 'registroasistencia',
       id::text,
       nombre::text,
       fecha::text,
       idempresa::text
from public.registroasistencia
where fecha > current_date + interval '1 year'
   or fecha < date '2015-01-01'

order by tabla, fecha_mala;

-- ---------------------------------------------------------------------
-- 2) CORREGIR.
--
--    NO se incluye un UPDATE a ciegas: hay que ver el punto 1 para saber
--    cuál era la fecha REAL de esa orden (normalmente basta quitar el
--    dígito sobrante: 62026 -> 2026, y contrastar contra `fechaorden` o
--    `creado` de la misma fila).
--
--    Plantilla — reemplazar <id> y <fecha_correcta> con lo que salga arriba:
--
--      update public.cabeceraoc
--         set fechacargue = date '<fecha_correcta>'
--       where id = <id>;
--
--    Si la orden resulta ser basura de pruebas, lo correcto es marcarla
--    como no facturable o borrarla, no dejarle una fecha inventada.
--
--    Verificar DESPUÉS de corregir: el rango debe volver a ser sensato.
-- ---------------------------------------------------------------------
with rango as (
  select min(f) as desde, max(f) as hasta
  from (
    select fechacargue as f from public.cabeceraoc
    union all
    select fecha       as f from public.registroasistencia
  ) t
), personas as (
  select count(*) as n
  from (
    select distinct trim(regexp_split_to_table(auxiliares, ',')) as p
    from public.cabeceraoc
    where fincargue is not null and fincargue::text <> ''
    union
    select distinct trim(nombre) from public.registroasistencia
  ) x
)
select rango.desde,
       rango.hasta,
       (rango.hasta - rango.desde + 1)              as dias,
       personas.n                                   as personas,
       (rango.hasta - rango.desde + 1) * personas.n as filas_calendario
from rango, personas;
--    Esperado: días en cientos, filas_calendario en decenas de miles.

-- =====================================================================
-- 3) QUE NO VUELVA A PASAR.
--
-- Una sola fecha mal tecleada tumbó un módulo entero y llenó el disco de la
-- base. El formulario no valida el rango, así que puede repetirse mañana.
--
-- Estas restricciones rechazan la fecha imposible EN EL MOMENTO de guardarla,
-- que es donde cuesta un error y no un incidente. Revisar que no haya datos
-- históricos que las violen antes de aplicarlas — si el punto 1 quedó limpio,
-- pasan sin problema.
--
-- Se dejan COMENTADAS: son cambios de esquema, decídelo tú.
-- =====================================================================

-- alter table public.cabeceraoc
--   add constraint chk_cabeceraoc_fechacargue_sensata
--   check (fechacargue is null
--          or (fechacargue >= date '2015-01-01' and fechacargue <= date '2100-01-01'));

-- alter table public.registroasistencia
--   add constraint chk_registroasistencia_fecha_sensata
--   check (fecha is null
--          or (fecha >= date '2015-01-01' and fecha <= date '2100-01-01'));

-- =====================================================================
-- NOTA SOBRE LA VISTA
--
-- Los problemas de FORMA de `pagonomina` siguen ahí y valen la pena aparte:
--
--   · Termina en `ORDER BY persona, fecha DESC`. Una vista con ORDER BY
--     ordena el resultado íntegro en cada consulta, sin importar el WHERE ni
--     el LIMIT de afuera, y no sirve de nada porque cada consumidor pide su
--     propio orden.
--   · Las funciones de ventana (PARTITION BY persona ORDER BY fecha) impiden
--     que el filtro de `fecha` se empuje hacia adentro: siempre se calcula
--     sobre el calendario completo.
--
-- Con el rango sano el módulo funciona igual, pero esas dos cosas hacen que
-- el costo crezca con el histórico y que un dato malo pueda volver a tumbarlo.
-- No son urgentes; son deuda.
-- =====================================================================
