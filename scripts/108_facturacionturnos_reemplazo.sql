-- =====================================================================
-- facturacionturnos — REESCRITURA para que facture LO REAL.
--
-- La vista anterior tenía cinco defectos que distorsionaban el ingreso del
-- Estado de Resultados (todos verificados contra datos de julio-2026):
--
--   1. IGNORABA `cobraturno = 'NO'`: le cobraba turno a Estibado PT, Salvado y
--      Montacargas de producción, que YA se cobran por los ingresos de
--      producción aprobados. DOBLE COBRO: $12.115.659 solo en julio (id2).
--      (El UNION ALL con dos ramas idénticas era un intento de separar esos
--      puestos que quedó sin efecto: ambas ramas devolvían lo mismo.)
--   2. Solo facturaba la hora extra diurna (`hed`): hedf, hen, hef y hn se
--      calculaban pero salían en $0. En julio, $137.674 sin facturar solo en
--      Indupan.
--   3. Restaba 0,66 h por fila y por clase de hora: venía de la jornada de
--      7,3333 h y quedó obsoleto con la jornada de 7 h (16-jul-2026).
--   4. Cobraba turno en días NO trabajados: vacaciones, incapacidades,
--      licencias y descansos facturaban tarifa completa.
--   5. Ignoraba `tarifaturnofestivo`: los domingos y festivos se cobraban como
--      día ordinario ($136.131 en vez de $188.045 en Distribución Turno).
--
-- Qué factura la vista nueva: por cada día TRABAJADO (asistencia sin novedad)
-- de un puesto con tarifa vigente y `cobraturno <> 'NO'`, un turno (con tarifa
-- de festivo cuando el día lo es) más TODAS las horas extra a `tarifahoraextra`
-- y sin el −0,66. Los puestos de producción/destajo (Estibado PT, Salvado,
-- Cargue/Descargue, Auxiliar Mixto, Tolva…) quedan FUERA: su cobro va por
-- órdenes o por producción, no por turno.
--
-- OJO AVIMOL (id 2): la facturación REAL de Avimol se arma en la Conciliación
-- (turnos SOLICITADOS Y APROBADOS + producción + horas extra), no por
-- ejecución. El Estado de Resultados ya no lee esta vista para id2 — usa la
-- conciliación — así que aquí id2 queda solo como referencia de lo ejecutado.
--
-- MISMAS COLUMNAS y en el MISMO ORDEN que la vista anterior (create or replace
-- lo exige y los consumidores — use-ingresos, /api/facturacion/turnos, LIPbot —
-- no cambian). `tarifaturno`/`costoturno` pasan a ser la tarifa EFECTIVA del
-- día (festivo o normal), que es lo que esas columnas siempre quisieron decir.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 — SOLO LECTURA. Correr primero: cuánto factura la vista HOY.
-- =====================================================================
select idempresa, count(*) as filas,
       round(sum(facturacion_total)) as facturacion,
       round(sum(valorextra)) as horas_extra
  from public.facturacionturnos
 where fecha >= '2026-07-01' and fecha <= '2026-07-31'
 group by idempresa
 order by idempresa;
-- Esperado con la vista VIEJA (julio): id1 ≈ 2.466.764 · id2 ≈ 37.874.762


