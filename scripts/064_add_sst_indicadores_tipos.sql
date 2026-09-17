-- =====================================================================
-- Amplía los tipos permitidos de sst_indicadores para incluir los 2
-- indicadores extra del SG-SST que no son de medición 3.3.x:
--   investigaciones     (Cumplimiento de investigación de AT/incidentes, SST-FOR-48)
--   rotacion_personal   (Índice de rotación de personal, SST-FOR-49)
-- Reconstruye el CHECK con la lista completa de tipos (6 de medición 3.3.1-3.3.6
-- + 4 de gestión ya existentes + los 2 nuevos). Aditivo e idempotente.
-- =====================================================================

alter table public.sst_indicadores drop constraint if exists sst_indicadores_tipo_check;

alter table public.sst_indicadores add constraint sst_indicadores_tipo_check check (
  tipo in (
    -- Medición (Resolución 0312, numerales 3.3.1-3.3.6)
    'severidad_at', 'frecuencia_at', 'mortalidad_at',
    'prevalencia_el', 'incidencia_el', 'ausentismo',
    -- Gestión del SG-SST (ya existentes en el módulo)
    'cobertura_epp', 'cumplimiento_capacitacion',
    'ejecucion_plan_anual', 'cumplimiento_estandares',
    -- Extra (Excel de indicadores)
    'investigaciones', 'rotacion_personal'
  )
);

notify pgrst, 'reload schema';
