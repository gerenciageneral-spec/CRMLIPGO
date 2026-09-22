"use client"

// Comisiones de los vendedores.
//
// El porcentaje que se ve aquí es el que se CONGELÓ al liquidar, no el de la
// regla vigente hoy. Si se leyera de la regla, cambiar la tasa reescribiría el
// pasado y el vendedor vería una cifra distinta de la que se le pagó.

import { useEffect, useMemo, useState } from "react"
import {
  Loader2, Percent, CheckCircle2, Banknote, XCircle, Users, TrendingUp, Info,
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { getComisiones, cambiarEstadoComision, getReglasComision } from "@/lib/crm-cartera-actions"
import {
  ESTADO_COMISION_LABEL, money,
  type Comision, type ReglaComision, type EstadoComision,
} from "@/lib/crm-cartera"
import { getParam } from "@/lib/crm-parametros-actions"
import { PARAM, MOMENTO_COMISION_LABEL, type MomentoComision } from "@/lib/crm-parametros"
import { hoyISO } from "@/lib/crm-fechas"
import { KpiCard } from "@/components/crm/ui/kpi-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "@/hooks/use-toast"

const BADGE: Record<EstadoComision, "default" | "secondary" | "outline" | "destructive"> = {
  pendiente: "outline",
  aprobada: "secondary",
  pagada: "default",
  anulada: "destructive",
}

export function ComisionesPanel() {
  const { selectedEmpresaId } = useAuth()
  const empresaId = selectedEmpresaId ?? 1

  const [comisiones, setComisiones] = useState<Comision[]>([])
  const [reglas, setReglas] = useState<ReglaComision[]>([])
  const [momento, setMomento] = useState<MomentoComision>("recaudo")
  const [cargando, setCargando] = useState(true)
  const [periodo, setPeriodo] = useState(hoyISO().slice(0, 7))
  const [ocupado, setOcupado] = useState<number | null>(null)

  const cargar = async () => {
    const [cRes, rRes, m] = await Promise.all([
      getComisiones(empresaId, { periodo }),
      getReglasComision(empresaId),
      getParam(PARAM.COMISION_MOMENTO, empresaId),
    ])
    if (cRes.success) setComisiones(cRes.data ?? [])
    if (rRes.success) setReglas(rRes.data ?? [])
    setMomento(m as MomentoComision)
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, periodo])

  // Los últimos doce meses, para no pedirle al usuario que escriba la fecha.
  const periodos = useMemo(() => {
    const out: string[] = []
    const [a, m] = hoyISO().split("-").map(Number)
    for (let i = 0; i < 12; i++) {
      const d = new Date(a, m - 1 - i, 1)
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
    }
    return out
  }, [])

  const totales = useMemo(() => {
    let pendiente = 0
    let pagado = 0
    const porVendedor = new Map<number, { nombre: string; total: number }>()

    for (const c of comisiones) {
      if (c.estado === "anulada") continue
      const v = Number(c.valor) || 0
      if (c.estado === "pagada") pagado += v
      else pendiente += v

      const g = porVendedor.get(c.vendedor_id) ?? { nombre: c.vendedor_nombre ?? "—", total: 0 }
      g.total += v
      porVendedor.set(c.vendedor_id, g)
    }

    return {
      pendiente, pagado,
      vendedores: [...porVendedor.values()].sort((a, b) => b.total - a.total),
    }
  }, [comisiones])

  const cambiar = async (c: Comision, estado: "aprobada" | "pagada" | "anulada") => {
    setOcupado(c.id)
    const res = await cambiarEstadoComision(c.id, estado, empresaId)
    setOcupado(null)

    if (!res.success) {
      toast({ title: "No se pudo actualizar", description: res.error, variant: "destructive" })
      return
    }
    setComisiones((prev) => prev.map((x) => (x.id === c.id ? { ...x, estado } : x)))
    toast({ title: `Comisión ${ESTADO_COMISION_LABEL[estado].toLowerCase()}` })
  }

  if (cargando) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comisiones</h1>
          <p className="text-sm text-muted-foreground">
            Se causan {MOMENTO_COMISION_LABEL[momento].toLowerCase()}
          </p>
        </div>

        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {periodos.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard icon={Percent} label="Por pagar" value={money(totales.pendiente)} accent="warning" />
        <KpiCard icon={Banknote} label="Pagado en el período" value={money(totales.pagado)} accent="success" />
        <KpiCard icon={Users} label="Vendedores con comisión" value={totales.vendedores.length} accent="info" />
      </div>

      {reglas.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            {reglas.length} regla{reglas.length === 1 ? "" : "s"} vigente
            {reglas.length === 1 ? "" : "s"}
            {": "}
            {reglas.slice(0, 3).map((r) => `${r.nombre} (${r.porcentaje}%)`).join(", ")}
            {reglas.length > 3 && `, y ${reglas.length - 3} más`}.
            El porcentaje aplicado a cada comisión queda congelado al liquidarla.
          </AlertDescription>
        </Alert>
      )}

      {totales.vendedores.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-base">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Por vendedor
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {totales.vendedores.map((v) => (
              <div key={v.nombre} className="flex items-center justify-between rounded-lg border p-3">
                <span className="truncate text-sm">{v.nombre}</span>
                <span className="font-semibold tabular-nums">{money(v.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {comisiones.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Percent className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No hay comisiones en {periodo}.
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Se liquidan {MOMENTO_COMISION_LABEL[momento].toLowerCase()}. El momento
              se configura en Parametrización.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-center">%</TableHead>
                <TableHead className="text-right">Comisión</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {comisiones.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.vendedor_nombre ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {money(c.base_calculo)}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{Number(c.porcentaje)}%</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {money(c.valor)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={BADGE[c.estado]}>{ESTADO_COMISION_LABEL[c.estado]}</Badge>
                  </TableCell>
                  <TableCell>
                    {ocupado === c.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : c.estado !== "pagada" && c.estado !== "anulada" ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Acciones">⋯</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {c.estado === "pendiente" && (
                            <DropdownMenuItem onClick={() => cambiar(c, "aprobada")}>
                              <CheckCircle2 className="mr-2 h-4 w-4 text-[var(--chart-2)]" />
                              Aprobar
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => cambiar(c, "pagada")}>
                            <Banknote className="mr-2 h-4 w-4" />
                            Marcar como pagada
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => cambiar(c, "anulada")}>
                            <XCircle className="mr-2 h-4 w-4 text-destructive" />
                            Anular
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}

export default ComisionesPanel
