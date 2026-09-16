-- Modo de carga elegido por el coordinador: "Estibado" (estibas normales) o
-- "Arrume" (arrume negro/desarrume, requiere casi el doble de auxiliares por
-- vehiculo). Solo aplica a Cargue en ID1 (Indupan) e ID2 (Avimol) — es donde
-- existe la practica real de arrume negro (confirmado por el usuario
-- 2026-08-29). Obligatorio antes de cerrar esas ordenes, ver
-- setModoCargaOrden (lib/picking-actions.ts) y su exigencia en
-- app/api/upload-picking-photos/route.ts.
ALTER TABLE public.cabeceraoc
  ADD COLUMN IF NOT EXISTS modo_carga text
  CHECK (modo_carga IS NULL OR modo_carga IN ('Estibado', 'Arrume'));
