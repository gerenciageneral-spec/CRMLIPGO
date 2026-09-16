"use client"

// PROGRAMACIÓN DEL PERSONAL — vista de quincena.
//
// Tres pestañas sobre la misma quincena:
//  · Cobertura        — cuánta gente se necesita por puesto y turno vs cuánta hay
//  · Equipos y patrones — grupos de trabajo y su rotación
//  · Detalle por persona — la grilla persona × día
//
// Convive con la programación diaria que ya existe: esta vista LEE la quincena
// completa y permite quitar asignaciones; para crear turnos se sigue usando la
// pestaña diaria, que es la que conoce las reglas de inserción.

import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Moon,
  Search,
  Users,
} from "lucide-react"
import {
  borrarAsignacion,
  getProgramacionQuincena,
  guardarDemanda,
} from "@/lib/programacion-quincena-actions"
import type { ProgramacionQuincenaData, TurnoDef } from "@/lib/programacion-quincena-tipos"

const NUM = new Intl.NumberFormat("es-CO")

function hoyColombia(): Date {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
  const [a, m, d] = s.split("-").map(Number)
  return new Date(a, m - 1, d)
}

/** Ficha de un turno en la cabecera. */
function FichaTurno({ t }: { t: TurnoDef }) {
  return (
    <div className="min-w-[210px] flex-1 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="rounded px-1.5 py-0.5 font-mono text-[10px] font-medium text-white"
            style={{ background: t.color ?? "#0d9488" }}
          >
            {t.codigo}
          </span>
          <span className="text-sm font-medium">{t.nombre}</span>
        </div>
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{t.horas} h</span>
      </div>
      <p className="mt-1.5 font-mono text-xs text-muted-foreground">
        {t.horaInicio} — {t.horaFin}
        {t.descansoMin > 0 ? ` · ${t.descansoMin} min de descanso` : ""}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {t.horasNocturnas > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700"
            title="Estimado de pantalla. El sistema todavía no liquida el recargo nocturno."
          >
            <Moon className="h-3 w-3" />
            {t.horasNocturnas} h en franja nocturna
          </span>
        )}
        {t.horas - t.horasNocturnas > 0 && (
          <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700">
            {Math.round((t.horas - t.horasNocturnas) * 10) / 10} h diurnas
          </span>
        )}
      </div>
    </div>
  )
}

