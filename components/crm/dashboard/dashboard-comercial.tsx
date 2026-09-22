"use client"

// Tablero comercial.
//
// Auto-refresco cada 60 s con `cargando` y `refrescando` separados: al
// refrescar se conserva lo que ya está en pantalla, así no parpadea cada
// minuto. Es el detalle que hace usable un tablero que se deja abierto.

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Loader2, TrendingUp, Target, FileText, Wallet, AlertTriangle, CalendarClock,
  Stamp, UserX, RefreshCw, ArrowRight, LayoutDashboard } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { getDashboardComercial, type DashboardComercial } from "@/lib/crm-dashboard-actions"
import { money } from "@/lib/crm-cotizaciones"
import { GraficaArea } from "@/components/crm/ui/graficas"
import { KpiCard } from "@/components/crm/ui/kpi-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { toast } from "@/hooks/use-toast"

const REFRESCO_MS = 60_000

interface Props {
  onNavigate?: (modulo: string) => void
}

export function DashboardComercialPanel({ onNavigate }: Props) {
  const { selectedEmpresaId } = useAuth()
  const empresaId = selectedEmpresaId ?? 1

  const [datos, setDatos] = useState<DashboardComercial | null>(null)
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const montado = useRef(true)

  const cargar = useCallback(
    async (silencioso: boolean) => {
      if (silencioso) setRefrescando(true)

      const res = await getDashboardComercial(empresaId)
      if (!montado.current) return

      if (res.success && res.data) {
        setDatos(res.data)
      } else if (!silencioso) {
        toast({ title: "No se pudo cargar", description: res.error, variant: "destructive" })
      }

      setCargando(false)
      setRefrescando(false)
    },
    [empresaId],
  )

  useEffect(() => {
    montado.current = true
    cargar(false)

    const id = setInterval(() => cargar(true), REFRESCO_MS)
    return () => {
      montado.current = false
      clearInterval(id)
    }
  }, [cargar])

  if (cargando) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!datos) return null

  const { ventas, embudo, cotizaciones, cartera, agenda, pendientes, topVendedores, ventasPorDia } = datos

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-[var(--chart-1)]/10 p-2 text-[var(--chart-1)]">
            <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Dashboard comercial</h1>
            <p className="text-sm text-muted-foreground">Mes en curso</p>
          </div>
        </div>

        <Button variant="ghost" size="sm" onClick={() => cargar(true)} disabled={refrescando}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refrescando ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </header>

      {/* Lo que requiere acción hoy, arriba del todo. Un tablero que empieza
          por las cifras del mes obliga a buscar lo urgente. */}
      {(pendientes.pedidosSinAutorizar > 0 || agenda.atrasadas > 0 || cotizaciones.porVencer > 0) && (
        <div className="flex flex-wrap gap-2">
          {pendientes.pedidosSinAutorizar > 0 && (
            <Accion
              icono={Stamp}
              texto={`${pendientes.pedidosSinAutorizar} pedido(s) esperando autorización`}
              onClick={() => onNavigate?.("Autorizar Pedidos")}
            />
          )}
          {agenda.atrasadas > 0 && (
            <Accion
              icono={CalendarClock}
              texto={`${agenda.atrasadas} visita(s) atrasada(s)`}
              tono="destructive"
              onClick={() => onNavigate?.("Mi Agenda")}
            />
          )}
          {cotizaciones.porVencer > 0 && (
            <Accion
              icono={FileText}
              texto={`${cotizaciones.porVencer} cotización(es) por vencer`}
              onClick={() => onNavigate?.("Cotizaciones")}
            />
          )}
          {pendientes.prospectosSinGestion > 0 && (
            <Accion
              icono={UserX}
              texto={`${pendientes.prospectosSinGestion} prospecto(s) sin gestión`}
              onClick={() => onNavigate?.("Embudo de Ventas")}
            />
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={TrendingUp}
          label="Ventas del mes"
          value={money(ventas.mes)}
          accent="primary"
          trend={ventas.variacion}
          trendHint="vs. mes anterior"
        />
        <KpiCard
          icon={Target}
          label="Pronóstico del embudo"
          value={money(embudo.valorPonderado)}
          accent="info"
          trendHint={`${embudo.prospectos} prospectos activos`}
        />
        <KpiCard
          icon={FileText}
          label="Tasa de cierre"
          value={cotizaciones.tasaConversion}
          unit="%"
          decimals={1}
          accent={cotizaciones.tasaConversion >= 40 ? "success" : "warning"}
          trendHint="Cotizaciones ganadas"
        />
        <KpiCard
          icon={Wallet}
          label="Cartera vencida"
          value={money(cartera.vencida)}
          accent={cartera.vencida > 0 ? "danger" : "success"}
          trendHint={`${cartera.porcentajeVencido}% del total`}
          invertTrend
          onClick={() => onNavigate?.("Antigüedad de Cartera")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ventas del mes</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficaArea
              datos={ventasPorDia}
              x="fecha"
              y="valor"
              etiqueta="Ventas"
              alto={224}
              moneda
              formatoX={(f: string) => f.slice(8)}
            />

            <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>{ventas.pedidos} pedidos</span>
              <span>Ticket promedio: {money(ventas.ticketPromedio)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              Embudo
              <Button
                variant="ghost" size="sm" className="h-6 px-1.5 text-xs"
                onClick={() => onNavigate?.("Embudo de Ventas")}
              >
                Ver <ArrowRight className="ml-0.5 h-3 w-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {embudo.porEtapa.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sin prospectos en el embudo.
              </p>
            ) : (
              embudo.porEtapa.map((e) => {
                const pct = embudo.valorTotal > 0 ? (e.valor / embudo.valorTotal) * 100 : 0
                return (
                  <div key={e.nombre} className="space-y-1">
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: e.color ?? "var(--chart-1)" }}
                        />
                        {e.nombre}
                        <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                          {e.cantidad}
                        </Badge>
                      </span>
                      <span className="tabular-nums text-muted-foreground">{money(e.valor)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: e.color ?? "var(--chart-1)" }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Equipo comercial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topVendedores.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sin ventas registradas este mes.
              </p>
            ) : (
              topVendedores.map((v) => (
                <div key={v.nombre} className="space-y-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="truncate font-medium">{v.nombre}</span>
                    <span className="tabular-nums">{money(v.ventas)}</span>
                  </div>
                  {v.meta > 0 && (
                    <div className="flex items-center gap-2">
                      <Progress value={Math.min(v.cumplimiento, 100)} className="h-1.5 flex-1" />
                      <span
                        className={`w-12 text-right text-xs tabular-nums ${
                          v.cumplimiento >= 100 ? "text-[var(--chart-2)]" : "text-muted-foreground"
                        }`}
                      >
                        {v.cumplimiento}%
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Resumen</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Dato
              etiqueta="Cotizaciones abiertas"
              valor={String(cotizaciones.abiertas)}
              sub={money(cotizaciones.valorAbierto)}
              onClick={() => onNavigate?.("Cotizaciones")}
            />
            <Dato
              etiqueta="Por cobrar"
              valor={money(cartera.pendiente)}
              sub={`${cartera.clientesEnMora} cliente(s) en mora`}
              onClick={() => onNavigate?.("Cuentas por Cobrar")}
            />
            <Dato
              etiqueta="Visitas hoy"
              valor={String(agenda.hoy)}
              sub={`${agenda.semana} esta semana`}
              onClick={() => onNavigate?.("Mi Agenda")}
            />
            <Dato
              etiqueta="Valor del embudo"
              valor={money(embudo.valorTotal)}
              sub={`Ponderado: ${money(embudo.valorPonderado)}`}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Accion({
  icono: Icono, texto, tono = "primary", onClick,
}: {
  icono: typeof Stamp
  texto: string
  tono?: "primary" | "destructive"
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent ${
        tono === "destructive"
          ? "border-destructive/40 text-destructive"
          : "border-[var(--chart-1)]/40 text-[var(--chart-1)]"
      }`}
    >
      <Icono className="h-4 w-4" aria-hidden="true" />
      {texto}
      <ArrowRight className="h-3.5 w-3.5 opacity-60" />
    </button>
  )
}

function Dato({
  etiqueta, valor, sub, onClick,
}: {
  etiqueta: string
  valor: string
  sub?: string
  onClick?: () => void
}) {
  const Wrapper = onClick ? "button" : "div"
  return (
    <Wrapper
      onClick={onClick}
      className={`rounded-lg border p-3 text-left ${onClick ? "transition-colors hover:bg-accent" : ""}`}
    >
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className="mt-0.5 font-semibold tabular-nums">{valor}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </Wrapper>
  )
}

export default DashboardComercialPanel
