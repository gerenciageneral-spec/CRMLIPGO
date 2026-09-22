"use client"

// Bandeja de firmas: los pedidos esperando MI autorización.
//
// Solo muestra lo que este usuario puede firmar de verdad. Si ya dio la otra
// firma o creó el pedido, no aparece: verlo y no poder actuar es peor que no
// verlo, porque obliga a descubrir el porqué probando.

import { useEffect, useState } from "react"
import {
  Loader2, Stamp, CheckCircle2, XCircle, AlertTriangle, Inbox, User, Calendar,
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import {
  getPedidosPendientesDeMiFirma, autorizarPedido, rechazarPedido, getPedido,
} from "@/lib/crm-pedidos-actions"
import {
  ROL_LABEL, firmasPendientes, money,
  type PedidoConDetalle, type RolAutorizacion, type LineaPedido,
} from "@/lib/crm-pedidos"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"

export function AutorizacionesPanel() {
  const { selectedEmpresaId } = useAuth()
  const empresaId = selectedEmpresaId ?? 1

  const [pedidos, setPedidos] = useState<PedidoConDetalle[]>([])
  const [misRoles, setMisRoles] = useState<RolAutorizacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [detalle, setDetalle] = useState<PedidoConDetalle | null>(null)
  const [accion, setAccion] = useState<{ pedido: PedidoConDetalle; rol: RolAutorizacion; tipo: "autorizar" | "rechazar" } | null>(null)

  const cargar = async () => {
    const res = await getPedidosPendientesDeMiFirma(empresaId)
    if (res.success && res.data) {
      setPedidos(res.data.pedidos)
      setMisRoles(res.data.roles)
    }
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const verDetalle = async (p: PedidoConDetalle) => {
    const res = await getPedido(p.id, empresaId)
    if (res.success && res.data) setDetalle(res.data)
  }

  if (cargando) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!misRoles.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <Stamp className="h-8 w-8 text-muted-foreground/40" />
          <p className="font-medium">No tienes permisos de autorización</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Las firmas de contabilidad y gerencia se otorgan desde
            Configuración → Gestión de Usuarios.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Autorizar pedidos</h1>
        <p className="text-sm text-muted-foreground">
          Puedes firmar como {misRoles.map((r) => ROL_LABEL[r]).join(" y ")}
          {" · "}
          {pedidos.length} pedido{pedidos.length === 1 ? "" : "s"} esperando
        </p>
      </header>

      {pedidos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No hay pedidos esperando tu firma.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pedidos.map((p) => {
            const faltan = firmasPendientes(p)
            const mias = misRoles.filter((r) => faltan.includes(r))

            return (
              <Card key={p.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.numero}</span>
                        {p.forma_pago === "credito" && (
                          <Badge variant="outline" className="text-[10px]">
                            Crédito {p.dias_credito} d
                          </Badge>
                        )}
                      </div>

                      <p className="text-sm text-muted-foreground">{p.cliente_nombre ?? "—"}</p>

                      <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {p.creado_por ?? "—"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {p.fecha}
                        </span>
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-semibold tabular-nums">{money(p.total)}</p>
                      {p.auth_contabilidad_en && (
                        <p className="text-xs text-[var(--chart-2)]">
                          Contabilidad ya firmó
                        </p>
                      )}
                      {p.auth_gerencia_en && (
                        <p className="text-xs text-[var(--chart-2)]">Gerencia ya firmó</p>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => verDetalle(p)}>
                      Ver detalle
                    </Button>

                    <div className="ml-auto flex flex-wrap gap-2">
                      {mias.map((rol) => (
                        <div key={rol} className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => setAccion({ pedido: p, rol, tipo: "autorizar" })}
                          >
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                            Autorizar como {ROL_LABEL[rol]}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAccion({ pedido: p, rol, tipo: "rechazar" })}
                          >
                            <XCircle className="mr-1 h-3.5 w-3.5" />
                            Rechazar
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <DetallePedido pedido={detalle} onCerrar={() => setDetalle(null)} />

      <DialogoAccion
        accion={accion}
        empresaId={empresaId}
        onCerrar={() => setAccion(null)}
        onHecho={() => {
          setAccion(null)
          cargar()
        }}
      />
    </div>
  )
}

function DetallePedido({
  pedido, onCerrar,
}: {
  pedido: PedidoConDetalle | null
  onCerrar: () => void
}) {
  return (
    <Dialog open={!!pedido} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pedido?.numero}</DialogTitle>
          <DialogDescription>{pedido?.cliente_nombre}</DialogDescription>
        </DialogHeader>

        {pedido && (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(pedido.lineas ?? []).map((l: LineaPedido) => (
                  <TableRow key={l.linea}>
                    <TableCell className="max-w-[220px] truncate">{l.producto_nombre}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(l.cantidad).toLocaleString("es-CO")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(l.precio_unitario)}
                      {Number(l.descuento_pct) > 0 && (
                        <span className="ml-1 text-xs text-[var(--chart-3)]">
                          -{Number(l.descuento_pct)}%
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {money(l.subtotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{money(pedido.subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>IVA ({Number(pedido.iva_pct)}%)</span>
                <span className="tabular-nums">{money(pedido.iva_valor)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{money(pedido.total)}</span>
              </div>
            </div>

            {pedido.observaciones && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Observaciones</p>
                {pedido.observaciones}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DialogoAccion({
  accion, empresaId, onCerrar, onHecho,
}: {
  accion: { pedido: PedidoConDetalle; rol: RolAutorizacion; tipo: "autorizar" | "rechazar" } | null
  empresaId: number
  onCerrar: () => void
  onHecho: () => void
}) {
  const [clave, setClave] = useState("")
  const [nota, setNota] = useState("")
  const [procesando, setProcesando] = useState(false)

  useEffect(() => {
    // La clave no se conserva entre diálogos: dejarla cargada sería dejarla
    // disponible para el siguiente pedido sin volver a pedirla.
    setClave("")
    setNota("")
  }, [accion])

  if (!accion) return null

  const { pedido, rol, tipo } = accion
  const esAutorizar = tipo === "autorizar"

  const ejecutar = async () => {
    setProcesando(true)

    const res = esAutorizar
      ? await autorizarPedido(pedido.id, rol, clave, nota.trim() || undefined, empresaId)
      : await rechazarPedido(pedido.id, rol, nota.trim(), empresaId)

    setProcesando(false)

    if (!res.success) {
      toast({ title: "No se pudo completar", description: res.error, variant: "destructive" })
      return
    }

    const completo = esAutorizar && (res.data as any)?.estado === "autorizado"
    toast({
      title: esAutorizar ? `Autorizado como ${ROL_LABEL[rol]}` : "Pedido rechazado",
      description: completo
        ? "Con las dos firmas completas ya puede enviarse a operación."
        : esAutorizar
          ? "Falta la otra firma."
          : undefined,
    })
    onHecho()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {esAutorizar ? `Autorizar como ${ROL_LABEL[rol]}` : "Rechazar pedido"}
          </DialogTitle>
          <DialogDescription>
            {pedido.numero} · {pedido.cliente_nombre} · {money(pedido.total)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {esAutorizar ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="clave" className="text-sm">
                  Clave de {ROL_LABEL[rol]}
                </Label>
                <Input
                  id="clave"
                  type="password"
                  autoComplete="off"
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && clave && ejecutar()}
                />
                <p className="text-xs text-muted-foreground">
                  Quedará registrado que tú diste esta autorización.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Nota (opcional)</Label>
                <Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-sm">Motivo del rechazo *</Label>
              <Textarea
                rows={3}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Por qué no se autoriza…"
              />
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                El motivo queda en el historial y lo verá quien creó el pedido.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            onClick={ejecutar}
            disabled={procesando || (esAutorizar ? !clave : !nota.trim())}
            variant={esAutorizar ? "default" : "destructive"}
          >
            {procesando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {esAutorizar ? "Autorizar" : "Rechazar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default AutorizacionesPanel
