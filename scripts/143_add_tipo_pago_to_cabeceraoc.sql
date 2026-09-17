-- =====================================================================
-- Pago Global vs Individual por orden (cabeceraoc.tipo_pago).
--
-- Hoy el pago es SIEMPRE "global" en los 4 proyectos (el total de toneladas
-- del día se reparte entre todo el personal elegible presente, no por
-- vehículo específico) — pero la fórmula real (peso_base_calculo ÷
-- cantidad_auxiliares, ver 053_pagonomina_reemplazo.sql) solo sabe dividir POR
-- ORDEN. Para lograr el efecto global, el coordinador escribe a mano TODO
-- el personal presente en `auxiliares` de cada orden. Este campo formaliza
-- la elección: 'individual' deja `auxiliares` tal cual lo asigne el
-- coordinador (split real por vehículo); 'global' hace que el sistema
-- calcule y sobrescriba `auxiliares` al cerrar la orden (mismo resultado
-- de hoy, sin tecleo manual). Es OBLIGATORIO elegir antes de cerrar
-- (aplicado en app/api/upload-picking-photos/route.ts, no solo en la UI).
--
-- Aditivo e idempotente.
-- =====================================================================

alter table public.cabeceraoc
  add column if not exists tipo_pago text;

alter table public.cabeceraoc
  drop constraint if exists cabeceraoc_tipo_pago_chk;
alter table public.cabeceraoc
  add constraint cabeceraoc_tipo_pago_chk
  check (tipo_pago is null or tipo_pago in ('global', 'individual'));

-- Backfill de transición: órdenes YA ABIERTAS hoy (fincargue IS NULL) que ya
-- tienen `auxiliares` cargado (el workaround manual de hoy) se marcan
-- 'global' para no bloquearlas retroactivamente — al cerrar, el sistema
-- recalcula el roster igual, así que el tecleo manual actual nunca se usa
-- de verdad para el pago. Las que aún no tienen personal asignado quedan
-- NULL y siguen el flujo nuevo (elegir antes de cerrar). Ninguna orden ya
-- cerrada se toca.
update public.cabeceraoc
   set tipo_pago = 'global'
 where fincargue is null
   and tipo_pago is null
   and auxiliares is not null
   and trim(auxiliares) <> '';

-- =====================================================================
