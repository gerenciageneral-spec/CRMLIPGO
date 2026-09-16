-- =====================================================================
-- NORMALIZAR inspecciones_montacargas.placa
--
-- El preoperacional captura la placa como TEXTO LIBRE y el histórico quedó
-- sucio: **60 valores distintos para ~10 montacargas** en 540 inspecciones.
-- En Cedi Funza hay hasta 19 formas de escribir la misma serie, con el clásico
-- baile entre O, 0, D y P.
--
-- Por eso esas inspecciones no aparecen en la hoja de vida de su equipo: el
-- módulo de Gestión de Montacargas casa por identificación y lo que no casa lo
-- reporta en vez de adivinar. Aquí se ADECÚA LA INFORMACIÓN a lo que el módulo
-- espera; no se toca ni una línea del módulo.
--
-- REGLA DE SEGURIDAD: NO se usa LIKE ni ILIKE ni ningún patrón. Cada cambio es
-- una IGUALDAD EXACTA contra un literal escrito a mano y acotado por proyecto,
-- porque '#1' significa un equipo distinto en Avimol que en Medellín. Un patrón
-- puede tocar filas que nadie revisó.
--
-- Se corre en dos bloques: el BLOQUE 1 solo LEE. Solo cuando cuadre se corre
-- el BLOQUE 2, que escribe dentro de una transacción.
--
-- NO CAMBIA NINGÚN DATO DE LA INSPECCIÓN: solo se reescribe el nombre con que
-- se identificó el equipo. Las 32 casillas, la firma, el operario y la fecha
-- quedan intactos.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 — SOLO LECTURA. Correr primero.
-- =====================================================================

-- Cuántas inspecciones hay por cada forma de escribir la placa.
select idempresa,
       '['     || placa || ']'        as placa_exacta,
       count(*)                        as inspecciones,
       min(fecha)                      as desde,
       max(fecha)                      as hasta
  from public.inspecciones_montacargas
 group by idempresa, placa
 order by idempresa nulls first, count(*) desc;

-- Los equipos del maestro contra los que se va a casar.
select idempresa, identificacion, marca, activo
  from public.sst_equipos
 where tipo = 'montacargas'
 order by idempresa, identificacion;


-- =====================================================================
-- BLOQUE 2 — ESCRITURA.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- PASO 1 · Quitar espacios sobrantes.
--
-- Mecánico y sin riesgo: TRIM no fusiona identidades distintas, solo limpia
-- los bordes. Resuelve por sí solo 15 de los 60 valores ('Hyster ',
-- 'A268N20152p ', ' A268N20152p'…).
-- ---------------------------------------------------------------------
update public.inspecciones_montacargas
   set placa = trim(placa)
 where placa is not null
   and placa <> trim(placa);

update public.inspecciones_montacargas
   set referencia_montacargas = trim(referencia_montacargas)
 where referencia_montacargas is not null
   and referencia_montacargas <> trim(referencia_montacargas);


-- ---------------------------------------------------------------------
-- PASO 2 · INDUPAN (id 1). Aquí la placa es la marca del equipo.
-- ---------------------------------------------------------------------
update public.inspecciones_montacargas set placa = 'Hyster'
 where idempresa = 1
   and placa in ('hyster', 'HYSTER', 'Hister');   -- 'Hister': errata de una letra

update public.inspecciones_montacargas set placa = 'Yale'
 where idempresa = 1
   and placa in ('yale');

-- 'Yale 12' se unifica aunque el equipo no esté en el maestro: si algún día se
-- crea, su historia ya estará junta.
update public.inspecciones_montacargas set placa = 'Yale 12'
 where idempresa = 1
   and placa in ('yale 12');


-- ---------------------------------------------------------------------
-- PASO 3 · CEDI FUNZA (id 3). Series con el baile de O / 0 / D / P.
--
-- Cada grupo se atribuye al mismo equipo porque en id3 no existe ninguna otra
-- serie que empiece igual, todas salen con la misma marca y en el mismo
-- periodo, y las diferencias son de uno o dos caracteres.
-- ---------------------------------------------------------------------

-- Hyster A268N20152p — única serie A268N2xxxx del proyecto.
update public.inspecciones_montacargas set placa = 'A268N20152p'
 where idempresa = 3
   and placa in (
     'A268N20152P',   -- solo cambia la mayúscula final
     'A268N2015p',    -- falta el 2
     'A268N2015P',    -- falta el 2
     'A26N20152p',    -- falta el 8
     'A268N20162P',   -- 6 por 5
     'A268N20152'     -- falta la p
   );

