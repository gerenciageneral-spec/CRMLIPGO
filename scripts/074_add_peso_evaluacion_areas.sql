-- Evaluación de desempeño por ÁREA (despliegue del BSC a nivel LIP).
-- Cada indicador del catálogo (sig_indicadores) recibe un PESO (%) dentro de su área;
-- por área los pesos suman 100. La nota del área = Σ(cumplimiento_indicador × peso).
-- Es el despliegue de objetivos de la ISO 9001 (6.2.1) en funciones/procesos y la base
-- para evaluar a cada cabeza de área. La BSC gerencial sigue siendo GLOBAL (LIP 100).

-- 1) Columna de peso (idempotente). Default 0 = informativo (no pondera).
ALTER TABLE sig_indicadores ADD COLUMN IF NOT EXISTS peso numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN sig_indicadores.peso IS
  'Peso % del indicador dentro de su área para la evaluación del responsable. Por área suma 100. 0 = informativo.';

-- 2) SIEMBRA inicial: reparte 100% en partes iguales entre los indicadores ACTIVOS con
--    META de cada área (los informativos sin meta quedan en 0). El admin luego ajusta.
--    Se ejecuta solo si todos los pesos están en 0 (no pisa una configuración previa).
DO $$
BEGIN
  IF (SELECT COALESCE(SUM(peso), 0) FROM sig_indicadores WHERE idempresa = 100) = 0 THEN
    WITH med AS (
      SELECT id, COUNT(*) OVER (PARTITION BY area) AS n
      FROM sig_indicadores
      WHERE idempresa = 100 AND activo = true AND meta IS NOT NULL AND area IS NOT NULL
    )
    UPDATE sig_indicadores s
      SET peso = ROUND(100.0 / m.n, 2)
      FROM med m
      WHERE s.id = m.id;
  END IF;
END $$;

-- Verificación: suma de pesos por área (debe dar ~100 en las áreas con indicadores medibles).
-- SELECT area, ROUND(SUM(peso),2) AS suma_peso, COUNT(*) FILTER (WHERE peso > 0) AS con_peso
-- FROM sig_indicadores WHERE idempresa = 100 AND activo = true GROUP BY area ORDER BY area;
