"use client"

// Submódulo "Asistencia Administrativa" (Relaciones Laborales y Ausentismo):
// permite registrar/corregir asistencia y novedades para CUALQUIER fecha
// (pasada o futura), para personal operativo (tapar huecos de captura) y
// administrativo (headcount.admin=true, sin flujo de turnos propio). Ver
// lib/asistencia-administrativa-actions.ts para el porqué de fondo.

import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CalendarIcon, Search, Loader2, CheckCircle2, AlertCircle, Info } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
  getPersonasAsistenciaAdministrativa,
  getHistorialAsistenciaPersona,
  getEstadoHoyAdministrativos,
  upsertAsistenciaDia,
  completarQuincenaAdministrativos,
  type PersonaAsistenciaAdmin,
  type FilaHistorialAsistencia,
  type EstadoHoyAdministrativo,
} from "@/lib/asistencia-administrativa-actions"
import { NOVEDADES_DIA, OPERACIONES_OPTIONS, ESPECIALIDADES_OPTIONS } from "@/lib/asistencia-catalogos"

const toISO = (d: Date) => d.toISOString().slice(0, 10)

export default function AsistenciaAdministrativa() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()

  const [personas, setPersonas] = useState<PersonaAsistenciaAdmin[]>([])
  const [loadingPersonas, setLoadingPersonas] = useState(true)
  const [busqueda, setBusqueda] = useState("")
  // Por defecto solo Administrativos: es el caso de uso más frecuente de este
  // módulo (el personal operativo normal ya se ve en Tabla Asistencia). "Todos"
  // sigue disponible para el backfill de operativos sin captura.
  const [filtroTipo, setFiltroTipo] = useState<"administrativos" | "operativos" | "todos">("administrativos")
  const [seleccionada, setSeleccionada] = useState<PersonaAsistenciaAdmin | null>(null)

  const [historial, setHistorial] = useState<FilaHistorialAsistencia[]>([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  const [tipo, setTipo] = useState<"TRABAJADO" | "NOVEDAD">("TRABAJADO")
  const [puesto, setPuesto] = useState<string>("")
  const [novedad, setNovedad] = useState<string>("")
  const [fechaInicio, setFechaInicio] = useState<Date | undefined>(new Date())
  const [fechaFin, setFechaFin] = useState<Date | undefined>(undefined)
  const [usarRango, setUsarRango] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // Horas extra (solo operativo, día único -- ver lib/asistencia-administrativa-actions.ts).
  const [modoHorasExtra, setModoHorasExtra] = useState<"ninguna" | "horario" | "manual">("ninguna")
  const [horaIngreso, setHoraIngreso] = useState("")
  const [horaSalida, setHoraSalida] = useState("")
  const [horaEntradaProgramada, setHoraEntradaProgramada] = useState("")
  const [horaSalidaProgramada, setHoraSalidaProgramada] = useState("")
  const [hed, setHed] = useState("")
  const [hedf, setHedf] = useState("")
  const [aprobarHorasExtra, setAprobarHorasExtra] = useState(false)

  // Estado de HOY para administrativos: el registro debe ser DIARIO (a
  // pedido del usuario), no acumulado para fin de mes -- esto da
  // visibilidad de quién falta marcar sin tener que buscarlo uno por uno.
  const [estadoHoy, setEstadoHoy] = useState<EstadoHoyAdministrativo[]>([])
  const [loadingEstadoHoy, setLoadingEstadoHoy] = useState(true)
  const [marcandoHoy, setMarcandoHoy] = useState<string | null>(null)
  const [completandoQuincena, setCompletandoQuincena] = useState(false)

  const cargarEstadoHoy = () => {
    if (!selectedEmpresaId) return
    setLoadingEstadoHoy(true)
    getEstadoHoyAdministrativos(selectedEmpresaId)
      .then((r) => {
        if (r.success) setEstadoHoy(r.data)
        else toast({ title: "Error", description: r.message, variant: "destructive" })
      })
      .finally(() => setLoadingEstadoHoy(false))
  }

  useEffect(() => {
    if (!selectedEmpresaId) return
    setLoadingPersonas(true)
    getPersonasAsistenciaAdministrativa(selectedEmpresaId)
      .then((r) => {
        if (r.success) setPersonas(r.data)
        else toast({ title: "Error", description: r.message, variant: "destructive" })
      })
      .finally(() => setLoadingPersonas(false))
    cargarEstadoHoy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId, toast])

  const marcarTrabajadoHoy = async (p: EstadoHoyAdministrativo) => {
    if (!selectedEmpresaId) return
    setMarcandoHoy(p.identificacion)
    const r = await upsertAsistenciaDia({
      empresaId: selectedEmpresaId,
      identificacion: p.identificacion,
      nombre: p.nombre,
      fechaInicio: toISO(new Date()),
      tipo: "TRABAJADO",
      esAdministrativo: true,
    })
    setMarcandoHoy(null)
    if (!r.success) {
      toast({ title: "Error", description: r.message, variant: "destructive" })
      return
    }
    toast({ title: "Marcado", description: `${p.nombre}: día de hoy registrado.` })
    cargarEstadoHoy()
    if (seleccionada?.identificacion === p.identificacion) cargarHistorial(p.identificacion)
  }

  const completarQuincena = async () => {
    if (!selectedEmpresaId) return
    if (!confirm("¿Completar la quincena en curso para TODOS los administrativos activos? Solo se llenan los días que no tengan ningún registro -- nunca se toca un día que ya tenga algo (novedad, turno, lo que sea).")) return
    setCompletandoQuincena(true)
    const r = await completarQuincenaAdministrativos(selectedEmpresaId)
    setCompletandoQuincena(false)
    if (!r.success) {
      toast({ title: "Error", description: r.message, variant: "destructive" })
      return
    }
    if (r.diasCompletados === 0) {
      toast({ title: "Sin novedad", description: "La quincena ya estaba completa para todos los administrativos." })
    } else {
      toast({
        title: "Quincena completada",
        description: `${r.diasCompletados} día(s) marcado(s) en ${r.personasCompletadas} persona(s) (período ${r.periodo?.desde} a ${r.periodo?.hasta}).`,
      })
    }
    cargarEstadoHoy()
  }

  const cargarHistorial = (identificacion: string) => {
    if (!selectedEmpresaId) return
    setLoadingHistorial(true)
    getHistorialAsistenciaPersona(selectedEmpresaId, identificacion)
      .then((r) => {
        if (r.success) setHistorial(r.data)
        else toast({ title: "Error", description: r.message, variant: "destructive" })
      })
      .finally(() => setLoadingHistorial(false))
  }

  const seleccionarPersona = (p: PersonaAsistenciaAdmin) => {
    setSeleccionada(p)
    setBusqueda("")
    setPuesto("")
    setNovedad("")
    setTipo("TRABAJADO")
    setModoHorasExtra("ninguna")
    setHoraIngreso(""); setHoraSalida(""); setHoraEntradaProgramada(""); setHoraSalidaProgramada("")
    setHed(""); setHedf(""); setAprobarHorasExtra(false)
    cargarHistorial(p.identificacion)
  }

  const esRetiro = tipo === "NOVEDAD" && novedad.toLowerCase().includes("retiro")
  const usaHorasExtra = tipo === "TRABAJADO" && modoHorasExtra !== "ninguna"
  // Mismo criterio que la server action: retiro y horas extra nunca aplican
  // a un rango de fechas.
  const rangoDeshabilitado = esRetiro || usaHorasExtra

  const resultadosBusqueda = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return personas
      .filter((p) => filtroTipo === "todos" || (filtroTipo === "administrativos" ? p.admin : !p.admin))
      .filter((p) => !q || p.nombre.toLowerCase().includes(q) || p.identificacion.includes(q))
      .slice(0, 50)
  }, [busqueda, personas, filtroTipo])

  const handleGuardar = async () => {
    if (!seleccionada || !selectedEmpresaId || !fechaInicio) return
    if (tipo === "NOVEDAD" && !novedad) {
      toast({ title: "Falta la novedad", description: "Selecciona qué novedad aplicar.", variant: "destructive" })
      return
    }
    if (tipo === "TRABAJADO" && !seleccionada.admin && !puesto) {
      toast({ title: "Falta el puesto", description: "Selecciona qué puesto trabajó ese día.", variant: "destructive" })
      return
    }
    if (usaHorasExtra && seleccionada.admin) {
      toast({ title: "No aplica", description: "Las horas extra son solo para personal operativo.", variant: "destructive" })
      return
    }
    setGuardando(true)
    const r = await upsertAsistenciaDia({
      empresaId: selectedEmpresaId,
      identificacion: seleccionada.identificacion,
      nombre: seleccionada.nombre,
      fechaInicio: toISO(fechaInicio),
      fechaFin: usarRango && fechaFin && !rangoDeshabilitado ? toISO(fechaFin) : undefined,
      tipo,
      novedad: tipo === "NOVEDAD" ? (novedad as any) : undefined,
      puesto: tipo === "TRABAJADO" ? puesto : undefined,
      esAdministrativo: seleccionada.admin,
      horaIngreso: modoHorasExtra === "horario" ? horaIngreso || undefined : undefined,
      horaSalida: modoHorasExtra === "horario" ? horaSalida || undefined : undefined,
      horaEntradaProgramada: modoHorasExtra === "horario" ? horaEntradaProgramada || undefined : undefined,
      horaSalidaProgramada: modoHorasExtra === "horario" ? horaSalidaProgramada || undefined : undefined,
      hed: modoHorasExtra === "manual" && hed !== "" ? Number(hed) : undefined,
      hedf: modoHorasExtra === "manual" && hedf !== "" ? Number(hedf) : undefined,
      aprobarHorasExtra: usaHorasExtra ? aprobarHorasExtra : undefined,
    })
    setGuardando(false)
    if (!r.success) {
      toast({ title: "Error", description: r.message, variant: "destructive" })
      return
    }
    toast({ title: "Guardado", description: `${r.diasAfectados ?? 0} día(s) actualizado(s).` })
    if (r.diasOmitidos?.length) {
      toast({
        title: "Días omitidos (multi-turno)",
        description: `Corrígelos aparte desde Tabla Asistencia/Visor: ${r.diasOmitidos.join(", ")}`,
        variant: "destructive",
      })
    }
    cargarHistorial(seleccionada.identificacion)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Asistencia Administrativa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Registra o corrige asistencia y novedades para cualquier fecha (pasada o futura) — para personal
              operativo sin captura, o para personal administrativo, que no pasa por Tabla Asistencia.
            </AlertDescription>
          </Alert>

          {/* Pendientes de hoy: la asistencia administrativa se registra a
              DIARIO, no acumulada a fin de mes -- esto da visibilidad
              inmediata de a quién le falta el día de hoy. */}
          {loadingEstadoHoy ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando asistencia de hoy...
            </div>
          ) : estadoHoy.length > 0 && (
            <div
              className={`space-y-2 rounded-lg border p-3 ${
                estadoHoy.some((p) => !p.tieneHoy) ? "border-amber-300 bg-amber-50" : "border-green-300 bg-green-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {estadoHoy.some((p) => !p.tieneHoy) ? (
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                  <p className="text-sm font-medium">
                    {estadoHoy.every((p) => p.tieneHoy)
                      ? `Asistencia de hoy completa (${estadoHoy.length}/${estadoHoy.length} administrativos)`
                      : `Faltan ${estadoHoy.filter((p) => !p.tieneHoy).length} de ${estadoHoy.length} administrativos por marcar hoy`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={completandoQuincena}
                  onClick={completarQuincena}
                  title="Llena, para todos los administrativos activos, los días de la quincena en curso que no tengan ningún registro -- nunca toca un día que ya tenga algo"
                >
                  {completandoQuincena && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  Completar quincena
                </Button>
              </div>
              {estadoHoy.some((p) => !p.tieneHoy) && (
                <div className="space-y-1">
                  {estadoHoy
                    .filter((p) => !p.tieneHoy)
                    .map((p) => (
                      <div key={p.identificacion} className="flex items-center justify-between gap-2 rounded-md bg-white/70 px-2 py-1">
                        <span className="text-sm">
                          {p.nombre} <span className="text-xs text-muted-foreground">({p.identificacion})</span>
                        </span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={marcandoHoy === p.identificacion}
                            onClick={() => marcarTrabajadoHoy(p)}
                          >
                            {marcandoHoy === p.identificacion && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                            Marcar trabajado hoy
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => seleccionarPersona(p)}>
                            Registrar novedad
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Selector de persona */}
          <div className="space-y-2">
            <Label>Persona</Label>
            {seleccionada ? (
              <div className="flex items-center gap-2 rounded-md border border-border p-2">
                <span className="font-medium">{seleccionada.nombre}</span>
                <span className="text-sm text-muted-foreground">{seleccionada.identificacion}</span>
                <Badge variant={seleccionada.admin ? "secondary" : "outline"}>
                  {seleccionada.admin ? "Administrativo" : "Operativo"}
                </Badge>
                <Badge className={String(seleccionada.estado).toUpperCase() === "ACTIVO" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                  {seleccionada.estado || "—"}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => setSeleccionada(null)}>
                  Cambiar
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={filtroTipo === "administrativos" ? "default" : "outline"}
                    onClick={() => setFiltroTipo("administrativos")}
                  >
                    Administrativos
                  </Button>
                  <Button
                    size="sm"
                    variant={filtroTipo === "operativos" ? "default" : "outline"}
                    onClick={() => setFiltroTipo("operativos")}
                  >
                    Operativos
                  </Button>
                  <Button size="sm" variant={filtroTipo === "todos" ? "default" : "outline"} onClick={() => setFiltroTipo("todos")}>
                    Todos
                  </Button>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder={loadingPersonas ? "Cargando personal..." : "Filtrar por nombre o cédula (opcional)..."}
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    disabled={loadingPersonas}
                  />
                </div>
                <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                  {loadingPersonas ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    </div>
                  ) : resultadosBusqueda.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Sin personal {filtroTipo === "administrativos" ? "administrativo" : filtroTipo === "operativos" ? "operativo" : ""} que coincida.
                    </p>
                  ) : (
                    resultadosBusqueda.map((p) => (
                      <button
                        key={p.identificacion}
                        className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted"
                        onClick={() => seleccionarPersona(p)}
                      >
                        <span className="flex-1">{p.nombre}</span>
                        <span className="text-xs text-muted-foreground">{p.identificacion}</span>
                        <Badge variant={p.admin ? "secondary" : "outline"} className="text-xs">
                          {p.admin ? "Admin" : "Operativo"}
                        </Badge>
                        <Badge className={`text-xs ${String(p.estado).toUpperCase() === "ACTIVO" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                          {p.estado || "—"}
                        </Badge>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {seleccionada && (
            <>
              {/* Fecha o rango */}
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted p-3">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm">Fecha:</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        {fechaInicio ? format(fechaInicio, "PP", { locale: es }) : "Seleccionar"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={fechaInicio} onSelect={setFechaInicio} locale={es} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex items-center gap-2 border-l pl-3">
                  <input
                    type="checkbox"
                    id="usarRango"
                    checked={usarRango}
                    disabled={rangoDeshabilitado}
                    onChange={(e) => setUsarRango(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="usarRango" className={rangoDeshabilitado ? "text-sm text-muted-foreground" : "text-sm"}>
                    Aplicar a un rango de fechas{rangoDeshabilitado ? " (no disponible para Retiro/Horas extra)" : ""}
                  </Label>
                </div>
                {usarRango && !rangoDeshabilitado && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">hasta</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          {fechaFin ? format(fechaFin, "PP", { locale: es }) : "Fecha fin"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={fechaFin} onSelect={setFechaFin} locale={es} />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>

              {/* Tipo de registro */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-sm">Tipo de registro</Label>
                  <Select value={tipo} onValueChange={(v: any) => setTipo(v)}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TRABAJADO">Trabajado normal</SelectItem>
                      <SelectItem value="NOVEDAD">Novedad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {tipo === "TRABAJADO" && !seleccionada.admin && (
                  <div className="space-y-1">
                    <Label className="text-sm">Puesto</Label>
                    <Select value={puesto} onValueChange={setPuesto}>
                      <SelectTrigger className="w-[260px]">
                        <SelectValue placeholder="Seleccionar puesto" />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERACIONES_OPTIONS.map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                        {ESPECIALIDADES_OPTIONS.map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {tipo === "TRABAJADO" && seleccionada.admin && (
                  <p className="text-sm text-muted-foreground pb-2">Día de salario normal (sin puesto operativo).</p>
                )}

                {tipo === "NOVEDAD" && (
                  <div className="space-y-1">
                    <Label className="text-sm">Novedad</Label>
                    <Select value={novedad} onValueChange={setNovedad}>
                      <SelectTrigger className="w-[320px]">
                        <SelectValue placeholder="Seleccionar novedad" />
                      </SelectTrigger>
                      <SelectContent>
                        {NOVEDADES_DIA.map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Este botón cubre Novedad (cualquiera) y Trabajado+Administrativo.
                    Trabajado+Operativo tiene su propio botón más abajo, junto al
                    bloque de horas extra. */}
                {!(tipo === "TRABAJADO" && !seleccionada.admin) && (
                  <Button onClick={handleGuardar} disabled={guardando}>
                    {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Guardar
                  </Button>
                )}
              </div>

              {/* Horas extra: solo operativo, tipo=TRABAJADO, día único. */}
              {tipo === "TRABAJADO" && !seleccionada.admin && (
                <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                  <Label className="text-sm">Horas extra de ese día (opcional)</Label>
                  <div className="flex flex-wrap gap-3">
                    <Select value={modoHorasExtra} onValueChange={(v: any) => setModoHorasExtra(v)}>
                      <SelectTrigger className="w-[240px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ninguna">Sin horas extra</SelectItem>
                        <SelectItem value="horario">Horario real (calcula solo)</SelectItem>
                        <SelectItem value="manual">Horas manuales (número directo)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {modoHorasExtra === "horario" && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Solo tiene efecto en puestos de especialidad: el sistema calcula las horas extra igual que el
                        flujo normal de campo, con la misma política configurada.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Entrada real</Label>
                          <Input type="time" value={horaIngreso} onChange={(e) => setHoraIngreso(e.target.value)} className="w-[130px]" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Salida real</Label>
                          <Input type="time" value={horaSalida} onChange={(e) => setHoraSalida(e.target.value)} className="w-[130px]" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Entrada programada</Label>
                          <Input type="time" value={horaEntradaProgramada} onChange={(e) => setHoraEntradaProgramada(e.target.value)} className="w-[130px]" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Salida programada</Label>
                          <Input type="time" value={horaSalidaProgramada} onChange={(e) => setHoraSalidaProgramada(e.target.value)} className="w-[130px]" />
                        </div>
                      </div>
                    </div>
                  )}

                  {modoHorasExtra === "manual" && (
                    <div className="flex flex-wrap gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">HED (diurna 25%)</Label>
                        <Input type="number" step="0.01" value={hed} onChange={(e) => setHed(e.target.value)} className="w-[110px]" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">HEDF (dominical/festiva)</Label>
                        <Input type="number" step="0.01" value={hedf} onChange={(e) => setHedf(e.target.value)} className="w-[110px]" />
                      </div>
                    </div>
                  )}

                  {usaHorasExtra && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="aprobarHE"
                        checked={aprobarHorasExtra}
                        onChange={(e) => setAprobarHorasExtra(e.target.checked)}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="aprobarHE" className="text-sm">
                        Aprobar estas horas extra ahora (necesario para que cuenten en nómina)
                      </Label>
                    </div>
                  )}

                  <Button onClick={handleGuardar} disabled={guardando} variant={usaHorasExtra ? "default" : "outline"}>
                    {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Guardar
                  </Button>
                </div>
              )}

              {/* Historial */}
              <div className="space-y-2">
                <Label className="text-sm">Historial (últimos 90 días)</Label>
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Puesto</TableHead>
                        <TableHead>Novedad</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingHistorial ? (
                        <TableRow>
                          <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                          </TableCell>
                        </TableRow>
                      ) : historial.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                            Sin registros en los últimos 90 días.
                          </TableCell>
                        </TableRow>
                      ) : (
                        historial.map((h) => (
                          <TableRow key={h.id}>
                            <TableCell>{h.fecha}</TableCell>
                            <TableCell>{h.puesto || "—"}</TableCell>
                            <TableCell>{h.asistencia || "—"}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
