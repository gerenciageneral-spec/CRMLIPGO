-- ============================================================================
-- Módulo "Asignación de apoyo en cargue" (Compensación)
-- ----------------------------------------------------------------------------
-- Rastro de auditoría de qué personas fueron agregadas (APARTE de Picking/
-- Packing) a una orden de Cargue/Descargue para entrar en el reparto de
-- toneladas de esa orden (cabeceraoc.auxiliares). Es también la llave que usa
-- el fix de pagonomina (scripts/053_pagonomina_reemplazo.sql) para permitirle el
-- bono de toneladas a una persona de especialidad=true SOLO el día en que
-- tiene una fila aquí — sin relajar la regla de especialidad en general.
-- ============================================================================

create table if not exists public.apoyo_cargue_asignaciones (
  id bigserial primary key,
  idorden bigint not null references public.cabeceraoc(id) on delete cascade,
  idempresa integer not null,
  fecha date not null,
  persona text not null,
  asignado_por text,
  creado_en timestamptz not null default now()
);

create index if not exists idx_apoyo_cargue_fecha_persona
  on public.apoyo_cargue_asignaciones (fecha, persona);

create index if not exists idx_apoyo_cargue_idorden
  on public.apoyo_cargue_asignaciones (idorden);
