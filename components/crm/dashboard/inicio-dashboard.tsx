"use client"

// Pantalla de Inicio: un tablero, no un menú.
//
// Antes era solo la rejilla de áreas, que obliga a entrar a un módulo para
// saber si algo va mal. Ahora lo primero que se ve es el estado del negocio y
// lo que requiere acción hoy; las áreas quedan debajo, para navegar.
//
// Sigue el patrón del Dashboard Gerencia de LIPgo: encabezado ejecutivo con
// reloj en vivo, fila de KPIs con glow de color, y paneles con cabecera de
// icono. Auto-refresco cada 60 s conservando lo que ya está en pantalla.

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Loader2, TrendingUp, Target, FileText, Wallet, CalendarClock, Stamp,
  UserX, ArrowRight, Users, ShoppingCart, AlertTriangle, Activity,
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { getDashboardComercial, type DashboardComercial } from "@/lib/crm-dashboard-actions"
import { money } from "@/lib/crm-cotizaciones"
import { KpiCard } from "@/components/crm/ui/kpi-card"
import { PanelCard } from "@/components/crm/ui/panel-card"
import { GraficaArea } from "@/components/crm/ui/graficas"
import { Aparece, ListaEscalonada, ElementoLista } from "@/components/crm/ui/movimiento"
import { EncabezadoEjecutivo } from "@/components/crm/ui/encabezado-ejecutivo"
import { ModuleCards } from "@/components/module-cards"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { toast } from "@/hooks/use-toast"
import type { GroupKey } from "@/lib/dashboard-data"
import type { LucideIcon } from "lucide-react"

const REFRESCO_MS = 60_000

interface Props {
  onSelectGroup: (group: GroupKey) => void
  onSelectModule?: (modulo: string) => void
}

