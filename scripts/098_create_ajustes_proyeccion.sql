-- ============================================================================
-- AJUSTES DE PROYECCIÓN — tabla base de "Ajuste Nómina Anterior"
-- (Compensación › Revisión de nómina; antes "Ajuste de Proyecciones")
-- ----------------------------------------------------------------------------
-- HISTÓRICO — este script ya se corrió en producción, se deja como registro de
-- cómo se creó la tabla. El diseño actual del cruce y de la novedad Siigo NO es
-- el que describía este comentario originalmente (proyección manual + novedad
-- propia 72/73): ver el header de scripts/059_archivoplano_reemplazo.sql y de
-- lib/ajuste-proyeccion-actions.ts para el modelo VIGENTE (día pleno, sin
-- proyección manual; el ajuste se funde en la novedad 52- normal de la
-- quincena que aplica, con piso $0 — ya no existe una novedad 72/73 propia).
-- Los campos `ton_pagada`/`ton_real`/`novedad_siigo` de abajo son los mismos
-- nombres de columna de siempre; solo cambió cómo se llenan y qué significan
-- en el flujo vigente (ver el código que escribe/lee esta tabla).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ajustes_proyeccion (
  id                bigserial PRIMARY KEY,
  idempresa         integer     NOT NULL,
  -- Día que se proyectó (el último de la quincena que se pagó por anticipado).
  fecha_proyectada  date        NOT NULL,
  -- Quincena a la que pertenece esa fecha (la que se está ajustando).
  anio              integer     NOT NULL,
  mes               integer     NOT NULL,
  quincena          smallint    NOT NULL,
  -- Persona: `persona` es la llave de pagonomina (nombre); `identificacion` es
  -- la que necesita el archivo plano. Se guardan ambas a propósito.
  persona           text        NOT NULL,
  identificacion    text,
  -- Toneladas y plata: lo pagado vs lo real, y la diferencia CON SIGNO.
  ton_pagada        numeric     NOT NULL DEFAULT 0,
  ton_real          numeric     NOT NULL DEFAULT 0,
  diferencia_ton    numeric     NOT NULL DEFAULT 0,
  valor_pagado      numeric     NOT NULL DEFAULT 0,
  valor_real        numeric     NOT NULL DEFAULT 0,
  valor_ajuste      numeric     NOT NULL DEFAULT 0,  -- + a favor del trabajador, − a favor de la empresa
  novedad_siigo     text        NOT NULL,
  -- Quincena donde se aplica (la siguiente a la ajustada).
  anio_aplica       integer     NOT NULL,
  mes_aplica        integer     NOT NULL,
  quincena_aplica   smallint    NOT NULL,
  estado            text        NOT NULL DEFAULT 'pendiente',
  creado_por        text,
  creado            timestamptz NOT NULL DEFAULT now(),
  aprobado_por      text,
  aprobado_en       timestamptz,
  observacion       text,
  CONSTRAINT ajustes_proyeccion_estado_chk CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  CONSTRAINT ajustes_proyeccion_quincena_chk CHECK (quincena IN (1, 2)),
  CONSTRAINT ajustes_proyeccion_quincena_aplica_chk CHECK (quincena_aplica IN (1, 2))
);

-- Un solo ajuste por persona y fecha proyectada: al re-correr el cruce se
-- ACTUALIZA el existente en vez de duplicar el pago.
CREATE UNIQUE INDEX IF NOT EXISTS ajustes_proyeccion_unico_idx
  ON public.ajustes_proyeccion (idempresa, fecha_proyectada, persona);

-- Accesos reales: el archivo plano (por cédula y quincena de aplicación) y la
-- bandeja de aprobación (por estado).
CREATE INDEX IF NOT EXISTS ajustes_proyeccion_aplica_idx
  ON public.ajustes_proyeccion (anio_aplica, mes_aplica, quincena_aplica, estado);
CREATE INDEX IF NOT EXISTS ajustes_proyeccion_ident_idx
  ON public.ajustes_proyeccion (identificacion);
CREATE INDEX IF NOT EXISTS ajustes_proyeccion_estado_idx
  ON public.ajustes_proyeccion (estado);
