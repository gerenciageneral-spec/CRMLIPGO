"use client"

// Hook generico de alertas del CRM.
//
// POR QUE ES UNO SOLO: LIPgo tenia DIEZ hooks de alerta (useFacturasAlerts,
// useAsistenciaAlerts, useInventarioAlerts...) identicos salvo el permiso, la
// URL y el tipo de la alerta. Diez copias del mismo codigo son diez sitios
// donde arreglar el mismo bug. Aqui se parametriza lo que cambiaba y se deja
// una sola implementacion.
//
// CONTRATO CON EL SERVIDOR: la ruta /api/crm/<dominio>-alerts debe devolver
// SIEMPRE { alerts, count } y no lanzar nunca: si falla, devuelve listas
// vacias. Una alerta rota no puede tumbar la barra superior.

import { useState, useEffect } from "react"
import { getUserPermissions } from "@/lib/permissions-actions"

/** Forma minima de una alerta. Cada dominio extiende con lo suyo, pero
 *  `mensaje` viene RENDERIZADO DESDE EL SERVIDOR: asi el popover solo pinta
 *  texto y no duplica reglas de negocio en el cliente. */
export interface CrmAlerta {
  tipo: string
  mensaje: string
  id?: number | string
  fecha?: string | null
  [k: string]: unknown
}

export interface UseCrmAlertsResult<T extends CrmAlerta = CrmAlerta> {
  alerts: T[]
  count: number
  loading: boolean
  hasPermission: boolean
}

/** Cada cuanto se repregunta. 60s es el intervalo que ya usaba LIPgo: lo
 *  bastante vivo para una alerta operativa, sin castigar la base. */
const REFRESH_MS = 60_000

/**
 * @param endpoint  nombre del dominio, p.ej. "cartera" -> /api/crm/cartera-alerts
 * @param permiso   columna(s) de permisos_usuarios que habilitan la alerta;
 *                  con varias, basta con tener una
 * @param empresaId empresa activa del selector global
 * @param userId    profiles.id del usuario en sesion
 */
export function useCrmAlerts<T extends CrmAlerta = CrmAlerta>(
  endpoint: string,
  permiso: string | string[],
  empresaId: number | null,
  userId?: string,
): UseCrmAlertsResult<T> {
  const [alerts, setAlerts] = useState<T[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [hasPermission, setHasPermission] = useState(false)

  useEffect(() => {
    let cancelado = false

    const cargar = async () => {
      if (!empresaId) {
        setLoading(false)
        return
      }

      try {
        // El permiso se consulta ANTES del fetch: sin permiso no se pregunta
        // por datos que el usuario no puede ver.
        const permisos = await getUserPermissions(userId)
        // El doble casting es necesario: UserPermissions es una interfaz de
        // columnas concretas y aqui el permiso llega como string en runtime.
        const lista = Array.isArray(permiso) ? permiso : [permiso]
        const mapa = permisos as unknown as Record<string, unknown> | null
        if (!mapa || !lista.some((k) => mapa[k] === true)) {
          if (!cancelado) {
            setHasPermission(false)
            setLoading(false)
          }
          return
        }
        if (cancelado) return
        setHasPermission(true)

        const res = await fetch(`/api/crm/${endpoint}-alerts?empresaId=${empresaId}`, {
          cache: "no-store", // una alerta cacheada es una alerta que miente
        })
        if (!res.ok || cancelado) {
          if (!cancelado) setLoading(false)
          return
        }

        const data = await res.json()
        if (cancelado) return
        setAlerts(data.alerts || [])
        setCount(data.count || 0)
      } catch (error) {
        // Se traga el error a proposito: la campana no puede romper la barra.
        console.error(`[crm-alerts:${endpoint}]`, error)
      } finally {
        if (!cancelado) setLoading(false)
      }
    }

    cargar()
    const id = setInterval(cargar, REFRESH_MS)
    return () => {
      cancelado = true // evita setState sobre un componente ya desmontado
      clearInterval(id)
    }
    // Se compara el permiso como texto: un arreglo literal es un objeto nuevo
    // en cada render y re-dispararia el efecto sin parar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, Array.isArray(permiso) ? permiso.join("|") : permiso, empresaId, userId])

  return { alerts, count, loading, hasPermission }
}
