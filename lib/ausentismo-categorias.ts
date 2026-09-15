// Clasificación de las novedades del control diario (registroasistencia.asistencia)
// para el PUENTE hacia el módulo de Ausentismos. Puro y client-safe (sin
// "use server"): lo usan el puente (server), la tabla de Ausentismos y Recobro.
//
// REGLA (definida con negocio). SON ausentismo (el puente las envía):
//   - Incapacidades MÉDICAS: enfermedad general (EG) y accidente/enf. laboral (AT).
//     Son las únicas RECOBRABLES (EPS/ARL) y las que alimentan indicadores SST.
//   - Licencia NO REMUNERADA: ausencia SIN soporte médico que nómina rotula así
//     (deducción). Es ausentismo NO médico → NO recobrable, sin diagnóstico.
// NO son ausentismo (el puente NO las envía):
//   - Otras licencias (maternidad/paternidad, luto, remunerada)
//   - Vacaciones (submódulo propio), Descanso / compensatorio, Retiro (baja).

export type CategoriaAusentismo = "ENFERMEDAD_GENERAL" | "ACCIDENTE_LABORAL" | "NO_REMUNERADA"

// Solo estas alimentan recobro (EPS/ARL) e indicadores SST de accidentalidad.
export const CATEGORIAS_MEDICAS: CategoriaAusentismo[] = ["ENFERMEDAD_GENERAL", "ACCIDENTE_LABORAL"]

export function esCategoriaMedica(cat: string | null | undefined): boolean {
  return cat === "ENFERMEDAD_GENERAL" || cat === "ACCIDENTE_LABORAL"
}

export function tipoEventoDeCategoria(cat: string | null | undefined): "EG" | "AT" | null {
  if (cat === "ENFERMEDAD_GENERAL") return "EG"
  if (cat === "ACCIDENTE_LABORAL") return "AT"
  return null // NO_REMUNERADA no tiene tipo_evento (no es médica)
}

// Rótulo de novedad → categoría de ausentismo, o null si NO es ausentismo.
export function categoriaDeNovedad(asistencia: string | null | undefined): CategoriaAusentismo | null {
  const s = String(asistencia || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
  if (!s) return null
  if (s.includes("incapacidad")) return s.includes("profesional") ? "ACCIDENTE_LABORAL" : "ENFERMEDAD_GENERAL"
  // "Suspensión temporal de Contrato" comparte el mismo código PILA y trato que la
  // licencia no remunerada (ver lib/asistencia-catalogos.ts) -- misma categoría aquí.
  if (s.includes("no remunerada") || s.includes("suspension")) return "NO_REMUNERADA"
  return null // otras licencias, vacaciones, descanso, retiro → NO son ausentismo
}

export const CATEGORIA_LABEL: Record<string, string> = {
  ENFERMEDAD_GENERAL: "Enfermedad general",
  ACCIDENTE_LABORAL: "Accidente / enf. laboral",
  NO_REMUNERADA: "No remunerada (sin soporte médico)",
}

export function etiquetaCategoria(cat: string | null | undefined): string {
  return (cat && CATEGORIA_LABEL[cat]) || "Ausentismo"
}

// Denominador REAL del ausentismo: días que una persona estuvo vinculada
// (headcount.fechainicio/fecha_retiro) dentro de un período [desde,hasta],
// no el conteo de filas que alcanzó a tener en registroasistencia ese
// período (alguien puede estar activo sin ninguna fila registrada). Usa las
// fechas de vínculo para que el resultado sea correcto también para
// períodos históricos (headcount cambia con altas/bajas en el tiempo).
export function diasActivosEnPeriodo(
  fechainicio: string | null | undefined,
  fechaRetiro: string | null | undefined,
  desde: string,
  hasta: string,
): number {
  const DAY_MS = 86_400_000
  const clamp = (s: string) => new Date(`${String(s).slice(0, 10)}T00:00:00`).getTime()
  const iniPeriodo = clamp(desde)
  const finPeriodo = clamp(hasta)
  const ini = Math.max(iniPeriodo, fechainicio ? clamp(fechainicio) : iniPeriodo)
  const fin = Math.min(finPeriodo, fechaRetiro ? clamp(fechaRetiro) : finPeriodo)
  if (fin < ini) return 0
  return Math.round((fin - ini) / DAY_MS) + 1
}
