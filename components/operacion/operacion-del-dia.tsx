"use client"

// OPERACIÓN DEL DÍA — panel ejecutivo del coordinador.
//
// Reúne en una pantalla lo que hoy está repartido: personal activo, turnos,
// cobertura, novedades pendientes, solicitudes de personal y el pago de la
// quincena. Todo filtrado por la empresa del selector global.
//
// Cada cifra sale de la misma fuente que ya usa su módulo: no se recalcula
// nada por una vía propia. Los botones llevan al módulo donde se resuelve.

import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Loader2,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react"
import { getOperacionDia } from "@/lib/operacion-dia-actions"
import type { CoberturaTurno, ItemBandeja, OperacionDiaData } from "@/lib/operacion-dia-tipos"

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})
const NUM = new Intl.NumberFormat("es-CO")

/** Abre otro módulo. El destino conserva su propio PermissionGuard. */
function irAModulo(nombre: string) {
  window.dispatchEvent(new CustomEvent("lipgo:navigate-module", { detail: nombre }))
}

const COLOR_NIVEL: Record<ItemBandeja["nivel"], string> = {
  alto: "#dc2626",
  medio: "#f59e0b",
  bajo: "#16a34a",
}

/** El anillo de cobertura de la cabecera. */
function Anillo({ pct }: { pct: number }) {
  const r = 34
  const circ = 2 * Math.PI * r
  const lleno = Math.max(0, Math.min(100, pct))
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="7" />
        <circle
          cx="40" cy="40" r={r} fill="none"
          stroke="#5eead4" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${(circ * lleno) / 100} ${circ}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold text-white tabular-nums">{lleno}%</span>
        <span className="text-[9px] uppercase tracking-wide text-white/70">cobertura</span>
      </div>
    </div>
  )
}

function TarjetaTurno({ t }: { t: CoberturaTurno }) {
  const pct = t.programados > 0 ? Math.round((t.presentes / t.programados) * 100) : 0
  return (
    <div className="flex-1 border-r border-border px-4 py-3 last:border-r-0">
      <div className="flex items-center gap-2">
        <span className="rounded bg-foreground/85 px-1.5 py-0.5 font-mono text-[10px] text-background">
          {t.etiqueta}
        </span>
        {t.horario && <span className="font-mono text-[11px] text-muted-foreground">{t.horario}</span>}
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">
        {t.presentes === 0 && t.programados === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span style={{ color: pct >= 95 ? undefined : "#f59e0b" }}>{t.presentes}</span>
        )}
        <span className="text-base font-normal text-muted-foreground"> / {t.programados}</span>
      </p>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded bg-muted">
        <div
          className="h-full rounded"
          style={{ width: `${pct}%`, background: pct >= 95 ? "#14b8a6" : "#f59e0b" }}
        />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {t.programados === 0
          ? "sin turnos programados"
          : t.sinMarcar > 0
            ? `${t.sinMarcar} sin marcar`
            : `${pct}% de asistencia confirmada`}
      </p>
    </div>
  )
}