-- Hyster A268N10019l — única serie A268N1xxxx del proyecto.
update public.inspecciones_montacargas set placa = 'A268N10019l'
 where idempresa = 3
   and placa in (
     'A168N10019l',   -- 1 por 2 al inicio
     'A268N10018l'    -- 8 por 9
   );

-- Yale C814NO218OE — única serie C814xxxx del proyecto.
update public.inspecciones_montacargas set placa = 'C814NO218OE'
 where idempresa = 3
   and placa in (
     'C814N218OE',    -- falta la O
     'C814NO2180E',   -- 0 por O al final
     'C814N02180E',   -- 0 por O ×2
     'C814N0218OE',   -- 0 por O
     'C814N0218DE',   -- 0 por O y D por O
     'C814N0218De',   -- igual, con minúscula
     'C814NO218E',    -- falta la O
     'C814 NO218OE',  -- espacio interno
     'C814NO218 OE',  -- espacio interno
     'C814NO21OE',    -- falta el 8
     'C814N2180E',    -- falta la O
     'C814NO218PE',   -- P por O
     'C814NO210E',    -- falta el 8, 0 por O
     'C814N21OE',     -- faltan el 8 y la O
     'V814N02180E'    -- V por C
   );


-- ---------------------------------------------------------------------
-- PASO 4 · id 6. Solo diferencias de mayúsculas.
-- ---------------------------------------------------------------------
update public.inspecciones_montacargas set placa = 'Yale'
 where idempresa = 6
   and placa in ('yale');


-- ---------------------------------------------------------------------
-- NO SE TOCAN, a propósito. No hay forma de decidirlas sin inventar:
--
--   id1  'Yale 0223'                ×1  → ¿es el Yale, el Yale 12, u otro?
--   id2  '#02'                      ×15 → pendiente de confirmar si es el '#2'
--   id2  '#1 montacarga de cargue'  ×1  → probablemente el '#1', sin confirmar
--   id2  'jn'                       ×2  → registros de prueba (marzo)
--   id3  'Yale'                     ×13 → no tiene serie; ¿cuál de los Yale?
--   id3  'Hyster'                   ×1  → no tiene serie
--   id4  '#1'                       ×1  → Medellín no tiene equipos creados
--   (sin idempresa) '#1'            ×1  → inspección sin proyecto
--
-- Seguirán saliendo en la hoja de vida como "identificación sin equipo", que
-- es justamente la señal para resolverlas.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- PASO 5 · VERIFICACIÓN. Revisar ANTES de confirmar.
-- ---------------------------------------------------------------------

-- 5.a) El total NO puede cambiar: deben seguir siendo 540 inspecciones.
select count(*) as total_inspecciones from public.inspecciones_montacargas;

-- 5.b) Cuántas casan ahora con un equipo del maestro. Debe dar 370.
select count(*) as casan_con_equipo
  from public.inspecciones_montacargas i
  join public.sst_equipos e
    on e.tipo = 'montacargas'
   and e.idempresa = i.idempresa
   and upper(trim(e.identificacion)) = upper(trim(i.placa));

-- 5.c) Desglose por equipo. Esperado:
--      id1 Hyster 76 · id1 Yale 42 · id2 #1 89 · id2 #2 82
--      id3 A268N10019l 43 · id3 A268N20152p 38
select e.idempresa, e.identificacion, count(*) as inspecciones
  from public.inspecciones_montacargas i
  join public.sst_equipos e
    on e.tipo = 'montacargas'
   and e.idempresa = i.idempresa
   and upper(trim(e.identificacion)) = upper(trim(i.placa))
 group by e.idempresa, e.identificacion
 order by e.idempresa, e.identificacion;

-- 5.d) Lo que sigue sin casar, para tenerlo a la vista.
select i.idempresa, i.placa, count(*) as inspecciones
  from public.inspecciones_montacargas i
 where not exists (
   select 1 from public.sst_equipos e
    where e.tipo = 'montacargas'
      and e.idempresa = i.idempresa
      and upper(trim(e.identificacion)) = upper(trim(i.placa))
 )
 group by i.idempresa, i.placa
 order by count(*) desc;

COMMIT;
-- Si algo no cuadra: ROLLBACK; en vez de COMMIT.
