// Lógica PURA del cuadro de mando de nómina (sin "use server", sin I/O): tipos,
// defaults y el cálculo de recargos/horas extra a partir del salario + auxilio y
// los parámetros legales del año. Este mismo cálculo se replica en SQL dentro de
// la vista pagonomina (ver scripts/050_vistas_financieras.sql, CTE calculo_turnos).
//
// Convenciones (confirmadas contra las vistas reales):
//   - La base de los recargos/horas extra es el SALARIO (el auxilio de transporte
//     NO entra en la base de horas extra; se paga aparte). ingresoTotal es solo
//     informativo (salario + auxilio).
//   - hed/hen/hedf/hef guardan la HORA COMPLETA  = HOD × (1 + %/100)
//   - hn (recargo nocturno) guarda SOLO EL RECARGO = HOD × (%/100)
//   - recargo dominical se aplica sobre el VALOR DÍA (no sobre la HOD)

// Campos comunes a un juego de parámetros legales (sin la clave). Sirven tanto para
// el modelo por AÑO (ParametrosNomina) como por VIGENCIA de fecha (VigenciaParametros).
export interface ParametrosLegalesBase {
  smlv: number // salario mínimo legal mensual vigente (fallback / salario de prueba)
  auxilio: number // auxilio de transporte mensual
  diasCalendario: number // divisor del valor día (30)
  jornadaHoras: number // horas/día de la jornada legal; divisor mensual = dias × jornada
  pctHed: number
  pctHen: number
  pctHn: number
  pctRecargoDominical: number
  pctHedf: number
  pctHef: number
  pctRecargoNocturnoDominical: number
  // % del día que LIP reconoce en incapacidad (13/14/15), editable -- confirmado con
  // datos reales de Siigo (2026-09-08) que hoy paga 100%, sin importar el "50%"/"66%"
  // del nombre de la novedad (esos son solo la clasificación legal de quién asume el
  // día). La vista `pagonomina` lee este valor por vigencia en vez de tenerlo fijo.
  pctPagoIncapacidad: number
}

export interface ParametrosNomina extends ParametrosLegalesBase {
  anio: number
}

/** Parámetros legales VIGENTES desde una fecha (intervalos). Clave = fechaDesde (ISO). */
export interface VigenciaParametros extends ParametrosLegalesBase {
  fechaDesde: string // 'YYYY-MM-DD'
}

// Defaults de ley (post 16-jul-2026: jornada 7h, recargo 90%). El % dominical sube a 100 en 2027.
export const PARAMS_NOMINA_DEFAULTS: Omit<ParametrosNomina, "anio" | "smlv" | "auxilio"> = {
  diasCalendario: 30,
  jornadaHoras: 7,
  pctHed: 25,
  pctHen: 75,
  pctHn: 35,
  pctRecargoDominical: 90,
  pctHedf: 115,
  pctHef: 165,
  pctRecargoNocturnoDominical: 125,
  pctPagoIncapacidad: 100,
}

export interface RecargosCalculados {
  base: number // salario (base de recargos; SIN auxilio)
  ingresoTotal: number // salario + auxilio (solo informativo)
  valorDia: number // salario / dias
  hod: number // hora ordinaria = salario / (dias × jornada)
  hed: number
  hen: number
  hn: number
  hedf: number
  hef: number
  recargoDominical: number // sobre el valor día
  recargoNocturnoDominical: number // informativo (sin columna en tarifasturnos)
}

/**
 * Calcula el valor $/hora de cada recargo a partir del salario y los parámetros
 * del año. El auxilio NO entra en la base (norma CO); se recibe solo para exponer
 * el ingreso total informativo. En el preview del cuadro, `salario` = SMLV del año;
 * en producción, `salario` = headcount.salario (contrato) de cada persona.
 */
export function calcularRecargos(salario: number, aux: number, p: ParametrosLegalesBase): RecargosCalculados {
  const base = Number(salario) || 0 // base de recargos = salario (sin auxilio)
  const ingresoTotal = base + (Number(aux) || 0)
  const dias = Number(p.diasCalendario) || 0
  const jornada = Number(p.jornadaHoras) || 0
  const divisorMensual = dias * jornada

  const valorDia = dias > 0 ? base / dias : 0
  const hod = divisorMensual > 0 ? base / divisorMensual : 0

  return {
    base,
    ingresoTotal,
    valorDia,
    hod,
    hed: hod * (1 + p.pctHed / 100),
    hen: hod * (1 + p.pctHen / 100),
    hn: hod * (p.pctHn / 100),
    hedf: hod * (1 + p.pctHedf / 100),
    hef: hod * (1 + p.pctHef / 100),
    recargoDominical: valorDia * (p.pctRecargoDominical / 100),
    recargoNocturnoDominical: hod * (p.pctRecargoNocturnoDominical / 100),
  }
}