export function OperacionDelDia() {
  const { selectedEmpresaId } = useAuth()
  const [data, setData] = useState<OperacionDiaData | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    const r = await getOperacionDia(selectedEmpresaId ?? null)
    if (r.success && r.data) setData(r.data)
    else {
      setData(null)
      setError(r.message ?? "No se pudo cargar el panel.")
    }
    setCargando(false)
  }, [selectedEmpresaId])

  useEffect(() => {
    cargar()
  }, [cargar])

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
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Operación</p>
          <h1 className="text-xl font-semibold">Operación del día</h1>
        </div>
        <Button variant="outline" size="sm" onClick={cargar} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </Button>
      </div>

      {/* Avisos de datos que no se pudieron leer: nunca mostrar 0 como si fuera real. */}
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

      {/* CABECERA — la quincena en curso */}
      <section
        className="rounded-xl p-5 text-white"
        style={{ background: "linear-gradient(120deg, #0f3b3b, #0a5757 60%, #0d6b6b)" }}
      >
        <div className="flex flex-wrap items-center gap-5">
          <Anillo pct={d.cobertura.pct} />

          <div className="min-w-[220px] flex-1">
            <p className="text-[10px] uppercase tracking-wide text-white/60">Quincena en curso</p>
            <h2 className="text-2xl font-semibold">{d.quincena.etiqueta}</h2>
            <p className="mt-1 text-sm text-white/80">
              {d.cobertura.cubiertos === 0 && d.cobertura.programados === 0
                ? "Todavía no hay turnos programados en esta quincena."
                : `${NUM.format(d.cobertura.cubiertos)} de ${NUM.format(d.cobertura.programados)} turnos cubiertos`}
            </p>
            <p className="mt-0.5 text-xs text-white/55">
              {d.cobertura.diasConDatos} {d.cobertura.diasConDatos === 1 ? "día" : "días"} con
              programación · corte {d.quincena.hasta.slice(8)} de {d.quincena.etiqueta.split(" de ")[1]}
            </p>
          </div>

          <div className="flex flex-wrap gap-6">
            <div className="border-l border-white/20 pl-5">
              <p className="text-[10px] uppercase tracking-wide text-white/60">Personal activo</p>
              <p className="text-2xl font-semibold tabular-nums">{NUM.format(d.personalActivo)}</p>
              <p className="text-[11px] text-white/55">operativos</p>
            </div>
            <div className="border-l border-white/20 pl-5">
              <p className="text-[10px] uppercase tracking-wide text-white/60">Turnos programados</p>
              <p className="text-2xl font-semibold tabular-nums">
                {NUM.format(d.turnosProgramadosQuincena)}
              </p>
              <p className="text-[11px] text-white/55">en la quincena</p>
            </div>
            <div className="border-l border-white/20 pl-5">
              <p className="text-[10px] uppercase tracking-wide text-white/60">Novedades abiertas</p>
              <p
                className="text-2xl font-semibold tabular-nums"
                style={{ color: d.novedadesAbiertas > 0 ? "#fbbf24" : undefined }}
              >
                {NUM.format(d.novedadesAbiertas)}
              </p>
              <p className="text-[11px] text-white/55">
                {d.novedadesAbiertas > 0 ? "esperan gestión" : "todo al día"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* COBERTURA DE HOY */}
      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Operación en vivo
            </p>
            <h2 className="text-sm font-semibold">Cobertura de hoy</h2>
            <p className="text-[11px] text-muted-foreground">
              Programado por ti · marcado en la tablet de portería
            </p>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">{d.fecha}</span>
        </div>

        {d.hoy.turnos.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No hay turnos programados para hoy.
          </p>
        ) : (
          <div className="flex flex-wrap">
            {d.hoy.turnos.map((t) => (
              <TarjetaTurno key={t.etiqueta} t={t} />
            ))}
            <div className="flex-1 bg-muted/30 px-4 py-3">
              <span className="rounded bg-foreground/85 px-1.5 py-0.5 font-mono text-[10px] text-background">
                Total
              </span>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums">
                {d.hoy.total.presentes}
                <span className="text-base font-normal text-muted-foreground">
                  {" "}/ {d.hoy.total.programados}
                </span>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">personas en operación</p>
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* BANDEJA DEL DÍA */}
        <section className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Bandeja del día
            </p>
            <h2 className="text-sm font-semibold">Requiere tu atención</h2>
          </div>
          {d.bandeja.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nada pendiente. La operación está al día.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {d.bandeja.map((it) => (
                <li key={it.id} className="flex items-start gap-3 px-4 py-3">
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: COLOR_NIVEL[it.nivel] }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{it.titulo}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{it.detalle}</p>
                  </div>
                  {it.moduloDestino && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => irAModulo(it.moduloDestino!)}
                    >
                      {it.textoBoton ?? "Abrir"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-4">
          {/* SOLICITAR PERSONAL */}
          <section className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Personal</p>
                <h2 className="text-sm font-semibold">Solicitar personal</h2>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => irAModulo("Solicitud de Personal")}>
                <UserPlus className="h-3.5 w-3.5" />
                Nueva requisición
              </Button>
            </div>

            {d.requisiciones.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No hay solicitudes de personal registradas.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {d.requisiciones.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                      {r.aprobadas}/{r.totalPasos}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.cargo}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.vacantes > 0 ? `${r.vacantes} ${r.vacantes === 1 ? "vacante" : "vacantes"}` : "Sin cupo definido"}
                        {r.proyecto ? ` · ${r.proyecto}` : ""} · {r.avance}
                      </p>
                    </div>
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px]"
                      style={{
                        background:
                          r.estado === "aprobado" ? "#dcfce7" : r.estado === "rechazado" ? "#fee2e2" : "#fef3c7",
                        color:
                          r.estado === "aprobado" ? "#166534" : r.estado === "rechazado" ? "#991b1b" : "#92400e",
                      }}
                    >
                      {r.estado}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-border px-4 py-2">
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => irAModulo("Solicitud de Personal")}
              >
                Ver todas las solicitudes <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </section>

          {/* PAGO DE LA QUINCENA */}
          <section className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Pago de personal
                </p>
                <h2 className="text-sm font-semibold">Quincena en curso</h2>
              </div>
              <span className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                en construcción
              </span>
            </div>
            <div className="px-4 py-4">
              {d.pago.disponible ? (
                <>
                  <p className="text-3xl font-semibold tabular-nums">{COP.format(d.pago.total)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {NUM.format(d.pago.personas)} personas con pago ·{" "}
                    {NUM.format(d.turnosProgramadosQuincena)} turnos
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Calculado sobre los turnos y novedades registrados hasta hoy. Cambia hasta el
                    cierre.
                  </p>
                </>
              ) : (
                <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    No se pudo calcular el pago
                  </p>
                  <p className="mt-1">{d.pago.mensaje}</p>
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => irAModulo("Revisión de nómina")}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Ver detalle
                </Button>
                <Button variant="outline" size="sm" onClick={() => irAModulo("Tabla Asistencia")}>
                  <Users className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default OperacionDelDia