export function ProgramacionQuincena() {
  const { toast } = useToast()
  const { selectedEmpresaId } = useAuth()

  const inicial = hoyColombia()
  const [anio, setAnio] = useState(inicial.getFullYear())
  const [mes, setMes] = useState(inicial.getMonth() + 1)
  const [quincena, setQuincena] = useState<1 | 2>(inicial.getDate() <= 15 ? 1 : 2)

  const [data, setData] = useState<ProgramacionQuincenaData | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [buscar, setBuscar] = useState("")
  const [equipoFiltro, setEquipoFiltro] = useState<number | null>(null)
  const [editDemanda, setEditDemanda] = useState<{ puesto: string; turno: string; valor: string } | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    const r = await getProgramacionQuincena(selectedEmpresaId ?? null, anio, mes, quincena)
    if (r.success && r.data) setData(r.data)
    else {
      setData(null)
      setError(r.message ?? "No se pudo cargar la programación.")
    }
    setCargando(false)
  }, [selectedEmpresaId, anio, mes, quincena])

  useEffect(() => {
    cargar()
  }, [cargar])

  function mover(delta: number) {
    let q = quincena === 1 ? 2 : 1
    let m = mes
    let a = anio
    if (delta > 0 && quincena === 2) { m = mes === 12 ? 1 : mes + 1; if (mes === 12) a = anio + 1 }
    if (delta < 0 && quincena === 1) { m = mes === 1 ? 12 : mes - 1; if (mes === 1) a = anio - 1 }
    setQuincena(q as 1 | 2); setMes(m); setAnio(a)
  }

  const personasFiltradas = useMemo(() => {
    if (!data) return []
    const t = buscar.trim().toLowerCase()
    return data.personas.filter((p) => {
      if (equipoFiltro != null && p.equipoId !== equipoFiltro) return false
      return !t || p.nombre.toLowerCase().includes(t) || p.identificacion.includes(t)
    })
  }, [data, buscar, equipoFiltro])

  async function quitar(id: number, nombre: string, fecha: string) {
    if (!selectedEmpresaId) return
    const r = await borrarAsignacion(selectedEmpresaId, id)
    if (!r.success) {
      toast({ title: "No se pudo quitar", description: r.message, variant: "destructive" })
      return
    }
    toast({ title: "Asignación retirada", description: `${nombre} · ${fecha}` })
    cargar()
  }

  async function guardarReq() {
    if (!editDemanda || !selectedEmpresaId) return
    const r = await guardarDemanda({
      empresaId: selectedEmpresaId,
      puesto: editDemanda.puesto,
      turnoCodigo: editDemanda.turno,
      requeridos: Number(editDemanda.valor) || 0,
    })
    if (!r.success) {
      toast({ title: "No se pudo guardar", description: r.message, variant: "destructive" })
      return
    }
    setEditDemanda(null)
    cargar()
  }

  if (cargando) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </p>
        </div>
      </div>
    )
  }

  const d = data

  return (
    <div className="space-y-4 p-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Turnos</p>
          <h1 className="text-xl font-semibold">Programación del personal</h1>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border px-1 py-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => mover(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="px-2 text-center">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Quincena</p>
            <p className="text-sm font-medium">
              {d.quincena.etiqueta} {d.quincena.anio}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => mover(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Falta el script: se dice, no se muestra una grilla vacía */}
      {d.faltaMigracion && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Falta correr <code className="font-mono text-xs">scripts/add_programacion_turnos_quincena.sql</code>
          </p>
          <p className="mt-1 text-xs">
            Sin él no existen los turnos con nombre, los equipos ni la demanda por puesto. La grilla
            de abajo funciona igual, pero sin poder reconocer a qué turno pertenece cada horario.
          </p>
        </div>
      )}

      {d.avisos.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {d.avisos.map((a) => (
            <p key={a} className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {a}
            </p>
          ))}
        </div>
      )}

      {/* HORARIOS DE TURNO — cabecera común a las tres vistas */}
      {d.turnos.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Horarios de turno</h2>
              <p className="text-xs text-muted-foreground">
                Definen la jornada de cada turno y cuántas horas caen en franja nocturna.
              </p>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">
              Franja nocturna 19:00–06:00
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {d.turnos.map((t) => (
              <FichaTurno key={t.id} t={t} />
            ))}
          </div>

          {/* Lo que el sistema NO calcula todavía. Se dice aquí y no se simula. */}
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            <p className="flex items-start gap-1.5 text-[11px] text-slate-700">
              <Moon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Las <strong>{d.totales.horasNocturnasEstimadas} h</strong> en franja nocturna de esta
                quincena son un <strong>estimado de esta pantalla</strong>. El recargo nocturno
                todavía no se liquida: la nómina calcula horas extra diurnas y festivas, y las
                columnas de recargo nocturno siguen en cero. Mientras eso siga así, aquí no se
                muestra un valor en pesos que la nómina no respalda.
              </span>
            </p>
          </div>
        </section>
      )}

      <Tabs defaultValue="cobertura">
        <TabsList>
          <TabsTrigger value="cobertura">Cobertura</TabsTrigger>
          <TabsTrigger value="equipos">Equipos y patrones</TabsTrigger>
          <TabsTrigger value="detalle">Detalle por persona</TabsTrigger>
        </TabsList>

        {/* ---------------- COBERTURA ---------------- */}
        <TabsContent value="cobertura" className="pt-3">
          <section className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Demanda por puesto</h2>
                <p className="text-xs text-muted-foreground">
                  Cuánta gente necesitas por turno, no quién va cada día.
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> cubierto
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> parcial
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-500" /> déficit
                </span>
              </div>
            </div>

            {d.cobertura.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  Todavía no has definido cuánta gente requiere cada puesto.
                </p>
                <p className="mx-auto mt-1 max-w-lg text-xs text-muted-foreground">
                  Esa información no existe hoy en el sistema: no se puede deducir de lo programado,
                  porque lo programado es lo que hubo, no lo que se necesitaba. Defínela una vez y la
                  cobertura se calcula sola cada quincena.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium">
                        Puesto · turno
                      </th>
                      {d.dias.map((dd) => (
                        <th
                          key={dd.fecha}
                          className={`px-1 py-2 text-center font-medium ${dd.esFestivo ? "bg-amber-50" : dd.esDomingo ? "bg-muted/50" : ""}`}
                        >
                          <span className="block text-[10px] text-muted-foreground">{dd.diaSemana}</span>
                          <span className="block">{dd.diaMes}</span>
                          {dd.esFestivo && (
                            <span className="block text-[8px] uppercase text-amber-700">festivo</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.cobertura.map((f) => (
                      <tr key={`${f.puesto}|${f.turnoCodigo}`} className="border-b border-border last:border-0">
                        <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                          <span className="flex items-center gap-1.5">
                            <span className="rounded bg-muted px-1 font-mono text-[10px]">
                              {f.turnoCodigo}
                            </span>
                            <span className="font-medium">{f.puesto}</span>
                          </span>
                          <button
                            type="button"
                            className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                            onClick={() =>
                              setEditDemanda({
                                puesto: f.puesto,
                                turno: f.turnoCodigo,
                                valor: String(f.requeridosBase),
                              })
                            }
                          >
                            requiere {f.requeridosBase} · cambiar
                          </button>
                        </td>
                        {f.dias.map((c) => (
                          <td key={c.fecha} className="px-1 py-1.5 text-center">
                            <span
                              className="inline-block rounded px-1 py-0.5 font-mono text-[10px] tabular-nums"
                              style={{
                                background:
                                  c.estado === "cubierto" ? "#dcfce7"
                                  : c.estado === "parcial" ? "#fef3c7"
                                  : c.estado === "deficit" ? "#fee2e2" : "transparent",
                                color:
                                  c.estado === "cubierto" ? "#166534"
                                  : c.estado === "parcial" ? "#92400e"
                                  : c.estado === "deficit" ? "#991b1b" : "inherit",
                              }}
                            >
                              {c.asignados}/{c.requeridos}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {editDemanda && (
              <div className="flex flex-wrap items-end gap-2 border-t border-border bg-muted/30 px-4 py-3">
                <div>
                  <label className="block text-[11px] text-muted-foreground">
                    {editDemanda.puesto} · {editDemanda.turno}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={editDemanda.valor}
                    onChange={(e) => setEditDemanda({ ...editDemanda, valor: e.target.value })}
                    className="mt-1 h-8 w-28 text-sm"
                  />
                </div>
                <Button size="sm" onClick={guardarReq}>Guardar</Button>
                <Button size="sm" variant="outline" onClick={() => setEditDemanda(null)}>
                  Cancelar
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Aplica a todos los días de la quincena.
                </p>
              </div>
            )}
          </section>
        </TabsContent>

        {/* ---------------- EQUIPOS Y PATRONES ---------------- */}
        <TabsContent value="equipos" className="pt-3">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Equipos</h2>
                <p className="text-xs text-muted-foreground">
                  Un patrón aplica a todo el grupo de una vez.
                </p>
              </div>
              {d.equipos.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Todavía no hay equipos. Hoy la gente solo se agrupa por empresa y por puesto.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {d.equipos.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
                        style={{ background: e.color ?? "#0d9488" }}
                      >
                        {e.nombre.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{e.nombre}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {e.integrantes} {e.integrantes === 1 ? "persona" : "personas"}
                          {e.area ? ` · ${e.area}` : ""}
                          {e.patronNombre ? ` · ${e.patronNombre}` : " · sin patrón"}
                        </p>
                      </div>
                      {e.horasSemana != null && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                          {e.horasSemana} h/sem
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Patrones de rotación</h2>
                <p className="text-xs text-muted-foreground">
                  La secuencia se repite a lo largo de la quincena.
                </p>
              </div>
              {d.patrones.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No hay patrones definidos.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {d.patrones.map((pt) => (
                    <li key={pt.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{pt.nombre}</p>
                        {pt.horasSemana != null && (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                            {pt.horasSemana} h/sem
                          </span>
                        )}
                      </div>
                      {pt.descripcion && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{pt.descripcion}</p>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {pt.secuencia.map((c, i) => (
                          <span
                            key={i}
                            className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                            style={{
                              background:
                                c === "D" ? "#f1f5f9"
                                : d.turnos.find((t) => t.codigo === c)?.color ?? "#0d9488",
                              color: c === "D" ? "#64748b" : "#fff",
                            }}
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-border px-4 py-2.5">
                <p className="text-[11px] text-muted-foreground">
                  Las horas por semana son las <strong>declaradas</strong> en cada patrón. El sistema
                  no valida el límite legal todavía: no calcula la jornada real de cada persona.
                </p>
              </div>
            </section>
          </div>
        </TabsContent>

        {/* ---------------- DETALLE POR PERSONA ---------------- */}
        <TabsContent value="detalle" className="pt-3">
          <section className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Detalle por persona</h2>
                <p className="text-xs text-muted-foreground">
                  {NUM.format(personasFiltradas.length)} de {NUM.format(d.totales.personas)} personas ·{" "}
                  {NUM.format(d.totales.diasProgramados)} turnos ·{" "}
                  {NUM.format(d.totales.horasProgramadas)} h programadas
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {d.equipos.length > 0 && (
                  <select
                    value={equipoFiltro ?? ""}
                    onChange={(e) => setEquipoFiltro(e.target.value ? Number(e.target.value) : null)}
                    className="h-8 rounded border bg-background px-2 text-xs"
                  >
                    <option value="">Todos los equipos</option>
                    {d.equipos.map((e) => (
                      <option key={e.id} value={e.id}>{e.nombre}</option>
                    ))}
                  </select>
                )}
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar persona…"
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    className="h-8 w-48 pl-7 text-xs"
                  />
                </div>
              </div>
            </div>

            {personasFiltradas.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                No hay personas que coincidan.
              </p>
            ) : (
              <div className="max-h-[560px] overflow-auto">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-20 bg-card">
                    <tr className="border-b border-border">
                      <th className="sticky left-0 z-30 bg-card px-3 py-2 text-left font-medium">
                        Trabajador
                      </th>
                      {d.dias.map((dd) => (
                        <th
                          key={dd.fecha}
                          className={`min-w-[38px] px-1 py-2 text-center font-medium ${dd.esFestivo ? "bg-amber-50" : dd.esDomingo ? "bg-muted/50" : ""}`}
                        >
                          <span className="block text-[10px] text-muted-foreground">{dd.diaSemana}</span>
                          <span className="block">{dd.diaMes}</span>
                        </th>
                      ))}
                      <th className="px-2 py-2 text-right font-medium">Horas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {personasFiltradas.map((per) => (
                      <tr key={per.identificacion} className="border-b border-border last:border-0">
                        <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                          <p className="max-w-[220px] truncate font-medium">{per.nombre}</p>
                          <p className="truncate font-mono text-[10px] text-muted-foreground">
                            {per.identificacion}
                            {per.equipoNombre ? ` · ${per.equipoNombre}` : ""}
                          </p>
                        </td>
                        {d.dias.map((dd) => {
                          const c = per.dias[dd.fecha]
                          const turno = c?.turnoCodigo
                            ? d.turnos.find((t) => t.codigo === c.turnoCodigo)
                            : null
                          return (
                            <td
                              key={dd.fecha}
                              className={`px-0.5 py-1 text-center ${dd.esFestivo ? "bg-amber-50/50" : dd.esDomingo ? "bg-muted/30" : ""}`}
                            >
                              {!c ? (
                                <span className="text-muted-foreground/40">·</span>
                              ) : c.novedad ? (
                                <span
                                  title={c.novedad}
                                  className="inline-block max-w-[34px] truncate rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-600"
                                >
                                  {c.novedad.replace(/^\d+-\s*/, "").slice(0, 4)}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  title={`${c.puesto ?? ""} ${c.horaEntrada ?? ""}-${c.horaSalida ?? ""}${c.marco ? " · ya marcó" : ""} — clic para quitar`}
                                  onClick={() => c.id && quitar(c.id, per.nombre, dd.fecha)}
                                  className="inline-block rounded px-1 py-0.5 font-mono text-[10px] text-white hover:opacity-80"
                                  style={{ background: turno?.color ?? "#64748b" }}
                                >
                                  {turno?.codigo ?? (c.horaEntrada ? c.horaEntrada.slice(0, 2) : "?")}
                                </button>
                              )}
                            </td>
                          )
                        })}
                        <td className="px-2 py-1.5 text-right">
                          <span className="font-medium tabular-nums">{per.horasQuincena} h</span>
                          <span className="block text-[10px] text-muted-foreground">
                            {per.diasConTurno} {per.diasConTurno === 1 ? "turno" : "turnos"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="border-t border-border px-4 py-2.5">
              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Clic en un turno para quitarlo. <strong>No hay borrador</strong>: lo que se ve aquí
                  ya está en nómina y facturación. Para asignar turnos usa la pestaña de programación
                  diaria, que aplica las reglas de inserción.
                </span>
              </p>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default ProgramacionQuincena
