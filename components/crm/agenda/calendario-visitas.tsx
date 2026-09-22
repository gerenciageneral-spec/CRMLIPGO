"use client"

// Calendario mensual de visitas.
//
// Construido a mano y no con react-day-picker: esa librería es un selector de
// fechas, no una agenda. Pintar eventos dentro de sus celdas exige pelearse
// con su render interno, y una rejilla de siete columnas es código directo.
//
// La semana arranca en LUNES, como se trabaja en Colombia, no en domingo.

import { useEffect, useMemo, useState } from "react"
import {
  Loader2, ChevronLeft, ChevronRight, Plus, CalendarDays, MapPin, Phone,
  Users, Truck, Wallet, CheckCircle2, CalendarClock,
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { getCitas, crearCita, TIPOS_CITA, type Cita, type EstadoCita } from "@/lib/crm-agenda-actions"
import { getClientesCrm } from "@/lib/crm-catalogos-actions"
import { getProspectos } from "@/lib/crm-prospectos-actions"
import type { ClienteCrm } from "@/lib/crm-catalogos"
import type { ProspectoConEtapa } from "@/lib/crm-prospectos"
import { hoyISO, formatearISO } from "@/lib/crm-fechas"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { DatePickerField } from "@/components/ui/date-picker-field"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import type { LucideIcon } from "lucide-react"

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

const ICONO_TIPO: Record<string, LucideIcon> = {
  visita: MapPin, llamada: Phone, reunion: Users,
  entrega: Truck, cobro: Wallet, otro: CalendarDays,
}

const COLOR_ESTADO: Record<EstadoCita, string> = {
  pendiente: "var(--chart-1)",
  cumplida: "var(--chart-2)",
  reprogramada: "var(--chart-3)",
  cancelada: "var(--muted-foreground)",
}

const SIN_VINCULO = "__ninguno__"

export function CalendarioVisitas() {
  const { profile, selectedEmpresaId } = useAuth()
  const empresaId = selectedEmpresaId ?? 1

  const [ancla, setAncla] = useState(() => {
    const [a, m] = hoyISO().split("-").map(Number)
    return { anio: a, mes: m }
  })
  const [citas, setCitas] = useState<Cita[]>([])
  const [cargando, setCargando] = useState(true)
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null)
  const [creando, setCreando] = useState<string | null>(null)

  // Rango del mes visible, con margen para las celdas del mes anterior y
  // siguiente que completan la rejilla.
  const rango = useMemo(() => {
    const primero = new Date(ancla.anio, ancla.mes - 1, 1)
    const ultimo = new Date(ancla.anio, ancla.mes, 0)
    return {
      desde: iso(new Date(primero.getFullYear(), primero.getMonth(), -7)),
      hasta: iso(new Date(ultimo.getFullYear(), ultimo.getMonth(), ultimo.getDate() + 7)),
    }
  }, [ancla])

  const cargar = async () => {
    const res = await getCitas(empresaId, { desde: rango.desde, hasta: rango.hasta })
    if (res.success) setCitas(res.data ?? [])
    else toast({ title: "No se pudo cargar", description: res.error, variant: "destructive" })
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, rango.desde, rango.hasta])

  const porDia = useMemo(() => {
    const mapa = new Map<string, Cita[]>()
    for (const c of citas) {
      if (!mapa.has(c.fecha)) mapa.set(c.fecha, [])
      mapa.get(c.fecha)!.push(c)
    }
    // Dentro del día, por hora; las sin hora al final.
    for (const lista of mapa.values()) {
      lista.sort((a, b) => (a.hora_inicio ?? "99").localeCompare(b.hora_inicio ?? "99"))
    }
    return mapa
  }, [citas])

  // La rejilla: seis semanas siempre, para que la altura no salte al cambiar
  // de mes.
  const semanas = useMemo(() => {
    const primero = new Date(ancla.anio, ancla.mes - 1, 1)
    // getDay() da 0 para domingo; se convierte a lunes = 0.
    const desplazamiento = (primero.getDay() + 6) % 7
    const inicio = new Date(ancla.anio, ancla.mes - 1, 1 - desplazamiento)

    const out: Date[][] = []
    for (let s = 0; s < 6; s++) {
      const semana: Date[] = []
      for (let d = 0; d < 7; d++) {
        semana.push(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + s * 7 + d))
      }
      out.push(semana)
    }
    return out
  }, [ancla])

  const mover = (delta: number) => {
    setAncla((a) => {
      const m = a.mes + delta
      if (m < 1) return { anio: a.anio - 1, mes: 12 }
      if (m > 12) return { anio: a.anio + 1, mes: 1 }
      return { ...a, mes: m }
    })
  }

  const hoy = hoyISO()

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendario de visitas</h1>
          <p className="text-sm text-muted-foreground">
            {citas.filter((c) => c.estado === "pendiente").length} pendiente(s) en el período
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => mover(-1)} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className="min-w-[150px] text-center font-medium">
            {MESES[ancla.mes - 1]} {ancla.anio}
          </span>

          <Button variant="outline" size="icon" onClick={() => mover(1)} aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost" size="sm"
            onClick={() => {
              const [a, m] = hoyISO().split("-").map(Number)
              setAncla({ anio: a, mes: m })
            }}
          >
            Hoy
          </Button>

          <Button size="sm" onClick={() => setCreando(hoy)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Programar
          </Button>
        </div>
      </header>

      {cargando ? (
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b bg-muted/40">
            {DIAS.map((d) => (
              <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {semanas.flat().map((fecha) => {
              const f = iso(fecha)
              const delMes = fecha.getMonth() === ancla.mes - 1
              const esHoy = f === hoy
              const delDia = porDia.get(f) ?? []

              return (
                <button
                  key={f}
                  onClick={() => delDia.length && setDiaAbierto(f)}
                  onDoubleClick={() => setCreando(f)}
                  className={`min-h-[92px] border-b border-r p-1.5 text-left align-top transition-colors last:border-r-0 ${
                    delMes ? "" : "bg-muted/20"
                  } ${delDia.length ? "hover:bg-accent" : ""}`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                        esHoy
                          ? "bg-[var(--chart-1)] font-semibold text-white"
                          : delMes
                            ? "text-foreground"
                            : "text-muted-foreground/50"
                      }`}
                    >
                      {fecha.getDate()}
                    </span>

                    {delDia.length > 2 && (
                      <span className="text-[10px] text-muted-foreground">
                        {delDia.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-0.5">
                    {delDia.slice(0, 2).map((c) => (
                      <div
                        key={c.id}
                        className="truncate rounded px-1 py-0.5 text-[10px] leading-tight"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${COLOR_ESTADO[c.estado]} 14%, transparent)`,
                          color: COLOR_ESTADO[c.estado],
                          textDecoration: c.estado === "cancelada" ? "line-through" : undefined,
                        }}
                        title={c.titulo}
                      >
                        {c.hora_inicio && `${c.hora_inicio.slice(0, 5)} `}
                        {c.prospecto_nombre ?? c.cliente_nombre ?? c.titulo}
                      </div>
                    ))}

                    {delDia.length > 2 && (
                      <div className="px-1 text-[10px] text-muted-foreground">
                        +{delDia.length - 2} más
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </Card>
      )}

      <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(Object.keys(COLOR_ESTADO) as EstadoCita[]).map((e) => (
          <span key={e} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLOR_ESTADO[e] }} />
            {e === "pendiente" ? "Pendiente" : e === "cumplida" ? "Cumplida" : e === "reprogramada" ? "Reprogramada" : "Cancelada"}
          </span>
        ))}
        <span className="ml-auto">Doble clic en un día para programar</span>
      </p>

      {diaAbierto && (
        <DetalleDia
          fecha={diaAbierto}
          citas={porDia.get(diaAbierto) ?? []}
          onCerrar={() => setDiaAbierto(null)}
          onProgramar={() => {
            setCreando(diaAbierto)
            setDiaAbierto(null)
          }}
        />
      )}

      {creando && (
        <FormularioCita
          fecha={creando}
          empresaId={empresaId}
          usuario={profile?.usuario ?? "desconocido"}
          onCerrar={() => setCreando(null)}
          onGuardado={() => {
            setCreando(null)
            cargar()
          }}
        />
      )}
    </div>
  )
}

