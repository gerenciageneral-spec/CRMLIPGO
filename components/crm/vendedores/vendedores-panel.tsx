"use client"

// Vendedores: datos comerciales, meta mensual y desempeño del mes.

import { useEffect, useMemo, useState } from "react"
import {
  Loader2, Search, UserCheck, Target, TrendingUp, Wallet, Pencil,
  Phone, Mail, MapPin, Link2,
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import {
  getVendedoresCompletos, guardarDetalleVendedor, getUsuariosDisponibles,
  type VendedorCompleto,
} from "@/lib/crm-vendedores-actions"
import { money } from "@/lib/crm-cotizaciones"
import { KpiCard } from "@/components/crm/ui/kpi-card"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { DatePickerField } from "@/components/ui/date-picker-field"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"

const SIN_USUARIO = "__ninguno__"

export function VendedoresPanel() {
  const { selectedEmpresaId } = useAuth()
  const empresaId = selectedEmpresaId ?? 1

  const [vendedores, setVendedores] = useState<VendedorCompleto[]>([])
  const [usuarios, setUsuarios] = useState<{ id: string; usuario: string }[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState("")
  const [editando, setEditando] = useState<VendedorCompleto | null>(null)

  const cargar = async () => {
    const [vRes, uRes] = await Promise.all([
      getVendedoresCompletos(empresaId),
      getUsuariosDisponibles(),
    ])
    if (vRes.success) setVendedores(vRes.data ?? [])
    else toast({ title: "No se pudieron cargar", description: vRes.error, variant: "destructive" })
    if (uRes.success) setUsuarios(uRes.data ?? [])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return vendedores
    return vendedores.filter((v) =>
      [v.nombre, v.zona, v.ciudad_base, v.cedula].some((x) => x?.toLowerCase().includes(t)),
    )
  }, [vendedores, busqueda])

  const totales = useMemo(() => {
    const ventas = vendedores.reduce((s, v) => s + (v.ventas_mes ?? 0), 0)
    const meta = vendedores.reduce((s, v) => s + v.meta_mensual, 0)
    return {
      ventas,
      meta,
      cumplimiento: meta > 0 ? Math.round((ventas / meta) * 1000) / 10 : 0,
      conMeta: vendedores.filter((v) => v.meta_mensual > 0).length,
    }
  }, [vendedores])

  if (cargando) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Vendedores</h1>
        <p className="text-sm text-muted-foreground">
          Zona, meta y desempeño del mes en curso
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={UserCheck} label="Equipo comercial" value={vendedores.length} accent="info" />
        <KpiCard icon={TrendingUp} label="Ventas del mes" value={money(totales.ventas)} accent="primary" />
        <KpiCard icon={Target} label="Meta del equipo" value={money(totales.meta)} accent="neutral" trendHint={`${totales.conMeta} con meta`} />
        <KpiCard
          icon={Target}
          label="Cumplimiento"
          value={totales.cumplimiento}
          unit="%"
          decimals={1}
          accent={totales.cumplimiento >= 100 ? "success" : totales.cumplimiento >= 70 ? "warning" : "danger"}
        />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar vendedor o zona…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibles.map((v) => (
          <Card key={v.vendedor_id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                {v.foto_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={v.foto_url}
                    alt={v.nombre}
                    className="h-11 w-11 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--chart-1)]/10 text-sm font-semibold text-[var(--chart-1)]">
                    {iniciales(v.nombre)}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{v.nombre}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {v.zona && (
                      <span className="flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" />
                        {v.zona}
                      </span>
                    )}
                    {v.usuario_id && (
                      <Badge variant="outline" className="gap-0.5 text-[9px]">
                        <Link2 className="h-2.5 w-2.5" />
                        Con acceso
                      </Badge>
                    )}
                  </p>
                </div>

                <Button variant="ghost" size="icon" onClick={() => setEditando(v)} aria-label="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* La meta con su avance: un número de ventas sin la meta al lado
                  no dice si el mes va bien o mal. */}
              {v.meta_mensual > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">Meta del mes</span>
                    <span className="font-medium tabular-nums">
                      {money(v.ventas_mes ?? 0)} / {money(v.meta_mensual)}
                    </span>
                  </div>
                  <Progress value={Math.min(v.cumplimiento ?? 0, 100)} className="h-1.5" />
                  <p
                    className={`text-right text-xs font-medium ${
                      (v.cumplimiento ?? 0) >= 100
                        ? "text-[var(--chart-2)]"
                        : (v.cumplimiento ?? 0) >= 70
                          ? "text-[var(--chart-3)]"
                          : "text-destructive"
                    }`}
                  >
                    {v.cumplimiento ?? 0}%
                  </p>
                </div>
              )}

              <Separator />

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <p className="font-semibold tabular-nums">{v.pedidos_mes ?? 0}</p>
                  <p className="text-muted-foreground">Pedidos</p>
                </div>
                <div>
                  <p className="font-semibold tabular-nums">{v.prospectos_activos ?? 0}</p>
                  <p className="text-muted-foreground">Prospectos</p>
                </div>
                <div>
                  <p className="font-semibold tabular-nums">{money(v.cartera_asignada ?? 0)}</p>
                  <p className="text-muted-foreground">Cartera</p>
                </div>
              </div>

              {(v.telefono || v.email) && (
                <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {v.telefono && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {v.telefono}
                    </span>
                  )}
                  {v.email && (
                    <span className="flex items-center gap-1 truncate">
                      <Mail className="h-3 w-3 shrink-0" />
                      {v.email}
                    </span>
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {visibles.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {busqueda ? "Ningún vendedor coincide." : "No hay vendedores registrados."}
          </CardContent>
        </Card>
      )}

      {editando && (
        <EditorVendedor
          vendedor={editando}
          usuarios={usuarios}
          empresaId={empresaId}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null)
            cargar()
          }}
        />
      )}
    </div>
  )
}

function iniciales(nombre: string): string {
  return nombre.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")
}

function EditorVendedor({
  vendedor, usuarios, empresaId, onCerrar, onGuardado,
}: {
  vendedor: VendedorCompleto
  usuarios: { id: string; usuario: string }[]
  empresaId: number
  onCerrar: () => void
  onGuardado: () => void
}) {
  const [zona, setZona] = useState(vendedor.zona ?? "")
  const [ciudad, setCiudad] = useState(vendedor.ciudad_base ?? "")
  const [meta, setMeta] = useState(String(vendedor.meta_mensual))
  const [comision, setComision] = useState(
    vendedor.comision_propia != null ? String(vendedor.comision_propia) : "",
  )
  const [ingreso, setIngreso] = useState(vendedor.fecha_ingreso ?? "")
  const [telefono, setTelefono] = useState(vendedor.telefono ?? "")
  const [email, setEmail] = useState(vendedor.email ?? "")
  const [usuarioId, setUsuarioId] = useState(vendedor.usuario_id ?? SIN_USUARIO)
  const [observaciones, setObservaciones] = useState(vendedor.observaciones ?? "")
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    setGuardando(true)
    const res = await guardarDetalleVendedor(
      vendedor.vendedor_id,
      {
        zona: zona.trim() || null,
        ciudad_base: ciudad.trim() || null,
        meta_mensual: Number(meta) || 0,
        comision_propia: comision ? Number(comision) : null,
        fecha_ingreso: ingreso || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        usuario_id: usuarioId === SIN_USUARIO ? null : usuarioId,
        observaciones: observaciones.trim() || null,
      },
      empresaId,
    )
    setGuardando(false)

    if (!res.success) {
      toast({ title: "No se guardó", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: "Vendedor actualizado" })
    onGuardado()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vendedor.nombre}</DialogTitle>
          <DialogDescription>
            {vendedor.cedula ? `CC ${vendedor.cedula}` : "Datos comerciales"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Territorio y meta</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Zona" value={zona} onChange={setZona} placeholder="Norte, Centro…" />
              <Campo label="Ciudad base" value={ciudad} onChange={setCiudad} />
              <Campo label="Meta mensual" type="number" value={meta} onChange={setMeta} />
              <div className="space-y-1.5">
                <Label className="text-sm">Comisión propia (%)</Label>
                <Input
                  type="number" min="0" max="100"
                  value={comision}
                  onChange={(e) => setComision(e.target.value)}
                  placeholder="Usa la regla general"
                />
                <p className="text-xs text-muted-foreground">
                  Si se deja vacío, aplica la regla de comisión configurada.
                </p>
              </div>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Contacto</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Teléfono" value={telefono} onChange={setTelefono} />
              <Campo label="Correo" type="email" value={email} onChange={setEmail} />
              <div className="space-y-1.5">
                <Label className="text-sm">Fecha de ingreso</Label>
                <DatePickerField value={ingreso} onChange={setIngreso} />
              </div>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Acceso al sistema</h3>
            <div className="space-y-1.5">
              <Label className="text-sm">Usuario vinculado</Label>
              <Select value={usuarioId} onValueChange={setUsuarioId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_USUARIO}>Sin vincular</SelectItem>
                  {usuarios.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.usuario}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Al vincularlo, ese usuario podrá ver sus propios prospectos y
                cotizaciones cuando entre al sistema.
              </p>
            </div>
          </section>

          <div className="space-y-1.5">
            <Label className="text-sm">Observaciones</Label>
            <Textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Campo({
  label, value, onChange, type = "text", placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export default VendedoresPanel
