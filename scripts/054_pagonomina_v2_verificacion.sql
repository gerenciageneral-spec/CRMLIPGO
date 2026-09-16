-- ============================================================================
-- PASO 2 (VERIFICACIÓN) — pagonomina_v2
-- ----------------------------------------------------------------------------
-- Vista PARALELA (no reemplaza pagonomina) para validar el remapeo antes de
-- tocar producción. Cambios vs pagonomina (mismos nombres/campos/lógica):
--   A) CTE calculo_turnos: los recargos y la base del turno se calculan POR
--      PERSONA desde el salario de contrato (headcount.salario), y los parámetros
--      del año (parametros_legales_anio). El auxilio de transporte NO entra en la
--      base de recargos/horas extra (norma CO). Se CONSERVA el JOIN a
--      tarifasturnos como registro de "qué puestos son de turno" (gate intacto).
--         HOD = COALESCE(headcount.salario, smlv) / (dias * jornada)
--         base_turno = salario / dias
--         val_hed = cant_hed * HOD * (1 + pct_hed/100)   [hen/hedf/hef igual]
--         val_hn  = cant_hn  * HOD * (pct_hn/100)        [recargo puro]
--   B) recargodominical: valor_diario_ley * 0.8  ->  * (pct_recargo_dominical/100).
-- NO se cambia: nombres de columnas, el fallback 58364 de valor_diario_ley,
-- las cantidades de horas (trigger), ni ninguna otra vista.
--
-- REQUISITO: correr antes scripts/051_extend_parametros_nomina.sql (columnas nuevas).
-- ============================================================================

drop view if exists public.pagonomina_v2;