/** ISO local, sin pasar por UTC: toISOString correría el día. */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function DetalleDia({
  fecha, citas, onCerrar, onProgramar,
}: {
  fecha: string
  citas: Cita[]
  onCerrar: () => void
  onProgramar: () => void
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{formatearISO(fecha)}</DialogTitle>
          <DialogDescription>
            {citas.length} compromiso{citas.length === 1 ? "" : "s"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {citas.map((c) => {
            const Icono = ICONO_TIPO[c.tipo] ?? CalendarDays
            return (
              <div key={c.id} className="flex items-start gap-3 rounded-lg border p-3">
                <span
                  className="mt-0.5 rounded-lg p-1.5"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${COLOR_ESTADO[c.estado]} 14%, transparent)`,
                    color: COLOR_ESTADO[c.estado],
                  }}
                >
                  <Icono className="h-3.5 w-3.5" aria-hidden="true" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{c.titulo}</p>
                  {(c.prospecto_nombre || c.cliente_nombre) && (
                    <p className="text-xs text-muted-foreground">
                      {c.prospecto_nombre ?? c.cliente_nombre}
                    </p>
                  )}
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    {c.hora_inicio && <span>{c.hora_inicio.slice(0, 5)}</span>}
                    {c.direccion && <span className="truncate">· {c.direccion}</span>}
                  </p>
                </div>

                <Badge
                  variant="outline"
                  className="shrink-0 text-[10px]"
                  style={{ borderColor: COLOR_ESTADO[c.estado], color: COLOR_ESTADO[c.estado] }}
                >
                  {c.estado === "pendiente" && <CalendarClock className="mr-0.5 h-2.5 w-2.5" />}
                  {c.estado === "cumplida" && <CheckCircle2 className="mr-0.5 h-2.5 w-2.5" />}
                  {c.estado}
                </Badge>
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onProgramar}>
            <Plus className="mr-1.5 h-4 w-4" />
            Programar otra
          </Button>
          <Button onClick={onCerrar}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FormularioCita({
  fecha, empresaId, usuario, onCerrar, onGuardado,
}: {
  fecha: string
  empresaId: number
  usuario: string
  onCerrar: () => void
  onGuardado: () => void
}) {
  const [clientes, setClientes] = useState<ClienteCrm[]>([])
  const [prospectos, setProspectos] = useState<ProspectoConEtapa[]>([])
  const [titulo, setTitulo] = useState("")
  const [tipo, setTipo] = useState("visita")
  const [cuando, setCuando] = useState(fecha)
  const [hora, setHora] = useState("")
  const [vinculo, setVinculo] = useState(SIN_VINCULO)
  const [direccion, setDireccion] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    Promise.all([getClientesCrm(empresaId), getProspectos(empresaId)]).then(([cRes, pRes]) => {
      if (cRes.success) setClientes(cRes.data ?? [])
      if (pRes.success) setProspectos(pRes.data ?? [])
    })
  }, [empresaId])

  const guardar = async () => {
    if (!titulo.trim()) {
      toast({ title: "Escribe de qué se trata", variant: "destructive" })
      return
    }

    // El vínculo se codifica como "p:12" o "c:34" para poder usar un solo
    // selector con prospectos y clientes juntos.
    const [clase, id] = vinculo === SIN_VINCULO ? ["", ""] : vinculo.split(":")

    setGuardando(true)
    const res = await crearCita(
      {
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || undefined,
        tipo,
        fecha: cuando,
        hora_inicio: hora || null,
        prospecto_id: clase === "p" ? Number(id) : null,
        cliente_id: clase === "c" ? Number(id) : null,
        direccion: direccion.trim() || null,
      },
      usuario,
      empresaId,
    )
    setGuardando(false)

    if (!res.success) {
      toast({ title: "No se pudo programar", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: "Programada", description: formatearISO(cuando) })
    onGuardado()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Programar compromiso</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-sm">¿De qué se trata? *</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Llevar muestra, cobrar factura…"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">¿Con quién?</Label>
            <Select
              value={vinculo}
              onValueChange={(v) => {
                setVinculo(v)
                // Se autocompleta la dirección: quien programa una visita no
                // debería tener que buscarla en otra pantalla.
                if (v === SIN_VINCULO) return
                const [clase, id] = v.split(":")
                if (clase === "p") {
                  const p = prospectos.find((x) => x.id === Number(id))
                  if (p?.direccion) setDireccion(p.direccion)
                }
              }}
            >
              <SelectTrigger><SelectValue placeholder="Sin vincular" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_VINCULO}>Sin vincular</SelectItem>

                {prospectos.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Prospectos</div>
                    {prospectos.slice(0, 50).map((p) => (
                      <SelectItem key={`p${p.id}`} value={`p:${p.id}`}>
                        {p.razon_social}
                      </SelectItem>
                    ))}
                  </>
                )}

                {clientes.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Clientes</div>
                    {clientes.slice(0, 50).map((c) => (
                      <SelectItem key={`c${c.id}`} value={`c:${c.id}`}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm">Fecha</Label>
              <DatePickerField value={cuando} onChange={setCuando} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Hora</Label>
              <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_CITA.map((t) => (
                  <SelectItem key={t.valor} value={t.valor}>{t.etiqueta}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Dirección</Label>
            <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Notas</Label>
            <Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Programar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CalendarioVisitas
