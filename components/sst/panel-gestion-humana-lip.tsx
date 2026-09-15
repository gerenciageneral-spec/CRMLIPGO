"use client"

// Panel LIP · Gestión Humana — el talento que presta el servicio. En línea.
// Armónico con las 3 normas: ISO 9001 (7.1.2 personas / 7.2 competencia /
// 7.3 toma de conciencia), ISO 45001 (accidentalidad/ausentismo), ISO 14001
// (formación ambiental). Por cliente/sitio. Fuente: headcount, registroasistencia,
// ausentismosst, capacitaciones_evaluacion_intentos.

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { SigHeader, SigFilterBar, SigField, SigKpi, sigControl } from "@/components/sst/sig-ui"
import { useAuth } from "@/components/auth-provider"
import { getPanelGestionHumanaLIP } from "@/lib/sig-actions"
import { Loader2, Users, ShieldCheck, GraduationCap, CalendarCheck, HeartPulse, UserCheck } from "lucide-react"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts"

function KPI({ label, valor, unidad, Icon, color, sub }: { label: string; valor: number | string; unidad?: string; Icon: any; color: string; sub?: string }) {
  return <SigKpi label={label} value={valor} unit={unidad} Icon={Icon} accent={color} valueColor={color} sub={sub} />
}

