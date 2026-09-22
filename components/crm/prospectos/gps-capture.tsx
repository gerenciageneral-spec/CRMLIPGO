"use client"

// Captura de la ubicacion GPS donde se registra el prospecto.
//
// DOS DECISIONES QUE IMPORTAN:
//
// 1. Se pide la ubicacion AL ABRIR el formulario, no al guardar. El navegador
//    muestra el permiso una sola vez y el GPS tarda en fijar: pedirlo al final
//    significa que el vendedor espera con el formulario lleno, o que guarda sin
//    ubicacion porque no quiso esperar.
//
// 2. Se muestra la PRECISION en metros y se advierte cuando es mala. El
//    navegador devuelve una coordenada tanto si viene del GPS (5-30 m) como si
//    la dedujo de la IP o del wifi (cientos o miles de metros). Las dos llegan
//    con la misma forma y sin mirar `accuracy` son indistinguibles. Una
//    ubicacion por IP en un CRM de visitas es un dato falso con apariencia de
//    dato bueno: sirve para "demostrar" una visita que no ocurrio.

import { useEffect, useState, useCallback } from "react"
import { MapPin, Loader2, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { GPS_PRECISION_SOSPECHOSA_M, esGpsConfiable } from "@/lib/crm-prospectos"

export interface Ubicacion {
  latitud: number
  longitud: number
  precision_m: number
}

interface GpsCaptureProps {
  value: Ubicacion | null
  onChange: (u: Ubicacion | null) => void
  /** Pide la ubicacion al montar. Por defecto si. */
  auto?: boolean
}

type Estado = "inicial" | "capturando" | "listo" | "error"

export function GpsCapture({ value, onChange, auto = true }: GpsCaptureProps) {
  const [estado, setEstado] = useState<Estado>(value ? "listo" : "inicial")
  const [mensajeError, setMensajeError] = useState<string | null>(null)

  const capturar = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setEstado("error")
      setMensajeError("Este dispositivo no permite obtener la ubicación.")
      return
    }

    setEstado("capturando")
    setMensajeError(null)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          latitud: Number(pos.coords.latitude.toFixed(7)),
          longitud: Number(pos.coords.longitude.toFixed(7)),
          precision_m: Math.round(pos.coords.accuracy),
        })
        setEstado("listo")
      },
      (err) => {
        setEstado("error")
        // Mensajes en terminos de lo que el vendedor puede hacer, no del
        // codigo de error del navegador.
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setMensajeError("Diste permiso denegado. Actívalo en el candado de la barra de direcciones y vuelve a intentar.")
            break
          case err.POSITION_UNAVAILABLE:
            setMensajeError("No se pudo determinar la ubicación. Revisa que el GPS esté encendido.")
            break
          case err.TIMEOUT:
            setMensajeError("La ubicación tardó demasiado. Intenta de nuevo, preferiblemente al aire libre.")
            break
          default:
            setMensajeError("No se pudo obtener la ubicación.")
        }
      },
      {
        enableHighAccuracy: true, // exige GPS real, no la aproximacion rapida
        timeout: 15_000,
        maximumAge: 0,            // sin cache: la visita es aqui y ahora
      },
    )
  }, [onChange])

  useEffect(() => {
    if (auto && estado === "inicial" && !value) capturar()
    // Solo al montar: si se reintentara en cada cambio, un error dejaria el
    // componente pidiendo ubicacion en bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const confiable = value ? esGpsConfiable(value.precision_m) : false

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Ubicación del registro
        </span>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={capturar}
          disabled={estado === "capturando"}
        >
          {estado === "capturando" ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Ubicando…
            </>
          ) : (
            <>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {value ? "Actualizar" : "Capturar"}
            </>
          )}
        </Button>
      </div>

      {estado === "capturando" && (
        <p className="text-xs text-muted-foreground">
          Buscando señal. Al aire libre es más rápido y preciso.
        </p>
      )}

      {value && (
        <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3">
          <div className="flex items-center gap-1.5 text-sm">
            {confiable ? (
              <CheckCircle2 className="h-4 w-4 text-[var(--chart-2)]" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-[var(--chart-3)]" aria-hidden="true" />
            )}
            <span className="font-mono text-xs">
              {value.latitud.toFixed(5)}, {value.longitud.toFixed(5)}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              ±{value.precision_m} m
            </span>
          </div>

          {!confiable && (
            <p className="text-xs text-[var(--chart-3)]">
              Precisión baja (más de {GPS_PRECISION_SOSPECHOSA_M} m). Probablemente
              venga de la red y no del GPS, así que no sirve como evidencia de
              que estuviste en el sitio. Si estás frente al cliente, intenta
              actualizar.
            </p>
          )}
        </div>
      )}

      {estado === "error" && mensajeError && (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            {mensajeError}
            {/* El prospecto se puede guardar sin ubicacion: negarse a
                registrarlo por no tener GPS seria peor que no tener el dato. */}
            <span className="mt-1 block text-muted-foreground">
              Puedes guardar el prospecto igualmente, pero quedará sin ubicación.
            </span>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

export default GpsCapture
