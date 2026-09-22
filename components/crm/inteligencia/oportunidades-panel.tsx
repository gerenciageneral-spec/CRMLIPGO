"use client"

// Oportunidades de negocio detectadas en los datos.
//
// Cada tarjeta trae la cifra que la sustenta. Una "oportunidad" sin número
// verificable es una corazonada con aspecto de análisis, y eso hace que el
// equipo deje de creerle a la pantalla.

import { useEffect, useMemo, useState } from "react"
import {
  Loader2, TrendingUp, UserX, TrendingDown, ShoppingBasket, Clock,
  FileQuestion, Wallet, RefreshCw, ArrowRight, Sparkles,
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import {
  getOportunidades, type Oportunidad, type TipoOportunidad,
} from "@/lib/crm-oportunidades-actions"
import { TIPO_OPORTUNIDAD_LABEL } from "@/lib/crm-oportunidades"
import { money } from "@/lib/crm-cotizaciones"
import { KpiCard } from "@/components/crm/ui/kpi-card"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import type { LucideIcon } from "lucide-react"

const ICONO: Record<TipoOportunidad, LucideIcon> = {
  cliente_dormido: UserX,
  bajo_volumen: TrendingDown,
  venta_cruzada: ShoppingBasket,
  prospecto_estancado: Clock,
  cotizacion_sin_respuesta: FileQuestion,
  cupo_sin_usar: Wallet,
}

const COLOR: Record<TipoOportunidad, string> = {
  cliente_dormido: "var(--destructive)",
  bajo_volumen: "var(--chart-3)",
  venta_cruzada: "var(--chart-2)",
  prospecto_estancado: "var(--chart-4)",
  cotizacion_sin_respuesta: "var(--chart-1)",
  cupo_sin_usar: "var(--chart-2)",
}

interface Props {
  onNavigate?: (modulo: string) => void
}

export function OportunidadesPanel({ onNavigate }: Props) {
  const { selectedEmpresaId } = useAuth()
  const empresaId = selectedEmpresaId ?? 1

  const [oportunidades, setOportunidades] = useState<Oportunidad[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState<string>("todas")

  const cargar = async () => {
    setCargando(true)
    const res = await getOportunidades(empresaId)
    if (res.success) setOportunidades(res.data ?? [])
    else toast({ title: "No se pudo analizar", description: res.error, variant: "destructive" })
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const visibles = useMemo(
    () => (filtro === "todas" ? oportunidades : oportunidades.filter((o) => o.tipo === filtro)),
    [oportunidades, filtro],
  )

  const resumen = useMemo(() => {
    const porTipo = new Map<TipoOportunidad, number>()
    let valorTotal = 0

    for (const o of oportunidades) {
      porTipo.set(o.tipo, (porTipo.get(o.tipo) ?? 0) + 1)
      valorTotal += o.valorPotencial ?? 0
    }

    return {
      porTipo: [...porTipo.entries()].sort((a, b) => b[1] - a[1]),
      valorTotal,
      urgentes: oportunidades.filter((o) => o.relevancia >= 4).length,
    }
  }, [oportunidades])

  if (cargando) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Analizando el histórico…</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Sparkles className="h-5 w-5 text-[var(--chart-1)]" aria-hidden="true" />
            Oportunidades de negocio
          </h1>
          <p className="text-sm text-muted-foreground">
            Señales detectadas en el histórico de ventas, cartera y prospectos
          </p>
        </div>

        <Button variant="ghost" size="sm" onClick={cargar}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Volver a analizar
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard icon={Sparkles} label="Oportunidades" value={oportunidades.length} accent="primary" />
        <KpiCard
          icon={TrendingUp}
          label="Valor potencial"
          value={money(resumen.valorTotal)}
          accent="success"
          trendHint="Suma de lo estimable"
        />
        <KpiCard
          icon={Clock}
          label="Requieren atención pronto"
          value={resumen.urgentes}
          accent={resumen.urgentes > 0 ? "warning" : "neutral"}
        />
      </div>

      {oportunidades.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground/40" />
            <p className="font-medium">Nada que señalar por ahora</p>
            <p className="max-w-md text-sm text-muted-foreground">
              No se detectaron clientes dormidos, caídas de volumen ni
              cotizaciones sin respuesta. Conviene volver a revisar en unos días,
              o cuando haya más histórico de ventas.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas ({oportunidades.length})</SelectItem>
                {resumen.porTipo.map(([tipo, n]) => (
                  <SelectItem key={tipo} value={tipo}>
                    {TIPO_OPORTUNIDAD_LABEL[tipo]} ({n})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {visibles.map((o, i) => {
              const Icono = ICONO[o.tipo]
              const color = COLOR[o.tipo]

              return (
                <Card key={`${o.tipo}-${o.clienteId ?? o.prospectoId ?? i}`}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start gap-3">
                      <span
                        className="mt-0.5 shrink-0 rounded-lg p-2"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
                          color,
                        }}
                      >
                        <Icono className="h-4 w-4" aria-hidden="true" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate font-medium">{o.titulo}</p>
                          {o.relevancia >= 4 && (
                            <Badge variant="destructive" className="shrink-0 text-[10px]">
                              Prioritaria
                            </Badge>
                          )}
                        </div>

                        <Badge
                          variant="outline"
                          className="mt-0.5 text-[10px]"
                          style={{ borderColor: color, color }}
                        >
                          {TIPO_OPORTUNIDAD_LABEL[o.tipo]}
                        </Badge>
                      </div>
                    </div>

                    {/* El detalle con su cifra: es lo que separa esto de una
                        corazonada. */}
                    <p className="text-sm text-muted-foreground">{o.detalle}</p>

                    {o.valorPotencial != null && o.valorPotencial > 0 && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Podría valer </span>
                        <span className="font-semibold tabular-nums">{money(o.valorPotencial)}</span>
                      </p>
                    )}

                    <Separator />

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium">{o.accionSugerida}</p>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() =>
                          onNavigate?.(o.prospectoId ? "Embudo de Ventas" : "Gestión de Clientes")
                        }
                      >
                        Ir
                        <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default OportunidadesPanel
