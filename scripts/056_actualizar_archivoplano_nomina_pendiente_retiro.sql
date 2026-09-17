-- ============================================================================
-- Reversión SOLO HACIA ADELANTE: la nómina pendiente de un retiro vuelve a
-- pagarse por el archivo plano (nómina normal de la quincena), en vez de
-- cobrarse por el submódulo Liquidaciones -- pedido explícito del usuario
-- 2026-09-08 ("la nómina pendiente en curso se paga en el plano y en
-- liquidación las otras acreencias"). Ver memoria del proyecto
-- lipgo-liquidaciones-nomina-pendiente-plano.
--
-- QUÉ CAMBIA respecto a la definición actual (confirmada VIVA en Supabase:
-- coincide con scripts/059_archivoplano_reemplazo.sql, verificado con un retiro
-- real de HOY -- YAIR DE JESUS TRUYOL CABALLERO, retiro 2026-09-08, cero
-- filas en archivoplano antes de este cambio): el filtro que excluye a los
-- trabajadores RETIRADOS (`base_datos`, antes línea ~202) gana una excepción
-- por fecha:
--
--   WHERE lower(coalesce(h.estado,'activo')) <> 'inactivo'
--         OR h.fecha_retiro >= DATE '2026-09-09'
--
-- Es decir: un retirado con `fecha_retiro >= 2026-09-09` (retiros NUEVOS, de
-- hoy en adelante) SÍ vuelve a aparecer en el plano -- con sus días
-- trabajados HASTA la fecha de retiro (pagonomina ya corta ahí solo, no hace
-- falta tocar nada más). Un retirado con `fecha_retiro < 2026-09-09` (todo lo
-- YA procesado) sigue EXACTAMENTE igual que hoy: excluido del plano, su
-- nómina pendiente sigue viviendo en Liquidaciones -- "solo hacia adelante",
-- confirmado explícitamente por el usuario para no reabrir/duplicar nada ya
-- gestionado.
--
-- MISMO CORTE en el código: `NOMINA_PENDIENTE_EN_PLANO_DESDE` en
-- lib/liquidaciones-actions.ts. Si se mueve la fecha aquí, hay que moverla
-- también allá -- los dos lados deben coincidir o se paga dos veces (por el
-- plano Y por la liquidación) o no se paga por ninguno.
--
-- ACTUALIZACIÓN (mismo día, tras revisión pedida por el usuario: "si se
-- realiza un retiro se debe calcular todas las novedades de nómina que
-- tenga ese trabajador hasta que se le marca la novedad de retiro"): se
-- agregan 2 correcciones más, necesarias PORQUE ahora un retiro nuevo SÍ
-- pasa por esta vista (antes ni se planteaba el problema, quedaban fuera
-- del todo). Dos mecanismos de esta vista difieren dinero del DÍA DE CIERRE
-- (15 o último día del mes) a la "quincena siguiente" -- válido para alguien
-- que sigue activo, pero un retirado NUNCA tiene quincena siguiente, así que
-- ese dinero se perdería para siempre en vez de solo pagarse tarde:
--   a) `fecha_efectiva_turno` (horas extra/recargo del día de cierre, ramas
--      07/10/11/12/26/08/25): ahora NO se desplaza si la persona está
--      retirada -- cobra su día de cierre completo en su propia quincena.
--   b) El bono de destajo del día de cierre en `agrupado_quincena`: mismo
--      criterio, no se pone en $0 si la persona está retirada.
-- Nueva columna `es_retirado` en `base_datos` para saber esto. Verificado
-- con datos reales que NO hacía falta ningún cambio en cómo se CALCULAN los
-- valores (`total_liquidado_dia` en `pagonomina` ya incluye horas extra y
-- recargos completos para personal de turno, confirmado con datos reales) --
-- el único problema era que esos valores se estaban DIFIRIENDO a una
-- quincena que para un retirado nunca llega.
--
-- ALCANCE DELIBERADAMENTE ACOTADO -- 3 exclusiones de retirados que NO se
-- tocan aquí, a propósito, porque son conceptos DISTINTOS de "nómina
-- pendiente" (los días trabajados + su bono de destajo + horas extra, que es
-- lo único que lib/liquidaciones-actions.ts sí cuenta como `total`):
--   1. `ajustes_aplicables` (Ajuste Nómina Anterior, ~línea 259): corrección
--      diferida de UN día de cierre de quincena -- caso de borde, solo
--      afectaría a alguien que se retira justo en ese día puntual. No se
--      tocó por acotar el riesgo de este cambio; si hace falta, es un ajuste
--      pequeño y aparte.
--   2. Bonos no prestacionales (Compensación › Bonos, ~línea 684): flujo de
--      pago SEPARADO que ni siquiera hoy cuenta como "nómina pendiente" en
--      Liquidaciones (esa pantalla no lee `bonos_nomina`) -- no es lo que
--      pidió el usuario.
--   3. Anticipo de nómina (~línea 723): es una DEDUCCIÓN, no un ingreso --
--      fuera del alcance de "nómina pendiente".
--
-- Ejecutar en el editor SQL de Supabase (no es DML, requiere permisos de
-- owner sobre la vista). Como NO se agrega/reordena ninguna columna de
-- salida (el cambio es solo en el WHERE de una CTE interna), alcanza con
-- CREATE OR REPLACE VIEW -- no hace falta DROP + CREATE en transacción como
-- el script original (esa técnica se necesitó allá solo porque agregaban una
-- columna nueva EN MEDIO de la lista).
-- ============================================================================

