// Cuando esta activa cada integracion.
//
// La decision vive en funciones PURAS (sin base, sin variables de entorno
// leidas por dentro) para poder probarlas: "un pedido de Molinos nunca viaja a
// SAP" y "con SAP_MODE=disabled no sale nada" son criterios de aceptacion del
// requerimiento y tienen que estar cubiertos por pruebas, no por confianza.

import type { FlujoSap, ModoSap } from "./tipos"

/** Interpreta SAP_MODE. Cualquier valor raro cuenta como apagado: SAP nunca se
 *  enciende por un error de escritura en una variable de entorno. */
export function interpretarModoSap(valor: string | undefined | null): ModoSap {
  const v = String(valor ?? "").trim().toLowerCase()
  return v === "mock" || v === "live" ? v : "disabled"
}

/**
 * Un flujo hacia SAP esta activo solo si se cumplen LAS TRES condiciones:
 *   1. la conexion esta encendida (SAP_MODE distinto de disabled);
 *   2. el interruptor de ese flujo esta en true (crm_parametros);
 *   3. el owner del documento factura por SAP (INDUPAN si, Molinos no).
 *
 * Tres llaves y no una: encender SAP para probar recaudos no debe empezar a
 * mandar pedidos, y ningun interruptor puede hacer que Molinos llegue a SAP.
 */
export function flujoSapActivo(p: {
  modo: ModoSap
  interruptorFlujo: boolean
  ownerEnviaSap: boolean
}): boolean {
  return p.modo !== "disabled" && p.interruptorFlujo && p.ownerEnviaSap
}

/**
 * Hay que dejar el evento en la bandeja aunque SAP este apagado?
 *
 * Si: INT-02 pide que con SAP desactivado los eventos queden pendientes, para
 * que al encenderlo se puedan enviar (criterio de aceptacion 3). Lo unico que
 * NUNCA se encola es lo de un owner que no factura por SAP: un pedido de
 * Molinos no debe aparecer ni como pendiente (criterio 4).
 */
export function debeEncolarSap(ownerEnviaSap: boolean): boolean {
  return ownerEnviaSap
}

/**
 * Espera antes del siguiente reintento, en minutos. Se duplica en cada intento
 * (5, 10, 20, 40…) con un techo de un dia: un sistema que vuelve de una caida
 * no recibe de golpe todo lo que se acumulo.
 */
export function esperaReintentoMin(intento: number, baseMin: number): number {
  const base = Math.max(1, baseMin)
  return Math.min(base * 2 ** Math.max(0, intento - 1), 24 * 60)
}

/** Llave de idempotencia estandar: sistema:entidad:id:operacion:version. */
export function llaveIdempotencia(p: {
  sistema: string
  entidad: string
  entidadId: number | string
  operacion: string
  version?: number
}): string {
  return [p.sistema, p.entidad, p.entidadId, p.operacion, `v${p.version ?? 1}`].join(":")
}

export const FLUJOS_SAP: readonly FlujoSap[] = [
  "pedidos", "recaudos", "clientes", "facturas", "inventario", "sucursales",
]
