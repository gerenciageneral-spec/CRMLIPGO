"use client"

// Registrar pago: atajo para cuando llega un abono y hay que aplicarlo rápido.
//
// Es la misma operación de Cuentas por Cobrar, pero entrando por el cliente en
// vez de por la factura: quien recibe una transferencia sabe de quién viene,
// no contra qué factura va.

import { useEffect, useMemo, useState } from "react"
import { Loader2, Search, Banknote, Wallet, AlertTriangle } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { getCuentasPorCobrar } from "@/lib/crm-cartera-actions"
import { diasVencido, money, type CuentaPorCobrar } from "@/lib/crm-cartera"
import { hoyISO } from "@/lib/crm-fechas"
import { RegistrarPagoDialog } from "./registrar-pago-dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"

interface GrupoCliente {
  clienteId: number
  nombre: string
  cuentas: CuentaPorCobrar[]
  total: number
  vencido: number
}

export function PagosPanel() {
  const { profile, selectedEmpresaId } = useAuth()
  const empresaId = selectedEmpresaId ?? 1

  const [cuentas, setCuentas] = useState<CuentaPorCobrar[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState("")
  const [cobrando, setCobrando] = useState<CuentaPorCobrar | null>(null)

  const cargar = async () => {
    const res = await getCuentasPorCobrar(empresaId)
    if (res.success) setCuentas(res.data ?? [])
    else toast({ title: "No se pudo cargar", description: res.error, variant: "destructive" })
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  // Se agrupa por cliente: quien registra un pago busca al cliente, no la
  // factura. Dentro de cada uno, las más vencidas primero, que es el orden en
  // que conviene aplicar un abono.
  const grupos = useMemo(() => {
    const hoy = hoyISO()
    const t = busqueda.trim().toLowerCase()
    const mapa = new Map<number, GrupoCliente>()

    for (const c of cuentas) {
      if (t && !c.cliente_nombre?.toLowerCase().includes(t)) continue

      const g = mapa.get(c.cliente_id) ?? {
        clienteId: c.cliente_id,
        nombre: c.cliente_nombre ?? "—",
        cuentas: [],
        total: 0,
        vencido: 0,
      }

      const saldo = Number(c.saldo) || 0
      g.cuentas.push(c)
      g.total += saldo
      if (diasVencido(c.fecha_vencimiento, hoy) > 0) g.vencido += saldo

      mapa.set(c.cliente_id, g)
    }

    for (const g of mapa.values()) {
      g.cuentas.sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))
    }

    // Los clientes con más vencido arriba: son los que hay que cobrar.
    return [...mapa.values()].sort((a, b) => b.vencido - a.vencido || b.total - a.total)
  }, [cuentas, busqueda])

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-[var(--chart-1)]/10 p-2 text-[var(--chart-1)]">
            <Banknote className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Registrar pago</h1>
            <p className="text-sm text-muted-foreground">Busca el cliente y aplica el abono sobre la factura que corresponda</p>
          </div>
        </div>
      </header>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar cliente…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="pl-9"
          autoFocus
        />
      </div>

      {cargando ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : grupos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Wallet className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {busqueda ? "Ese cliente no tiene cartera pendiente." : "No hay cartera pendiente."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {grupos.map((g) => (
            <Card key={g.clienteId}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{g.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.cuentas.length} factura{g.cuentas.length === 1 ? "" : "s"} abierta
                      {g.cuentas.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{money(g.total)}</p>
                    {g.vencido > 0 && (
                      <p className="flex items-center justify-end gap-1 text-xs text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        {money(g.vencido)} vencido
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-1.5">
                  {g.cuentas.map((c) => {
                    const dias = diasVencido(c.fecha_vencimiento, hoyISO())
                    const vencida = dias > 0

                    return (
                      <div key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="min-w-[120px] font-medium">
                          {c.numero_factura ?? c.pedido_numero ?? `#${c.id}`}
                        </span>

                        <span className="text-xs text-muted-foreground">
                          vence {c.fecha_vencimiento}
                        </span>

                        {vencida && (
                          <Badge variant="destructive" className="text-[10px]">
                            {dias} d
                          </Badge>
                        )}

                        {c.estado === "parcial" && (
                          <Badge variant="secondary" className="text-[10px]">
                            Abonada
                          </Badge>
                        )}

                        <span className="ml-auto font-semibold tabular-nums">{money(c.saldo)}</span>

                        <Button size="sm" variant="outline" onClick={() => setCobrando(c)}>
                          <Banknote className="mr-1 h-3.5 w-3.5" />
                          Abonar
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
    </div>
  )
}

export default PagosPanel
