"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty"
import {
  Search,
  FolderOpen,
  Folder,
  FileText,
  User,
  CheckCircle2,
  XCircle,
  CalendarDays,
  ChevronRight,
  Download,
} from "lucide-react"
import { getEvidenciaInducciones, type IntentoInduccion } from "@/lib/inducciones-actions"
import { getDisciplinariosDePersona } from "@/lib/disciplinarios-actions"
import { estadoMeta } from "@/lib/disciplinarios-catalogo"
import type { ProcesoDisciplinario } from "@/lib/disciplinarios-tipos"
import { type HeadcountPerson } from "@/lib/headcount-actions"
import { useAuth } from "@/components/auth-provider"
import { cn } from "@/lib/utils"

// Documentos base que se cargan a cada trabajador en HeadCount. Cada uno es una
// columna de tipo URL en la tabla `headcount`. Se replica aqui el mismo listado
// usado en el modulo de HeadCount para mostrarlos dentro del expediente.
const DOCUMENTOS_BASE: { key: string; label: string }[] = [
  { key: "hoja_de_vida", label: "Hoja de Vida" },
  { key: "copia_doc_id", label: "Copia Doc. ID" },
  { key: "afiliacion_arl", label: "Afiliación ARL" },
  { key: "afiliacion_eps", label: "Afiliación EPS" },
  { key: "afiliacion_afp", label: "Afiliación AFP" },
  { key: "afiliacion_caja", label: "Afiliación Caja" },
  { key: "cert_laborales", label: "Cert. Laborales" },
  { key: "cert_personales", label: "Cert. Personales" },
  { key: "antecedentes", label: "Antecedentes" },
  { key: "doc_beneficia", label: "Doc. Beneficiarios" },
  { key: "examenes_ing", label: "Exámenes Ingreso" },
  { key: "cert_m_alimentos", label: "Cert. M. Alimentos" },
  { key: "cert_eva_med", label: "Cert. Eva. Médica" },
  { key: "acta_dotacion", label: "Acta Dotación" },
  { key: "cert_cuenta", label: "Cert. Cuenta" },
  { key: "contrato", label: "Contrato" },
  { key: "contratosiigo", label: "Contrato Siigo" },
  { key: "sst", label: "SST" },
  { key: "induccion", label: "Inducción" },
]

interface CarpetaTrabajador {
  id: string // clave de agrupacion (id de headcount)
  nombre: string
  identificacion: string | null
  persona: HeadcountPerson | null
  intentos: IntentoInduccion[]
}

function formatFecha(fecha: string | null): string {
  if (!fecha) return "—"
  const d = new Date(fecha)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" })
}

