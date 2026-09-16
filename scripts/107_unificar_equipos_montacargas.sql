-- =====================================================================
-- UNIFICAR las identificaciones que resultaron ser EL MISMO montacarga.
--
-- Confirmado con la operación: cada sede tiene DOS montacargas.
--   · Indupan    → Hyster + un Yale
--   · Avimol     → #1 + #2
--   · Cedi Funza → dos (hoy A268N10019l y A268N20152p)
--
-- Los datos lo respaldan sin ambigüedad. En 540 inspecciones NUNCA hubo tres
-- equipos el mismo día en una sede, y los nombres que se unifican abajo
-- **jamás aparecen juntos**, sino siempre alternándose junto al mismo
-- compañero. Esa es la firma de un solo equipo escrito de dos formas:
--
--   Indupan: 'Yale' convive con Hyster 33 días · 'Yale 12' con Hyster 37 días
--            · entre ellos, CERO días. Con solo 2 equipos y Hyster siempre
--            presente, el otro puesto lo ocupa uno u otro, nunca los dos.
--   Avimol:  '#02' convive con '#1' 8 días y con '#2' CERO. '#2' convive con
--            '#1' 70 días. Luego '#02' ocupa el puesto de '#2'.
--
-- Recupera 56 inspecciones que hoy no aparecen en la hoja de vida de su
-- equipo. Igual que el script anterior: se ADECÚA LA INFORMACIÓN, no el módulo.
--
-- Sin LIKE ni patrones: igualdad exacta contra literales, acotada por
-- proyecto. Solo se reescribe la identificación; las 32 casillas, la firma, el
-- operario y la fecha quedan intactos.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 — SOLO LECTURA. Correr primero.
-- =====================================================================

-- Qué se va a unificar y cuánto pesa cada cosa.
select idempresa, placa, count(*) as inspecciones, min(fecha) as desde, max(fecha) as hasta
  from public.inspecciones_montacargas
 where (idempresa = 1 and placa in ('Yale', 'Yale 12', 'Yale 0223'))
    or (idempresa = 2 and placa in ('#1', '#2', '#02', '#1 montacarga de cargue'))
 group by idempresa, placa
 order by idempresa, count(*) desc;

-- Prueba de que no conviven: días en que AMBOS nombres fueron inspeccionados.
-- Debe devolver CERO filas en los dos casos.
select 'Indupan Yale vs Yale 12' as caso, a.fecha
  from public.inspecciones_montacargas a
  join public.inspecciones_montacargas b
    on b.fecha = a.fecha and b.idempresa = a.idempresa
 where a.idempresa = 1 and a.placa = 'Yale' and b.placa = 'Yale 12'
union all
select 'Avimol #2 vs #02', a.fecha
  from public.inspecciones_montacargas a
  join public.inspecciones_montacargas b
    on b.fecha = a.fecha and b.idempresa = a.idempresa
 where a.idempresa = 2 and a.placa = '#2' and b.placa = '#02';


-- =====================================================================
-- BLOQUE 2 — ESCRITURA.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- INDUPAN (id 1) — el segundo equipo, escrito de tres formas.
-- 'Yale 0223' se incluye porque también convive solo con Hyster y aparece
-- justo cuando 'Yale 12' deja de usarse.
-- ---------------------------------------------------------------------
update public.inspecciones_montacargas set placa = 'Yale'
 where idempresa = 1
   and placa in ('Yale 12', 'Yale 0223');

-- ---------------------------------------------------------------------
-- AVIMOL (id 2).
-- ---------------------------------------------------------------------
update public.inspecciones_montacargas set placa = '#2'
 where idempresa = 2
   and placa in ('#02');

update public.inspecciones_montacargas set placa = '#1'
 where idempresa = 2
   and placa in ('#1 montacarga de cargue');

-- ---------------------------------------------------------------------
-- NO SE TOCA, a propósito:
--
--   id2 'jn' ×2 (30-mar)   → registros de prueba, con la desviación "prueba".
--   id3 'Hyster' ×1        → un solo registro que convive con LOS DOS equipos
--                            actuales de Funza; no hay forma de saber cuál es.
--   id3 'Yale' ×13         → reemplazo temporal: convive con C814NO218OE y con
--                            A268N20152p, nunca con A268N10019l. Es un tercer
--                            equipo real, no una errata.
--   id3 'E50XN-33' ×22 y 'C814NO218OE' ×62 → la pareja ANTERIOR de Funza,
--                            relevada en junio. Son equipos reales, no erratas:
--                            conviven entre sí 19 días.
--   id4 '#1' ×1 · (sin proyecto) '#1' ×1 → sedes sin equipos creados.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- VERIFICACIÓN. Revisar ANTES de confirmar.
-- ---------------------------------------------------------------------

-- a) El total no cambia: 540.
select count(*) as total_inspecciones from public.inspecciones_montacargas;

-- b) Casan con un equipo del maestro. Debe pasar de 370 a 426.
select count(*) as casan_con_equipo
  from public.inspecciones_montacargas i
  join public.sst_equipos e
    on e.tipo = 'montacargas' and e.idempresa = i.idempresa
   and upper(trim(e.identificacion)) = upper(trim(i.placa));

-- c) Desglose esperado:
--    id1 Hyster 76 · id1 Yale 82 · id2 #1 90 · id2 #2 97
--    id3 A268N10019l 43 · id3 A268N20152p 38
select e.idempresa, e.identificacion, count(*) as inspecciones
  from public.inspecciones_montacargas i
  join public.sst_equipos e
    on e.tipo = 'montacargas' and e.idempresa = i.idempresa
   and upper(trim(e.identificacion)) = upper(trim(i.placa))
 group by e.idempresa, e.identificacion
 order by e.idempresa, e.identificacion;

COMMIT;
-- Si algo no cuadra: ROLLBACK; en vez de COMMIT.