create view public.pagonomina_v2 as
 WITH transformacion AS (
         SELECT cabeceraoc.fechacargue,
            cabeceraoc.idempresa,
            cabeceraoc.tipooperacion,
                CASE
                    WHEN (cabeceraoc.idempresa = ANY (ARRAY[3, 4])) THEN cabeceraoc.pesoorden
                    ELSE cabeceraoc.pesovascula
                END AS peso_base_calculo,
            array_length(string_to_array(cabeceraoc.auxiliares, ','::text), 1) AS cantidad_auxiliares,
            TRIM(BOTH FROM regexp_split_to_table(cabeceraoc.auxiliares, ','::text)) AS nombre_auxiliar
           FROM cabeceraoc
          WHERE ((cabeceraoc.fincargue IS NOT NULL) AND ((cabeceraoc.fincargue)::text <> ''::text))
        ), produccion_diaria AS (
         SELECT t.fechacargue AS fecha,
            t.nombre_auxiliar AS persona,
            max(t.idempresa) AS idempresa_operacion,
            sum(
                CASE
                    WHEN (t.cantidad_auxiliares > 0) THEN (t.peso_base_calculo / (t.cantidad_auxiliares)::numeric)
                    ELSE (0)::numeric
                END) AS toneladas_dia,
            sum(
                CASE
                    WHEN ((t.cantidad_auxiliares > 0) AND (tp.tarifa IS NOT NULL)) THEN ((t.peso_base_calculo / (t.cantidad_auxiliares)::numeric) * tp.tarifa)
                    ELSE (0)::numeric
                END) AS pago_produccion_dia
           FROM (transformacion t
             LEFT JOIN tarifaspersonal tp ON (((t.idempresa = tp.empresaid) AND (t.tipooperacion = tp.operacion) AND ((t.fechacargue >= tp.fechaini) AND (t.fechacargue <= tp.fechafin)))))
          GROUP BY t.fechacargue, t.nombre_auxiliar
        ), datos_asistencia AS (
         SELECT registroasistencia.fecha,
            TRIM(BOTH FROM registroasistencia.nombre) AS persona,
            registroasistencia.idempresa AS idempresa_asistencia,
            registroasistencia.puesto,
            registroasistencia.asistencia,
                CASE
                    WHEN (registroasistencia.especialidad = 'true'::text) THEN true
                    ELSE false
                END AS especialidad,
            COALESCE(registroasistencia.hed, (0)::numeric) AS cant_hed,
            COALESCE(registroasistencia.hedf, (0)::numeric) AS cant_hedf,
            COALESCE(registroasistencia.hen, (0)::numeric) AS cant_hen,
            COALESCE(registroasistencia.hef, (0)::numeric) AS cant_hef,
            COALESCE(registroasistencia.hn, (0)::numeric) AS cant_hn,
                CASE
                    WHEN ((registroasistencia.asistencia IS NULL) OR (TRIM(BOTH FROM registroasistencia.asistencia) = ''::text)) THEN 0
                    WHEN (TRIM(BOTH FROM registroasistencia.asistencia) = ANY (ARRAY['13- Incapacidad por enfermedad general al 100%'::text, '31- Vacaciones disfrutadas'::text, '15- Incapacidad por enfermedad general al 66%- ingreso'::text, '14- Incapacidad por enfermedad general al 50'::text, 'Descanso'::text, 'Descanso compensatorio domingo anterior'::text, '38- Licencia no remunerada- Deducción'::text, 'Retiro'::text])) THEN 0
                    ELSE 1
                END AS es_falta_penalizable,
                CASE
                    WHEN (TRIM(BOTH FROM registroasistencia.asistencia) = ANY (ARRAY['Descanso'::text, 'Descanso compensatorio domingo anterior'::text, '38- Licencia no remunerada- Deducción'::text, 'Retiro'::text])) THEN 1
                    ELSE 0
                END AS bloquea_domingo
           FROM registroasistencia
        ), calculo_turnos AS (
         SELECT a.fecha,
            a.persona,
            COALESCE(calc.valor_dia, (0)::numeric) AS base_turno,
            a.cant_hed,
            a.cant_hedf,
            a.cant_hen,
            a.cant_hef,
            a.cant_hn,
            (a.cant_hed  * COALESCE(calc.hod, (0)::numeric) * ((1)::numeric + (COALESCE(pa.pct_hed,  (25)::numeric)  / 100.0))) AS val_hed,
            (a.cant_hedf * COALESCE(calc.hod, (0)::numeric) * ((1)::numeric + (COALESCE(pa.pct_hedf, (115)::numeric) / 100.0))) AS val_hedf,
            (a.cant_hen  * COALESCE(calc.hod, (0)::numeric) * ((1)::numeric + (COALESCE(pa.pct_hen,  (75)::numeric)  / 100.0))) AS val_hen,
            (a.cant_hef  * COALESCE(calc.hod, (0)::numeric) * ((1)::numeric + (COALESCE(pa.pct_hef,  (165)::numeric) / 100.0))) AS val_hef,
            (a.cant_hn   * COALESCE(calc.hod, (0)::numeric) * (COALESCE(pa.pct_hn, (35)::numeric) / 100.0)) AS val_hn,
            (
                (a.cant_hed  * COALESCE(calc.hod, (0)::numeric) * ((1)::numeric + (COALESCE(pa.pct_hed,  (25)::numeric)  / 100.0)))
              + (a.cant_hedf * COALESCE(calc.hod, (0)::numeric) * ((1)::numeric + (COALESCE(pa.pct_hedf, (115)::numeric) / 100.0)))
              + (a.cant_hen  * COALESCE(calc.hod, (0)::numeric) * ((1)::numeric + (COALESCE(pa.pct_hen,  (75)::numeric)  / 100.0)))
              + (a.cant_hef  * COALESCE(calc.hod, (0)::numeric) * ((1)::numeric + (COALESCE(pa.pct_hef,  (165)::numeric) / 100.0)))
              + (a.cant_hn   * COALESCE(calc.hod, (0)::numeric) * (COALESCE(pa.pct_hn, (35)::numeric) / 100.0))
            ) AS total_recargos
           FROM (((datos_asistencia a
             JOIN tarifasturnos tt ON ((((a.fecha >= tt.fechaini) AND (a.fecha <= tt.fechafin)) AND (TRIM(BOTH FROM a.puesto) = TRIM(BOTH FROM tt.puesto)))))
             LEFT JOIN headcount h2 ON ((TRIM(BOTH FROM h2.nombre) = a.persona)))
             LEFT JOIN parametros_legales_anio pa ON ((pa.anio = (EXTRACT(year FROM a.fecha))::integer)))
             CROSS JOIN LATERAL (
                 SELECT (s.smmlv_pers / NULLIF(s.dias_p, (0)::numeric)) AS valor_dia,
                        (s.smmlv_pers / NULLIF((s.dias_p * s.jornada_p), (0)::numeric)) AS hod
                   FROM ( SELECT (COALESCE(h2.salario, pa.smlv))::numeric AS smmlv_pers,  -- base = SALARIO (auxilio NO entra en la base de recargos)
                                 COALESCE(pa.dias_calendario, (30)::numeric) AS dias_p,
                                 COALESCE(pa.jornada_horas, (7)::numeric) AS jornada_p
                        ) s
             ) calc
        ), rango_fechas AS (
         SELECT min(tf.fecha) AS fecha_inicio,
            max(tf.fecha) AS fecha_fin
           FROM ( SELECT cabeceraoc.fechacargue AS fecha
                   FROM cabeceraoc
                UNION ALL
                 SELECT registroasistencia.fecha
                   FROM registroasistencia) tf
        ), lista_empleados AS (
         SELECT DISTINCT transformacion.nombre_auxiliar AS persona
           FROM transformacion
        UNION
         SELECT DISTINCT registroasistencia.nombre AS persona
           FROM registroasistencia
        ), calendario_base AS (
         SELECT (d.fecha)::date AS fecha,
            e.persona
           FROM rango_fechas r,
            (LATERAL generate_series((r.fecha_inicio)::timestamp with time zone, (r.fecha_fin)::timestamp with time zone, '1 day'::interval) d(fecha)
             CROSS JOIN lista_empleados e)
        ), consolidado_completo AS (
         SELECT c.fecha,
            c.persona,
            EXTRACT(dow FROM c.fecha) AS dia_semana,
            p.idempresa_operacion,
            COALESCE((p.idempresa_operacion)::integer, (a.idempresa_asistencia)::integer, (h.idempresa)::integer, 0) AS idempresa_origen,
            a.especialidad,
            h.salario,
            COALESCE((h.salario / (30)::numeric), (58364)::numeric) AS valor_diario_ley,
            COALESCE(pa2.pct_recargo_dominical, (90)::numeric) AS pct_recargo_dominical,
            COALESCE(p.toneladas_dia, (0)::numeric) AS toneladas,
            COALESCE(p.pago_produccion_dia, (0)::numeric) AS pago_produccion,
            ct.base_turno,
            COALESCE(ct.cant_hed, (0)::numeric) AS horas_hed,
            COALESCE(ct.cant_hedf, (0)::numeric) AS horas_hedf,
            COALESCE(ct.cant_hen, (0)::numeric) AS horas_hen,
            COALESCE(ct.cant_hef, (0)::numeric) AS horas_hef,
            COALESCE(ct.cant_hn, (0)::numeric) AS horas_hn,
            COALESCE(ct.val_hed, (0)::numeric) AS val_hed,
            COALESCE(ct.val_hedf, (0)::numeric) AS val_hedf,
            COALESCE(ct.val_hen, (0)::numeric) AS val_hen,
            COALESCE(ct.val_hef, (0)::numeric) AS val_hef,
            COALESCE(ct.val_hn, (0)::numeric) AS val_hn,
            COALESCE(ct.total_recargos, (0)::numeric) AS total_recargos_turno,
                CASE
                    WHEN (ct.base_turno IS NOT NULL) THEN a.puesto
                    WHEN (COALESCE(p.toneladas_dia, (0)::numeric) > (0)::numeric) THEN 'Cargue/Descargue'::text
                    WHEN (f.fecha IS NOT NULL) THEN 'Festivo'::text
                    WHEN (a.puesto IS NOT NULL) THEN a.puesto
                    ELSE 'Sin Registro'::text
                END AS actividad_registrada,
            a.asistencia AS asistencia_texto,
            COALESCE(a.es_falta_penalizable, 0) AS cuenta_como_falta,
            COALESCE(a.bloquea_domingo, 0) AS bloquea_domingo,
                CASE
                    WHEN (f.fecha IS NOT NULL) THEN 0
                    WHEN ((ct.base_turno IS NULL) AND (COALESCE(p.toneladas_dia, (0)::numeric) = (0)::numeric) AND (a.puesto IS NULL) AND ((a.asistencia IS NULL) OR (TRIM(BOTH FROM a.asistencia) = ''::text))) THEN 1
                    ELSE 0
                END AS es_sin_registro,
                CASE
                    WHEN (((ct.base_turno IS NOT NULL) OR (COALESCE(p.toneladas_dia, (0)::numeric) > (0)::numeric) OR (a.puesto IS NOT NULL) OR (f.fecha IS NOT NULL)) AND ((a.asistencia IS NULL) OR (TRIM(BOTH FROM a.asistencia) = ''::text))) THEN 1
                    ELSE 0
                END AS asistio_ok,
                CASE
                    WHEN (f.fecha IS NOT NULL) THEN 1
                    ELSE 0
                END AS es_festivo
           FROM ((((((calendario_base c
             LEFT JOIN produccion_diaria p ON (((c.fecha = p.fecha) AND (c.persona = p.persona))))
             LEFT JOIN datos_asistencia a ON (((c.fecha = a.fecha) AND (c.persona = a.persona))))
             LEFT JOIN calculo_turnos ct ON (((c.fecha = ct.fecha) AND (c.persona = ct.persona))))
             LEFT JOIN festivos f ON ((c.fecha = f.fecha)))
             LEFT JOIN headcount h ON ((h.nombre = c.persona)))
             LEFT JOIN parametros_legales_anio pa2 ON ((pa2.anio = (EXTRACT(year FROM c.fecha))::integer)))
        ), calculo_nomina_base AS (
         SELECT consolidado_completo.fecha,
            consolidado_completo.persona,
            consolidado_completo.dia_semana,
            consolidado_completo.idempresa_operacion,
            consolidado_completo.idempresa_origen,
            consolidado_completo.especialidad,
            consolidado_completo.salario,
            consolidado_completo.valor_diario_ley,
            consolidado_completo.pct_recargo_dominical,
            consolidado_completo.toneladas,
            consolidado_completo.pago_produccion,
            consolidado_completo.base_turno,
            consolidado_completo.horas_hed,
            consolidado_completo.horas_hedf,
            consolidado_completo.horas_hen,
            consolidado_completo.horas_hef,
            consolidado_completo.horas_hn,
            consolidado_completo.val_hed,
            consolidado_completo.val_hedf,
            consolidado_completo.val_hen,
            consolidado_completo.val_hef,
            consolidado_completo.val_hn,
            consolidado_completo.total_recargos_turno,
            consolidado_completo.actividad_registrada,
            consolidado_completo.asistencia_texto,
            consolidado_completo.cuenta_como_falta,
            consolidado_completo.bloquea_domingo,
            consolidado_completo.es_sin_registro,
            consolidado_completo.asistio_ok,
            consolidado_completo.es_festivo,
            sum(consolidado_completo.cuenta_como_falta) OVER (PARTITION BY consolidado_completo.persona ORDER BY consolidado_completo.fecha ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING) AS faltas_semana_anterior,
            sum(consolidado_completo.es_sin_registro) OVER (PARTITION BY consolidado_completo.persona ORDER BY consolidado_completo.fecha ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING) AS vacios_semana_anterior,
            sum(consolidado_completo.bloquea_domingo) OVER (PARTITION BY consolidado_completo.persona ORDER BY consolidado_completo.fecha ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING) AS novedades_semana_anterior,
            max(
                CASE
                    WHEN (TRIM(BOTH FROM consolidado_completo.asistencia_texto) = '38- Licencia no remunerada- Deducción'::text) THEN 1
                    ELSE 0
                END) OVER (PARTITION BY consolidado_completo.persona ORDER BY consolidado_completo.fecha ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING) AS tuvo_licencia_no_rem_semana,
            max(
                CASE
                    WHEN (TRIM(BOTH FROM consolidado_completo.asistencia_texto) = 'Descanso compensatorio domingo anterior'::text) THEN 1
                    ELSE 0
                END) OVER (PARTITION BY consolidado_completo.persona ORDER BY consolidado_completo.fecha ROWS BETWEEN 1 FOLLOWING AND 6 FOLLOWING) AS tiene_compensatorio_posterior
           FROM consolidado_completo
        ), pre_calculo_valores AS (
         SELECT calculo_nomina_base.fecha,
            calculo_nomina_base.persona,
            calculo_nomina_base.dia_semana,
            calculo_nomina_base.idempresa_operacion,
            calculo_nomina_base.idempresa_origen,
            calculo_nomina_base.especialidad,
            calculo_nomina_base.salario,
            calculo_nomina_base.valor_diario_ley,
            calculo_nomina_base.toneladas,
            calculo_nomina_base.pago_produccion,
            calculo_nomina_base.base_turno,
            calculo_nomina_base.horas_hed,
            calculo_nomina_base.horas_hedf,
            calculo_nomina_base.horas_hen,
            calculo_nomina_base.horas_hef,
            calculo_nomina_base.horas_hn,
            calculo_nomina_base.val_hed,
            calculo_nomina_base.val_hedf,
            calculo_nomina_base.val_hen,
            calculo_nomina_base.val_hef,
            calculo_nomina_base.val_hn,
            calculo_nomina_base.total_recargos_turno,
            calculo_nomina_base.actividad_registrada,
            calculo_nomina_base.asistencia_texto,
            calculo_nomina_base.cuenta_como_falta,
            calculo_nomina_base.bloquea_domingo,
            calculo_nomina_base.es_sin_registro,
            calculo_nomina_base.asistio_ok,
            calculo_nomina_base.es_festivo,
            calculo_nomina_base.faltas_semana_anterior,
            calculo_nomina_base.vacios_semana_anterior,
            calculo_nomina_base.novedades_semana_anterior,
            calculo_nomina_base.tuvo_licencia_no_rem_semana,
            calculo_nomina_base.tiene_compensatorio_posterior,
                CASE
                    WHEN (TRIM(BOTH FROM calculo_nomina_base.asistencia_texto) = '15- Incapacidad por enfermedad general al 66%- ingreso'::text) THEN (calculo_nomina_base.valor_diario_ley * 0.6667)
                    WHEN (calculo_nomina_base.es_festivo = 1) THEN calculo_nomina_base.valor_diario_ley
                    WHEN (TRIM(BOTH FROM calculo_nomina_base.asistencia_texto) = ANY (ARRAY['13- Incapacidad por enfermedad general al 100%'::text, '31- Vacaciones disfrutadas'::text, '14- Incapacidad por enfermedad general al 50'::text, 'Descanso'::text, 'Descanso compensatorio domingo anterior'::text])) THEN calculo_nomina_base.valor_diario_ley
                    WHEN (calculo_nomina_base.asistio_ok = 1) THEN
                    CASE
                        WHEN ((calculo_nomina_base.especialidad = true) AND (calculo_nomina_base.base_turno IS NOT NULL)) THEN calculo_nomina_base.base_turno
                        ELSE calculo_nomina_base.valor_diario_ley
                    END
                    ELSE (0)::numeric
                END AS valor_base_final,
                CASE
                    WHEN ((calculo_nomina_base.dia_semana = (0)::numeric) AND ((calculo_nomina_base.faltas_semana_anterior = 0) OR (calculo_nomina_base.faltas_semana_anterior IS NULL)) AND ((calculo_nomina_base.vacios_semana_anterior = 0) OR (calculo_nomina_base.vacios_semana_anterior IS NULL)) AND ((calculo_nomina_base.novedades_semana_anterior = 0) OR (calculo_nomina_base.novedades_semana_anterior IS NULL)) AND ((calculo_nomina_base.tiene_compensatorio_posterior = 0) OR (calculo_nomina_base.tiene_compensatorio_posterior IS NULL))) THEN
                    CASE
                        WHEN ((calculo_nomina_base.especialidad = true) AND (calculo_nomina_base.base_turno IS NOT NULL)) THEN calculo_nomina_base.base_turno
                        ELSE calculo_nomina_base.valor_diario_ley
                    END
                    ELSE (0)::numeric
                END AS valor_domingo_final,
                CASE
                    WHEN ((calculo_nomina_base.toneladas > (0)::numeric) AND (calculo_nomina_base.pago_produccion > calculo_nomina_base.valor_diario_ley)) THEN (calculo_nomina_base.pago_produccion - calculo_nomina_base.valor_diario_ley)
                    ELSE (0)::numeric
                END AS excedente_bruto_destajo,
                CASE
                    WHEN ((calculo_nomina_base.dia_semana = (0)::numeric) AND (calculo_nomina_base.asistio_ok = 1) AND (calculo_nomina_base.especialidad = true) AND (COALESCE(calculo_nomina_base.toneladas, (0)::numeric) = (0)::numeric)) THEN (calculo_nomina_base.valor_diario_ley * (calculo_nomina_base.pct_recargo_dominical / 100.0))
                    ELSE (0)::numeric
                END AS recargodominical
           FROM calculo_nomina_base
        )
 SELECT fecha,
    idempresa_origen AS idempresa,
    COALESCE((idempresa_operacion)::integer, idempresa_origen, 0) AS idempresaliquidacion,
    persona,
    actividad_registrada,
        CASE
            WHEN ((dia_semana = (0)::numeric) AND (tuvo_licencia_no_rem_semana = 1)) THEN '38- Licencia no remunerada- Deducción'::text
            ELSE asistencia_texto
        END AS novedad_reportada,
    especialidad,
    toneladas,
    pago_produccion,
    valor_base_final AS base_dia,
        CASE
            WHEN (excedente_bruto_destajo > (0)::numeric) THEN LEAST(excedente_bruto_destajo, (9948)::numeric)
            ELSE (0)::numeric
        END AS bonif_prestacional,
        CASE
            WHEN (excedente_bruto_destajo > (9948)::numeric) THEN (excedente_bruto_destajo - (9948)::numeric)
            ELSE (0)::numeric
        END AS bonif_no_prestacional,
    horas_hed,
    horas_hedf,
    horas_hen,
    horas_hef,
    horas_hn,
    val_hed AS hed,
    val_hedf AS hedf,
    val_hen AS hen,
    val_hef AS hef,
    val_hn AS hn,
    total_recargos_turno AS total_recargos,
        CASE
            WHEN (TRIM(BOTH FROM asistencia_texto) = ANY (ARRAY['13- Incapacidad por enfermedad general al 100%'::text, '31- Vacaciones disfrutadas'::text, '14- Incapacidad por enfermedad general al 50'::text, '15- Incapacidad por enfermedad general al 66%- ingreso'::text, 'Descanso compensatorio domingo anterior'::text])) THEN (0)::numeric
            ELSE valor_domingo_final
        END AS pago_domingo,
    recargodominical,
    (((
        CASE
            WHEN (TRIM(BOTH FROM asistencia_texto) = '15- Incapacidad por enfermedad general al 66%- ingreso'::text) THEN (valor_diario_ley * 0.6667)
            WHEN (es_festivo = 1) THEN valor_diario_ley
            WHEN (TRIM(BOTH FROM asistencia_texto) = ANY (ARRAY['13- Incapacidad por enfermedad general al 100%'::text, '31- Vacaciones disfrutadas'::text, '14- Incapacidad por enfermedad general al 50'::text, 'Descanso'::text, 'Descanso compensatorio domingo anterior'::text])) THEN valor_diario_ley
            WHEN (especialidad = true) THEN valor_base_final
            WHEN (toneladas > (0)::numeric) THEN pago_produccion
            ELSE valor_base_final
        END + COALESCE(total_recargos_turno, (0)::numeric)) +
        CASE
            WHEN (TRIM(BOTH FROM asistencia_texto) = ANY (ARRAY['Descanso'::text, '31- Vacaciones disfrutadas'::text, 'Descanso compensatorio domingo anterior'::text, '13- Incapacidad por enfermedad general al 100%'::text, '14- Incapacidad por enfermedad general al 50'::text, '15- Incapacidad por enfermedad general al 66%- ingreso'::text])) THEN (0)::numeric
            ELSE valor_domingo_final
        END) + recargodominical) AS total_liquidado_dia
   FROM pre_calculo_valores pc
  WHERE (fecha <= CURRENT_DATE)
  ORDER BY persona, fecha DESC;

