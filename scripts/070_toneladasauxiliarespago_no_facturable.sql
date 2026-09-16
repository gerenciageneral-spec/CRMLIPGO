-- =====================================================================
-- Excluir del PAGO DE NÓMINA de auxiliares las órdenes marcadas como NO
-- facturables (cabeceraoc.facturar = false). Si LIP no prestó el servicio
-- (personal no-LIP en el cargue / conductor solo en la distribución), esa orden
-- no se cobra NI genera pago de nómina de auxiliares.
-- Cambio: se agrega `AND cabeceraoc.facturar IS DISTINCT FROM false` al WHERE de
-- la CTE `transformacion`. `null`/`true` siguen generando pago; solo `false` sale.
-- Idempotente (create or replace view). Correr en el SQL Editor de Supabase.
-- =====================================================================

create or replace view public.toneladasauxiliarespago as
 WITH transformacion AS (
         SELECT cabeceraoc.fechacargue,
            cabeceraoc.idempresa,
            cabeceraoc.tipooperacion,
                CASE
                    -- Cedis id3/4 DESCARGUE: se paga con el peso de BÁSCULA del tiquete
                    -- (normalizado a toneladas, IGUAL que el cobro), cayendo al detalle si
                    -- no hay báscula o el dato es corrupto. Cargue/plantas sin cambio.
                    WHEN ((cabeceraoc.idempresa = ANY (ARRAY[3, 4])) AND (cabeceraoc.tipooperacion = 'Descargue'::text)) THEN
                        CASE
                            WHEN (COALESCE(cabeceraoc.pesovascula, (0)::numeric) <= (0)::numeric) THEN cabeceraoc.pesoorden
                            WHEN ((
                                CASE WHEN ((cabeceraoc.pesovascula / NULLIF(cabeceraoc.pesoorden, (0)::numeric)) > (50)::numeric)
                                     THEN (cabeceraoc.pesovascula / (1000)::numeric) ELSE cabeceraoc.pesovascula END
                                ) / NULLIF(cabeceraoc.pesoorden, (0)::numeric) NOT BETWEEN (0.1)::numeric AND (10)::numeric) THEN cabeceraoc.pesoorden
                            ELSE (
                                CASE WHEN ((cabeceraoc.pesovascula / NULLIF(cabeceraoc.pesoorden, (0)::numeric)) > (50)::numeric)
                                     THEN (cabeceraoc.pesovascula / (1000)::numeric) ELSE cabeceraoc.pesovascula END
                                )
                        END
                    WHEN (cabeceraoc.idempresa = ANY (ARRAY[3, 4])) THEN cabeceraoc.pesoorden
                    ELSE cabeceraoc.pesovascula
                END AS peso_base_calculo,
            array_length(string_to_array(cabeceraoc.auxiliares, ','::text), 1) AS cantidad_auxiliares,
            TRIM(BOTH FROM regexp_split_to_table(cabeceraoc.auxiliares, ','::text)) AS nombre_auxiliar
           FROM cabeceraoc
          WHERE ((cabeceraoc.fincargue IS NOT NULL) AND ((cabeceraoc.fincargue)::text <> ''::text)
                 AND (cabeceraoc.facturar IS DISTINCT FROM false)
                 -- "proyeccion" excluido (2026-09-08): residuo de un módulo manual
                 -- descontinuado en jul-2026, nunca fue tonelaje real (ver
                 -- scripts/053_pagonomina_reemplazo.sql).
                 AND NOT (cabeceraoc.tipooperacion = 'proyeccion'::text))
        ), liquidacion_individual AS (
         SELECT t.fechacargue,
            t.idempresa,
            t.nombre_auxiliar,
                CASE
                    WHEN (t.cantidad_auxiliares > 0) THEN (t.peso_base_calculo / (t.cantidad_auxiliares)::numeric)
                    ELSE (0)::numeric
                END AS toneladas_fila,
                CASE
                    WHEN ((t.cantidad_auxiliares > 0) AND (tp.tarifa IS NOT NULL)) THEN ((t.peso_base_calculo / (t.cantidad_auxiliares)::numeric) * tp.tarifa)
                    ELSE (0)::numeric
                END AS pago_fila
           FROM (transformacion t
             LEFT JOIN tarifaspersonal tp ON (((t.idempresa = tp.empresaid) AND (t.tipooperacion = tp.operacion) AND ((t.fechacargue >= tp.fechaini) AND (t.fechacargue <= tp.fechafin)))))
        )
 SELECT fechacargue,
    idempresa,
    nombre_auxiliar AS persona,
    sum(toneladas_fila) AS total_toneladas_dia,
    sum(pago_fila) AS total_pago_dia,
    count(*) AS total_operaciones_realizadas
   FROM liquidacion_individual
  WHERE nombre_auxiliar !~* 'prueba'   -- fuera los auxiliares de PRUEBA (todos los ID): no se pagan
  GROUP BY fechacargue, idempresa, nombre_auxiliar
  ORDER BY fechacargue DESC, nombre_auxiliar;
