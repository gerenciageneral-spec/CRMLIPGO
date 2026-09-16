-- ============================================================================
-- Meta de toneladas por PROYECTO (Financiera › Tarifas › Metas).
-- Es la referencia de PRODUCTIVIDAD: lo mínimo que cada trabajador debe cargar/
-- descargar por día para "ganarse" la base fija que se le paga.
--   toneladas_dia          = toneladas_mes / dias_operacion
--   meta_ton_trabajador_dia = toneladas_dia / hc
-- Alimenta el módulo "Revisión de nómina" (indicador de cumplimiento; NO cambia
-- la liquidación ni el bono, que siguen sobre salario/30).
-- idempresa = proyecto (1 HARINERA INDUPAN, 2 AVIMOL, 3 CEDI FUNZA, 4 CEDI MEDELLIN).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.meta_toneladas_proyecto (
  idempresa       integer PRIMARY KEY,
  proyecto        text,
  toneladas_mes   numeric NOT NULL DEFAULT 0,
  dias_operacion  numeric NOT NULL DEFAULT 24.7,   -- días operativos/mes (para derivar ton/día)
  hc              integer NOT NULL DEFAULT 1,       -- head count de cargue/descargue del proyecto
  actualizado_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed con el cuadro entregado (28-jul-2026). Reproduce las metas exactas:
--   AVIMOL/INDUPAN 4000/24.7/11 -> 14,72 ; CEDI FUNZA 2200/24.7/7 -> 12,72 ; CEDI MEDELLIN 1713/24.7/7 -> 9,91
INSERT INTO public.meta_toneladas_proyecto (idempresa, proyecto, toneladas_mes, dias_operacion, hc)
VALUES
  (1, 'HARINERA INDUPAN', 4000, 24.7, 11),
  (2, 'AVIMOL',           4000, 24.7, 11),
  (3, 'CEDI FUNZA',       2200, 24.7, 7),
  (4, 'CEDI MEDELLIN',    1713, 24.7, 7)
ON CONFLICT (idempresa) DO UPDATE
  SET proyecto = EXCLUDED.proyecto,
      toneladas_mes = EXCLUDED.toneladas_mes,
      dias_operacion = EXCLUDED.dias_operacion,
      hc = EXCLUDED.hc,
      actualizado_at = now();