export function InicioDashboard({ onSelectGroup, onSelectModule }: Props) {
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

      if (res.success && res.data) setDatos(res.data)
      else if (!silencioso) {
        toast({ title: "No se pudo cargar el tablero", description: res.error, variant: "destructive" })
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
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Cargando el tablero…</p>
      </div>
    )
  }

  const d = datos
  const hayPendientes =
    (d?.pendientes.pedidosSinAutorizar ?? 0) > 0 ||
    (d?.agenda.atrasadas ?? 0) > 0 ||
    (d?.cotizaciones.porVencer ?? 0) > 0 ||
    (d?.pendientes.prospectosSinGestion ?? 0) > 0

  return (
    <div className="space-y-5">
      <EncabezadoEjecutivo
        titulo="Centro de Gestión Comercial"
        refrescando={refrescando}
        onRefrescar={() => cargar(true)}
      />

      {/* Lo que pide acción HOY, antes que las cifras del mes. Un tablero que
          empieza por los totales obliga a buscar lo urgente. */}
      {hayPendientes && (
        <div className="flex flex-wrap gap-2">
          {(d?.pendientes.pedidosSinAutorizar ?? 0) > 0 && (
            <Pendiente
              icono={Stamp}
              texto={`${d!.pendientes.pedidosSinAutorizar} pedido(s) esperando autorización`}
              tono="primary"
              onClick={() => onSelectModule?.("Autorizar Pedidos")}
            />
          )}
          {(d?.agenda.atrasadas ?? 0) > 0 && (
            <Pendiente
              icono={CalendarClock}
              texto={`${d!.agenda.atrasadas} visita(s) atrasada(s)`}
              tono="danger"
              onClick={() => onSelectModule?.("Mi Agenda")}
            />
          )}
          {(d?.cotizaciones.porVencer ?? 0) > 0 && (
            <Pendiente
              icono={FileText}
              texto={`${d!.cotizaciones.porVencer} cotización(es) por vencer`}
              tono="warning"
              onClick={() => onSelectModule?.("Cotizaciones")}
            />
          )}
          {(d?.pendientes.prospectosSinGestion ?? 0) > 0 && (
            <Pendiente
              icono={UserX}
              texto={`${d!.pendientes.prospectosSinGestion} prospecto(s) sin gestión`}
              tono="warning"
              onClick={() => onSelectModule?.("Embudo de Ventas")}
            />
          )}
        </div>
      )}

      {/* Escalonado: las cuatro tarjetas entran una tras otra, lo que guia la
          mirada de izquierda a derecha en vez de soltarlas de golpe. */}
      <ListaEscalonada className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ElementoLista>
        <KpiCard
          icon={TrendingUp}
          label="Ventas del mes"
          value={money(d?.ventas.mes ?? 0)}
          accent="primary"
          trend={d?.ventas.variacion}
          trendHint="vs. mes anterior"
        />
        </ElementoLista>
        <ElementoLista>
        <KpiCard
          icon={Target}
          label="Pronóstico del embudo"
          value={money(d?.embudo.valorPonderado ?? 0)}
          accent="info"
          trendHint={`${d?.embudo.prospectos ?? 0} prospectos activos`}
        />
        </ElementoLista>
        <ElementoLista>
        <KpiCard
          icon={FileText}
          label="Tasa de cierre"
          value={d?.cotizaciones.tasaConversion ?? 0}
          unit="%"
          decimals={1}
          accent={(d?.cotizaciones.tasaConversion ?? 0) >= 40 ? "success" : "warning"}
          trendHint="Cotizaciones ganadas"
          onClick={() => onSelectModule?.("Cotizaciones")}
        />
        </ElementoLista>
        <ElementoLista>
        <KpiCard
          icon={Wallet}
          label="Cartera vencida"
          value={money(d?.cartera.vencida ?? 0)}
          accent={(d?.cartera.vencida ?? 0) > 0 ? "danger" : "success"}
          trendHint={`${d?.cartera.porcentajeVencido ?? 0}% del total`}
          // Subir cartera vencida es mala noticia: sin esto se pinta en verde.
          invertTrend
          onClick={() => onSelectModule?.("Antigüedad de Cartera")}
        />
        </ElementoLista>
      </ListaEscalonada>

      <div className="grid gap-4 lg:grid-cols-3">
        <PanelCard
          title="Ventas del mes"
          subtitle={`${d?.ventas.pedidos ?? 0} pedidos · ticket promedio ${money(d?.ventas.ticketPromedio ?? 0)}`}
          icon={<Activity className="h-5 w-5" />}
          accent="primary"
          className="lg:col-span-2"
        >
          <GraficaArea
            datos={d?.ventasPorDia ?? []}
            x="fecha"
            y="valor"
            etiqueta="Ventas"
            alto={224}
            moneda
            formatoX={(f: string) => f.slice(8)}
          />
        </PanelCard>

        <PanelCard
          title="Embudo comercial"
          subtitle={`${money(d?.embudo.valorTotal ?? 0)} en juego`}
          icon={<Target className="h-5 w-5" />}
          accent="info"
          headerRight={
            <button
              onClick={() => onSelectModule?.("Embudo de Ventas")}
              className="flex items-center gap-0.5 text-xs font-medium text-[#0aa1c4] hover:underline"
            >
              Ver <ArrowRight className="h-3 w-3" />
            </button>
          }
        >
          {!d?.embudo.porEtapa.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Sin prospectos en el embudo.
            </p>
          ) : (
            <div className="space-y-2.5">
              {d.embudo.porEtapa.map((e) => {
                const pct = d.embudo.valorTotal > 0 ? (e.valor / d.embudo.valorTotal) * 100 : 0
                return (
                  <div key={e.nombre} className="space-y-1">
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: e.color ?? "#5bc0de" }}
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
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: e.color ?? "#5bc0de" }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </PanelCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelCard
          title="Equipo comercial"
          subtitle="Ventas del mes contra su meta"
          icon={<Users className="h-5 w-5" />}
          accent="success"
          headerRight={
            <button
              onClick={() => onSelectModule?.("Vendedores")}
              className="flex items-center gap-0.5 text-xs font-medium text-[#0aa1c4] hover:underline"
            >
              Ver <ArrowRight className="h-3 w-3" />
            </button>
          }
        >
          {!d?.topVendedores.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin ventas registradas este mes.
            </p>
          ) : (
            <div className="space-y-3">
              {d.topVendedores.map((v) => (
                <div key={v.nombre} className="space-y-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="truncate font-medium">{v.nombre}</span>
                    <span className="tabular-nums">{money(v.ventas)}</span>
                  </div>
                  {v.meta > 0 && (
                    <div className="flex items-center gap-2">
                      <Progress value={Math.min(v.cumplimiento, 100)} className="h-1.5 flex-1" />
                      <span
                        className={`w-12 text-right text-xs font-semibold tabular-nums ${
                          v.cumplimiento >= 100 ? "text-emerald-600"
                            : v.cumplimiento >= 70 ? "text-amber-600"
                              : "text-rose-600"
                        }`}
                      >
                        {v.cumplimiento}%
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </PanelCard>

        <PanelCard
          title="Estado del negocio"
          subtitle="Resumen del día"
          icon={<ShoppingCart className="h-5 w-5" />}
          accent="warning"
        >
          <div className="grid grid-cols-2 gap-3">
            <Dato
              etiqueta="Cotizaciones abiertas"
              valor={String(d?.cotizaciones.abiertas ?? 0)}
              sub={money(d?.cotizaciones.valorAbierto ?? 0)}
              onClick={() => onSelectModule?.("Cotizaciones")}
            />
            <Dato
              etiqueta="Por cobrar"
              valor={money(d?.cartera.pendiente ?? 0)}
              sub={`${d?.cartera.clientesEnMora ?? 0} cliente(s) en mora`}
              onClick={() => onSelectModule?.("Cuentas por Cobrar")}
            />
            <Dato
              etiqueta="Visitas hoy"
              valor={String(d?.agenda.hoy ?? 0)}
              sub={`${d?.agenda.semana ?? 0} esta semana`}
              onClick={() => onSelectModule?.("Mi Agenda")}
            />
            <Dato
              etiqueta="Pedidos del mes"
              valor={String(d?.ventas.pedidos ?? 0)}
              sub={`Ticket ${money(d?.ventas.ticketPromedio ?? 0)}`}
              onClick={() => onSelectModule?.("Pedidos CRM")}
            />
          </div>
        </PanelCard>
      </div>

      {/* Las áreas, debajo del tablero: primero se ve cómo va el negocio y
          luego se navega. */}
      <div className="pt-1">
        <ModuleCards onSelectGroup={onSelectGroup} onSelectModule={onSelectModule} />
      </div>
    </div>
  )
}

function Pendiente({
  icono: Icono, texto, tono, onClick,
}: {
  icono: LucideIcon
  texto: string
  tono: "primary" | "warning" | "danger"
  onClick?: () => void
}) {
  const estilo =
    tono === "danger" ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
      : tono === "warning" ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
        : "border-[#5bc0de]/40 bg-[#5bc0de]/10 text-[#0aa1c4] hover:bg-[#5bc0de]/20"

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${estilo}`}
    >
      <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
      {texto}
      <ArrowRight className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
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
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted/50"
    >
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className="mt-0.5 font-bold tabular-nums text-foreground">{valor}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </button>
  )
}

export default InicioDashboard
