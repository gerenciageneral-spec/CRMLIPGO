// Planificación de rutas de visita.
//
// SIN "use server": son funciones puras, y quien las llame decide dónde.
//
// EL CÁLCULO NO LO HACE EL MODELO DE LENGUAJE. Un LLM resolviendo un problema
// de rutas produce recorridos plausibles y equivocados: nombra ciudades en un
// orden que suena razonable y no minimiza nada. Aquí el orden lo decide un
// algoritmo determinista y comprobable; el modelo interviene después, para
// explicar la ruta y ajustarla por criterios blandos ("este cliente prefiere
// mañanas", "esa zona tiene trancón a esa hora").

export interface Parada {
  id: string
  nombre: string
  latitud: number
  longitud: number
  /** Qué se va a hacer allí. Alimenta la explicación de la ruta. */
  motivo?: string
  tipo?: "prospecto" | "cliente" | "cobro"
  /** Para priorizar: un cobro vencido pesa más que una visita de cortesía. */
  prioridad?: number
}

export interface RutaCalculada {
  paradas: Parada[]
  distanciaKm: number
  tiempoEstimadoMin: number
  /** Cuánto mejoró frente al orden original, en porcentaje. */
  mejora: number
}

const RADIO_TIERRA_KM = 6371

/**
 * Distancia en línea recta entre dos coordenadas (haversine).
 *
 * Es una aproximación: no conoce calles ni sentidos. Para ordenar visitas
 * dentro de una ciudad es suficiente y no cuesta nada; calcular distancias
 * reales exigiría un servicio de rutas externo con su costo por consulta.
 */
export function distanciaKm(a: { latitud: number; longitud: number }, b: { latitud: number; longitud: number }): number {
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.latitud - a.latitud)
  const dLon = rad(b.longitud - a.longitud)
  const lat1 = rad(a.latitud)
  const lat2 = rad(b.latitud)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2

  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(h))
}

/** Distancia total de recorrer las paradas en el orden dado. */
export function distanciaTotal(paradas: Parada[], origen?: Parada): number {
  if (paradas.length < 2 && !origen) return 0

  let total = 0
  let anterior = origen ?? paradas[0]
  const resto = origen ? paradas : paradas.slice(1)

  for (const p of resto) {
    total += distanciaKm(anterior, p)
    anterior = p
  }
  return total
}

/**
 * Ordena las paradas para acortar el recorrido.
 *
 * Dos pasos:
 *   1. Vecino más cercano: desde donde se está, ir siempre a lo más próximo.
 *      Rápido, pero se equivoca al final del recorrido.
 *   2. 2-opt: buscar pares de tramos que se cruzan y desenredarlos. Es lo que
 *      quita los cruces que deja el paso anterior.
 *
 * Es un problema del que no se conoce solución exacta eficiente; para diez o
 * quince paradas esta combinación da resultados muy cercanos al óptimo en
 * milisegundos.
 */
export function optimizarRuta(
  paradas: Parada[],
  origen?: Parada,
  velocidadKmh = 35,
  minutosPorParada = 20,
): RutaCalculada {
  if (paradas.length <= 1) {
    return {
      paradas,
      distanciaKm: 0,
      tiempoEstimadoMin: paradas.length * minutosPorParada,
      mejora: 0,
    }
  }

  const distanciaOriginal = distanciaTotal(paradas, origen)

  // --- Paso 1: vecino más cercano --------------------------------------
  const pendientes = [...paradas]
  const orden: Parada[] = []
  let actual = origen

  while (pendientes.length) {
    let mejorIdx = 0

    if (actual) {
      let mejorDist = Infinity
      for (let i = 0; i < pendientes.length; i++) {
        // La prioridad reduce la distancia percibida: una parada urgente se
        // visita antes aunque quede algo más lejos. Sin esto, un cobro
        // vencido al otro lado de la ciudad quedaría para el final.
        const factor = 1 - Math.min(pendientes[i].prioridad ?? 0, 5) * 0.08
        const d = distanciaKm(actual, pendientes[i]) * factor
        if (d < mejorDist) {
          mejorDist = d
          mejorIdx = i
        }
      }
    }

    const elegida = pendientes.splice(mejorIdx, 1)[0]
    orden.push(elegida)
    actual = elegida
  }

  // --- Paso 2: 2-opt ----------------------------------------------------
  let mejorado = true
  let vueltas = 0

  // Tope de vueltas: con muchas paradas el 2-opt puede iterar largo rato, y
  // esto corre en el navegador mientras el usuario espera.
  while (mejorado && vueltas < 60) {
    mejorado = false
    vueltas++

    for (let i = 0; i < orden.length - 1; i++) {
      for (let j = i + 2; j < orden.length; j++) {
        const antes = distanciaTotal(orden, origen)
        // Invertir el tramo entre i+1 y j deshace el cruce si lo había.
        const candidato = [
          ...orden.slice(0, i + 1),
          ...orden.slice(i + 1, j + 1).reverse(),
          ...orden.slice(j + 1),
        ]
        const despues = distanciaTotal(candidato, origen)

        if (despues < antes - 0.01) {
          orden.splice(0, orden.length, ...candidato)
          mejorado = true
        }
      }
    }
  }

  const distanciaFinal = distanciaTotal(orden, origen)
  const tiempoViaje = (distanciaFinal / velocidadKmh) * 60

  return {
    paradas: orden,
    distanciaKm: Math.round(distanciaFinal * 10) / 10,
    tiempoEstimadoMin: Math.round(tiempoViaje + orden.length * minutosPorParada),
    mejora: distanciaOriginal > 0
      ? Math.max(0, Math.round(((distanciaOriginal - distanciaFinal) / distanciaOriginal) * 1000) / 10)
      : 0,
  }
}

/** Reparte paradas en varios días cuando no caben en uno. */
export function repartirEnDias(
  paradas: Parada[],
  maxPorDia: number,
  origen?: Parada,
): RutaCalculada[] {
  if (paradas.length <= maxPorDia) return [optimizarRuta(paradas, origen)]

  // Se optimiza el conjunto completo y luego se corta: así cada día queda con
  // paradas geográficamente vecinas, en vez de repartirlas al azar.
  const completa = optimizarRuta(paradas, origen)
  const dias: RutaCalculada[] = []

  for (let i = 0; i < completa.paradas.length; i += maxPorDia) {
    dias.push(optimizarRuta(completa.paradas.slice(i, i + maxPorDia), origen))
  }
  return dias
}

/** Centro y zoom para encuadrar todas las paradas en el mapa. */
export function encuadrar(paradas: Parada[]): { centro: [number, number]; zoom: number } {
  // Centro de Colombia como respaldo, igual que hacía el visor de LIPgo.
  if (!paradas.length) return { centro: [4.5709, -74.2973], zoom: 5 }

  const lats = paradas.map((p) => p.latitud)
  const lons = paradas.map((p) => p.longitud)
  const centro: [number, number] = [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lons) + Math.max(...lons)) / 2,
  ]

  const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lons) - Math.min(...lons))
  const zoom = span > 5 ? 6 : span > 2 ? 8 : span > 0.5 ? 10 : span > 0.1 ? 12 : 14

  return { centro, zoom }
}

export function formatearDuracion(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = Math.round(minutos % 60)
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}
