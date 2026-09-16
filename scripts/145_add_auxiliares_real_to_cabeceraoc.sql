-- =====================================================================
-- Trazabilidad de personal real asignado (cabeceraoc.auxiliares_real).
--
-- `auxiliares` alimenta la fórmula de nómina (peso_base_calculo ÷
-- cantidad_auxiliares, ver 053_pagonomina_reemplazo.sql) — en pago 'global' el
-- sistema lo SOBRESCRIBE al cerrar con el roster elegible del día, así que
-- deja de reflejar quién trabajó realmente ese vehículo específico.
--
-- `auxiliares_real` es un campo aparte que SIEMPRE guarda a quién asignó
-- de verdad el coordinador a esa orden (trazabilidad de cargue/descargue),
-- sin importar el modo de pago — nunca se sobrescribe al cerrar. No
-- participa en ningún cálculo de nómina.
--
-- Aditivo e idempotente. Backfill solo de órdenes AÚN ABIERTAS hoy (para
-- esas, `auxiliares` todavía es el valor real, ya que el override de pago
-- global solo ocurre al cerrar) — las ya cerradas se dejan como están, no
-- se puede reconstruir retroactivamente qué tan "real" era ese dato.
-- =====================================================================

alter table public.cabeceraoc
  add column if not exists auxiliares_real text;

update public.cabeceraoc
   set auxiliares_real = auxiliares
 where fincargue is null
   and auxiliares_real is null
   and auxiliares is not null
   and trim(auxiliares) <> '';

-- =====================================================================