-- =====================================================================
-- BLOQUE 2 — REEMPLAZO.
-- =====================================================================
create or replace view public.facturacionturnos as
select
    a.id,
    a.fecha,
    a.nombre,
    a.identificacion,
    a.puesto,
    a.asistencia,
    -- Horas COMPLETAS: el −0,66 venía de la jornada 7,3333 y quedó obsoleto.
    coalesce(a.hed,  0)::numeric as hed,
    coalesce(a.hedf, 0)::numeric as hedf,
    coalesce(a.hen,  0)::numeric as hen,
    coalesce(a.hef,  0)::numeric as hef,
    coalesce(a.hn,   0)::numeric as hn,
    a.idempresa,
    a.especialidad,
    -- Tarifa EFECTIVA del día: la de festivo cuando el día es domingo o festivo.
    case when x.es_festivo then coalesce(t.tarifaturnofestivo, t.tarifaturno) else t.tarifaturno end as tarifaturno,
    t.tarifahoraextra,
    case when x.es_festivo then coalesce(t.costoturnofestivo, t.costoturno) else t.costoturno end as costoturno,
    t.costohoraextra,
    case when t.id is null then 'SIN TARIFA'::text else 'OK'::text end as estado_tarifa,
    round(coalesce(t.tarifahoraextra, 0) * x.horas, 2) as valorextra,
    round(coalesce(case when x.es_festivo then coalesce(t.tarifaturnofestivo, t.tarifaturno) else t.tarifaturno end, 0)
          + coalesce(t.tarifahoraextra, 0) * x.horas, 2) as facturacion_total,
    round(coalesce(t.costohoraextra, 0) * x.horas, 2) as costoextra,
    round(coalesce(case when x.es_festivo then coalesce(t.costoturnofestivo, t.costoturno) else t.costoturno end, 0)
          + coalesce(t.costohoraextra, 0) * x.horas, 2) as costo_total,
    round((coalesce(case when x.es_festivo then coalesce(t.tarifaturnofestivo, t.tarifaturno) else t.tarifaturno end, 0)
           + coalesce(t.tarifahoraextra, 0) * x.horas)
        - (coalesce(case when x.es_festivo then coalesce(t.costoturnofestivo, t.costoturno) else t.costoturno end, 0)
           + coalesce(t.costohoraextra, 0) * x.horas), 2) as utilidad
from registroasistencia a
left join tarifasfacturacionturnos t
       on trim(a.puesto) = trim(t.puesto)                -- TRIM: la igualdad estricta perdía filas por espacios
      and a.fecha >= t.fechainicio and a.fecha <= t.fechafin
cross join lateral (
    select
      -- Todas las clases de hora extra facturan, no solo la diurna.
      coalesce(a.hed,0) + coalesce(a.hedf,0) + coalesce(a.hen,0) + coalesce(a.hef,0) + coalesce(a.hn,0) as horas,
      (extract(dow from a.fecha) = 0 or exists (select 1 from festivos f where f.fecha = a.fecha)) as es_festivo
) x
where
      -- Solo días TRABAJADOS: cualquier novedad (vacaciones, incapacidad,
      -- licencia, descanso, retiro) no genera turno facturable.
      nullif(trim(coalesce(a.asistencia, '')), '') is null
      -- Personas de prueba fuera, igual que en pagonomina.
  and coalesce(a.nombre, '') !~* 'prueba'
      -- Producción y destajo NO se cobran por turno: van por órdenes o por
      -- ingresos de producción. (La lista que el UNION viejo intentó aplicar.)
  and trim(coalesce(a.puesto, '')) not in
      ('Estibado PT','Salvado','Montacargas de producción','Montacargas de cargue',
       'Cargue/Descargue','Auxiliar Mixto','Tolva Bulto','Tolva Planchador')
      -- Y lo que el maestro declara que no se cobra por turno, tampoco.
  and upper(trim(coalesce(t.cobraturno, 'SI'))) <> 'NO';


-- =====================================================================
-- BLOQUE 3 — VERIFICACIÓN. Correr después del reemplazo.
-- =====================================================================
select idempresa, count(*) as filas,
       round(sum(facturacion_total)) as facturacion,
       round(sum(valorextra)) as horas_extra
  from public.facturacionturnos
 where fecha >= '2026-07-01' and fecha <= '2026-07-31'
 group by idempresa
 order by idempresa;
-- Esperado con la vista NUEVA (julio):
--   id1 ≈ 2.604.438  (los mismos 16 turnos + las horas extra que faltaban)
--   id2 ≈ 24.325.885 (sin los $12,1M de Estibado PT/Salvado que duplicaban
--                     la producción; en el P&L id2 ya ni siquiera usa esta
--                     vista: usa la conciliación)

-- Ningún día NO trabajado debe facturar: debe devolver 0 filas.
select count(*) as dias_no_trabajados_facturando
  from public.facturacionturnos
 where nullif(trim(coalesce(asistencia,'')),'') is not null;
