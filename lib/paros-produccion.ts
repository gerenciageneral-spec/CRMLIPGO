// Lógica pura (cliente y servidor) para detectar FRANJAS DE PARO de la máquina
// a partir del contador de 2 min (historial_intervalos). Comparte el criterio
// de "celda down" con el dashboard de producción para que ambos vean los mismos
// paros y se puedan comentar/reflejar de forma consistente. Todo en HORA LITERAL
// (UTC), igual que el dashboard.

export interface HistRowLike {
  fecha_hora: string
  produccion_2min: number | null
}

export interface ParoDetectado {
  inicioMs: number
  finMs: number
  inicioISO: string // clave del paro (ISO UTC del inicio de la franja)
  finISO: string
  inicio: string // HH:MM
  fin: string // HH:MM
  minutos: number
}

const BUCKET_MIN = 2

const HORA_UTC = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
})

export function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

// Fecha (YYYY-MM-DD) de HOY para el filtro por defecto.
//
// OJO: se toma en hora de COLOMBIA, no en UTC, aunque el resto del modulo
// trabaje en hora literal.
//
// Antes se formateaba en UTC y, a partir de las 19:00 hora de Colombia, ya era
// el dia siguiente en UTC: "Reporte de Paros" abria en el dia siguiente y salia
// VACIO toda la tarde-noche. El dashboard ya lo habia corregido de su lado
// (control-piso.tsx), pero esta copia se quedo atras y el bug seguia vivo en
// Reporte de Paros, que es justamente el modulo que se usa al cierre del turno.
//
// No es contradictorio con el resto del archivo: los RANGOS de consulta si se
// arman con los digitos literales (...T00:00:00Z), porque `fecha_hora` guarda
// la hora de pared de Colombia etiquetada como UTC. Justamente por eso el
// limite del dia tiene que ser el dia calendario COLOMBIANO: asi los digitos
// del rango coinciden con los digitos almacenados.
//
// El nombre se conserva para no tocar a los consumidores.
export function utcDateStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

export function nextDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(next)
}

// Hora de pared de Bogotá reinterpretada como UTC (mismo criterio del dashboard).
export function bogotaWallAsUtcMs(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00"
  const hour = get("hour") === "24" ? "00" : get("hour")
  return Date.parse(`${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}Z`)
}

export function parseTs(value: string): Date {
  if (!value) return new Date(NaN)
  let s = value.trim().replace(" ", "T")
  const tz = s.match(/([+-]\d{2}(:?\d{2})?|Z)$/)
  if (!tz) s = `${s}Z`
  else if (/[+-]\d{2}$/.test(s)) s = `${s}:00`
  return new Date(s)
}

export function horaUTC(ms: number): string {
  return HORA_UTC.format(new Date(ms))
}

// Devuelve las FRANJAS de paro (celdas de 2 min sin producción, agrupadas en
// runs contiguos) entre shiftStart y shiftEnd, hasta el corte `nowMs`.
/**
 * Igual que `detectarParos`, pero la ventana se expresa en MINUTOS desde la
 * medianoche en vez de en horas enteras.
 *
 * Hace falta porque el Horario de Tolva se configura a la hora que sea
 * -06:30, 17:45- y redondear a la hora en punto inventaria o descartaria
 * paros en los bordes de la jornada.
 */
export function detectarParosEnVentana(
  histRows: HistRowLike[],
  selectedDate: string,
  desdeMin: number,
  hastaMin: number,
  nowMs: number,
): ParoDetectado[] {
  const bucketMs = BUCKET_MIN * 60000
  const prod = new Map<number, number>()
  for (const h of histRows) {
    const t = parseTs(h.fecha_hora).getTime()
    if (Number.isNaN(t)) continue
    const start = t - (t % bucketMs)
    prod.set(start, (prod.get(start) || 0) + (h.produccion_2min || 0))
  }
  const base = Date.parse(
    `${selectedDate}T${pad2(Math.floor(desdeMin / 60))}:${pad2(desdeMin % 60)}:00Z`,
  )
  const totalBuckets = Math.max(0, Math.ceil((hastaMin - desdeMin) / BUCKET_MIN))
  const paros: ParoDetectado[] = []
  const push = (s: number, e: number) => {
    paros.push({
      inicioMs: s,
      finMs: e,
      inicioISO: new Date(s).toISOString(),
      finISO: new Date(e).toISOString(),
      inicio: horaUTC(s),
      fin: horaUTC(e),
      minutos: Math.round((e - s) / 60000),
    })
  }
  let runStart: number | null = null
  let lastDown = 0
  for (let i = 0; i < totalBuckets; i++) {
    const start = base + i * bucketMs
    if (start > nowMs) break // futuro: aún no ocurre
    const down = (prod.get(start) || 0) <= 0
    if (down) {
      if (runStart == null) runStart = start
      lastDown = start
    } else if (runStart != null) {
      push(runStart, lastDown + bucketMs)
      runStart = null
    }
  }
  if (runStart != null) push(runStart, lastDown + bucketMs)
  return paros
}

/**
 * Firma original, en horas enteras. Se conserva para `reporte-paros`, que
 * trabaja con turnos en hora en punto.
 */
export function detectarParos(
  histRows: HistRowLike[],
  selectedDate: string,
  shiftStart: number,
  shiftEnd: number,
  nowMs: number,
): ParoDetectado[] {
  return detectarParosEnVentana(histRows, selectedDate, shiftStart * 60, shiftEnd * 60, nowMs)
}
