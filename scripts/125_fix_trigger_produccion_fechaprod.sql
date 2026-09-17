-- =====================================================================
-- `fn_sync_produccion_to_invtrans`: escribir tambien `fechaprod` y `horaprod`.
--
-- >>> CORREGIDO 2026-08-05. Si ya corriste la version anterior de este script,
-- >>> VUELVE A CORRER ESTE: aquella convertia la zona horaria al reves y dejaba
-- >>> la hora 5 horas antes de la real. Al final hay un UPDATE que repara las
-- >>> filas que alcanzo a escribir.
--
-- PROBLEMA QUE CORRIGE
-- La produccion que sube el LOGO llega a `invtrans` por este trigger, pero el
-- INSERT no incluia `fechaprod` ni `horaprod`, asi que esas filas nacian con
-- ambas columnas en NULL.
--
-- "Liquidación Tolva del día" filtra por `fechaprod = <fecha>`, de modo que la
-- produccion del LOGO era INVISIBLE ahi — aunque estuviera aprobada y se viera
-- perfectamente en "Aprobación de ingreso de producción", que no filtra por esa
-- columna. Verificado contra datos reales: todas las filas con
-- `creadopor = 'LOGO'` tenian `fechaprod` y `horaprod` en null.
--
-- ZONA HORARIA — LEER ANTES DE TOCAR ESTO
-- `produccion.fecha_hora` NO guarda UTC real: guarda la HORA DE PARED DE
-- COLOMBIA ETIQUETADA COMO UTC. Es decir, `2026-08-05 13:25:40+00` significa la
-- 1:25 de la tarde EN COLOMBIA, no las 8:25.
--
-- Esta documentado en `components/produccion/control-piso.tsx` (ver los
-- comentarios de `bogotaWallAsUtcMs` y de `inactividad`), que es el modulo
-- construido sobre esta tabla y que compara contra la hora de pared de Bogota
-- reinterpretada como UTC justamente para no aplicar el desfase.
--
-- Por eso aqui se leen los COMPONENTES LITERALES del timestamp (`AT TIME ZONE
-- 'UTC'`) y NO se convierte a 'America/Bogota': convertir restaria cinco horas
-- que la columna nunca tuvo, mandando la produccion al turno equivocado y, para
-- lo registrado antes de las 05:00, al dia anterior.
--
-- COMO SE COMPRUEBA: la produccion del 04-ago iba de 08:29 a 19:03 en estos
-- digitos, que encaja con los turnos 06:00-13:00 y 13:00-20:00. Convertida daria
-- 03:29 a 14:03: arrancando a las 3 de la madrugada y sin nada en la segunda
-- mitad del Turno 2. Ese contraste es la prueba.
--
-- `horaprod` se guarda como texto "HH:MM", que es el formato que espera
-- `lib/liquidacion-tolva-actions.ts` (ver scripts/123_add_horaprod_invtrans.sql).
--
-- El resto de la funcion queda EXACTAMENTE igual.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_sync_produccion_to_invtrans()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_nombreproducto text;
  v_codproducto text;
  v_location_codigo text;
  v_almacen_nombre text;
  v_max_id bigint;
  v_local timestamp;
BEGIN
  -- 1. Asegurar la secuencia al valor máximo actual para evitar el error 23505
  SELECT COALESCE(MAX(id), 0) INTO v_max_id FROM public.invtrans;
  PERFORM setval(pg_get_serial_sequence('public.invtrans', 'id'), v_max_id, true);

  -- 1b. Hora de la produccion. Se toman los digitos LITERALES del timestamp
  --     porque ya son hora de Colombia (ver cabecera). NO convertir.
  v_local := NEW.fecha_hora AT TIME ZONE 'UTC';

  -- 2. Búsqueda de datos en la tabla productos
  SELECT nombre, codigo INTO v_nombreproducto, v_codproducto
  FROM public.productos
  WHERE id = NEW.producto;

  -- 3. Búsqueda de datos en la tabla locations
  SELECT codigo INTO v_location_codigo
  FROM public.locations
  WHERE id = NEW.localizacion;

  -- 4. Búsqueda de datos en la tabla almacenes
  SELECT nombre INTO v_almacen_nombre
  FROM public.almacenes
  WHERE id = NEW.bodega;

  -- 5. Inserción del nuevo registro en invtrans (el ID se genera solo y de forma segura)
  INSERT INTO public.invtrans (
    idempresa,
    idproducto,
    nombreproducto,
    lote,
    location,
    cantidad,
    tipomov,
    status,
    origen,
    creado,
    creadopor,
    codproducto,
    almacen,
    qrestiba,
    fechaprod,
    horaprod
  ) VALUES (
    1,
    NEW.producto::smallint,
    v_nombreproducto,
    NEW.lote::text,
    v_location_codigo,
    NEW.bultos_procesados::numeric,
    'Entrada',
    NULL,
    'ingreso producción',
    NEW.fecha_hora,
    'LOGO',
    v_codproducto,
    v_almacen_nombre,
    NEW.id::numeric,
    v_local::date,
    to_char(v_local, 'HH24:MI')
  );

  RETURN NEW;
END;
$function$;

-- =====================================================================
-- REPARACION de lo que escribio la version anterior (la que convertia mal).
--
-- IDEMPOTENTE: recalcula desde `creado` con el criterio correcto, asi que
-- correrlo dos veces da el mismo resultado. Solo toca filas del LOGO que ya
-- tengan `fechaprod`; las que siguen en NULL son historicas y las resuelve el
-- respaldo de `lib/liquidacion-tolva-actions.ts`.
-- =====================================================================

update public.invtrans
   set fechaprod = (creado AT TIME ZONE 'UTC')::date,
       horaprod  = to_char(creado AT TIME ZONE 'UTC', 'HH24:MI')
 where creadopor = 'LOGO'
   and fechaprod is not null;

-- =====================================================================
-- VERIFICACION
-- =====================================================================

-- 1) La funcion quedo con las dos columnas y SIN la conversion a Bogota.
select pg_get_functiondef('public.fn_sync_produccion_to_invtrans'::regproc) like '%fechaprod%'
         as tiene_fechaprod,
       pg_get_functiondef('public.fn_sync_produccion_to_invtrans'::regproc) like '%horaprod%'
         as tiene_horaprod,
       pg_get_functiondef('public.fn_sync_produccion_to_invtrans'::regproc) like '%America/Bogota%'
         as convierte_mal;   -- debe dar FALSE

-- 2) `horaprod` debe coincidir con los digitos de `creado`. Si `creado` dice
--    13:25, `horaprod` debe decir 13:25 — NO 08:25.
select id, nombreproducto, lote, cantidad, creado, fechaprod, horaprod, creadopor
from public.invtrans
where creadopor = 'LOGO' and fechaprod is not null
order by id desc
limit 10;
