// Catálogo único de novedades de "día" (Siigo) y de puestos operativos.
// Antes vivía duplicado byte-a-byte en 4 archivos (Novedades de Personal,
// Visor de asistencia, LIPbot, Programación de turnos) -- cualquier cambio
// tenía que replicarse a mano en los 4 sin garantía de que quedaran iguales.

// "38- Suspensión temporal de Contrato" REUSA el código 38 (mismo trato de
// nómina/PILA que Licencia no remunerada -- la ley las agrupa bajo el mismo
// código PILA "SLN"), pero es un texto distinto para dejar auditable CUÁL de
// las dos ocurrió. `clasificarDiaCotizacion` (lib/parafiscales.ts) y las
// vistas `pagonomina`/`050_vistas_financieras.sql` tratan ambos textos igual.
export const NOVEDADES_DIA = [
  "38- Licencia no remunerada- Deducción",
  "38- Suspensión temporal de Contrato- Deducción",
  "13- Incapacidad por enfermedad general al 100%",
  "14- Incapacidad por enfermedad general al 50",
  "15- Incapacidad por enfermedad general al 66%- ingreso",
  "16- Incapacidad por enfermedad profesional",
  "20- Licencia maternidad/paternidad",
  "21- Licencia por luto",
  "22- Licencia remunerada",
  "31- Vacaciones disfrutadas",
  "Retiro",
  "Descanso",
  "Descanso compensatorio domingo anterior",
] as const
export type NovedadDia = (typeof NOVEDADES_DIA)[number]

// Movidos desde components/attendance-table.tsx (mismos literales, misma
// fuente ahora también para Asistencia Administrativa).
export const OPERACIONES_OPTIONS = [
  "Cargue/Descargue",
  "Tolva Planchador",
  "Tolva Bulto",
  "Distribución Externa",
  "Auxiliar Mixto",
] as const

export const ESPECIALIDADES_OPTIONS = [
  "Pacas",
  "Cosedor",
  "Arrume Negro",
  "Reempaque",
  "Aseo",
  "Limpieza de Estibas",
  "Clasificacion huevos",
  "Cargue/Descargue Huevos",
  "Estibado PT",
  "Salvado",
  "Producción",
  "Descanso",
  "Distribución Turno",
  "Montacargas de producción",
  "Montacargas de cargue",
  "Operador PT (Carrusel)",
] as const


// Duplicado intencional de app/api/attendance/register-shifts/route.ts: no
// se centraliza esa ruta del kiosko para no tocarla sin necesidad.
export function horasTurnoParaEspecialidad(puesto: string | null | undefined): number {
  if (!puesto) return 8
  return puesto.trim().toLowerCase() === "salvado" ? 10 : 8
}

// Movidos desde components/attendance-table.tsx (misma regla ahora también
// para el Visor de Asistencia · Dashboard Diario, para que "llegada tarde"
// signifique EXACTAMENTE lo mismo en ambos módulos).

/**
 * Convierte "HH:MM" o "HH:MM:SS" a minutos desde medianoche. Devuelve
 * NaN si el string no tiene formato valido — el caller debe filtrarlo
 * antes de comparar para evitar comparaciones contra NaN (que siempre
 * son false y enmascararian la regla de "Llegada tarde").
 */
export function timeToMinutes(t: string | null | undefined): number {
  if (!t) return Number.NaN
  const parts = t.split(":")
  if (parts.length < 2) return Number.NaN
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.NaN
  return h * 60 + m
}

/**
 * `true` si la persona llego tarde respecto a su hora programada.
 * Reglas: ambos valores deben existir y parsear a numeros validos. Si
 * no hay hora programada (sin turno) no se considera tardanza, aunque
 * haya llegado: la columna mostrara solo "-".
 */
export function isLate(
  horaLlegada: string | null | undefined,
  horaProgramada: string | null | undefined,
): boolean {
  const llegada = timeToMinutes(horaLlegada)
  const programada = timeToMinutes(horaProgramada)
  if (!Number.isFinite(llegada) || !Number.isFinite(programada)) return false
  return llegada > programada
}

/** Minutos de tardanza (0 si no llegó tarde o falta algún dato). */
export function minutosTarde(
  horaLlegada: string | null | undefined,
  horaProgramada: string | null | undefined,
): number {
  if (!isLate(horaLlegada, horaProgramada)) return 0
  return timeToMinutes(horaLlegada) - timeToMinutes(horaProgramada)
}
