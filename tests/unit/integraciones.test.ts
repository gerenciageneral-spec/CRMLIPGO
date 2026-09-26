// Reglas de la capa de integracion (seccion 2 del requerimiento).
//
// Cubre dos criterios de aceptacion del documento:
//   - con SAP_MODE=disabled no sale nada hacia SAP (criterio 1);
//   - un pedido de Molinos nunca genera evento hacia SAP (criterio 4).

import { describe, expect, it } from "vitest"
import {
  debeEncolarSap, esperaReintentoMin, flujoSapActivo, interpretarModoSap, llaveIdempotencia,
} from "@/lib/integraciones/config"
import { getSapGateway, sapSimulado } from "@/lib/integraciones/sap/gateways"
import { limpiarVariable, normalizarCelularCO } from "@/lib/integraciones/whatsapp"

describe("modo de SAP", () => {
  it("solo mock y live encienden la conexion", () => {
    expect(interpretarModoSap("mock")).toBe("mock")
    expect(interpretarModoSap("live")).toBe("live")
    expect(interpretarModoSap(" LIVE ")).toBe("live")
  })

  it("cualquier otro valor, o su ausencia, deja SAP apagado", () => {
    for (const v of [undefined, null, "", "disabled", "true", "prod", "livee"]) {
      expect(interpretarModoSap(v)).toBe("disabled")
    }
  })
})

describe("cuando un flujo viaja a SAP", () => {
  it("exige las tres llaves: conexion, interruptor del flujo y owner que factura por SAP", () => {
    expect(flujoSapActivo({ modo: "live", interruptorFlujo: true, ownerEnviaSap: true })).toBe(true)
    expect(flujoSapActivo({ modo: "mock", interruptorFlujo: true, ownerEnviaSap: true })).toBe(true)
  })

  it("con SAP desactivado no viaja nada, aunque el flujo este encendido", () => {
    expect(flujoSapActivo({ modo: "disabled", interruptorFlujo: true, ownerEnviaSap: true })).toBe(false)
  })

  it("con el interruptor del flujo apagado no viaja", () => {
    expect(flujoSapActivo({ modo: "live", interruptorFlujo: false, ownerEnviaSap: true })).toBe(false)
  })

  it("Molinos nunca viaja a SAP, ni con todo encendido", () => {
    expect(flujoSapActivo({ modo: "live", interruptorFlujo: true, ownerEnviaSap: false })).toBe(false)
  })
})

describe("que se deja en la bandeja", () => {
  it("lo de INDUPAN se encola aunque SAP este apagado, para enviarlo al encenderlo", () => {
    expect(debeEncolarSap(true)).toBe(true)
  })

  it("lo de Molinos no se encola nunca, ni como pendiente", () => {
    expect(debeEncolarSap(false)).toBe(false)
  })
})

describe("gateways de SAP", () => {
  it("el desactivado nunca reporta exito", async () => {
    const r = await getSapGateway("disabled").ejecutar("crear_pedido", {}, "k")
    expect(r.ok).toBe(false)
    expect(r.reintentable).toBe(true)
  })

  it("el simulado devuelve un numero de documento estable para la misma llave", async () => {
    const a = await sapSimulado.ejecutar("crear_pedido", {}, "sap:pedido:1:crear:v1")
    const b = await sapSimulado.ejecutar("crear_pedido", {}, "sap:pedido:1:crear:v1")
    const c = await sapSimulado.ejecutar("crear_pedido", {}, "sap:pedido:2:crear:v1")
    expect(a.ok).toBe(true)
    expect(a.referencia).toBe(b.referencia)
    expect(a.referencia).not.toBe(c.referencia)
  })

  it("el simulado puede forzar un error, reintentable o permanente", async () => {
    const t = await sapSimulado.ejecutar("crear_pedido", { __simular_error: "timeout" }, "k")
    const p = await sapSimulado.ejecutar("crear_pedido", { __simular_error: "permanente" }, "k")
    expect(t.ok).toBe(false)
    expect(t.reintentable).toBe(true)
    expect(p.reintentable).toBe(false)
  })

  it("elige la implementacion segun el modo", () => {
    expect(getSapGateway("disabled").modo).toBe("disabled")
    expect(getSapGateway("mock").modo).toBe("mock")
    expect(getSapGateway("live").modo).toBe("live")
  })
})

describe("idempotencia y reintentos", () => {
  it("la llave distingue documento, operacion y version", () => {
    const base = { sistema: "sap", entidad: "pedido", entidadId: 7, operacion: "crear_pedido" }
    expect(llaveIdempotencia(base)).toBe("sap:pedido:7:crear_pedido:v1")
    expect(llaveIdempotencia({ ...base, version: 2 })).not.toBe(llaveIdempotencia(base))
  })

  it("la espera se duplica en cada intento, con techo de un dia", () => {
    expect([1, 2, 3, 4].map((i) => esperaReintentoMin(i, 5))).toEqual([5, 10, 20, 40])
    expect(esperaReintentoMin(30, 5)).toBe(24 * 60)
  })
})

describe("WhatsApp", () => {
  it("normaliza celulares colombianos a E.164", () => {
    expect(normalizarCelularCO("300 123 4567")).toBe("573001234567")
    expect(normalizarCelularCO("+57 300-123-4567")).toBe("573001234567")
    expect(normalizarCelularCO("0057 3001234567")).toBe("573001234567")
  })

  it("rechaza lo que no es un movil colombiano", () => {
    for (const v of ["", null, "6011234567", "12345", "5530012345678"]) {
      expect(normalizarCelularCO(v)).toBeNull()
    }
  })

  it("quita saltos de linea, que Meta rechaza dentro de una variable", () => {
    expect(limpiarVariable("Pedido aprobado\n\nCliente X   Sucursal Y")).toBe("Pedido aprobado · Cliente X Sucursal Y")
  })
})
