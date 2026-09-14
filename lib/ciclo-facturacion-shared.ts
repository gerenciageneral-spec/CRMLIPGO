// Piezas puras del Ciclo de Facturación, compartidas entre `lib/ciclo-facturacion-actions.ts`
// (`"use server"`, solo puede exportar funciones async) y consumidores que
// necesitan una función síncrona o una constante (el cron en
// app/api/cron/anexos-pendientes/route.ts, el componente
// components/ciclo-facturacion.tsx). Mismo patrón que lib/tarifas-turno-shared.ts.

/** Owner de una prefactura -- en la práctica siempre uno solo (confirmado con el negocio); si trae más de uno, se marca para revisión manual en vez de ocultarlo. */
export function ownerDePrefactura(lineas: any[]): { owner: string; ownerMezclado: boolean } {
  const owners = Array.from(new Set((lineas || []).map((l) => String(l?.owner || "").trim()).filter(Boolean)))
  return { owner: owners[0] || "(sin owner)", ownerMezclado: owners.length > 1 }
}

export const DIAS_SEMANA_LABEL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

/** Fecha de "ayer" en Colombia, ISO (YYYY-MM-DD) -- usada tanto por
 *  `generarPrefacturaAhora` (calcula "hasta") como por el cron (decide si
 *  hoy le toca disparar la cadencia "cortes", comparando el día-del-mes de
 *  ayer contra `dias_corte`), para que el disparo y el período generado
 *  siempre sean consistentes entre sí. */
export function fechaAyerColombiaISO(): string {
  const ahora = new Date()
  const colombia = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Bogota" }))
  colombia.setDate(colombia.getDate() - 1)
  const y = colombia.getFullYear()
  const m = String(colombia.getMonth() + 1).padStart(2, "0")
  const d = String(colombia.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}
