-- ============================================================================
-- Horario de Tolva (Turno 1 / Turno 2) — INDEPENDIENTE del horario normal de
-- entrada/salida de cada persona (registroasistencia.horaentradaprogramada/
-- horasalidaprogramada, que sigue siendo para asistencia/horas extra).
--
-- Es UN horario COMPARTIDO por día+empresa+turno (no por persona): se define
-- una sola vez desde "Programación de turnos" (botón "Horario de Tolva") y
-- todas las personas asignadas a ese turno (registroasistencia.turno = 1/2)
-- quedan amarradas a esta ventana para efectos de "Liquidación Tolva del día"
-- (bucketing de invtrans por hora de creado). NO afecta hed/hen ni el
-- horario normal de la persona.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.horario_tolva (
  fecha         date NOT NULL,
  idempresa     integer NOT NULL,
  turno         smallint NOT NULL CHECK (turno IN (1, 2)),
  hora_inicio   time NOT NULL,
  hora_fin      time NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fecha, idempresa, turno)
);

COMMENT ON TABLE public.horario_tolva IS
  'Ventana horaria de Turno 1/Turno 2 para Tolva, por día+empresa. Independiente del horario de entrada/salida normal de cada persona.';