export function CarpetasTrabajadores() {
  // Empresa seleccionada dinamicamente (mismo contexto que usa HeadCount).
  const { selectedEmpresaId } = useAuth()
  const [personas, setPersonas] = useState<HeadcountPerson[]>([])
  const [intentos, setIntentos] = useState<IntentoInduccion[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  // Subcarpeta abierta dentro del expediente del trabajador.
  const [subAbierta, setSubAbierta] = useState<
    "base" | "inducciones" | "disciplinarios" | null
  >("base")
  // Procesos disciplinarios de la persona seleccionada. Van en subcarpeta y no
  // como una columna mas de headcount porque una persona puede tener VARIOS
  // casos, y una columna solo guardaria el ultimo.
  const [disciplinarios, setDisciplinarios] = useState<ProcesoDisciplinario[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      // Cargamos en paralelo el personal (HeadCount) y las evidencias de
      // induccion, ambos filtrados por la empresa seleccionada dinamicamente.
      // El personal se obtiene del mismo endpoint que usa el modulo HeadCount
      // para garantizar que salga la plantilla completa de esa empresa.
      const hcUrl = selectedEmpresaId
        ? `/api/headcount?empresaId=${selectedEmpresaId}`
        : "/api/headcount"
      const [hcResult, evResult] = await Promise.all([
        fetch(hcUrl, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => [] as HeadcountPerson[]),
        getEvidenciaInducciones(selectedEmpresaId),
      ])
      if (!cancelled) {
        setPersonas(Array.isArray(hcResult) ? hcResult : [])
        setIntentos(evResult.success ? evResult.data : [])
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [selectedEmpresaId])

  // Construir las carpetas a partir del personal de HeadCount y adjuntar los
  // intentos de induccion correspondientes (emparejados por id de headcount).
  const carpetas = useMemo<CarpetaTrabajador[]>(() => {
    const intentosPorHc = new Map<number, IntentoInduccion[]>()
    for (const it of intentos) {
      if (it.trabajador_id == null) continue
      if (!intentosPorHc.has(it.trabajador_id)) intentosPorHc.set(it.trabajador_id, [])
      intentosPorHc.get(it.trabajador_id)!.push(it)
    }

    const map = new Map<string, CarpetaTrabajador>()
    for (const p of personas) {
      const key = `hc-${p.id}`
      map.set(key, {
        id: key,
        nombre: p.nombre,
        identificacion: p.identificacion,
        persona: p,
        intentos: p.id != null ? intentosPorHc.get(p.id) ?? [] : [],
      })
    }

    // Intentos cuyo trabajador no esta en la lista de HeadCount (caso raro):
    // se agregan como carpeta solo-inducciones para no perder informacion.
    for (const it of intentos) {
      const key = it.trabajador_id != null ? `hc-${it.trabajador_id}` : `nom-${it.trabajador_nombre}`
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          nombre: it.trabajador_nombre,
          identificacion: it.trabajador_identificacion,
          persona: null,
          intentos: [it],
        })
      }
    }

    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [personas, intentos])

  const carpetasFiltradas = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return carpetas
    return carpetas.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        (c.identificacion ?? "").toLowerCase().includes(q),
    )
  }, [carpetas, searchTerm])

  const carpetaActiva = useMemo(
    () => carpetas.find((c) => c.id === seleccionado) ?? null,
    [carpetas, seleccionado],
  )

  // Documentos base disponibles (con URL) del trabajador seleccionado.
  // Casos disciplinarios de la persona abierta. Se piden aparte --y no con el
  // resto del expediente-- porque solo hacen falta cuando hay alguien
  // seleccionado, y son muchos menos que el listado completo.
  useEffect(() => {
    const cedula = (carpetaActiva?.persona as any)?.identificacion
    if (!cedula) {
      setDisciplinarios([])
      return
    }
    let vivo = true
    getDisciplinariosDePersona(String(cedula)).then((r) => {
      if (vivo) setDisciplinarios(r.success && r.data ? r.data : [])
    })
    return () => {
      vivo = false
    }
  }, [carpetaActiva])

  const documentosBase = useMemo(() => {
    const p = carpetaActiva?.persona as Record<string, any> | null | undefined
    if (!p) return []
    return DOCUMENTOS_BASE.map((d) => ({ ...d, url: p[d.key] as string | null }))
      .filter((d) => typeof d.url === "string" && d.url.trim() !== "")
  }, [carpetaActiva])

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (carpetas.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Folder className="h-6 w-6" />
          </EmptyMedia>
          <EmptyTitle>Sin carpetas de trabajadores</EmptyTitle>
          <EmptyDescription>
            Aún no hay trabajadores registrados para esta empresa. Cuando se cree personal en
            HeadCount aparecerán aquí agrupados en carpetas.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-[320px_1fr]">
      {/* Lista de trabajadores (carpetas) */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Folder className="h-4 w-4 text-primary" />
            Trabajadores
            {/* Total del headcount completo. Al buscar mostramos cuantos
                coinciden sobre el total para no perder de vista el universo. */}
            <Badge variant="secondary" className="ml-auto">
              {searchTerm.trim()
                ? `${carpetasFiltradas.length} / ${carpetas.length}`
                : carpetas.length}
            </Badge>
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o documento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[28rem]">
            {carpetasFiltradas.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No hay trabajadores que coincidan.
              </p>
            ) : (
              <ul className="divide-y">
                {carpetasFiltradas.map((c) => {
                  const activa = c.id === seleccionado
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSeleccionado(c.id)
                          setSubAbierta("base")
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                          activa && "bg-primary/10 hover:bg-primary/10",
                        )}
                      >
                        {activa ? (
                          <FolderOpen className="h-5 w-5 shrink-0 text-primary" />
                        ) : (
                          <Folder className="h-5 w-5 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{c.nombre}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {c.identificacion || "Sin documento"}
                          </p>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Carpeta del trabajador seleccionado */}
      {carpetaActiva ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <CardTitle className="truncate text-lg">{carpetaActiva.nombre}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {carpetaActiva.identificacion || "Sin documento"}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Subcarpeta: Documentos base (HeadCount) */}
            <div className="rounded-lg border">
              <button
                type="button"
                onClick={() => setSubAbierta((s) => (s === "base" ? null : "base"))}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    subAbierta === "base" && "rotate-90",
                  )}
                />
                {subAbierta === "base" ? (
                  <FolderOpen className="h-5 w-5 shrink-0 text-primary" />
                ) : (
                  <Folder className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 font-medium">Documentos base</span>
                <Badge variant="outline" className="shrink-0">
                  {documentosBase.length}
                </Badge>
              </button>
              {subAbierta === "base" && (
                <div className="border-t p-3">
                  {documentosBase.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Este trabajador no tiene documentos base cargados en HeadCount.
                    </p>
                  ) : (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {documentosBase.map((d) => (
                        <li
                          key={d.key}
                          className="flex items-center gap-3 rounded-lg border p-2.5"
                        >
                          <div className="rounded-lg bg-muted p-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {d.label}
                          </span>
                          <Button asChild size="sm" variant="outline" className="gap-1.5">
                            <a href={d.url!} target="_blank" rel="noopener noreferrer">
                              <Download className="h-3.5 w-3.5" />
                              Ver
                            </a>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Subcarpeta: Inducciones */}
            <div className="rounded-lg border">
              <button
                type="button"
                onClick={() => setSubAbierta((s) => (s === "inducciones" ? null : "inducciones"))}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    subAbierta === "inducciones" && "rotate-90",
                  )}
                />
                {subAbierta === "inducciones" ? (
                  <FolderOpen className="h-5 w-5 shrink-0 text-primary" />
                ) : (
                  <Folder className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 font-medium">Inducciones</span>
                <Badge variant="outline" className="shrink-0">
                  {carpetaActiva.intentos.length}
                </Badge>
              </button>
              {subAbierta === "inducciones" && (
                <div className="border-t p-3">
                  {carpetaActiva.intentos.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Este trabajador no tiene inducciones registradas.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {carpetaActiva.intentos.map((it) => (
                        <li
                          key={it.id}
                          className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                        >
                          <div className="rounded-lg bg-muted p-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{it.induccion_titulo}</p>
                              {it.induccion_codigo_sig && (
                                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                  {it.induccion_codigo_sig}
                                </code>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {formatFecha(it.fecha)}
                              </span>
                              <span>
                                Puntaje: {it.puntaje}/{it.total}
                              </span>
                              {it.aprobado ? (
                                <span className="flex items-center gap-1 text-green-600">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Aprobó
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-destructive">
                                  <XCircle className="h-3.5 w-3.5" />
                                  Reprobó
                                </span>
                              )}
                            </div>
                          </div>
                          {it.evidencia_url ? (
                            <Button asChild size="sm" variant="outline" className="gap-1.5">
                              <a href={it.evidencia_url} target="_blank" rel="noopener noreferrer">
                                <FileText className="h-3.5 w-3.5" />
                                Ver PDF
                              </a>
                            </Button>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              Sin documento
                            </Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Subcarpeta: Procesos disciplinarios.
                Va como subcarpeta y no como una columna mas de headcount
                porque una persona puede tener VARIOS casos: una columna solo
                guardaria el ultimo y se perderia el historico, que es
                justamente lo que un expediente laboral tiene que conservar. */}
            <div className="rounded-lg border">
              <button
                type="button"
                onClick={() =>
                  setSubAbierta((s) => (s === "disciplinarios" ? null : "disciplinarios"))
                }
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    subAbierta === "disciplinarios" && "rotate-90",
                  )}
                />
                {subAbierta === "disciplinarios" ? (
                  <FolderOpen className="h-5 w-5 shrink-0 text-primary" />
                ) : (
                  <Folder className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 font-medium">Procesos disciplinarios</span>
                <Badge variant="outline" className="shrink-0">
                  {disciplinarios.length}
                </Badge>
              </button>
              {subAbierta === "disciplinarios" && (
                <div className="border-t p-3">
                  {disciplinarios.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Este trabajador no tiene procesos disciplinarios.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {disciplinarios.map((c) => {
                        const meta = estadoMeta(c.estado)
                        return (
                          <li
                            key={c.id}
                            className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                          >
                            <div className="rounded-lg bg-muted p-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{c.conducta}</p>
                                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                  {c.radicado}
                                </code>
                                <span
                                  className="rounded px-1.5 py-0.5 text-[10px] text-white"
                                  style={{ background: meta.color }}
                                >
                                  {meta.etiqueta}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <CalendarDays className="h-3.5 w-3.5" />
                                  {formatFecha(c.fechaHecho)}
                                </span>
                                {c.medidaAplicada && <span>Medida: {c.medidaAplicada}</span>}
                              </div>
                            </div>
                            {c.documentoUrl ? (
                              <Button asChild size="sm" variant="outline" className="gap-1.5">
                                <a href={c.documentoUrl} target="_blank" rel="noopener noreferrer">
                                  <FileText className="h-3.5 w-3.5" />
                                  Ver acta
                                </a>
                              </Button>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                Sin acta generada
                              </Badge>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="flex items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderOpen className="h-6 w-6" />
              </EmptyMedia>
              <EmptyTitle>Selecciona un trabajador</EmptyTitle>
              <EmptyDescription>
                Elige un trabajador de la lista para ver su expediente con las subcarpetas de
                documentos base e inducciones.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      )}
    </div>
  )
}