export function PanelGestionHumanaLIP() {
  const { toast } = useToast()
  const { selectedEmpresaId, selectedEmpresaNombre } = useAuth()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [anio, setAnio] = useState<string>("")
  const [mes, setMes] = useState<string>("")
  const [dia, setDia] = useState<string>("")

  useEffect(() => {
    let cancel = false
    setLoading(true)
    // Cliente/sitio definido por el SELECTOR GLOBAL (conector).
    getPanelGestionHumanaLIP(selectedEmpresaId ?? null, anio || null, mes || null, dia || null).then((r) => {
      if (cancel) return
      if (r.success) setData(r.data)
      else toast({ title: "No se pudo cargar el panel", description: r.error })
      setLoading(false)
    })
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId, anio, mes, dia])

  const t = data?.talento, f = data?.formacion, j = data?.jornada, s = data?.sst
  const colPct = (v: number, meta: number, menor = false) =>
    menor ? (v <= meta ? SST_TOKENS.ok : v <= meta * 1.5 ? SST_TOKENS.warn : SST_TOKENS.bad)
          : (v >= meta ? SST_TOKENS.ok : v >= meta * 0.85 ? SST_TOKENS.warn : SST_TOKENS.bad)
  const anios = ["", "2026", "2025"]
  const meses = [
    { v: "", l: "Todos" }, { v: "01", l: "Enero" }, { v: "02", l: "Febrero" }, { v: "03", l: "Marzo" },
    { v: "04", l: "Abril" }, { v: "05", l: "Mayo" }, { v: "06", l: "Junio" }, { v: "07", l: "Julio" },
    { v: "08", l: "Agosto" }, { v: "09", l: "Septiembre" }, { v: "10", l: "Octubre" }, { v: "11", l: "Noviembre" }, { v: "12", l: "Diciembre" },
  ]
  const dias = ["", ...Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"))]

  return (
    <div className="space-y-5">
      <SigHeader
        Icon={Users}
        title="Panel LIP · Gestión Humana"
        subtitle="El talento que presta el servicio · en línea · armónico con ISO 9001 (7.1.2/7.2/7.3), ISO 45001 y ISO 14001 — por cliente/sitio"
      />

      <SigFilterBar cliente={selectedEmpresaNombre}>
        <SigField label="Año">
          <select value={anio} onChange={(e) => setAnio(e.target.value)} className={sigControl}>
            {anios.map((a) => (<option key={a} value={a}>{a || "Todos"}</option>))}
          </select>
        </SigField>
        <SigField label="Mes">
          <select
            value={mes}
            onChange={(e) => { setMes(e.target.value); if (!e.target.value) setDia("") }}
            className={sigControl}
          >
            {meses.map((m) => (<option key={m.v} value={m.v}>{m.l}</option>))}
          </select>
        </SigField>
        <SigField label="Día">
          <select value={dia} onChange={(e) => setDia(e.target.value)} className={sigControl} disabled={!mes}>
            {dias.map((d) => (<option key={d} value={d}>{d || "Todos"}</option>))}
          </select>
        </SigField>
        {loading && <Loader2 className="h-4 w-4 animate-spin" style={{ color: SST_TOKENS.teal }} />}
      </SigFilterBar>

      {!data ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: SST_TOKENS.navy }} /></div>
      ) : (
        <>
          <div>
            <h2 className="mb-2 text-sm font-semibold" style={{ color: SST_TOKENS.ink }}>Talento e idoneidad · ISO 9001 7.1.2 / 7.2</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
              <KPI label="Colaboradores activos" valor={t.activos} Icon={Users} color={SST_TOKENS.navy} sub={`${t.vinculados} vinculados (incl. apoyo picos)`} />
              <KPI label="Cobertura de planta" valor={t.cobertura} unidad="%" Icon={UserCheck} color={colPct(t.cobertura, 100)} sub={`${t.activos}/${t.planta} planta acordada`} />
              <KPI label="Ausentismo" valor={t.ausentismo} unidad="%" Icon={HeartPulse} color={colPct(t.ausentismo, 3, true)} sub={`${t.ausencias} ausencias vs headcount del período`} />
              <KPI label="Capacidad de respuesta" valor={t.capacidadRespuesta} unidad="%" Icon={HeartPulse} color={colPct(t.capacidadRespuesta, 3, true)} sub="ausencias / turnos programados (control diario)" />
              <KPI label="Idoneidad documental" valor={t.idoneidad} unidad="%" Icon={UserCheck} color={colPct(t.idoneidad, 95)} sub={`${t.idoneos}/${t.activos} con contrato+examen+ARL`} />
              <KPI label="Formación aprobada" valor={f.aprobadas} unidad="%" Icon={GraduationCap} color={colPct(f.aprobadas, 90)} sub={`${f.intentos} evaluaciones`} />
              <KPI label="Cobertura de formación" valor={f.coberturaFormacion} unidad="%" Icon={GraduationCap} color={colPct(f.coberturaFormacion, 80)} sub={`${f.colaboradoresCapacitados} colaboradores`} />
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold" style={{ color: SST_TOKENS.ink }}>Disponibilidad y SST · ISO 45001</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
              <KPI label="Cumplimiento de jornada" valor={j.cumplimiento} unidad="%" Icon={CalendarCheck} color={colPct(j.cumplimiento, 95)} sub={`${j.presentes}/${j.total} registros`} />
              <KPI label="Accidentes de trabajo" valor={s.casosAT} Icon={ShieldCheck} color={s.casosAT === 0 ? SST_TOKENS.ok : SST_TOKENS.bad} sub={`${s.diasAT} días incapacidad`} />
              <KPI label="Ausentismo médico (EG)" valor={s.diasEG} unidad="días" Icon={HeartPulse} color={SST_TOKENS.warn} sub={`${s.casosEG} casos`} />
              <KPI label="Casos osteomusculares" valor={s.osteomuscular} Icon={HeartPulse} color={s.osteomuscular === 0 ? SST_TOKENS.ok : SST_TOKENS.warn} sub="requieren revisión SST" />
              <KPI label="Costo ausentismo (empresa)" valor={`$${(s.costos || 0).toLocaleString("es-CO")}`} Icon={HeartPulse} color={SST_TOKENS.navy} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-3">
              <h3 className="mb-2 text-sm font-semibold" style={{ color: SST_TOKENS.ink }}>Ausentismo por tipo (días)</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.ausentismoPorTipo}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="tipo" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="dias" name="Días" fill={SST_TOKENS.bad} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="casos" name="Casos" fill={SST_TOKENS.warn} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-3">
              <h3 className="mb-2 text-sm font-semibold" style={{ color: SST_TOKENS.ink }}>Colaboradores activos por cargo</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.porCargo} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="cargo" tick={{ fontSize: 10 }} width={140} />
                  <Tooltip />
                  <Bar dataKey="n" name="Colaboradores" fill={SST_TOKENS.navy} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Gestión propia de LIP: personal competente, idóneo y seguro es la base de la satisfacción del cliente. El ausentismo y la accidentalidad se gestionan en el SG-SST (ISO 45001); la formación incluye toma de conciencia de calidad y ambiental (ISO 9001 7.3 / ISO 14001).
          </p>
        </>
      )}
    </div>
  )
}
