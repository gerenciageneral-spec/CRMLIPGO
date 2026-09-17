-- ============================================================================
-- BONOS de nómina (Compensación › Bonos) — bonos OPERATIVOS y ADMINISTRATIVOS
-- ----------------------------------------------------------------------------
-- Registra, por DÍA y por PERSONA, un bono discrecional con su concepto. Es
-- distinto del bono de destajo (`pagonomina.bonif_prestacional` → novedad
-- "52-Bonificación Por Productividad-Ingreso"), que se calcula solo.
--
-- Reglas de negocio (confirmadas con el negocio):
--   · NO PRESTACIONAL: no cotiza a seguridad social (no entra al IBC de la
--     PILA) ni sirve de base para cesantías/prima/vacaciones. Por eso NO se
--     suma a `pagonomina.total_liquidado_dia` — esa columna alimenta el IBC
--     (lib/parafiscales-actions.ts), el costo de nómina del P&L y las
--     prestaciones de retiro. Se expone aparte en `bonif_no_prestacional` y
--     llega al trabajador por el ARCHIVO PLANO.
--   · REQUIERE APROBACIÓN: nace 'pendiente'. Solo los 'aprobado' impactan
--     pagonomina y archivoplano.
--   · `tipo` (Operativo/Administrativo) es SOLO clasificación y reporte: el
--     cálculo es idéntico en ambos.
--   · `novedad_siigo` guarda el nombre COMPLETO de la novedad tal como debe
--     salir al archivo plano. Se guarda al registrar (no se resuelve por
--     catálogo en la vista) para que un cambio futuro de nomenclatura en
--     Siigo no reescriba el histórico ya enviado.
--
-- `nombre` va denormalizado desde headcount porque `pagonomina` se une por
-- NOMBRE (no expone cédula); `identificacion` es la llave que usa el
-- archivo plano. Se guardan ambas a propósito.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bonos_nomina (
  id              bigserial PRIMARY KEY,
  fecha           date        NOT NULL,
  identificacion  text        NOT NULL,
  nombre          text        NOT NULL,
  idempresa       integer     NOT NULL,
  tipo            text        NOT NULL,            -- 'Operativo' | 'Administrativo'
  concepto        text        NOT NULL,
  novedad_siigo   text        NOT NULL,            -- nombrenovedad completo (43/50/66)
  valor           numeric     NOT NULL,
  estado          text        NOT NULL DEFAULT 'pendiente',  -- pendiente|aprobado|rechazado
  creado_por      text,
  creado          timestamptz NOT NULL DEFAULT now(),
  aprobado_por    text,
  aprobado_en     timestamptz,
  motivo_rechazo  text,
  CONSTRAINT bonos_nomina_valor_pos CHECK (valor > 0),
  CONSTRAINT bonos_nomina_estado_chk CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  CONSTRAINT bonos_nomina_tipo_chk CHECK (tipo IN ('Operativo', 'Administrativo'))
);

-- Índices para los tres accesos reales: la vista pagonomina (fecha+nombre),
-- el archivo plano (identificación aprobada por periodo) y la bandeja de
-- aprobación (estado).
CREATE INDEX IF NOT EXISTS bonos_nomina_fecha_nombre_idx
  ON public.bonos_nomina (fecha, nombre);
CREATE INDEX IF NOT EXISTS bonos_nomina_fecha_ident_idx
  ON public.bonos_nomina (fecha, identificacion);
CREATE INDEX IF NOT EXISTS bonos_nomina_estado_idx
  ON public.bonos_nomina (estado);
CREATE INDEX IF NOT EXISTS bonos_nomina_empresa_fecha_idx
  ON public.bonos_nomina (idempresa, fecha);
