-- =====================================================================
-- Doble aprobacion para Solicitudes de Personal (tabla `vacantes`)
-- =====================================================================
-- Agrega el flujo de doble aprobacion: RRHH + Gerente de Operaciones.
-- El `estado` global pasa a 'aprobado' solo cuando ambas aprobaciones
-- estan en 'aprobado'. Si cualquiera rechaza, queda en 'rechazado'.
--
-- Valores esperados en cada columna de aprobacion:
--   'pendiente' | 'aprobado' | 'rechazado'
--
-- Idempotente: usa IF NOT EXISTS, se puede correr varias veces.
-- =====================================================================

ALTER TABLE vacantes
  ADD COLUMN IF NOT EXISTS aprobacion_rrhh text NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS aprobacion_operaciones text NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS motivo_rechazo text;

-- Normaliza registros existentes: las vacantes que ya estaban 'aprobado'
-- se consideran aprobadas por ambos roles para no romper el historico.
UPDATE vacantes
  SET aprobacion_rrhh = 'aprobado',
      aprobacion_operaciones = 'aprobado'
  WHERE estado = 'aprobado'
    AND (aprobacion_rrhh <> 'aprobado' OR aprobacion_operaciones <> 'aprobado');
