"use client"

// Listado de pedidos y envío a operación.
//
// El botón "Enviar a operación" solo aparece con las dos firmas completas. Es
// el punto donde el CRM escribe en producción ajena, así que la interfaz no
// ofrece el camino antes de tiempo.

import { useEffect, useMemo, useState } from "react"
import {
  Loader2, Search, Send, CheckCircle2, Clock, AlertTriangle, ExternalLink, ClipboardList } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { getPedidos, enviarPedidoALipgo } from "@/lib/crm-pedidos-actions"
import {
  ESTADO_PEDIDO_LABEL, firmasPendientes, ROL_LABEL, money,
  type PedidoConDetalle, type EstadoPedido,
} from "@/lib/crm-pedidos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip"
import { toast } from "@/hooks/use-toast"
import { MarcoTabla, FilaCargando, FilaVacia } from "@/components/crm/ui/modulo"

// Color por estado, al estilo de LIPgo. El ambar de "falta una firma" y el
// azul de "enviado a operacion" distinguen de un vistazo lo que espera accion
// de lo que ya termino su recorrido.
const BADGE: Record<EstadoPedido, string> = {
  borrador: "bg-slate-50 text-slate-700 border-slate-200",
  pendiente_autorizacion: "bg-blue-50 text-blue-700 border-blue-200",
  autorizado_parcial: "bg-amber-50 text-amber-700 border-amber-200",
  autorizado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rechazado: "bg-red-50 text-red-700 border-red-200",
  enviado_lipgo: "bg-violet-50 text-violet-700 border-violet-200",
  anulado: "bg-slate-50 text-slate-500 border-slate-200",
}

export function PedidosPanel() {
  const { selectedEmpresaId } = useAuth()
  const empresaId = selectedEmpresaId ?? 1

  const [pedidos, setPedidos] = useState<PedidoConDetalle[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState("")
  const [filtroEstado, setFiltroEstado] = useState("todos")
  const [enviando, setEnviando] = useState<number | null>(null)

  const cargar = async () => {
    const res = await getPedidos(empresaId)
    if (res.success) setPedidos(res.data ?? [])
    else toast({ title: "No se pudieron cargar", description: res.error, variant: "destructive" })
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    return pedidos.filter((p) => {
      if (filtroEstado !== "todos" && p.estado !== filtroEstado) return false
      if (!t) return true
      return [p.numero, p.cliente_nombre, p.orden_compra].some((x) => x?.toLowerCase().includes(t))
    })
  }, [pedidos, busqueda, filtroEstado])

  const enviar = async (p: PedidoConDetalle) => {
    setEnviando(p.id)
    const res = await enviarPedidoALipgo(p.id, empresaId)
    setEnviando(null)

    if (!res.success) {
      // El error más común es un producto cuyo nombre no existe en el catálogo
      // de operación. El mensaje lo nombra para no revisar línea por línea.
      toast({
        title: "No se pudo enviar",
        description: res.error,
        variant: "destructive",
      })
      cargar() // el error queda guardado en el pedido
      return
    }

    toast({
      title: "Pedido enviado a operación",
      description: `Quedó como pedido ${res.data?.idpedido} con ${res.data?.lineas} línea(s)`,
    })
    cargar()
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        <header>
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-[var(--chart-1)]/10 p-2 text-[var(--chart-1)]">
            <ClipboardList className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Pedidos</h1>
            <p className="text-sm text-muted-foreground">Un pedido viaja a operación cuando tiene las dos autorizaciones</p>
          </div>
        </div>
      </header>

        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por número, cliente u orden de compra…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {Object.entries(ESTADO_PEDIDO_LABEL).map(([k, v]) => (
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
                <TableHead className="text-xs font-semibold">Cliente</TableHead>
                <TableHead className="text-xs font-semibold">Pago</TableHead>
                <TableHead className="text-xs font-semibold text-right">Total</TableHead>
                <TableHead className="text-xs font-semibold">Firmas</TableHead>
                <TableHead className="text-xs font-semibold">Estado</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {cargando ? (
                <FilaCargando columnas={7} />
              ) : visibles.length === 0 ? (
                <FilaVacia
                  columnas={7}
                  mensaje={
                    busqueda || filtroEstado !== "todos"
                      ? "Ningún pedido coincide con el filtro."
                      : "Todavía no hay pedidos. Se crean al aceptar una cotización."
                  }
                />
              ) : (
                visibles.map((p) => {
                const faltan = firmasPendientes(p)
                const listo = p.estado === "autorizado" && !p.idpedido_lipgo
                const tono = BADGE[p.estado]

                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs font-medium">{p.numero}</TableCell>

                    <TableCell className="text-xs max-w-[200px] truncate">
                      {p.cliente_nombre ?? "—"}
                    </TableCell>

                    <TableCell className="text-xs">
                      <span className="text-sm">
                        {p.forma_pago === "credito" ? `Crédito ${p.dias_credito} d` : "Contado"}
                      </span>
                    </TableCell>

                    <TableCell className="text-xs text-right font-medium tabular-nums">
                      {money(p.total)}
                    </TableCell>

                    <TableCell className="text-xs">
                      <Firmas pedido={p} />
                    </TableCell>

                    <TableCell className="text-xs">
                      <Badge variant="outline" className={`font-medium ${tono}`}>
                        {ESTADO_PEDIDO_LABEL[p.estado]}
                      </Badge>
                      {p.error_lipgo && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertTriangle className="ml-1.5 inline h-3.5 w-3.5 text-destructive" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">{p.error_lipgo}</TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>

                    <TableCell className="text-xs">
                      {p.idpedido_lipgo ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ExternalLink className="h-3 w-3" />
                          Op. #{p.idpedido_lipgo}
                        </span>
                      ) : listo ? (
                        <Button
                          size="sm"
                          onClick={() => enviar(p)}
                          disabled={enviando === p.id}
                        >
                          {enviando === p.id ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="mr-1 h-3.5 w-3.5" />
                          )}
                          Enviar
                        </Button>
                      ) : faltan.length ? (
                        <span className="text-xs text-muted-foreground">
                          Falta {faltan.map((r) => ROL_LABEL[r]).join(" y ")}
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                  )
                })
              )}
            </TableBody>
            </Table>
        </MarcoTabla>
      </div>
    </TooltipProvider>
  )
}

/** Las dos firmas, con quién y cuándo. Una firma sin nombre no sirve para
 *  responder "quién autorizó esto". */
function Firmas({ pedido: p }: { pedido: PedidoConDetalle }) {
  const items = [
    { rol: "Contab.", nombre: p.auth_contabilidad_nombre, fecha: p.auth_contabilidad_en },
    { rol: "Gerencia", nombre: p.auth_gerencia_nombre, fecha: p.auth_gerencia_en },
  ]

  return (
    <div className="flex gap-1.5">
      {items.map((f) => (
        <Tooltip key={f.rol}>
          <TooltipTrigger asChild>
            <span
              className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] ${
                f.fecha
                  ? "bg-[var(--chart-2)]/12 text-[var(--chart-2)]"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {f.fecha ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
              {f.rol}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {f.fecha
              ? `${f.nombre ?? "—"} · ${new Date(f.fecha).toLocaleString("es-CO", {
                  timeZone: "America/Bogota",
                  dateStyle: "short",
                  timeStyle: "short",
                })}`
              : "Pendiente"}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

export default PedidosPanel
