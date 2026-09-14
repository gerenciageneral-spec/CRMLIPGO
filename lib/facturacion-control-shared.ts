// Piezas puras de Cuadro de Control de Facturación, compartidas entre
// `lib/facturacion-control-actions.ts` (`"use server"`, solo puede exportar
// funciones async) y consumidores que necesitan una función síncrona (ver
// lib/ciclo-facturacion-shared.ts, mismo patrón).

import type { PrefacturaResumen } from "@/lib/facturacion-control-actions"

/**
 * ¿Este grupo del resumen ya está listo para entrar en un anexo de Ciclo de
 * Facturación? Bloque "producción" (Tolva reclasificada, conciliación de
 * Avimol, Servicios Adicionales) no tiene validación por-orden del
 * Coordinador -- no hay tiquete/foto que pedirle, así que se factura
 * completa igual que siempre (el período contiguo es su único anti-doble-
 * cobro). Bloque "operación" (Cargue/Descargue/Distribución a clientes
 * reales) SÍ exige que el Coordinador ya haya validado la orden en Gestión
 * de Facturas ("CF - Factura solicitada") -- confirmado por el usuario
 * 2026-09-14: "la solicitud de facturas a crédito es la que arma el cuadro
 * control que a su vez alimenta el ciclo de facturación, sin estos anexos
 * no se puede cobrar a los clientes". Antes de este cambio se usaba
 * `valorPorFacturar` (justo lo CONTRARIO: órdenes que el Coordinador nunca
 * ha tocado) -- quedaba al revés.
 */
export function valorListoParaAnexo(r: PrefacturaResumen): number {
  return r.bloque === "produccion" ? r.valorPorFacturar : r.valorValidadoCredito
}
export function tonListoParaAnexo(r: PrefacturaResumen): number {
  return r.bloque === "produccion" ? r.tonPorFacturar : r.tonValidadoCredito
}
