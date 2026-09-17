-- ============================================================================
-- PASO 0 — VENTANA DE REVERSA (correr ANTES de desplegar el nuevo modelo)
-- ----------------------------------------------------------------------------
-- Captura la definición EXACTA de las vistas ANTES del cambio. Copia el resultado
-- de cada consulta y guárdalo en un archivo (p.ej. rollback_nomina_2026-07-28.sql).
-- Con eso puedes RESTAURAR el estado actual en cualquier momento simplemente
-- pegando y ejecutando ese texto. Es tu botón de "deshacer".
--
-- Cada consulta ya devuelve el DDL COMPLETO y ejecutable (incluye el
-- 'create or replace view ... as'). No hace falta editar nada: copiar y guardar.
-- ============================================================================

-- 1) Rollback de pagonomina  (copiar la celda de resultado y guardar)
SELECT 'create or replace view public.pagonomina as ' || pg_get_viewdef('public.pagonomina'::regclass, true) AS rollback_pagonomina;

-- 2) Rollback de archivoplano (copiar la celda de resultado y guardar)
SELECT 'create or replace view public.archivoplano as ' || pg_get_viewdef('public.archivoplano'::regclass, true) AS rollback_archivoplano;

-- Sugerencia: guarda ambas celdas en un mismo .sql. Para RETROCEDER, ejecutas ese
-- archivo (primero pagonomina, luego archivoplano) y las vistas vuelven a como
-- están HOY, sin pérdida de datos (son vistas: no tocan tablas ni información).
