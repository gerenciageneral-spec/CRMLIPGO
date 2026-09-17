-- Migración idempotente: agrega el detalle de "qué se proyectó" y "a qué hora
-- fue el corte" a `ajustes_proyeccion`, para que el ajuste de la quincena
-- siguiente quede auditable sin depender solo del agregado ton_pagada/ton_real.
-- Filas históricas (previas a este cambio) quedan con estos campos en NULL/0 —
-- no se recalculan retroactivamente.

ALTER TABLE public.ajustes_proyeccion
  ADD COLUMN IF NOT EXISTS ton_proyectada numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hora_corte text;
