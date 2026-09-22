"use client"

// Cuentas por cobrar: qué se debe, desde cuándo y cuánto falta.

import { useEffect, useMemo, useState } from "react"
import {
  Loader2, Search, Wallet, AlertTriangle, Receipt, Banknote, FileText,
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { getCuentasPorCobrar, asignarNumeroFactura } from "@/lib/crm-cartera-actions"
import {
  ESTADO_CUENTA_LABEL, diasVencido, money, type CuentaPorCobrar,
} from "@/lib/crm-cartera"
import { hoyISO } from "@/lib/crm-fechas"
import { RegistrarPagoDialog } from "./registrar-pago-dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { KpiCard } from "@/components/crm/ui/kpi-card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"

export function CxcPanel() {
  const { profile, selectedEmpresaId } = useAuth()
  const empresaId = selectedEmpresaId ?? 1

  const [cuentas, setCuentas] = useState<CuentaPorCobrar[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState("")
  const [filtro, setFiltro] = useState("pendientes")
  const [cobrando, setCobrando] = useState<CuentaPorCobrar | null>(null)
  const [facturando, setFacturando] = useState<CuentaPorCobrar | null>(null)

  const cargar = async () => {
    const res = await getCuentasPorCobrar(empresaId, {
      soloVencidas: filtro === "vencidas",
    })
    if (res.success) setCuentas(res.data ?? [])
    else toast({ title: "No se pudo cargar la cartera", description: res.error, variant: "destructive" })
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, filtro])

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return cuentas
    return cuentas.filter((c) =>
      [c.cliente_nombre, c.numero_factura, c.pedido_numero].some((x) => x?.toLowerCase().includes(t)),
    )
  }, [cuentas, busqueda])

  const totales = useMemo(() => {
    const hoy = hoyISO()
    let pendiente = 0
    let vencido = 0
    let cuentasVencidas = 0

    for (const c of visibles) {
      const saldo = Number(c.saldo) || 0
      pendiente += saldo
      if (diasVencido(c.fecha_vencimiento, hoy) > 0) {
        vencido += saldo
        cuentasVencidas += 1
      }
    }
    return { pendiente, vencido, cuentasVencidas }
  }, [visibles])

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-[var(--chart-1)]/10 p-2 text-[var(--chart-1)]">
            <Wallet className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Cuentas por cobrar</h1>
            <p className="text-sm text-muted-foreground">La cartera nace cuando un pedido a crédito viaja a operación</p>
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard icon={Wallet} label="Por cobrar" value={money(totales.pendiente)} accent="primary" />
        <KpiCard
          icon={AlertTriangle}
          label="Vencido"
          value={money(totales.vencido)}
          accent={totales.vencido > 0 ? "danger" : "neutral"}
          trendHint={`${totales.cuentasVencidas} factura(s)`}
          // Subir cartera vencida es mala noticia: sin invertTrend se pintaría
          // en verde, justo al revés de lo que el gerente necesita ver.
          invertTrend
        />
        <KpiCard icon={Receipt} label="Facturas abiertas" value={visibles.length} accent="info" />
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente o factura…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pendientes">Pendientes</SelectItem>
            <SelectItem value="vencidas">Solo vencidas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {cargando ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : visibles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Wallet className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {busqueda ? "Nada coincide con la búsqueda." : "No hay cartera pendiente."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">Cliente</TableHead>
                <TableHead className="text-xs font-semibold">Factura</TableHead>
                <TableHead className="text-xs font-semibold">Vence</TableHead>
                <TableHead className="text-xs font-semibold text-right">Valor</TableHead>
                <TableHead className="text-xs font-semibold text-right">Saldo</TableHead>
                <TableHead className="text-xs font-semibold">Estado</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {visibles.map((c) => {
                const dias = diasVencido(c.fecha_vencimiento, hoyISO())
                const vencida = dias > 0

                return (
                  <TableRow key={c.id} className={vencida ? "bg-destructive/5" : undefined}>
                    <TableCell className="max-w-[200px] truncate font-medium">
                      {c.cliente_nombre ?? "—"}
                    </TableCell>

                    <TableCell>
                      {c.numero_factura ? (
                        <span className="text-sm">{c.numero_factura}</span>
                      ) : (
                        <Button
                          variant="ghost" size="sm"
                          className="h-6 px-1.5 text-xs text-muted-foreground"
                          onClick={() => setFacturando(c)}
                        >
                          <FileText className="mr-1 h-3 w-3" />
                          Asignar
                        </Button>
                      )}
                      {c.pedido_numero && (
                        <p className="text-[11px] text-muted-foreground">{c.pedido_numero}</p>
                      )}
                    </TableCell>

                    <TableCell>
                      <span className="text-sm">{c.fecha_vencimiento}</span>
                      {vencida && (
                        <p className="text-[11px] font-medium text-destructive">
                          {dias} día{dias === 1 ? "" : "s"} vencida
                        </p>
                      )}
                    </TableCell>

                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {money(c.valor_original)}
                    </TableCell>

                    <TableCell className="text-right font-semibold tabular-nums">
                      {money(c.saldo)}
                    </TableCell>

                    <TableCell>
                      {/* Vencida en rojo, abonada en azul, al dia en gris:
                          el color dice que hacer sin leer la fila entera. */}
                      <Badge
                        variant="outline"
                        className={`font-medium ${
                          vencida
                            ? "bg-red-50 text-red-700 border-red-200"
                            : c.estado === "parcial"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-slate-50 text-slate-700 border-slate-200"
                        }`}
                      >
                        {ESTADO_CUENTA_LABEL[c.estado]}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setCobrando(c)}>
                        <Banknote className="mr-1 h-3.5 w-3.5" />
                        Abonar
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <RegistrarPagoDialog
        cuenta={cobrando}
        empresaId={empresaId}
        usuario={profile?.usuario ?? "desconocido"}
        onCerrar={() => setCobrando(null)}
        onPagado={() => {
          setCobrando(null)
          cargar()
        }}
      />

      <DialogoFactura
        cuenta={facturando}
        empresaId={empresaId}
        onCerrar={() => setFacturando(null)}
        onGuardado={() => {
          setFacturando(null)
          cargar()
        }}
      />
    </div>
  )
}

/** Número de factura de Siigo. La cartera ya existe desde que el pedido viajó;
 *  esto solo la amarra al documento contable. */
function DialogoFactura({
  cuenta, empresaId, onCerrar, onGuardado,
}: {
  cuenta: CuentaPorCobrar | null
  empresaId: number
  onCerrar: () => void
  onGuardado: () => void
}) {
  const [numero, setNumero] = useState("")
  const [guardando, setGuardando] = useState(false)

  useEffect(() => setNumero(cuenta?.numero_factura ?? ""), [cuenta])

  if (!cuenta) return null

  const guardar = async () => {
    setGuardando(true)
    const res = await asignarNumeroFactura(cuenta.id, numero, empresaId)
    setGuardando(false)

    if (!res.success) {
      toast({ title: "No se guardó", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: "Factura asignada" })
    onGuardado()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Número de factura</DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5 py-2">
          <Label className="text-sm">Factura emitida en el sistema contable</Label>
          <Input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="FV-1234"
            onKeyDown={(e) => e.key === "Enter" && numero && guardar()}
          />
          <p className="text-xs text-muted-foreground">
            {cuenta.cliente_nombre} · {money(cuenta.valor_original)}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando || !numero.trim()}>
            {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CxcPanel
