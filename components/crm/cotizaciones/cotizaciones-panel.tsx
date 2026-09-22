"use client"

// Listado de cotizaciones y su ciclo: emitir, enviar, aceptar y convertir.

import { useEffect, useMemo, useState } from "react"
import {
  Loader2, Plus, Search, FileText, Download, CheckCircle2, XCircle,
  ArrowRight, Clock, AlertTriangle,
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import {
  getCotizaciones, cambiarEstadoCotizacion, convertirEnPedido, vencerCotizaciones,
} from "@/lib/crm-cotizaciones-actions"
import { generarPdfCotizacion } from "@/lib/crm-cotizacion-pdf"
import {
  ESTADO_COTIZACION_LABEL, money,
  type CotizacionConDetalle, type EstadoCotizacion,
} from "@/lib/crm-cotizaciones"
import { hoyISO, diasEntre } from "@/lib/crm-fechas"
import { CotizacionForm } from "./cotizacion-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import { MarcoTabla, FilaCargando, FilaVacia } from "@/components/crm/ui/modulo"

// Color por estado, al estilo de LIPgo: fondo 50, texto 700, borde 200. Se
// lee de un vistazo cual necesita atencion, que es lo que las variantes
// genericas de shadcn no dan (pintan casi todo del mismo gris).
const BADGE: Record<EstadoCotizacion, string> = {
  borrador: "bg-slate-50 text-slate-700 border-slate-200",
  enviada: "bg-blue-50 text-blue-700 border-blue-200",
  aceptada: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rechazada: "bg-red-50 text-red-700 border-red-200",
  vencida: "bg-amber-50 text-amber-700 border-amber-200",
  convertida: "bg-violet-50 text-violet-700 border-violet-200",
}

interface Props {
  onNavigate?: (modulo: string) => void
}

export function CotizacionesPanel({ onNavigate }: Props) {
  const { profile, selectedEmpresaId } = useAuth()
  const empresaId = selectedEmpresaId ?? 1

  const [cotizaciones, setCotizaciones] = useState<CotizacionConDetalle[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState("")
  const [filtroEstado, setFiltroEstado] = useState<string>("todas")
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [dialogAbierto, setDialogAbierto] = useState(false)

  const cargar = async () => {
    // Se vencen antes de listar: así el estado es correcto aunque el cron
    // diario no haya corrido todavía.
    await vencerCotizaciones(empresaId)
    const res = await getCotizaciones(empresaId)
    if (res.success) setCotizaciones(res.data ?? [])
    else toast({ title: "No se pudieron cargar", description: res.error, variant: "destructive" })
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    return cotizaciones.filter((c) => {
      if (filtroEstado !== "todas" && c.estado !== filtroEstado) return false
      if (!t) return true
      return [c.numero, c.cliente_nombre, c.prospecto_nombre].some((x) => x?.toLowerCase().includes(t))
    })
  }, [cotizaciones, busqueda, filtroEstado])

  const descargarPdf = async (c: CotizacionConDetalle) => {
    setOcupado(c.id)
    // Se regenera siempre: si la cotización se editó, el PDF guardado estaría
    // desactualizado y nadie se enteraría hasta que el cliente lo reciba.
    const res = await generarPdfCotizacion(c.id, empresaId)
    setOcupado(null)

    if (!res.success || !res.url) {
      toast({ title: "No se generó el PDF", description: res.error, variant: "destructive" })
      return
    }
    window.open(res.url, "_blank", "noopener,noreferrer")
    setCotizaciones((prev) => prev.map((x) => (x.id === c.id ? { ...x, pdf_url: res.url! } : x)))
  }

  const cambiarEstado = async (c: CotizacionConDetalle, estado: EstadoCotizacion) => {
    setOcupado(c.id)
    const res = await cambiarEstadoCotizacion(c.id, estado, empresaId)
    setOcupado(null)

    if (!res.success) {
      toast({ title: "No se pudo actualizar", description: res.error, variant: "destructive" })
      return
    }
    setCotizaciones((prev) => prev.map((x) => (x.id === c.id ? { ...x, estado } : x)))
    toast({ title: `Cotización ${ESTADO_COTIZACION_LABEL[estado].toLowerCase()}` })
  }

  const convertir = async (c: CotizacionConDetalle) => {
    setOcupado(c.id)
    const res = await convertirEnPedido(c.id, profile?.usuario ?? "desconocido", empresaId)
    setOcupado(null)

    if (!res.success) {
      toast({ title: "No se pudo convertir", description: res.error, variant: "destructive" })
      return
    }

    toast({
      title: "Pedido creado",
      description: `${res.data?.numero} · queda pendiente de autorización de contabilidad y gerencia`,
    })
    cargar()
    onNavigate?.("Pedidos CRM")
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-[var(--chart-1)]/10 p-2 text-[var(--chart-1)]">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Cotizaciones</h1>
            <p className="text-sm text-muted-foreground">{cotizaciones.length} emitida{cotizaciones.length === 1 ? "" : "s"}</p>
          </div>
        </div>

        <Dialog open={dialogAbierto} onOpenChange={setDialogAbierto}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-8">
              <Plus className="mr-1.5 h-4 w-4" />
              Nueva cotización
            </Button>
          </DialogTrigger>
          <CotizacionForm
            empresaId={empresaId}
            usuario={profile?.usuario ?? "desconocido"}
            onGuardado={() => {
              setDialogAbierto(false)
              cargar()
            }}
          />
        </Dialog>
      </header>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por número o cliente…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todos los estados</SelectItem>
            {Object.entries(ESTADO_COTIZACION_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* La tabla no desaparece mientras carga: la cabecera se queda en su
          sitio y el aviso de carga ocupa el cuerpo. Cambiar el bloque entero
          por un spinner hace saltar el contenido dos veces en cada consulta. */}
      <MarcoTabla>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-semibold">Número</TableHead>
              <TableHead className="text-xs font-semibold">Para</TableHead>
              <TableHead className="text-xs font-semibold">Vigencia</TableHead>
              <TableHead className="text-xs font-semibold text-right">Total</TableHead>
              <TableHead className="text-xs font-semibold">Estado</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {cargando ? (
              <FilaCargando columnas={6} />
            ) : visibles.length === 0 ? (
              <FilaVacia
                columnas={6}
                mensaje={
                  busqueda || filtroEstado !== "todas"
                    ? "Ninguna cotización coincide con el filtro."
                    : "Todavía no hay cotizaciones."
                }
              />
            ) : (
              visibles.map((c) => (
                <FilaCotizacion
                  key={c.id}
                  cotizacion={c}
                  ocupado={ocupado === c.id}
                  onPdf={() => descargarPdf(c)}
                  onEstado={(e) => cambiarEstado(c, e)}
                  onConvertir={() => convertir(c)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </MarcoTabla>
    </div>
  )
}

function FilaCotizacion({
  cotizacion: c, ocupado, onPdf, onEstado, onConvertir,
}: {
  cotizacion: CotizacionConDetalle
  ocupado: boolean
  onPdf: () => void
  onEstado: (e: EstadoCotizacion) => void
  onConvertir: () => void
}) {
  const diasRestantes = diasEntre(hoyISO(), c.fecha_vencimiento)
  const vigente = diasRestantes >= 0
  const porVencer = vigente && diasRestantes <= 3
  const convertible = c.estado === "aceptada" && vigente && !c.crm_pedido_id
  const tono = BADGE[c.estado]

  return (
    <TableRow>
      <TableCell className="text-xs font-medium">
        {c.numero}
        {c.requiere_autorizacion_descuento && (
          <AlertTriangle
            className="ml-1.5 inline h-3.5 w-3.5 text-[var(--chart-3)]"
            aria-label="Tiene descuento por encima del tope"
          />
        )}
      </TableCell>

      <TableCell className="text-xs max-w-[220px] truncate">
        {c.cliente_nombre ?? c.prospecto_nombre ?? "—"}
        {!c.cliente_id && c.prospecto_id && (
          <span className="ml-1.5 text-xs text-muted-foreground">(prospecto)</span>
        )}
      </TableCell>

      <TableCell className="text-xs">
        <span className="text-sm">{c.fecha_vencimiento}</span>
        {porVencer && (
          <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-[var(--chart-3)]">
            <Clock className="h-3 w-3" />
            {diasRestantes === 0 ? "vence hoy" : `${diasRestantes} d`}
          </span>
        )}
      </TableCell>

      <TableCell className="text-xs text-right font-medium tabular-nums">{money(c.total)}</TableCell>

      <TableCell className="text-xs">
        <Badge variant="outline" className={`font-medium ${tono}`}>
          {ESTADO_COTIZACION_LABEL[c.estado]}
        </Badge>
      </TableCell>

      <TableCell className="text-xs">
        {ocupado ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Acciones">⋯</Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onPdf}>
                <Download className="mr-2 h-4 w-4" />
                Descargar PDF
              </DropdownMenuItem>

              {c.estado === "borrador" && (
                <DropdownMenuItem onClick={() => onEstado("enviada")}>
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Marcar como enviada
                </DropdownMenuItem>
              )}

              {(c.estado === "enviada" || c.estado === "borrador") && (
                <>
                  <DropdownMenuItem onClick={() => onEstado("aceptada")}>
                    <CheckCircle2 className="mr-2 h-4 w-4 text-[var(--chart-2)]" />
                    El cliente la aceptó
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEstado("rechazada")}>
                    <XCircle className="mr-2 h-4 w-4 text-destructive" />
                    La rechazó
                  </DropdownMenuItem>
                </>
              )}

              {convertible && (
                <DropdownMenuItem onClick={onConvertir} className="font-medium">
                  <ArrowRight className="mr-2 h-4 w-4 text-[var(--chart-1)]" />
                  Convertir en pedido
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  )
}

export default CotizacionesPanel
