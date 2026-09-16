-- =====================================================================
-- Horas extra: solo las APROBADAS entran a la liquidación.
--
-- `pagonomina` liquidaba TODA hora registrada en `registroasistencia`, aprobada
-- o no. Ahora las horas de una fila sin aprobar entran en CERO.
--
-- EL ÚNICO VALOR VÁLIDO ES 'aprobado' (confirmado por el negocio). Vacío, null,
-- 'true', 'si' o cualquier otra cosa NO cuentan. Solo se normalizan mayúsculas
-- y espacios sobrantes: 'Aprobado ' sí cuenta, 'true' no.
--
-- >>> ESTO BAJA PAGOS, y sin piso de vigencia aplica a TODO EL HISTÓRICO: al
-- >>> reemplazar la vista, las quincenas ya pagadas que tuvieran horas sin
-- >>> aprobar quedan por debajo de lo que se reportó a Siigo.
-- >>> CORRER LOS PUNTOS 1, 2 Y 3 ANTES DE REEMPLAZAR LA VISTA.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ¿QUÉ VALORES TIENE `aprobado`? Esto es lo primero.
--
--    Solo la fila cuyo valor sea 'aprobado' conserva sus horas. Todo lo demás
--    las pierde. Aquí se ve exactamente qué hay y cuántas filas con horas hay
--    detrás de cada valor.
-- ---------------------------------------------------------------------
select coalesce(nullif(trim(aprobado::text), ''), '(vacío)') as valor_aprobado,
       count(*)                                              as filas,
       count(*) filter (where coalesce(hed,0) + coalesce(hedf,0) + coalesce(hen,0)
                            + coalesce(hef,0) + coalesce(hn,0) > 0) as filas_con_horas,
       case when lower(trim(aprobado::text)) = 'aprobado'
            then 'SÍ se liquida' else 'NO se liquida' end     as efecto
from public.registroasistencia
group by 1, 4
order by filas desc;

-- ---------------------------------------------------------------------
-- 2) CUÁNTAS HORAS SE CAEN, y de quién. El impacto real del cambio.
-- ---------------------------------------------------------------------
select r.fecha,
       r.idempresa,
       r.nombre,
       r.puesto,
       coalesce(nullif(trim(r.aprobado::text), ''), '(vacío)') as aprobado,
       coalesce(r.hed, 0)  as hed,
       coalesce(r.hedf, 0) as hedf,
       coalesce(r.hen, 0)  as hen,
       coalesce(r.hef, 0)  as hef,
       coalesce(r.hn, 0)   as hn
from public.registroasistencia r
where (coalesce(r.hed,0) + coalesce(r.hedf,0) + coalesce(r.hen,0)
     + coalesce(r.hef,0) + coalesce(r.hn,0)) > 0
  and lower(trim(r.aprobado::text)) is distinct from 'aprobado'
order by r.fecha desc, r.nombre
limit 300;

-- ---------------------------------------------------------------------
-- 3) EL RESUMEN QUE HAY QUE MIRAR ANTES DE DECIDIR: horas que se caen por
--    mes y empresa. Si los meses cerrados pesan mucho, conviene poner piso de
--    vigencia en vez de aplicarlo a todo el histórico (ver el final).
-- ---------------------------------------------------------------------
select to_char(r.fecha, 'YYYY-MM')                as mes,
       r.idempresa                                as empresa,
       count(*)                                   as filas_afectadas,
       count(distinct r.nombre)                   as personas,
       round(sum(coalesce(r.hed,0) + coalesce(r.hedf,0) + coalesce(r.hen,0)
                + coalesce(r.hef,0) + coalesce(r.hn,0)), 2) as horas_que_dejan_de_pagarse
from public.registroasistencia r
where (coalesce(r.hed,0) + coalesce(r.hedf,0) + coalesce(r.hen,0)
     + coalesce(r.hef,0) + coalesce(r.hn,0)) > 0
  and lower(trim(r.aprobado::text)) is distinct from 'aprobado'
group by 1, 2
order by mes desc, empresa;

-- ---------------------------------------------------------------------
-- 4) DESPUÉS DE REEMPLAZAR: comprobar que a una persona con horas sin
--    aprobar le quedó `total_recargos` en cero ese día.
--    Reemplazar el nombre y la fecha con un caso del punto 2.
-- ---------------------------------------------------------------------
-- select fecha, persona, actividad_registrada,
--        horas_hed, horas_hedf, horas_hen, horas_hef, horas_hn,
--        total_recargos, total_liquidado_dia
-- from public.pagonomina
-- where persona = '<NOMBRE>' and fecha = date '<AAAA-MM-DD>';

-- =====================================================================
-- SI SE PREFIERE NO TOCAR LO YA PAGADO
--
-- En scripts/053_pagonomina_reemplazo.sql, dentro de `datos_asistencia_raw`, cada
-- una de las cinco columnas `cant_*` lleva la condición de aprobación. Basta
-- con dejar pasar lo viejo sin filtrar, añadiéndole la fecha:
--
--     CASE WHEN (registroasistencia.fecha < DATE '2026-08-16'
--                OR LOWER(TRIM(registroasistencia.aprobado::text)) = 'aprobado'::text)
--          THEN COALESCE(registroasistencia.hed, (0)::numeric) ELSE (0)::numeric END
--
-- Con eso el filtro solo aplica desde esa fecha en adelante.
-- =====================================================================