-- ============================================================================
-- COMPARACIÓN viejo (pagonomina) vs nuevo (pagonomina_v2)
-- Ajusta el rango de fechas a un mes YA LIQUIDADO y revisa los deltas.
-- ============================================================================

-- 1) Resumen del mes: total viejo vs nuevo y delta global.
-- SELECT
--   SUM(o.total_liquidado_dia)                          AS total_old,
--   SUM(n.total_liquidado_dia)                          AS total_new,
--   SUM(n.total_liquidado_dia - o.total_liquidado_dia)  AS delta_total,
--   COUNT(*) FILTER (WHERE ROUND(n.total_liquidado_dia,2) <> ROUND(o.total_liquidado_dia,2)) AS filas_con_delta
-- FROM pagonomina o
-- JOIN pagonomina_v2 n ON (o.fecha = n.fecha AND o.persona = n.persona)
-- WHERE o.fecha BETWEEN '2026-06-01' AND '2026-06-30';

-- 2) Detalle de las filas que cambian (mayor delta primero).
-- SELECT o.fecha, o.persona, o.especialidad,
--   o.base_dia AS base_old, n.base_dia AS base_new,
--   o.hed AS hed_old, n.hed AS hed_new,
--   o.hedf AS hedf_old, n.hedf AS hedf_new,
--   o.hen AS hen_old, n.hen AS hen_new,
--   o.hef AS hef_old, n.hef AS hef_new,
--   o.hn  AS hn_old,  n.hn  AS hn_new,
--   o.recargodominical AS rd_old, n.recargodominical AS rd_new,
--   o.total_liquidado_dia AS tot_old, n.total_liquidado_dia AS tot_new,
--   (n.total_liquidado_dia - o.total_liquidado_dia) AS delta
-- FROM pagonomina o
-- JOIN pagonomina_v2 n ON (o.fecha = n.fecha AND o.persona = n.persona)
-- WHERE o.fecha BETWEEN '2026-06-01' AND '2026-06-30'
--   AND ABS(COALESCE(n.total_liquidado_dia,0) - COALESCE(o.total_liquidado_dia,0)) > 0.5
-- ORDER BY ABS(n.total_liquidado_dia - o.total_liquidado_dia) DESC
-- LIMIT 100;
