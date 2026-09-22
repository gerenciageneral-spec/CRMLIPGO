// Fechas del CRM — helpers puros, SIN "use server": este archivo exporta
// constantes y funciones sincronas, que una directiva "use server" prohibiria.
//
// POR QUE NO SE USA lib/date-utils.ts: ese archivo es "use server" (solo
// invocable desde servidor) y su getColombiaDate() aplica toISOString() sobre
// una fecha que ya fue desplazada por toLocaleString, con lo que reintroduce
// el offset UTC que pretendia corregir. Aqui se usa date-fns-tz, que ya es
// dependencia del proyecto (^3.2.0) y hace la conversion bien.
//
// CONVENCION DEL PROYECTO: las fechas de negocio viajan como strings
// "YYYY-MM-DD" de punta a punta (BD -> server action -> estado -> UI). No se
// construyen objetos Date para filtrar: se comparan strings. Asi ninguna capa
// puede correr el dia por zona horaria.

import { formatInTimeZone } from "date-fns-tz"

/** Colombia no tiene horario de verano, pero se nombra la zona igual: el dia
 *  de negocio lo define la operacion en Bogota, no donde este el servidor. */
export const TZ = "America/Bogota"

/** Hoy en Colombia, ISO "YYYY-MM-DD". */
export function hoyISO(): string {
  return formatInTimeZone(new Date(), TZ, "yyyy-MM-dd")
}

/** Ahora en Colombia, "YYYY-MM-DD HH:mm". Para sellos legibles, no para BD. */
export function ahoraColombia(): string {
  return formatInTimeZone(new Date(), TZ, "yyyy-MM-dd HH:mm")
}

/** Suma (o resta, con negativo) dias a una fecha ISO y devuelve ISO.
 *  Opera sobre las partes de la fecha, sin pasar por UTC. */
export function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number)
  const f = new Date(a, m - 1, d + dias) // constructor local: no hay conversion UTC
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`
}

/** Dias calendario entre dos ISO (fin - ini). Negativo si fin es anterior. */
export function diasEntre(iniISO: string, finISO: string): number {
  const [a1, m1, d1] = iniISO.split("-").map(Number)
  const [a2, m2, d2] = finISO.split("-").map(Number)
  const ini = Date.UTC(a1, m1 - 1, d1)
  const fin = Date.UTC(a2, m2 - 1, d2)
  return Math.round((fin - ini) / 86_400_000)
}

/** Dias vencidos respecto a hoy. Positivo = ya vencio. Es la base del aging. */
export function diasVencidos(vencimientoISO: string): number {
  return diasEntre(vencimientoISO, hoyISO())
}

/** Dias habiles entre dos fechas ISO, inclusive: lunes a sabado, EXCLUYENDO
 *  domingos y FESTIVOS (Colombia). Pasale el conjunto de festivos (fechas ISO)
 *  para que los descuente; sin el, solo excluye domingos.
 *
 *  Heredado de lib/vacaciones-types.ts, con una correccion: el original armaba
 *  el ISO con toISOString(), que convierte a UTC y en un servidor al oeste de
 *  Greenwich devolvia el dia anterior. Aqui se arma desde las partes locales. */
export function diasHabilesEntre(iniISO: string, finISO: string, festivos?: Iterable<string>): string[] {
  const fest = festivos instanceof Set ? festivos : new Set(festivos ?? [])
  const out: string[] = []
  const d = new Date(`${iniISO}T00:00:00`)
  const fin = new Date(`${finISO}T00:00:00`)
  if (Number.isNaN(d.getTime()) || Number.isNaN(fin.getTime()) || d > fin) return out
  while (d <= fin) {
    const dow = d.getDay() // 0=dom, 1=lun ... 6=sab
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    if (dow !== 0 && !fest.has(iso)) out.push(iso) // lun-sab y no festivo
    d.setDate(d.getDate() + 1)
  }
  return out
}

/** Primer y ultimo dia del mes de una fecha ISO. Para filtros de periodo. */
export function rangoDelMes(iso: string): { desde: string; hasta: string } {
  const [a, m] = iso.split("-").map(Number)
  const ultimo = new Date(a, m, 0).getDate() // dia 0 del mes siguiente = ultimo de este
  const mm = String(m).padStart(2, "0")
  return { desde: `${a}-${mm}-01`, hasta: `${a}-${mm}-${String(ultimo).padStart(2, "0")}` }
}

/** Formatea un ISO para mostrar: "22/09/2026". Vacio si el valor no sirve. */
export function formatearISO(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return ""
  const [a, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${a}`
}
