// Que puede ver el asistente de IA, y con que permiso.
//
// SIN "use server": exporta constantes y funciones sincronas.
//
// Este archivo es la superficie de datos del asistente. Agregar una tabla aqui
// es darle acceso; quitarla es cerrarselo. Conviene tratarlo como lo que es:
// una decision de seguridad, no de configuracion.
//
// El equivalente en LIPgo (lib/lipbot-registry.ts) tenia ademas un
// NUCLEO_PROHIBIDO con las tablas que la IA no podia tocar ni con permiso
// (nomina, inventario, ordenes de cargue). Aqui no hace falta la lista negra
// porque se usa la inversa: SOLO existe lo que esta en esta lista blanca, y
// ninguna tabla de LIPgo aparece en ella.

import type { UserPermissions } from "@/lib/permissions-map"

/** Tablas y vistas que el asistente puede LEER. Lista blanca estricta. */
export const TABLAS_LECTURA = [
  "crm_prospectos",
  "crm_prospecto_interes",
  "crm_actividades",
  "crm_agenda",
  "crm_etapas",
  "crm_cotizaciones",
  "crm_cotizacion_detalle",
  "crm_pedidos",
  "crm_pedido_detalle",
  "crm_cuentas_cobrar",
  "crm_cartera_aging",
  "crm_pagos",
  "crm_comisiones",
  "crm_listas_precios",
  "crm_lista_precio_detalle",
  "clientes",
  "productos",
  "vendedores",
  "bodegas",
] as const

export type TablaLectura = (typeof TABLAS_LECTURA)[number]

/** Permiso que habilita cada tabla. Si el usuario no lo tiene, la tabla no
 *  llega siquiera al esquema de la herramienta. */
const PERMISO_POR_TABLA: Record<string, keyof UserPermissions> = {
  crm_prospectos: "crm_prospectos",
  crm_prospecto_interes: "crm_prospectos",
  crm_actividades: "crm_actividades",
  crm_agenda: "crm_agenda",
  crm_etapas: "crm_embudo",
  crm_cotizaciones: "crm_cotizaciones",
  crm_cotizacion_detalle: "crm_cotizaciones",
  crm_pedidos: "crm_pedidos",
  crm_pedido_detalle: "crm_pedidos",
  crm_cuentas_cobrar: "crm_cartera",
  crm_cartera_aging: "crm_cartera",
  crm_pagos: "crm_pagos",
  crm_comisiones: "crm_comisiones",
  crm_listas_precios: "crm_listas_precios",
  crm_lista_precio_detalle: "crm_listas_precios",
  clientes: "crm_clientes",
  productos: "crm_productos",
  vendedores: "crm_vendedores",
  bodegas: "crm_clientes",
}

export function permisoDeTabla(tabla: string): keyof UserPermissions {
  // Sin entrada explicita se exige el permiso mas restrictivo que existe, para
  // que agregar una tabla y olvidar su permiso no la deje abierta.
  return PERMISO_POR_TABLA[tabla] ?? "crm_usuarios"
}

/**
 * Columna por la que se filtra la empresa en cada tabla, o null si es un
 * catalogo global.
 *
 * El nombre no es uniforme porque las tablas heredadas de LIPgo usan
 * `id_empresa` y las nuevas del CRM `idempresa`. Se centraliza aqui para que
 * nadie tenga que acordarse de cual toca en cada caso.
 */
export function columnaEmpresaDe(tabla: string): string | null {
  // Tablas del CRM: todas se crearon con `idempresa`.
  if (tabla.startsWith("crm_")) return "idempresa"

  // Tablas heredadas de LIPgo.
  switch (tabla) {
    case "clientes":
    case "productos":
    case "vendedores":
      return "id_empresa"
    case "bodegas":
      return "idempresa"
    default:
      return null
  }
}
