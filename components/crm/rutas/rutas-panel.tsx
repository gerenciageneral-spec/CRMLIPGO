"use client"

// Planificador de rutas de visita.
//
// Arma la ruta con las visitas agendadas, los clientes en mora y los
// prospectos con seguimiento pendiente; los ordena con un algoritmo
// determinista y los pinta en el mapa.

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import {
  Loader2, Route, MapPin, Clock, TrendingDown, Calendar, Wallet, UserPlus,
  AlertTriangle, RefreshCw,
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { getCitas } from "@/lib/crm-agenda-actions"
import { getCuentasPorCobrar } from "@/lib/crm-cartera-actions"
import { getProximosContactos } from "@/lib/crm-prospectos-actions"
import { getClientesCrm } from "@/lib/crm-catalogos-actions"
import { getParamNumber } from "@/lib/crm-parametros-actions"
import { PARAM } from "@/lib/crm-parametros"
import {
  optimizarRuta, encuadrar, formatearDuracion, type Parada, type RutaCalculada,
} from "@/lib/crm-rutas"
import { hoyISO, sumarDias, formatearISO, diasEntre } from "@/lib/crm-fechas"
import { money } from "@/lib/crm-cotizaciones"
import { KpiCard } from "@/components/crm/ui/kpi-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { DatePickerField } from "@/components/ui/date-picker-field"
import { toast } from "@/hooks/use-toast"

// El mapa NO puede renderizarse en servidor: Leaflet toca window al importarse.
const MapaRuta = dynamic(() => import("./mapa-ruta"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-xl bg-muted">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ),
})

export function RutasPanel() {
  const { selectedEmpresaId } = useAuth()
  const empresaId = selectedEmpresaId ?? 1

  const [fecha, setFecha] = useState(hoyISO())
  const [incluirCobros, setIncluirCobros] = useState(true)
  const [incluirProspectos, setIncluirProspectos] = useState(true)
  const [candidatas, setCandidatas] = useState<Parada[]>([])
  const [maxParadas, setMaxParadas] = useState(12)
  const [velocidad, setVelocidad] = useState(35)
  const [cargando, setCargando] = useState(true)
  const [sinUbicacion, setSinUbicacion] = useState(0)

  const cargar = useCallback(async () => {
    setCargando(true)

    const [citasRes, carteraRes, prospectosRes, clientesRes, max, vel] = await Promise.all([
      getCitas(empresaId, { desde: fecha, hasta: fecha, estado: "pendiente" }),
      getCuentasPorCobrar(empresaId, { soloVencidas: true }),
      getProximosContactos(empresaId, 3),
      getClientesCrm(empresaId),
      getParamNumber(PARAM.RUTA_MAX_PARADAS, empresaId),
      getParamNumber(PARAM.RUTA_VELOCIDAD_KMH, empresaId),
    ])

    setMaxParadas(max)
    setVelocidad(vel)

    // Coordenadas del cliente, para las paradas que no traen las suyas.
    const ubicacionCliente = new Map(
      (clientesRes.data ?? [])
        .filter((c) => c.latitud != null && c.longitud != null)
        .map((c) => [c.id, { lat: c.latitud!, lon: c.longitud!, nombre: c.nombre }]),
    )

    const paradas: Parada[] = []
    let sinCoordenadas = 0

    // 1. Visitas ya agendadas para ese día.
    for (const c of citasRes.data ?? []) {
      const coords =
        c.latitud != null && c.longitud != null
          ? { lat: c.latitud, lon: c.longitud }
          : c.cliente_id
            ? ubicacionCliente.get(c.cliente_id)
            : null

      if (!coords) {
        sinCoordenadas++
        continue
      }

      paradas.push({
        id: `cita-${c.id}`,
        nombre: c.prospecto_nombre ?? c.cliente_nombre ?? c.titulo,
        latitud: coords.lat,
        longitud: (coords as any).lon,
        motivo: c.titulo,
        tipo: c.prospecto_id ? "prospecto" : "cliente",
        // Lo agendado manda: alguien ya se comprometió a esa visita.
        prioridad: 4,
      })
    }

    // 2. Clientes en mora, si se pidió.
    if (incluirCobros) {
      const porCliente = new Map<number, { saldo: number; dias: number }>()
      for (const cta of carteraRes.data ?? []) {
        const g = porCliente.get(cta.cliente_id) ?? { saldo: 0, dias: 0 }
        g.saldo += Number(cta.saldo) || 0
        g.dias = Math.max(g.dias, diasEntre(cta.fecha_vencimiento, hoyISO()))
        porCliente.set(cta.cliente_id, g)
      }

      for (const [clienteId, datos] of porCliente) {
        if (paradas.some((p) => p.id === `cliente-${clienteId}`)) continue

        const u = ubicacionCliente.get(clienteId)
        if (!u) {
          sinCoordenadas++
          continue
        }

        paradas.push({
          id: `cobro-${clienteId}`,
          nombre: u.nombre,
          latitud: u.lat,
          longitud: u.lon,
          motivo: `Cobrar ${money(datos.saldo)} · ${datos.dias} días vencidos`,
          tipo: "cobro",
          // Cuanto más vieja la mora, más prioridad. Se topa en 5 para que no
          // domine por completo sobre lo agendado.
          prioridad: Math.min(5, 2 + Math.floor(datos.dias / 30)),
        })
      }
    }

    // 3. Prospectos con seguimiento próximo.
    if (incluirProspectos) {
      for (const p of prospectosRes.data ?? []) {
        if (p.latitud == null || p.longitud == null) {
          sinCoordenadas++
          continue
        }

        paradas.push({
          id: `prospecto-${p.id}`,
          nombre: p.razon_social,
          latitud: p.latitud,
          longitud: p.longitud,
          motivo: p.proxima_accion ?? "Seguimiento",
          tipo: "prospecto",
          prioridad: 3,
        })
      }
    }

    setCandidatas(paradas)
    setSinUbicacion(sinCoordenadas)
    setCargando(false)
  }, [empresaId, fecha, incluirCobros, incluirProspectos])

  useEffect(() => {
    cargar()
  }, [cargar])

  // La ruta se recalcula en memoria al cambiar cualquier opción: el cálculo
  // es de milisegundos y no vale la pena ir al servidor por él.
  const ruta: RutaCalculada = useMemo(
    () => optimizarRuta(candidatas.slice(0, maxParadas), undefined, velocidad),
    [candidatas, maxParadas, velocidad],
  )

  const vista = useMemo(() => encuadrar(ruta.paradas), [ruta.paradas])

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rutas óptimas</h1>
          <p className="text-sm text-muted-foreground">
            Ordena las visitas del día para acortar el recorrido
          </p>
        </div>

        <Button variant="ghost" size="sm" onClick={cargar} disabled={cargando}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${cargando ? "animate-spin" : ""}`} />
          Recalcular
        </Button>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Día</Label>
            <DatePickerField value={fecha} onChange={setFecha} />
          </div>

          <div className="flex items-center gap-2">
            <Switch id="cobros" checked={incluirCobros} onCheckedChange={setIncluirCobros} />
            <Label htmlFor="cobros" className="text-sm">Incluir cobros vencidos</Label>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="prosp" checked={incluirProspectos} onCheckedChange={setIncluirProspectos} />
            <Label htmlFor="prosp" className="text-sm">Incluir prospectos</Label>
          </div>

          <p className="ml-auto text-xs text-muted-foreground">
            Máximo {maxParadas} paradas · {velocidad} km/h
            <span className="block">Se configura en Parametrización</span>
          </p>
        </CardContent>
      </Card>

      {sinUbicacion > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--chart-3)]/40 bg-[var(--chart-3)]/5 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--chart-3)]" />
          <p className="text-xs">
            {sinUbicacion} destino(s) quedaron fuera por no tener ubicación GPS.
            Se captura al registrar el prospecto o desde la ficha del cliente.
          </p>
        </div>
      )}

      {cargando ? (
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : ruta.paradas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Route className="h-8 w-8 text-muted-foreground/40" />
            <p className="font-medium">Nada que visitar el {formatearISO(fecha)}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              No hay visitas agendadas ni clientes con ubicación para ese día.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <KpiCard icon={MapPin} label="Paradas" value={ruta.paradas.length} accent="primary" />
            <KpiCard icon={Route} label="Distancia" value={ruta.distanciaKm} unit="km" decimals={1} accent="info" />
            <KpiCard icon={Clock} label="Tiempo estimado" value={formatearDuracion(ruta.tiempoEstimadoMin)} accent="neutral" />
            <KpiCard
              icon={TrendingDown}
              label="Ahorro del orden"
              value={ruta.mejora}
              unit="%"
              decimals={1}
              accent="success"
              trendHint="Frente al orden original"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardContent className="p-2">
                <div className="h-[460px]">
                  <MapaRuta paradas={ruta.paradas} centro={vista.centro} zoom={vista.zoom} />
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Orden de visita</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[420px] space-y-2 overflow-y-auto">
                {ruta.paradas.map((p, i) => {
                  const siguiente = ruta.paradas[i + 1]
                  return (
                    <div key={p.id}>
                      <div className="flex items-start gap-2.5">
                        <span
                          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                          style={{
                            backgroundColor:
                              p.tipo === "cobro" ? "#ef4444"
                                : p.tipo === "prospecto" ? "#818cf8"
                                  : "#0ea5e9",
                          }}
                        >
                          {i + 1}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{p.nombre}</p>
                          {p.motivo && (
                            <p className="truncate text-xs text-muted-foreground">{p.motivo}</p>
                          )}
                        </div>

                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {p.tipo === "cobro" ? (
                            <Wallet className="mr-0.5 h-2.5 w-2.5" />
                          ) : p.tipo === "prospecto" ? (
                            <UserPlus className="mr-0.5 h-2.5 w-2.5" />
                          ) : (
                            <Calendar className="mr-0.5 h-2.5 w-2.5" />
                          )}
                          {p.tipo}
                        </Badge>
                      </div>

                      {siguiente && <Separator className="my-2" />}
                    </div>
                  )
                })}

                {candidatas.length > maxParadas && (
                  <p className="pt-2 text-xs text-muted-foreground">
                    Quedaron {candidatas.length - maxParadas} destino(s) fuera por el
                    tope de {maxParadas} paradas por día.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

export default RutasPanel
