"use client"

// Análisis de ausentismo desde el CONTROL DIARIO (registroasistencia) = los 4
// proyectos, 2026. Fuente: programación de turnos + tabla/registro de asistencia
// + novedades de personal. La novedad evidencia el tipo: incapacidad (salud),
// falta no médica (lic. no remunerada), planeada (vacaciones/descanso/licencias)
// o retiro. Interactivo: manda el SELECTOR GLOBAL + filtros año/mes + tipo de
// evento; las tarjetas se tocan para ver el detalle (drill-down).

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { SigKpi, SigSection, SigFilterBar, SigField, sigControl } from "@/components/sst/sig-ui"
import { getAnalisisAusentismoDiario, generarBorradoresAusentismoDesdeControl, type AnalisisAusentismo } from "@/lib/ausentismos-actions"
import { Loader2, HeartPulse, CalendarX, UserX, CalendarOff, Activity, CalendarCheck, FilePlus2 } from "lucide-react"
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ComposedChart, Line } from "recharts"

const fmt = (n: any) => (Number(n) || 0).toLocaleString("es-CO")
const MESES = [
  { v: "", l: "Todo el año" }, { v: "01", l: "Enero" }, { v: "02", l: "Febrero" }, { v: "03", l: "Marzo" },
  { v: "04", l: "Abril" }, { v: "05", l: "Mayo" }, { v: "06", l: "Junio" }, { v: "07", l: "Julio" },
  { v: "08", l: "Agosto" }, { v: "09", l: "Septiembre" }, { v: "10", l: "Octubre" }, { v: "11", l: "Noviembre" }, { v: "12", l: "Diciembre" },
]
export function AusentismosAnalisisDiario() {
  const { selectedEmpresaId, selectedEmpresaNombre } = useAuth()
  const { toast } = useToast()
  const [data, setData] = useState<AnalisisAusentismo | null>(null)
  const [loading, setLoading] = useState(true)
  const [anio, setAnio] = useState<string>("")
  const [mes, setMes] = useState<string>("")
  const [drill, setDrill] = useState<{ tipo: string; label: string } | null>(null)
  const [generando, setGenerando] = useState(false)

  async function generarBorradores() {
    if (!selectedEmpresaId) { toast({ title: "Selecciona un cliente/sitio en el selector global" }); return }
    if (!anio) { toast({ title: "Elige un año" }); return }
    if (!confirm(`Generar borradores SST de incapacidades en ausentismosst para ${selectedEmpresaNombre} (${anio}${mes ? "/" + mes : ""}).\n\nSolo crea los MESES INCOMPLETOS (omite los que ya tienen registros). Luego el analista completa diagnóstico/AT-EG/costos.\n\n¿Continuar?`)) return
    setGenerando(true)
    const r = await generarBorradoresAusentismoDesdeControl(selectedEmpresaId, anio, mes || null)
    setGenerando(false)
    if (r.error) { toast({ title: "No se pudo generar", description: r.error }); return }
    toast({ title: `${r.creados} borradores creados`, description: `${r.episodios} episodios · meses omitidos (ya cargados): ${r.mesesOmitidos.join(", ") || "ninguno"}` })
  }

  useEffect(() => {
    let cancel = false
    setLoading(true)
    getAnalisisAusentismoDiario(selectedEmpresaId ?? null, anio || null, mes || null).then((d) => {
      if (cancel) return
      setData(d)
      // Si no hay año elegido, fija el más reciente disponible.
      if (!anio && d.anios.length) setAnio(d.anios[0])
      setLoading(false)
    })
    return () => { cancel = true }
  }, [selectedEmpresaId, anio, mes])

  const eventosDrill = useMemo(() => (drill && data ? data.eventos.filter((e) => e.tipo === drill.tipo) : []), [drill, data])

  if (loading && !data) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: SST_TOKENS.navy }} /></div>
  if (!data) return null
  const r = data.resumen
  const colAus = r.pctAusentismo <= 3 ? SST_TOKENS.ok : r.pctAusentismo <= 5 ? SST_TOKENS.warn : SST_TOKENS.bad
  const colCap = r.pctCapacidadRespuesta <= 3 ? SST_TOKENS.ok : r.pctCapacidadRespuesta <= 5 ? SST_TOKENS.warn : SST_TOKENS.bad

  // Tarjeta tocable (drill-down).
  const Toca = ({ tipo, label, children }: { tipo?: string; label?: string; children: React.ReactNode }) =>
    tipo ? (
      <button type="button" className="text-left transition active:scale-[0.99]" onClick={() => setDrill({ tipo, label: label || tipo })} title="Ver detalle">
        {children}
      </button>
    ) : (<>{children}</>)

  return (
    <div className="space-y-5">
      <SigFilterBar cliente={selectedEmpresaNombre}>
        <SigField label="Año">
          <select value={anio} onChange={(e) => setAnio(e.target.value)} className={sigControl}>
            {data.anios.length === 0 && <option value="">—</option>}
            {data.anios.map((a) => (<option key={a} value={a}>{a}</option>))}
          </select>
        </SigField>
        <SigField label="Mes">
          <select value={mes} onChange={(e) => setMes(e.target.value)} className={sigControl}>
            {MESES.map((m) => (<option key={m.v} value={m.v}>{m.l}</option>))}
          </select>
        </SigField>
        {loading && <Loader2 className="h-4 w-4 animate-spin" style={{ color: SST_TOKENS.teal }} />}
        {selectedEmpresaId && (
          <Button size="sm" variant="outline" disabled={generando} onClick={generarBorradores} title="Crea borradores SST de incapacidades para los meses que aún no están cargados">
            {generando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-1 h-4 w-4" />} Generar borradores SST (meses incompletos)
          </Button>
        )}
        <span className="text-[11px] text-muted-foreground">Sin cliente en el selector = consolidado de los 4 proyectos. Toca una tarjeta para ver el detalle.</span>
      </SigFilterBar>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Toca tipo="incapacidad" label="Ausentismo médico (incapacidad)">
          <SigKpi label="Ausentismo médico" value={`${r.pctAusentismo}%`} Icon={HeartPulse} accent={colAus} valueColor={colAus} sub={`${fmt(r.incapacidadTurnos)} incapacidades vs headcount del período`} />
        </Toca>
        <Toca tipo="incapacidad" label="Ausentismo médico (incapacidad)">
          <SigKpi label="Capacidad de respuesta" value={`${r.pctCapacidadRespuesta}%`} Icon={Activity} accent={colCap} valueColor={colCap} sub="incapacidad / turnos programados (control diario)" />
        </Toca>
        <SigKpi label="Turnos programados" value={fmt(r.programados)} Icon={Activity} accent={SST_TOKENS.navy} sub={`${fmt(r.presentes)} presentes`} />
        <Toca tipo="incapacidad" label="Incapacidad (salud)">
          <SigKpi label="Incapacidad (salud)" value={fmt(r.incapacidadTurnos)} Icon={HeartPulse} accent={SST_TOKENS.bad} valueColor={SST_TOKENS.bad} sub="ver detalle →" />
        </Toca>
        <Toca tipo="falta" label="Falta no médica">
          <SigKpi label="Falta no médica" value={fmt(r.faltaNoMedica)} Icon={CalendarX} accent={SST_TOKENS.warn} valueColor={SST_TOKENS.warn} sub="lic. no remunerada →" />
        </Toca>
        <Toca tipo="planeada" label="Novedades planeadas">
          <SigKpi label="Planeadas" value={fmt(r.planeadas)} Icon={CalendarCheck} accent={SST_TOKENS.ok} sub="vacaciones/licencias →" />
        </Toca>
        <SigKpi label="No programados" value={fmt(r.noProgramados)} Icon={UserX} accent="#7c3aed" sub="sin turno asignado" />
      </div>

      <Card className="p-3">
        <SigSection title="Programados vs incapacidad por mes" />
        <p className="mb-2 text-[11px] text-muted-foreground">Si el volumen baja, los turnos programados bajan (ajuste de planta). La línea es la incapacidad. <b>Nota:</b> Programación de turnos es módulo reciente (~3 meses); meses iniciales pueden estar incompletos (acción de mejora).</p>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data.porMes}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="l" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar yAxisId="l" dataKey="programados" name="Turnos programados" fill={SST_TOKENS.navy} radius={[4, 4, 0, 0]} />
            <Line yAxisId="r" type="monotone" dataKey="incapacidad" name="Incapacidad" stroke={SST_TOKENS.bad} strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-3">
          <SigSection title="Causas / códigos más repetidos" />
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.porCodigo.slice(0, 8)} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="codigo" tick={{ fontSize: 9 }} width={160} />
              <Tooltip />
              <Bar dataKey="turnos" name="Turnos" radius={[0, 4, 4, 0]}>
                {data.porCodigo.slice(0, 8).map((c, i) => (<Cell key={i} fill={c.esIncapacidad ? SST_TOKENS.bad : SST_TOKENS.warn} />))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-3">
          <SigSection title="Trabajadores que más reinciden (incapacidad)" />
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[10px] uppercase text-muted-foreground">
                  <th className="px-2 py-1.5">Colaborador</th>
                  <th className="px-2 py-1.5 text-center">Incapacidad</th>
                  <th className="px-2 py-1.5 text-center">Novedades</th>
                </tr>
              </thead>
              <tbody>
                {data.reincidentes.map((p) => (
                  <tr key={p.identificacion} className="border-b last:border-0">
                    <td className="px-2 py-1.5"><div className="font-medium">{p.nombre}</div><div className="text-[10px] text-muted-foreground">{p.identificacion}</div></td>
                    <td className="px-2 py-1.5 text-center"><Badge style={{ background: p.incapacidades > 0 ? SST_TOKENS.bad : "#94a3b8", color: "white" }}>{p.incapacidades}</Badge></td>
                    <td className="px-2 py-1.5 text-center text-muted-foreground">{p.novedades}</td>
                  </tr>
                ))}
                {data.reincidentes.length === 0 && <tr><td colSpan={3} className="px-2 py-6 text-center text-muted-foreground">Sin novedades en el periodo.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="flex items-start gap-2 rounded-lg border p-3 text-xs text-muted-foreground" style={{ borderColor: `${SST_TOKENS.navy}1f` }}>
        <CalendarOff className="mt-0.5 h-4 w-4 shrink-0" style={{ color: SST_TOKENS.navy }} />
        <span><b>Lectura para auditoría:</b> el ausentismo médico ({r.pctAusentismo}%) mide solo incapacidades sobre el headcount realmente vinculado en el período (fechas de ingreso/retiro), no sobre filas del control diario. La <b>capacidad de respuesta</b> ({r.pctCapacidadRespuesta}%) es un indicador aparte: incapacidad sobre turnos programados, mide qué tanto respondió el personal ya programado. Las faltas <b>no programadas</b> ({fmt(r.noProgramados)}) no son ausentismo (no había turno). La caída de turnos programados mes a mes refleja el ajuste de planta por volumen.</span>
      </div>

      {/* Drill-down: detalle del evento de la tarjeta tocada */}
      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">{drill?.label} · {eventosDrill.length} eventos</DialogTitle></DialogHeader>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[10px] uppercase text-muted-foreground">
                <th className="px-2 py-1.5">Fecha</th>
                <th className="px-2 py-1.5">Colaborador</th>
                <th className="px-2 py-1.5">Novedad</th>
              </tr>
            </thead>
            <tbody>
              {eventosDrill.map((e, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-2 py-1.5 whitespace-nowrap">{e.fecha}</td>
                  <td className="px-2 py-1.5"><div className="font-medium">{e.nombre}</div><div className="text-[10px] text-muted-foreground">{e.identificacion}</div></td>
                  <td className="px-2 py-1.5 text-xs">{e.codigo}</td>
                </tr>
              ))}
              {eventosDrill.length === 0 && <tr><td colSpan={3} className="px-2 py-6 text-center text-muted-foreground">Sin eventos en el periodo/filtro.</td></tr>}
            </tbody>
          </table>
        </DialogContent>
      </Dialog>
    </div>
  )
}
