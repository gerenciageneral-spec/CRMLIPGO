-- ============================================================================
-- Columna `turno` en registroasistencia — soporte para 2 turnos/día de
-- "Auxiliar Mixto" (Turno 1 / Turno 2), cada uno con su propio horario
-- (horaentradaprogramada/horasalidaprogramada, que ya existen en la tabla).
--
-- NULL = comportamiento actual sin cambios (1 fila/persona/día, todo puesto
-- que no sea Auxiliar Mixto multi-turno). Solo Auxiliar Mixto con doble turno
-- usa 1/2, permitiendo 2 filas el mismo día para la misma persona.
--
-- IMPORTANTE: antes de correr esto, correr scripts/053_pagonomina_reemplazo.sql
-- actualizado (blindaje GROUP BY en datos_asistencia) — si se agrega esta
-- columna y se empiezan a crear 2 filas/día ANTES de blindar pagonomina, se
-- duplicaría la base salarial de esa persona ese día.
-- ============================================================================

ALTER TABLE public.registroasistencia
  ADD COLUMN IF NOT EXISTS turno smallint;

COMMENT ON COLUMN public.registroasistencia.turno IS
  'Turno del día para puestos con doble jornada (Auxiliar Mixto): 1 o 2. NULL = jornada única (todos los demás puestos, sin cambios).';
