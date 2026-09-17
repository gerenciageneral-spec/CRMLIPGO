-- =====================================================================
-- Ubica los indicadores de MEDICIÓN del SG-SST (Resolución 0312, numerales
-- 3.3.1-3.3.6) + 2 extra (investigaciones, rotación) en el BSC de LIP (100).
-- Cada indicador toma su valor EN VIVO del consolidado más reciente de
-- sst_indicadores (calculo_auto sst_*). Aditivo e idempotente.
-- =====================================================================

insert into sig_indicadores
  (idempresa, codigo, proceso_codigo, nombre, tipo, formula, fuente, calculo_auto,
   unidad, meta, sentido, frecuencia, responsable, perspectiva, area, finalidad, activo, orden)
select v.idempresa, v.codigo, v.proceso_codigo, v.nombre, v.tipo, v.formula, v.fuente,
       v.calculo_auto, v.unidad, v.meta, v.sentido, v.frecuencia, v.responsable,
       v.perspectiva, v.area, v.finalidad, v.activo, v.orden
  from (values
    (100, 'IND-SST-3.3.1', 'SST', 'Severidad de accidentalidad (3.3.1)',   'resultado',
       'Días perdidos por AT x cada 100 trabajadores', 'sst_indicadores (SST-FOR-43)', 'sst_severidad',
       'índice', 50::numeric, 'menor_mejor', 'mensual', 'Coordinador SST', 'procesos', 'SST',
       'Medir la severidad de los AT/EL (0312 · 3.3.1)', true, 100),
    (100, 'IND-SST-3.3.2', 'SST', 'Frecuencia de accidentalidad (3.3.2)',  'resultado',
       'N° de AT x cada 100 trabajadores', 'sst_indicadores (SST-FOR-42)', 'sst_frecuencia',
       'x100', 5::numeric, 'menor_mejor', 'mensual', 'Coordinador SST', 'procesos', 'SST',
       'Medir la frecuencia de los AT/EL (0312 · 3.3.2)', true, 101),
    (100, 'IND-SST-3.3.3', 'SST', 'Mortalidad por AT/EL (3.3.3)',          'resultado',
       'AT mortales / total AT x 100', 'sst_indicadores (SST-FOR-46)', 'sst_mortalidad',
       '%', 0::numeric, 'menor_mejor', 'anual', 'Coordinador SST', 'procesos', 'SST',
       'Medir la mortalidad por AT/EL (0312 · 3.3.3)', true, 102),
    (100, 'IND-SST-3.3.4', 'SST', 'Prevalencia de enfermedad laboral (3.3.4)', 'resultado',
       'Casos EL x cada 100.000 trabajadores', 'sst_indicadores (SST-FOR-44)', 'sst_prevalencia',
       'x100k', 0::numeric, 'menor_mejor', 'anual', 'Coordinador SST', 'procesos', 'SST',
       'Medir la prevalencia de la EL (0312 · 3.3.4)', true, 103),
    (100, 'IND-SST-3.3.5', 'SST', 'Incidencia de enfermedad laboral (3.3.5)',  'resultado',
       'Casos nuevos EL x cada 100.000 trabajadores', 'sst_indicadores (SST-FOR-45)', 'sst_incidencia',
       'x100k', 0::numeric, 'menor_mejor', 'anual', 'Coordinador SST', 'procesos', 'SST',
       'Medir la incidencia de la EL (0312 · 3.3.5)', true, 104),
    (100, 'IND-SST-3.3.6', 'SST', 'Ausentismo por causa médica (3.3.6)',   'resultado',
       'Días de ausencia EG / días programados x 100', 'sst_indicadores (SST-FOR-47)', 'sst_ausentismo_med',
       '%', 192::numeric, 'menor_mejor', 'mensual', 'Coordinador SST', 'procesos', 'SST',
       'Medir el ausentismo por causa médica (0312 · 3.3.6)', true, 105),
    (100, 'IND-SST-INVEST', 'SST', 'Cumplimiento de investigación de AT/incidentes', 'gestion',
       'Investigaciones realizadas / requeridas x 100', 'sst_indicadores (SST-FOR-48)', 'sst_investigaciones',
       '%', 100::numeric, 'mayor_mejor', 'mensual', 'Coordinador SST', 'procesos', 'SST',
       'Investigar el 100% de AT/incidentes reportados', true, 106),
    (100, 'IND-SST-ROTAC', 'SST', 'Índice de rotación de personal',        'gestion',
       'Retiros / promedio de empleados x 100', 'sst_indicadores (SST-FOR-49)', 'sst_rotacion',
       '%', null::numeric, 'menor_mejor', 'mensual', 'Coordinador SST', 'aprendizaje', 'SST',
       'Monitorear la rotación de personal', true, 107)
  ) as v(idempresa, codigo, proceso_codigo, nombre, tipo, formula, fuente, calculo_auto,
         unidad, meta, sentido, frecuencia, responsable, perspectiva, area, finalidad, activo, orden)
 where not exists (
   select 1 from sig_indicadores s where s.idempresa = 100 and s.codigo = v.codigo
 );

notify pgrst, 'reload schema';