create or replace view public.archivoplano as
 WITH base_datos AS (
         SELECT p.fecha,
            p.idempresa,
            -- ID de ORIGEN de la persona (Head Count) — DISTINTO de `p.idempresa`
            -- (el ID donde se movió el tonelaje ESE día). El bono de destajo
            -- (novedad 52-/71-, ver `agrupado_quincena` más abajo) se consolida
            -- por este ID, no por el trabajado: alguien de Head Count del ID1
            -- que un día ayuda en el ID3 no debe generarle una fila APARTE en
            -- el plano del ID3 (que fácilmente queda sin descargar/subir) —
            -- todo su bono, se haya generado donde se haya generado, viaja
            -- junto en el plano de SU ID de origen.
            h.idempresa AS idempresa_home,
            p.persona,
            h.identificacion,
            h.contratosiigo,
            h.salario,
            COALESCE((h.salario / (30)::numeric), (58643)::numeric) AS base_diaria,
            -- Jornada VIGENTE por fecha (Ley 2101): las horas del recargo/dominical
            -- que se envían a SIIGO se toman de aquí, no de un 7,33 fijo. jun-2026 →
            -- 7,3333; desde 16-jul-2026 → 7.
            -- FUENTE ÚNICA: parametros_legales_vigencia — LA MISMA que usa
            -- pagonomina. Antes se leía jornada_legal (la tabla que
            -- parametros_legales_vigencia reemplazó): si divergían, las HORAS
            -- que viajaban a Siigo no correspondían al VALOR que LIPgo liquidó.
            COALESCE(
              (SELECT pl.jornada_horas FROM parametros_legales_vigencia pl
                WHERE pl.fecha_desde <= p.fecha
                ORDER BY pl.fecha_desde DESC LIMIT 1),
              (7)::numeric
            ) AS jornada_dia,
            p.total_liquidado_dia,
            p.novedad_reportada,
            -- Excedente de destajo del día CON SIGNO (viene de pagonomina.bonif_prestacional).
            -- Se suma por quincena para netear días buenos con días bajos.
            COALESCE(p.bonif_prestacional, (0)::numeric) AS bonif_prestacional,
            COALESCE(p.bonif_no_prestacional, (0)::numeric) AS bonif_no_prestacional,
            p.pago_domingo,
            p.recargodominical,
            p.recargo_dominical_tasa_completa,
            p.hed,
            p.hedf,
            p.hen,
            p.hef,
            p.hn,
            p.toneladas,
            p.especialidad,
            p.horas_hed,
            p.horas_hedf,
            p.horas_hen,
            p.horas_hef,
            p.horas_hn,
            to_char((p.fecha)::timestamp with time zone, 'MM'::text) AS mes_txt,
            EXTRACT(month FROM p.fecha) AS mes_num,
            EXTRACT(year FROM p.fecha) AS anio_num,
                CASE
                    WHEN (EXTRACT(day FROM p.fecha) <= (15)::numeric) THEN 1
                    ELSE 2
                END AS num_quincena,
            -- FECHA EFECTIVA PARA TURNO (horas extra / recargo dominical-festivo),
            -- desde 2026-08-15: el 15 y el último día del mes son el día de cierre
            -- de su quincena — el turno YA cobra su base ese día (sin cambio, la
            -- base ni siquiera viaja por este archivo), pero sus NOVEDADES
            -- adicionales (horas extra, recargo dominical/festivo) se pagan en la
            -- quincena SIGUIENTE, mismo criterio que el destajo (ver "EXCLUIR EL
            -- DÍA DE CIERRE" más abajo). Sumarle 1 día a la fecha de cierre cae
            -- exactamente en la quincena/mes/año siguiente (15+1=16 mismo mes;
            -- último día del mes +1 = día 1 del mes siguiente, con año incluido si
            -- hace falta) — no hace falta lógica de calendario aparte, la resuelve
            -- la aritmética de fechas de Postgres.
            -- Antes del 2026-08-15 se conserva el criterio viejo (mismo día, sin
            -- desplazar), para no reescribir quincenas ya enviadas a Siigo.
                -- NO desplazar si la persona está RETIRADA: el desplazamiento
                -- asume que existe una "quincena siguiente" donde caer -- para
                -- un retirado esa quincena nunca llega, y sus horas extra/
                -- recargo del día de cierre se perderían para siempre en vez
                -- de solo pagarse tarde. Un retirado cobra su día de cierre
                -- COMPLETO en su propia (última) quincena. NOTA (2026-09-08).
                CASE
                    WHEN ((p.fecha >= DATE '2026-08-15')
                      AND ((EXTRACT(day FROM p.fecha) = 15)
                        OR (p.fecha = ((date_trunc('month'::text, (p.fecha)::timestamp with time zone) + interval '1 month' - interval '1 day'))::date))
                      AND (lower(COALESCE(h.estado, 'activo'::text)) <> 'inactivo'::text))
                    THEN (p.fecha + interval '1 day')::date
                    ELSE p.fecha
                END AS fecha_efectiva_turno,
            to_char((p.fecha)::timestamp with time zone, 'DD/MM/YYYY'::text) AS fecha_evento,
            -- RETIRADO: sin esta bandera, los mecanismos que difieren dinero a
            -- la "quincena siguiente" (destajo del día de cierre, ver
            -- `agrupado_quincena` más abajo) no tienen forma de saber que para
            -- esta persona esa quincena nunca va a llegar.
            (lower(COALESCE(h.estado, 'activo'::text)) = 'inactivo'::text) AS es_retirado
           FROM (pagonomina p
             -- TRIM en los DOS lados, igual que en pagonomina: `headcount.nombre`
             -- puede traer espacios de sobra del digitado y sin TRIM el cruce falla
             -- en silencio, dejando la fila sin cédula (y por tanto sin destinatario
             -- en Siigo). Los otros dos JOIN a headcount de esta vista ya usan TRIM.
             LEFT JOIN headcount h ON ((TRIM(BOTH FROM h.nombre) = TRIM(BOTH FROM p.persona))))
          -- Excluir del archivo plano a los trabajadores RETIRADOS (estado
          -- Inactivo) -- EXCEPTO si su retiro es NUEVO (fecha_retiro >=
          -- 2026-09-09): esos SÍ pasan, con sus días hasta la fecha de retiro
          -- (pagonomina ya corta ahí). null/'activo' permanecen sin cambio.
          -- Los retiros VIEJOS (antes del corte) siguen excluidos igual que
          -- siempre -- su nómina pendiente sigue viviendo en Liquidaciones.
          WHERE (
            lower(COALESCE(h.estado, 'activo'::text)) <> 'inactivo'::text
            OR h.fecha_retiro >= DATE '2026-09-09'
          )
            -- AL PLANO SOLO PASA QUIEN TIENE CONTRATO CON LIP (regla del negocio).
            -- Se exige lo que Siigo necesita para poder asignar la novedad:
            --   · CÉDULA  -> identificacionempleado. Sin ella la fila viaja en
            --     NULL y no le pertenece a nadie. Medido antes de este filtro:
            --     259 filas así, de 41 nombres que ni siquiera están en Head
            --     Count (ex-trabajadores, gente nunca registrada, y el relleno
            --     "SIN AUXILIAR" de Indupan).
            --   · CONTRATO SIIGO -> contratoempleado. Sin contrato no hay a qué
            --     vínculo cargarle la novedad. Medido: 3 de 57 personas no
            --     inactivas no lo tienen, y las 3 son casos a corregir en Head
            --     Count (dos marcadas Activo pero con fecha de retiro, y una con
            --     cédula ficticia).
            -- Los RETIRADOS ANTES DEL CORTE (2026-09-09) siguen sin pasar: su
            -- nómina pendiente se paga por el submódulo Liquidaciones, no por
            -- el plano. El trabajo de todos ellos sigue visible en pagonomina;
            -- lo que se corta es su viaje a Siigo. Los retiros NUEVOS (desde
            -- el corte) sí viajan, con sus días hasta la fecha de retiro.
            AND (h.identificacion IS NOT NULL)
            AND (TRIM(BOTH FROM h.identificacion) <> ''::text)
            AND (h.contratosiigo IS NOT NULL)
            AND (TRIM(BOTH FROM h.contratosiigo) <> ''::text)
        ), ajustes_aplicables AS (
         -- Ajuste Nómina Anterior — TODO el signo (positivo Y negativo) se
         -- funde en la MISMA novedad 52 de la quincena en la que aplica, en
         -- vez de viajar aparte (novedad 72/73): conceptualmente es el mismo
         -- bono de productividad, solo que del día de cierre, diferido un
         -- ciclo porque las órdenes de ese día todavía no habían cerrado. Se
         -- agrega por persona + período de aplicación para unirlo más abajo
         -- contra la MISMA llave con la que ya se agrupa el bono normal
         -- (agrupado_quincena).
         --
         -- El NEGATIVO ("se pagó de más ese día") también entra aquí a
         -- propósito: se resta del acumulado normal de la quincena que
         -- aplica, y el piso en $0 de `nivelacion.bono_final` (más abajo)
         -- protege al trabajador exactamente igual que en cualquier quincena
         -- floja — nunca se le descuenta de más, la empresa absorbe el
         -- sobrante. Por eso ya NO existe una novedad 73 de deducción aparte
         -- para esto.
         --
         -- SIN `idempresa` en la llave/GROUP BY a propósito: el ajuste se
         -- generó en el ID donde se movió el tonelaje ese día de cierre, pero
         -- el bono ya NO se reparte por ID (ver `idempresa_home` en
         -- base_datos) — si una persona tuviera ajustes de MÁS de un ID
         -- aplicando a la misma quincena, deben sumarse juntos en su única
         -- fila consolidada, no perderse uno contra el otro.
         --
         -- NOTA (2026-09-08): esta exclusión de retirados NO se relajó con el
         -- resto -- alcance deliberadamente acotado, ver header del archivo.
         SELECT a.anio_aplica,
            a.mes_aplica,
            a.quincena_aplica,
            -- TRIM: esta columna es la llave con la que `agrupado_quincena` cruza
            -- más abajo contra `base_datos.identificacion` (también TRIM'da ahí).
            -- Sin TRIM en los DOS lados el cruce puede fallar en silencio si la
            -- cédula trae espacios de sobra en headcount — MISMO riesgo ya
            -- documentado arriba en el JOIN de `base_datos` con headcount.
            TRIM(BOTH FROM a.identificacion) AS identificacion,
            sum(a.valor_ajuste) AS total_ajuste
           FROM (ajustes_proyeccion a
             LEFT JOIN headcount h ON ((TRIM(BOTH FROM h.identificacion) = TRIM(BOTH FROM a.identificacion))))
          WHERE ((a.estado = 'aprobado'::text) AND (lower(COALESCE(h.estado, 'activo'::text)) <> 'inactivo'::text))
          GROUP BY a.anio_aplica, a.mes_aplica, a.quincena_aplica, TRIM(BOTH FROM a.identificacion)
        ), agrupado_quincena AS (
         -- CONSOLIDADO POR PERSONA (no por ID trabajado): se agrupa por
         -- `idempresa_home` (Head Count), NO por `base_datos.idempresa` (el ID
         -- donde se movió el tonelaje ese día). Antes, alguien que trabajaba
         -- en más de un ID la misma quincena quedaba con una fila de novedad
         -- 52-/71- POR CADA ID — y si solo se descargaba/subía el plano de
         -- uno de esos IDs, la plata generada en el otro nunca llegaba a
         -- Siigo. Caso real: ARLEIS JESUS CABELLO JULIO, quincena 16-31 ago
         -- 2026, $219.694 en el plano de ID1 + $165.485 en el de ID3 — dos
         -- filas separadas del MISMO contrato. Ahora es una sola fila, bajo
         -- el ID de origen, con la suma completa.
         SELECT base_datos.mes_txt,
            base_datos.mes_num,
            base_datos.anio_num,
            base_datos.num_quincena,
            base_datos.idempresa_home AS idempresa,
            base_datos.identificacion,
            base_datos.contratosiigo,
            max(base_datos.salario) AS salario_ref,
            -- Nombre del empleado para el plano. `persona` viene de pagonomina y
            -- es el mismo valor que headcount.nombre (la vista une por ahí), así
            -- que el MAX sobre un grupo de una sola persona devuelve su nombre.
            max(base_datos.persona) AS nombre_ref,
            -- Excedente NETO de la quincena (Σ con signo): los días bajos restan a los
            -- altos. Es el "cruce" por trabajador toneladas vs base.
            -- OJO: aquí va SOLO `bonif_prestacional`. `bonif_no_prestacional` (los
            -- bonos del módulo Compensación › Bonos) NO se mezcla con la novedad
            -- 52-: sale por su propia rama al final, con su código 43/50/66.
            --
            -- EXCLUIR EL DÍA DE CIERRE (desde 2026-08-15): el 15 y el último día
            -- del mes ya NO se pagan por tonelaje ese mismo día — se paga el "día
            -- pleno" (ver 053_pagonomina_reemplazo.sql) y lo que produjo de más/menos
            -- se ajusta en la quincena SIGUIENTE (Revisión de nómina › Ajuste
            -- Nómina Anterior, fusionado en el 52- de esa quincena — ver abajo).
            -- Si ese día se dejara sumar aquí, la misma diferencia viajaría DOS
            -- VECES: una de una vez (esta novedad 52-) y otra diferida (fusionada
            -- en el 52- de la quincena siguiente). Antes del 2026-08-15 se
            -- conserva el comportamiento viejo (sí suma), para no reescribir
            -- quincenas ya enviadas a Siigo con ese criterio.
            --
            -- FUSIÓN DEL AJUSTE NÓMINA ANTERIOR (positivo Y negativo): se suma
            -- aquí mismo, ANTES del piso en $0 de `nivelacion.bono_final` — así
            -- el ajuste del día de cierre se comporta exactamente como cualquier
            -- otro día de la quincena (sube o baja el acumulado, y el piso en $0
            -- sigue protegiendo al trabajador si el neto de la quincena da
            -- negativo — nunca se le descuenta de más, la empresa absorbe el
            -- sobrante). `max(...)` y no `sum(...)` porque el JOIN de abajo
            -- repite el mismo total en cada fila-día de `base_datos`: sumarlo
            -- multiplicaría el ajuste por la cantidad de días de la quincena.
            -- NO diferir (pagar YA, completo) si la persona está RETIRADA
            -- (`es_retirado`, ver base_datos): diferir asume una quincena
            -- siguiente que a un retirado nunca le va a llegar -- su destajo
            -- del día de cierre se perdería para siempre en vez de pagarse
            -- tarde. NOTA (2026-09-08).
            (sum(
                CASE
                    WHEN ((base_datos.fecha >= DATE '2026-08-15')
                      AND ((EXTRACT(day FROM base_datos.fecha) = 15)
                        OR (base_datos.fecha = ((date_trunc('month'::text, (base_datos.fecha)::timestamp with time zone) + interval '1 month' - interval '1 day'))::date))
                      AND (NOT base_datos.es_retirado))
                    THEN (0)::numeric
                    ELSE base_datos.bonif_prestacional
                END)
             + COALESCE(max(aa.total_ajuste), (0)::numeric)) AS total_bono_nomina,
            sum(COALESCE(base_datos.hed, (0)::numeric)) AS total_hed_moneda,
            sum(COALESCE(base_datos.horas_hed, (0)::numeric)) AS total_hed_horas
           FROM (base_datos
             LEFT JOIN ajustes_aplicables aa ON (((aa.anio_aplica = base_datos.anio_num) AND (aa.mes_aplica = base_datos.mes_num) AND (aa.quincena_aplica = base_datos.num_quincena) AND (aa.identificacion = TRIM(BOTH FROM base_datos.identificacion)))))
          GROUP BY base_datos.mes_txt, base_datos.mes_num, base_datos.anio_num, base_datos.num_quincena, base_datos.idempresa_home, base_datos.identificacion, base_datos.contratosiigo
        ), nivelacion AS (
         SELECT agrupado_quincena.mes_txt,
            agrupado_quincena.mes_num,
            agrupado_quincena.anio_num,
            agrupado_quincena.num_quincena,
            agrupado_quincena.idempresa,
            agrupado_quincena.identificacion,
            agrupado_quincena.contratosiigo,
            agrupado_quincena.salario_ref,
            agrupado_quincena.nombre_ref,
            agrupado_quincena.total_bono_nomina,
            agrupado_quincena.total_hed_moneda,
            agrupado_quincena.total_hed_horas,
            -- Bono = excedente NETO de la quincena, con piso 0: cada día ya cobró su
            -- base, así que un neto negativo NO se le descuenta al trabajador — lo asume
            -- la empresa como costo de baja productividad (queda visible). Las HORAS
            -- EXTRA van COMPLETAS: ya NO se nivelan con el déficit.
            GREATEST((0)::numeric, agrupado_quincena.total_bono_nomina) AS bono_final,
            round(agrupado_quincena.total_hed_horas, 2) AS hed_horas_final
           FROM agrupado_quincena
        )
 SELECT nivelacion.mes_txt AS mes,
    nivelacion.num_quincena AS quincena,
    nivelacion.idempresa,
    nivelacion.identificacion AS identificacionempleado,
    nivelacion.nombre_ref AS nombreempleado,
    nivelacion.contratosiigo AS contratoempleado,
    -- RENOMBRADA DESDE LA QUINCENA DEL 16-JUL-2026. Lo ÚNICO que cambia es el
    -- código y el nombre, para que coincidan con el concepto creado en Siigo: el
    -- cálculo (bono_final), el piso 0 y su carácter prestacional son idénticos en
    -- ambas ramas — es la misma cifra con otra etiqueta.
    --
    -- Por qué el corte y no un cambio retroactivo: hasta la 1ª quincena de julio
    -- los planos YA se enviaron a Siigo con la 71. Renombrar hacia atrás dejaría
    -- LIPgo diciendo 52 sobre periodos que Siigo tiene registrados como 71.
    -- El corte es por QUINCENA (el plano se emite por quincena, no por día): se
    -- arma el primer día del periodo (1 ó 16) y se compara contra el 16-jul-2026.
        CASE
            WHEN (make_date((nivelacion.anio_num)::integer, (nivelacion.mes_num)::integer,
                            CASE WHEN nivelacion.num_quincena = 1 THEN 1 ELSE 16 END)
                  >= DATE '2026-07-16')
              THEN '52-Bonificación Por Productividad-Ingreso'::text
            ELSE '71-Bonificación Ajuste Toneladas-Ingreso'::text
        END AS nombrenovedad,
    'Valor'::text AS tiponovedad,
    round(nivelacion.bono_final) AS cantidadvalor,
    round(COALESCE(nivelacion.salario_ref, (1750905)::numeric) / (2)::numeric)::integer AS nominaproyectada, -- quincenal por trabajador (antes fijo 875452); ::integer para no cambiar el tipo de la columna existente
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM nivelacion
  WHERE (nivelacion.bono_final > (0)::numeric)
UNION ALL
 SELECT base_datos.mes_txt AS mes,
    base_datos.num_quincena AS quincena,
    base_datos.idempresa,
    base_datos.identificacion AS identificacionempleado,
    base_datos.persona AS nombreempleado,  -- rama sin GROUP BY: el nombre va directo
    base_datos.contratosiigo AS contratoempleado,
    base_datos.novedad_reportada AS nombrenovedad,
    'Dias'::text AS tiponovedad,
    1 AS cantidadvalor,
    0 AS nominaproyectada,
    base_datos.fecha_evento AS fechainicio,
    base_datos.fecha_evento AS fechafin,
    0 AS diasnohabiles
   FROM base_datos
  WHERE ((base_datos.novedad_reportada IS NOT NULL) AND (TRIM(BOTH FROM base_datos.novedad_reportada) <> ''::text) AND (TRIM(BOTH FROM base_datos.novedad_reportada) <> 'Descanso'::text) AND (TRIM(BOTH FROM base_datos.novedad_reportada) <> 'Descanso compensatorio domingo anterior'::text) AND (TRIM(BOTH FROM base_datos.novedad_reportada) <> 'Retiro'::text)
         -- DÍA 31: las novedades de DÍAS no se reportan. Siigo procesa toda
         -- novedad de tipo "Dias" DESCONTANDO el día de la base y pagando el
         -- concepto a su porcentaje. Pero la base quincenal de Siigo son 15 días
         -- —que por la convención de mes de 30 son el 16 al 30—, así que el 31
         -- NO está dentro de esa base: descontarlo resta un día que nunca se
         -- pagó. Y en LIPgo el 31 ya vale $0 por la misma regla (ver
         -- 053_pagonomina_reemplazo.sql), o sea que el día quedaba castigado DOS
         -- veces. Medido sobre datos reales: 7 casos de "38- Licencia no
         -- remunerada" fechados un 31, cada uno restando un día completo
         -- (~$58.364) que LIPgo sí pagaba — era la diferencia contra Siigo.
         -- Las de efecto neto 0 (13-Incapacidad, 20-Licencia, 31-Vacaciones)
         -- también salen, por coherencia: en un mes de 30 días el 31 no existe
         -- para la nómina. El soporte clínico/ausentismo vive en su módulo, no
         -- en el plano.
         AND (EXTRACT(day FROM base_datos.fecha) <> (31)::numeric))
UNION ALL
-- DÍA DE CIERRE DIFERIDO (desde 2026-08-15): igual que las otras ramas de
-- horas extra de más abajo, agrupa por `fecha_efectiva_turno` en vez de la
-- fecha real, para que las horas del día de cierre caigan en la quincena
-- SIGUIENTE. Antes salía de `nivelacion` (que agrupa por la fecha real, sin
-- desplazar) — se pasó a sumar directo de `base_datos`, mismo patrón que las
-- ramas 07/11/12/26, para poder aplicar el desplazamiento sin tocar
-- `agrupado_quincena`/`nivelacion` (esas siguen sirviendo solo al bono de
-- destajo — ver "EXCLUIR EL DÍA DE CIERRE").
 SELECT to_char((base_datos.fecha_efectiva_turno)::timestamp with time zone, 'MM'::text) AS mes,
        CASE
            WHEN (EXTRACT(day FROM base_datos.fecha_efectiva_turno) <= (15)::numeric) THEN 1
            ELSE 2
        END AS quincena,
    base_datos.idempresa,
    base_datos.identificacion AS identificacionempleado,
    max(base_datos.persona) AS nombreempleado,  -- rama agrupada: MAX sobre una sola persona
    base_datos.contratosiigo AS contratoempleado,
    '10- Horas extras diurnas 125%- Ingreso'::text AS nombrenovedad,
    'Horas'::text AS tiponovedad,
    round(sum(COALESCE(base_datos.horas_hed, (0)::numeric)), 2) AS cantidadvalor,
    0 AS nominaproyectada,
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM base_datos
  WHERE (base_datos.horas_hed > (0)::numeric)
  GROUP BY to_char((base_datos.fecha_efectiva_turno)::timestamp with time zone, 'MM'::text),
        CASE
            WHEN (EXTRACT(day FROM base_datos.fecha_efectiva_turno) <= (15)::numeric) THEN 1
            ELSE 2
        END,
    EXTRACT(month FROM base_datos.fecha_efectiva_turno), EXTRACT(year FROM base_datos.fecha_efectiva_turno),
    base_datos.idempresa, base_datos.identificacion, base_datos.contratosiigo
UNION ALL
-- DÍA DE CIERRE DIFERIDO (desde 2026-08-15): agrupa por `fecha_efectiva_turno`
-- en vez de la fecha real — ver el comentario en `base_datos.fecha_efectiva_turno`.
 SELECT to_char((base_datos.fecha_efectiva_turno)::timestamp with time zone, 'MM'::text) AS mes,
        CASE
            WHEN (EXTRACT(day FROM base_datos.fecha_efectiva_turno) <= (15)::numeric) THEN 1
            ELSE 2
        END AS quincena,
    base_datos.idempresa,
    base_datos.identificacion AS identificacionempleado,
    max(base_datos.persona) AS nombreempleado,  -- rama agrupada: MAX sobre una sola persona
    base_datos.contratosiigo AS contratoempleado,
    '07- Hora extra diurna dominical o festiva- Ingreso'::text AS nombrenovedad,
    'Horas'::text AS tiponovedad,
    sum(base_datos.horas_hedf) AS cantidadvalor,
    0 AS nominaproyectada,
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM base_datos
  WHERE (base_datos.horas_hedf > (0)::numeric)
  GROUP BY to_char((base_datos.fecha_efectiva_turno)::timestamp with time zone, 'MM'::text),
        CASE
            WHEN (EXTRACT(day FROM base_datos.fecha_efectiva_turno) <= (15)::numeric) THEN 1
            ELSE 2
        END,
    EXTRACT(month FROM base_datos.fecha_efectiva_turno), EXTRACT(year FROM base_datos.fecha_efectiva_turno),
    base_datos.idempresa, base_datos.identificacion, base_datos.contratosiigo
UNION ALL
-- DÍA DE CIERRE DIFERIDO (desde 2026-08-15): mismo criterio que la rama 07.
 SELECT to_char((base_datos.fecha_efectiva_turno)::timestamp with time zone, 'MM'::text) AS mes,
        CASE
            WHEN (EXTRACT(day FROM base_datos.fecha_efectiva_turno) <= (15)::numeric) THEN 1
            ELSE 2
        END AS quincena,
    base_datos.idempresa,
    base_datos.identificacion AS identificacionempleado,
    max(base_datos.persona) AS nombreempleado,  -- rama agrupada: MAX sobre una sola persona
    base_datos.contratosiigo AS contratoempleado,
    '11- Horas extras nocturnas 175%- Ingreso'::text AS nombrenovedad,
    'Horas'::text AS tiponovedad,
    sum(base_datos.horas_hen) AS cantidadvalor,
    0 AS nominaproyectada,
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM base_datos
  WHERE (base_datos.horas_hen > (0)::numeric)
  GROUP BY to_char((base_datos.fecha_efectiva_turno)::timestamp with time zone, 'MM'::text),
        CASE
            WHEN (EXTRACT(day FROM base_datos.fecha_efectiva_turno) <= (15)::numeric) THEN 1
            ELSE 2
        END,
    EXTRACT(month FROM base_datos.fecha_efectiva_turno), EXTRACT(year FROM base_datos.fecha_efectiva_turno),
    base_datos.idempresa, base_datos.identificacion, base_datos.contratosiigo
UNION ALL
-- DÍA DE CIERRE DIFERIDO (desde 2026-08-15): mismo criterio que la rama 07.
 SELECT to_char((base_datos.fecha_efectiva_turno)::timestamp with time zone, 'MM'::text) AS mes,
        CASE
            WHEN (EXTRACT(day FROM base_datos.fecha_efectiva_turno) <= (15)::numeric) THEN 1
            ELSE 2
        END AS quincena,
    base_datos.idempresa,
    base_datos.identificacion AS identificacionempleado,
    max(base_datos.persona) AS nombreempleado,  -- rama agrupada: MAX sobre una sola persona
    base_datos.contratosiigo AS contratoempleado,
    '12- Horas extras nocturnas dominical o festiva- Ingreso'::text AS nombrenovedad,
    'Horas'::text AS tiponovedad,
    sum(base_datos.horas_hef) AS cantidadvalor,
    0 AS nominaproyectada,
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM base_datos
  WHERE (base_datos.horas_hef > (0)::numeric)
  GROUP BY to_char((base_datos.fecha_efectiva_turno)::timestamp with time zone, 'MM'::text),
        CASE
            WHEN (EXTRACT(day FROM base_datos.fecha_efectiva_turno) <= (15)::numeric) THEN 1
            ELSE 2
        END,
    EXTRACT(month FROM base_datos.fecha_efectiva_turno), EXTRACT(year FROM base_datos.fecha_efectiva_turno),
    base_datos.idempresa, base_datos.identificacion, base_datos.contratosiigo
UNION ALL
-- DÍA DE CIERRE DIFERIDO (desde 2026-08-15): mismo criterio que la rama 07.
 SELECT to_char((base_datos.fecha_efectiva_turno)::timestamp with time zone, 'MM'::text) AS mes,
        CASE
            WHEN (EXTRACT(day FROM base_datos.fecha_efectiva_turno) <= (15)::numeric) THEN 1
            ELSE 2
        END AS quincena,
    base_datos.idempresa,
    base_datos.identificacion AS identificacionempleado,
    max(base_datos.persona) AS nombreempleado,  -- rama agrupada: MAX sobre una sola persona
    base_datos.contratosiigo AS contratoempleado,
    '26- Recargo nocturno- Ingreso'::text AS nombrenovedad,
    'Horas'::text AS tiponovedad,
    sum(base_datos.horas_hn) AS cantidadvalor,
    0 AS nominaproyectada,
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM base_datos
  WHERE (base_datos.horas_hn > (0)::numeric)
  GROUP BY to_char((base_datos.fecha_efectiva_turno)::timestamp with time zone, 'MM'::text),
        CASE
            WHEN (EXTRACT(day FROM base_datos.fecha_efectiva_turno) <= (15)::numeric) THEN 1
            ELSE 2
        END,
    EXTRACT(month FROM base_datos.fecha_efectiva_turno), EXTRACT(year FROM base_datos.fecha_efectiva_turno),
    base_datos.idempresa, base_datos.identificacion, base_datos.contratosiigo
UNION ALL
-- DÍA DE CIERRE DIFERIDO (desde 2026-08-15): agrupa por `fecha_efectiva_turno`
-- — el WHERE sigue mirando la fecha REAL (fue domingo o no ese día concreto),
-- solo el "a qué quincena pertenece" se desplaza.
 SELECT to_char((base_datos.fecha_efectiva_turno)::timestamp with time zone, 'MM'::text) AS mes,
        CASE
            WHEN (EXTRACT(day FROM base_datos.fecha_efectiva_turno) <= (15)::numeric) THEN 1
            ELSE 2
        END AS quincena,
    base_datos.idempresa,
    base_datos.identificacion AS identificacionempleado,
    max(base_datos.persona) AS nombreempleado,  -- rama agrupada: MAX sobre una sola persona
    base_datos.contratosiigo AS contratoempleado,
    '08- Hora extra recargo dominical o festivo- Ingreso'::text AS nombrenovedad,
    'Horas'::text AS tiponovedad,
    sum(base_datos.jornada_dia) AS cantidadvalor,  -- horas = jornada vigente por fecha (Ley 2101), no 7,33 fijo
    0 AS nominaproyectada,
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM base_datos
  -- 08 = tarifa COMPLETA (1 + pct, ej. 1,90): domingo O FESTIVO trabajado SIN
  -- descanso previo ni compensatorio posterior.
  --
  -- CAMBIO 2026-09: el festivo YA NO va siempre a tarifa completa. Por decisión
  -- de RRHH se liquida igual que el domingo, así que el festivo de quien ya
  -- descansó cae ahora en la rama 25. Esta consulta no cambió: lee
  -- `recargo_dominical_tasa_completa`, y fue esa bandera la que se ajustó en
  -- 053_pagonomina_reemplazo.sql.
  --
  -- La tarifa YA NO se decide con `pago_domingo` (el pago del día de descanso
  -- de quien NO trabajó — sin relación con la tarifa aplicada): con aquel
  -- criterio, cualquier domingo/festivo TRABAJADO caía siempre en la rama 25,
  -- incluso a tarifa completa. Caso real: ROBERTO ENRIQUE HOYOS VIDEZ (ID2),
  -- domingo 30-ago-2026, 7 días seguidos sin descanso → tarifa completa
  -- (verificado: 58.363,50 × 1,9 = 110.890,65) y el plano lo mandaba en 25.
  --
  -- SIN el filtro `dow = 0` (corregido): antes exigía que el día fuera
  -- domingo, así que cualquier FESTIVO ENTRE SEMANA (ej. lunes 17-ago-2026)
  -- quedaba fuera de esta rama Y de la 25 — el recargo no se perdía en
  -- LIPgo (pagonomina lo calcula bien), pero JAMÁS llegaba al plano de
  -- Siigo, para nadie. No hace falta re-chequear el día de la semana aquí:
  -- `recargo_dominical_tasa_completa` ya viene gateado en pagonomina por
  -- `(dow=0 OR es_festivo=1) AND trabajo_efectivo=1`, así que solo puede
  -- ser verdadero en un domingo o festivo realmente trabajado. Verificado
  -- con datos reales: 19 personas-caso, $2.788.449 entre el viernes
  -- 07-ago-2026 (17 personas, quincena YA enviada — requiere corrección
  -- manual en Siigo) y el lunes 17-ago-2026 (8 personas, quincena en curso).
  --
  -- SEGUNDA CORRECCIÓN EL MISMO DÍA: el WHERE traía además `OR toneladas>0
  -- OR especialidad=true`, una condición floja que el `dow=0` de arriba
  -- disimulaba (restringía a domingos igual). Al quitar `dow=0` esa condición
  -- quedó expuesta: para CUALQUIER turno (especialidad=true) se cumplía TODOS
  -- los días trabajados, no solo domingo/festivo -- la novedad se inflaba con
  -- horas de días normales. Caso real: RICHARD ANDRES ALTAMAR CUADRADO
  -- (ID2) mostraba 77 horas en la novedad 25 cuando le correspondían 0 (nunca
  -- tuvo un domingo a tasa parcial esta quincena); hallado gente hasta con 91
  -- horas, en los 4 ID. `recargodominical > 0` solo, sin el OR, es la única
  -- condición necesaria y suficiente -- ya viene gateada dentro de pagonomina.
  WHERE ((base_datos.recargodominical > (0)::numeric) AND (base_datos.recargo_dominical_tasa_completa = true))
  GROUP BY to_char((base_datos.fecha_efectiva_turno)::timestamp with time zone, 'MM'::text),
        CASE
            WHEN (EXTRACT(day FROM base_datos.fecha_efectiva_turno) <= (15)::numeric) THEN 1
            ELSE 2
        END,
    EXTRACT(month FROM base_datos.fecha_efectiva_turno), EXTRACT(year FROM base_datos.fecha_efectiva_turno),
    base_datos.idempresa, base_datos.identificacion, base_datos.contratosiigo
UNION ALL
-- DÍA DE CIERRE DIFERIDO (desde 2026-08-15): mismo criterio que la rama 08.
 SELECT to_char((base_datos.fecha_efectiva_turno)::timestamp with time zone, 'MM'::text) AS mes,
        CASE
            WHEN (EXTRACT(day FROM base_datos.fecha_efectiva_turno) <= (15)::numeric) THEN 1
            ELSE 2
        END AS quincena,
    base_datos.idempresa,
    base_datos.identificacion AS identificacionempleado,
    max(base_datos.persona) AS nombreempleado,  -- rama agrupada: MAX sobre una sola persona
    base_datos.contratosiigo AS contratoempleado,
    '25- Recargo dominical o festivo- Ingreso'::text AS nombrenovedad,
    'Horas'::text AS tiponovedad,
    sum(base_datos.jornada_dia) AS cantidadvalor,  -- horas = jornada vigente por fecha (Ley 2101), no 7,33 fijo
    0 AS nominaproyectada,
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM base_datos
  -- 25 = SOLO el recargo (pct, ej. 0,90): domingo O FESTIVO trabajado CON
  -- descanso previo o compensatorio posterior — mismo criterio que decide la
  -- tarifa dentro de `recargodominical`, ver comentario de la rama 08.
  --
  -- Desde el CAMBIO 2026-09 el festivo entra por aquí igual que el domingo
  -- (decisión de RRHH: "mismo efecto que el domingo que se liquida al 0.9").
  -- Antes tenía rama propia a tarifa completa y salía siempre en la 08.
  -- MISMO fix:
  -- sin el filtro `dow = 0` (un festivo entre semana con descanso ya tomado
  -- también debe viajar aquí, no perderse). Mismo segundo fix que la
  -- rama 08: sin `OR toneladas>0 OR especialidad=true`.
  WHERE ((base_datos.recargodominical > (0)::numeric) AND (COALESCE(base_datos.recargo_dominical_tasa_completa, false) = false))
  GROUP BY to_char((base_datos.fecha_efectiva_turno)::timestamp with time zone, 'MM'::text),
        CASE
            WHEN (EXTRACT(day FROM base_datos.fecha_efectiva_turno) <= (15)::numeric) THEN 1
            ELSE 2
        END,
    EXTRACT(month FROM base_datos.fecha_efectiva_turno), EXTRACT(year FROM base_datos.fecha_efectiva_turno),
    base_datos.idempresa, base_datos.identificacion, base_datos.contratosiigo
UNION ALL
-- BONOS no prestacionales (Compensación › Bonos). Una fila por CÓDIGO de
-- novedad (43 ocasionales / 50 no prestacional / 66 aux. movilidad), para que
-- en Siigo queden separados entre sí y del bono de productividad (52-).
--
-- Se lee `bonos_nomina` DIRECTO (no vía pagonomina) a propósito: el archivo
-- plano necesita `identificacionempleado`, y la cédula es la llave natural de
-- esta tabla — así no depende del frágil match por NOMBRE que pagonomina sí
-- necesita. Solo entran los APROBADOS, y se hereda la exclusión de retirados.
--
-- NOTA (2026-09-08): esta exclusión de retirados NO se relajó con el resto --
-- alcance deliberadamente acotado, ver header del archivo (los Bonos son un
-- flujo de pago separado, no cuentan como "nómina pendiente" en Liquidaciones).
 SELECT to_char((b.fecha)::timestamp with time zone, 'MM'::text) AS mes,
        CASE
            WHEN (EXTRACT(day FROM b.fecha) <= (15)::numeric) THEN 1
            ELSE 2
        END AS quincena,
    b.idempresa,
    b.identificacion AS identificacionempleado,
    -- `bonos_nomina` guarda su propio nombre: sirve de respaldo si la cédula no
    -- cruza con Head Count, para que la fila no salga sin nombre al plano.
    COALESCE(max(h.nombre), max(b.nombre)) AS nombreempleado,
    h.contratosiigo AS contratoempleado,
    b.novedad_siigo AS nombrenovedad,
    'Valor'::text AS tiponovedad,
    round(sum(b.valor)) AS cantidadvalor,
    round(COALESCE(max(h.salario), (1750905)::numeric) / (2)::numeric)::integer AS nominaproyectada,
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM (bonos_nomina b
     LEFT JOIN headcount h ON ((TRIM(BOTH FROM h.identificacion) = TRIM(BOTH FROM b.identificacion))))
  WHERE ((b.estado = 'aprobado'::text) AND (lower(COALESCE(h.estado, 'activo'::text)) <> 'inactivo'::text))
  GROUP BY to_char((b.fecha)::timestamp with time zone, 'MM'::text),
        CASE
            WHEN (EXTRACT(day FROM b.fecha) <= (15)::numeric) THEN 1
            ELSE 2
        END,
    b.idempresa, b.identificacion, h.contratosiigo, b.novedad_siigo
UNION ALL
-- ANTICIPO DE NÓMINA (Gestión de Solicitudes › Anticipo). Se lee
-- `solicitudes_trabajadores` DIRECTO (no vía pagonomina), mismo patrón que
-- bonos_nomina/ajustes_proyeccion: la cédula (vía headcount.id =
-- colaborador_id) es la llave natural, no el nombre frágil de pagonomina.
-- Solo 'aprobada'/'completada' (completada = ya firmó, sigue siendo un
-- anticipo aprobado — no debe desaparecer del plano). Quincena por
-- `fecha_aprobacion`, no por `fecha_solicitud`. Un solo concepto fijo:
-- no hay ingreso/deducción que distinguir aquí, siempre es deducción.
--
-- NOTA (2026-09-08): esta exclusión de retirados NO se relajó con el resto --
-- alcance deliberadamente acotado, ver header del archivo (el anticipo es una
-- deducción, no "nómina pendiente").
 SELECT to_char((s.fecha_aprobacion)::timestamp with time zone, 'MM'::text) AS mes,
        CASE
            WHEN (EXTRACT(day FROM s.fecha_aprobacion) <= (15)::numeric) THEN 1
            ELSE 2
        END AS quincena,
    h.idempresa,
    h.identificacion AS identificacionempleado,
    h.nombre AS nombreempleado,
    h.contratosiigo AS contratoempleado,
    '56-Dcto. Anticipo de Nomina-Deducción'::text AS nombrenovedad,
    'Valor'::text AS tiponovedad,
    round(s.monto) AS cantidadvalor,
    round(COALESCE(h.salario, (1750905)::numeric) / (2)::numeric)::integer AS nominaproyectada,
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM (solicitudes_trabajadores s
     LEFT JOIN headcount h ON (h.id = s.colaborador_id))
  WHERE (s.tipo = 'anticipo'::text
         AND s.estado = ANY (ARRAY['aprobada'::text, 'completada'::text])
         AND s.fecha_aprobacion IS NOT NULL
         AND s.monto IS NOT NULL
         AND s.monto > (0)::numeric
         AND (lower(COALESCE(h.estado, 'activo'::text)) <> 'inactivo'::text))
  -- ORDER BY POSICIONAL: 1 = mes, 2 = quincena, 4 = identificacionempleado.
  -- `nombreempleado` entró en la 5, así que las posiciones 1, 2 y 4 no se
  -- movieron y este ORDER BY sigue significando lo mismo.
  ORDER BY 1 DESC, 2, 4;

-- VERIFICACIÓN 1: un retiro VIEJO conocido debe seguir SIN aparecer (cero
-- filas) -- confirma que la regla vieja quedó intacta para lo ya procesado.
select count(*) as filas_deberia_ser_cero
  from public.archivoplano
 where identificacionempleado = '1004504508'; -- YAIR DE JESUS TRUYOL CABALLERO, retiro 2026-09-08

-- VERIFICACIÓN 2: consulta lista para correr cuando exista el primer retiro
-- NUEVO (fecha_retiro >= 2026-09-09) -- hoy (2026-09-08) todavía no hay
-- ninguno, así que no se puede probar con datos reales aún.
select h.identificacion, h.nombre, h.fecha_retiro, count(a.*) as filas_en_plano
  from headcount h
  left join public.archivoplano a on a.identificacionempleado = h.identificacion
 where h.estado = 'Inactivo' and h.fecha_retiro >= '2026-09-09'
 group by h.identificacion, h.nombre, h.fecha_retiro;
