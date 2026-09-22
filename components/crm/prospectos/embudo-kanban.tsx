"use client"

// Embudo de ventas en tablero kanban.
//
// ARRASTRE CON HTML5 NATIVO, sin libreria de drag & drop. Para siete columnas
// no compensa sumar otra dependencia al arbol: la API nativa cubre el caso y
// funciona en todos los navegadores de escritorio.
//
// EL DETALLE DEL ARRASTRE EN MOVIL: la API HTML5 no responde a tactil. Por eso
// cada tarjeta trae ademas un selector de etapa, que en telefono es el camino
// real y en escritorio queda como alternativa accesible al arrastre (que no se
// puede hacer con teclado).

import { useEffect, useMemo, useState } from "react"
import { Loader2, GripVertical, TrendingUp, Users, Target, Filter } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { getProspectos, getEtapas, moverEtapa, getResumenEmbudo } from "@/lib/crm-prospectos-actions"
import type { Etapa, ProspectoConEtapa, ResumenEmbudo } from "@/lib/crm-prospectos"
import { KpiCard } from "@/components/crm/ui/kpi-card"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"

const money = (n: number) =>
  n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })

export function EmbudoKanban() {
  const { profile, selectedEmpresaId } = useAuth()
  const empresaId = selectedEmpresaId ?? 1

  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [prospectos, setProspectos] = useState<ProspectoConEtapa[]>([])
  const [resumen, setResumen] = useState<ResumenEmbudo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [arrastrando, setArrastrando] = useState<number | null>(null)
  const [sobreEtapa, setSobreEtapa] = useState<number | null>(null)

  const cargar = async () => {
    const [eRes, pRes, rRes] = await Promise.all([
      getEtapas(empresaId),
      getProspectos(empresaId),
      getResumenEmbudo(empresaId),
    ])
    if (eRes.success) setEtapas(eRes.data ?? [])
    if (pRes.success) setProspectos(pRes.data ?? [])
    if (rRes.success) setResumen(rRes.data ?? null)
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const porEtapa = useMemo(() => {
    const mapa = new Map<number, ProspectoConEtapa[]>()
    for (const e of etapas) mapa.set(e.id, [])
    for (const p of prospectos) {
      if (mapa.has(p.etapa_id)) mapa.get(p.etapa_id)!.push(p)
    }
    return mapa
  }, [etapas, prospectos])

  const mover = async (prospectoId: number, etapaDestino: number) => {
    const prospecto = prospectos.find((p) => p.id === prospectoId)
    if (!prospecto || prospecto.etapa_id === etapaDestino) return

    const etapaPrevia = prospecto.etapa_id

    // Optimista: la tarjeta se mueve al instante y se revierte si falla. En un
    // tablero que se arrastra, esperar la respuesta del servidor se siente roto.
    setProspectos((prev) =>
      prev.map((p) => (p.id === prospectoId ? { ...p, etapa_id: etapaDestino } : p)),
    )

    const res = await moverEtapa(prospectoId, etapaDestino, profile?.usuario ?? "desconocido", empresaId)

    if (!res.success) {
      setProspectos((prev) =>
        prev.map((p) => (p.id === prospectoId ? { ...p, etapa_id: etapaPrevia } : p)),
      )
      toast({ title: "No se pudo mover", description: res.error, variant: "destructive" })
      return
    }

    // El resumen se recalcula en el servidor: el ponderado depende de la
    // probabilidad de la etapa nueva.
    getResumenEmbudo(empresaId).then((r) => r.success && setResumen(r.data ?? null))
  }

  if (cargando) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-[var(--chart-1)]/10 p-2 text-[var(--chart-1)]">
            <Filter className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Embudo de ventas</h1>
            <p className="text-sm text-muted-foreground">Arrastra una tarjeta para moverla de etapa, o usa el selector de cada una.</p>
          </div>
        </div>
      </header>

      {resumen && (
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard
            icon={Users}
            label="Prospectos activos"
            value={resumen.totalProspectos}
            accent="info"
          />
          <KpiCard
            icon={TrendingUp}
            label="Valor del embudo"
            value={money(resumen.valorTotal)}
            accent="primary"
            trendHint="Suma de las etapas abiertas"
          />
          <KpiCard
            icon={Target}
            label="Pronóstico ponderado"
            value={money(resumen.valorPonderado)}
            accent="success"
            trendHint="Ajustado por la probabilidad de cada etapa"
          />
        </div>
      )}

      {/* Scroll horizontal: con siete etapas no caben en pantalla y apilarlas
          en vertical perdería la lectura de embudo. */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {etapas.map((etapa) => {
          const items = porEtapa.get(etapa.id) ?? []
          const valor = items.reduce((s, p) => s + Number(p.valor_estimado || 0), 0)
          const esDestino = sobreEtapa === etapa.id

          return (
            <div
              key={etapa.id}
              onDragOver={(e) => {
                e.preventDefault() // sin esto el navegador no permite soltar
                setSobreEtapa(etapa.id)
              }}
              onDragLeave={() => setSobreEtapa((s) => (s === etapa.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault()
                setSobreEtapa(null)
                if (arrastrando != null) mover(arrastrando, etapa.id)
                setArrastrando(null)
              }}
              className={`flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30 transition-colors ${
                esDestino ? "border-[var(--chart-1)] bg-[var(--chart-1)]/5" : ""
              }`}
            >
              <div className="space-y-1 border-b px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: etapa.color ?? "var(--chart-1)" }}
                      aria-hidden="true"
                    />
                    {etapa.nombre}
                  </span>
                  <Badge variant="secondary">{items.length}</Badge>
                </div>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {money(valor)}
                  {!etapa.es_ganada && !etapa.es_perdida && ` · ${etapa.probabilidad}%`}
                </p>
              </div>

              <div className="flex-1 space-y-2 p-2">
                {items.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">Sin prospectos</p>
                ) : (
                  items.map((p) => (
                    <TarjetaKanban
                      key={p.id}
                      prospecto={p}
                      etapas={etapas}
                      arrastrando={arrastrando === p.id}
                      onDragStart={() => setArrastrando(p.id)}
                      onDragEnd={() => setArrastrando(null)}
                      onCambiarEtapa={(destino) => mover(p.id, destino)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TarjetaKanban({
  prospecto: p, etapas, arrastrando, onDragStart, onDragEnd, onCambiarEtapa,
}: {
  prospecto: ProspectoConEtapa
  etapas: Etapa[]
  arrastrando: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onCambiarEtapa: (etapaId: number) => void
}) {
  return (
    <Card
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`cursor-grab active:cursor-grabbing ${arrastrando ? "opacity-40" : ""}`}
    >
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start gap-1.5">
          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{p.razon_social}</p>
            {p.contacto_nombre && (
              <p className="truncate text-xs text-muted-foreground">{p.contacto_nombre}</p>
            )}
          </div>
        </div>

        {p.valor_estimado > 0 && (
          <p className="text-sm font-semibold tabular-nums">{money(p.valor_estimado)}</p>
        )}

        {p.proxima_fecha && (
          <p className="text-xs text-muted-foreground">Próximo: {p.proxima_fecha}</p>
        )}

        {/* Alternativa al arrastre: en móvil es el único camino, y en
            escritorio es lo que hace la acción accesible por teclado. */}
        <Select value={String(p.etapa_id)} onValueChange={(v) => onCambiarEtapa(Number(v))}>
          <SelectTrigger className="h-7 text-xs" aria-label="Cambiar etapa">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {etapas.map((e) => (
              <SelectItem key={e.id} value={String(e.id)} className="text-xs">
                {e.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  )
}

export default EmbudoKanban
