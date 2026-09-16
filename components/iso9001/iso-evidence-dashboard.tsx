"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ShieldCheck,
  RefreshCw,
  Upload,
  FileText,
  Loader2,
  Check,
  Pencil,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import {
  getResumenISO,
  setEstadoManualISO,
  updateClausulaISO,
  type ResumenISO,
  type ClausulaISO,
  type EstadoISO,
} from "@/lib/iso9001-actions"

/** Etiqueta + clases de color por estado para los badges. */
const ESTADO_META: Record<
  EstadoISO,
  { label: string; className: string }
> = {
  cumple: {
    label: "Cumple",
    className:
      "bg-[color-mix(in_oklch,var(--chart-3)_18%,transparent)] text-[var(--chart-3)] border-transparent",
  },
  parcial: {
    label: "Parcial",
    className:
      "bg-[color-mix(in_oklch,var(--chart-5)_18%,transparent)] text-[var(--chart-5)] border-transparent",
  },
  documental: {
    label: "Documental",
    className:
      "bg-[color-mix(in_oklch,var(--chart-2)_16%,transparent)] text-[var(--chart-2)] border-transparent",
  },
  pendiente: {
    label: "Pendiente",
    className: "bg-muted text-muted-foreground border-transparent",
  },
}

export default function IsoEvidenceDashboard() {
  const [data, setData] = useState<ResumenISO | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  // id de la clausula con una operacion en curso (estado o subida).
  const [savingId, setSavingId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingUploadId = useRef<{ id: string; numero: string } | null>(null)
  const { toast } = useToast()

  // Edicion completa de una clausula (requisito, prueba/fuente, estado, doc SIG).
  const [editando, setEditando] = useState<ClausulaISO | null>(null)
  const [editForm, setEditForm] = useState({
    titulo: "",
    fuente_lipgo: "",
    codigo_sig: "",
    estado: "auto" as EstadoISO | "auto",
  })
  const [guardandoEdit, setGuardandoEdit] = useState(false)

  function abrirEdicion(c: ClausulaISO) {
    setEditForm({
      titulo: c.titulo || "",
      fuente_lipgo: c.fuente_lipgo || "",
      codigo_sig: c.codigo_sig || "",
      estado: c.estadoManual ?? "auto",
    })
    setEditando(c)
  }

  async function guardarEdicion() {
    if (!editando) return
    if (!editForm.titulo.trim()) {
      toast({ variant: "destructive", title: "El requisito no puede quedar vacío" })
      return
    }
    setGuardandoEdit(true)
    try {
      // 1) Campos base (siempre disponibles).
      const resBase = await updateClausulaISO(editando.id, {
        titulo: editForm.titulo,
        fuente_lipgo: editForm.fuente_lipgo,
        codigo_sig: editForm.codigo_sig,
      })
      if (!resBase.success) throw new Error(resBase.error)

      // 2) Estado manual (requiere la columna estado_manual; best-effort).
      const nuevoEstado = editForm.estado === "auto" ? null : editForm.estado
      if (nuevoEstado !== (editando.estadoManual ?? null)) {
        const resEstado = await setEstadoManualISO(editando.id, nuevoEstado)
        if (!resEstado.success) {
          toast({
            variant: "destructive",
            title: "Datos guardados, pero el estado no",
            description:
              "Ejecuta la migración scripts/013_add_iso_evidencia_columns.sql para habilitar el estado manual.",
          })
          setEditando(null)
          await cargar()
          return
        }
      }

      toast({ title: "Cláusula actualizada", description: `Cláusula ${editando.numero} guardada.` })
      setEditando(null)
      await cargar()
    } catch (err: any) {
      toast({ variant: "destructive", title: "No se pudo guardar", description: err?.message })
    } finally {
      setGuardandoEdit(false)
    }
  }

  async function cargar() {
    try {
      const res = await getResumenISO()
      setData(res)
    } catch (err) {
      console.error("[v0] IsoEvidenceDashboard error:", err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  // Cambia el estado gestionado manualmente (o lo limpia con null).
  async function cambiarEstado(c: ClausulaISO, estado: EstadoISO | null) {
    setSavingId(c.id)
    try {
      const res = await setEstadoManualISO(c.id, estado)
      if (!res.success) throw new Error(res.error)
      toast({
        title: "Estado actualizado",
        description: `Cláusula ${c.numero}: ${estado ? ESTADO_META[estado].label : "automático"}.`,
      })
      await cargar()
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "No se pudo actualizar",
        description: err?.message || "Intenta de nuevo.",
      })
    } finally {
      setSavingId(null)
    }
  }

  // Abre el selector de archivos asociado a la clausula objetivo.
  function pedirArchivo(c: ClausulaISO) {
    pendingUploadId.current = { id: c.id, numero: c.numero }
    fileInputRef.current?.click()
  }

  // Sube el archivo elegido al endpoint y recarga.
  async function onArchivoElegido(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const target = pendingUploadId.current
    e.target.value = "" // permite re-subir el mismo nombre
    if (!file || !target) return
    setUploadingId(target.id)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("clausulaId", target.id)
      fd.append("numero", target.numero)
      const resp = await fetch("/api/iso9001/upload", { method: "POST", body: fd })
      const json = await resp.json()
      if (!resp.ok || !json.success) throw new Error(json.error || "Error al subir")
      toast({
        title: "Evidencia cargada",
        description: `${file.name} adjuntado a la cláusula ${target.numero}.`,
      })
      await cargar()
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "No se pudo subir",
        description: err?.message || "Intenta de nuevo.",
      })
    } finally {
      setUploadingId(null)
      pendingUploadId.current = null
    }
  }

  // Cobertura = clausulas con evidencia activa (cumple + documental) sobre
  // el total. Es la metrica "titular" de la barra superior.
  const cobertura = useMemo(() => {
    if (!data || data.totales.total === 0) return 0
    const conEvidencia = data.totales.cumple + data.totales.documental
    return Math.round((conEvidencia / data.totales.total) * 100)
  }, [data])

  // Agrupa las clausulas por capitulo preservando el orden de llegada.
  const porCapitulo = useMemo(() => {
    const grupos = new Map<string, ClausulaISO[]>()
    for (const c of data?.clausulas || []) {
      const arr = grupos.get(c.capitulo) || []
      arr.push(c)
      grupos.set(c.capitulo, arr)
    }
    return Array.from(grupos.entries())
  }, [data])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No se pudo cargar el resumen ISO 9001.
        </CardContent>
      </Card>
    )
  }

  const { totales } = data

  return (
    <div className="space-y-6">
      {/* Barra de cobertura */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color-mix(in_oklch,var(--chart-3)_16%,transparent)]">
                <ShieldCheck className="h-5 w-5 text-[var(--chart-3)]" aria-hidden />
              </span>
              <div>
                <CardTitle className="text-base">Centro de Evidencia ISO 9001</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Cumplimiento verificado con datos reales de LIPgo
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={refreshing}
              onClick={() => {
                setRefreshing(true)
                cargar()
              }}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
              <span className="ml-1.5">Actualizar</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-foreground">
              Cobertura de requisitos
            </span>
            <span className="text-2xl font-bold tabular-nums text-foreground">
              {cobertura}%
            </span>
          </div>
          <Progress value={cobertura} className="h-2" />
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline" className={ESTADO_META.cumple.className}>
              {totales.cumple} cumple
            </Badge>
            <Badge variant="outline" className={ESTADO_META.parcial.className}>
              {totales.parcial} parcial
            </Badge>
            <Badge variant="outline" className={ESTADO_META.documental.className}>
              {totales.documental} documental
            </Badge>
            <Badge variant="outline" className={ESTADO_META.pendiente.className}>
              {totales.pendiente} pendiente
            </Badge>
            <Badge variant="outline" className="ml-auto">
              {totales.total} requisitos
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Una Card por capitulo */}
      {porCapitulo.map(([capitulo, clausulas]) => (
        <Card key={capitulo}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {capitulo}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">N°</TableHead>
                    <TableHead>Requisito</TableHead>
                    <TableHead>Prueba / fuente</TableHead>
                    <TableHead className="w-36">Estado</TableHead>
                    <TableHead className="w-44">Evidencia</TableHead>
                    <TableHead className="w-28">Doc. SIG</TableHead>
                    <TableHead className="w-16 text-right">Editar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clausulas.map((c) => {
                    const meta = ESTADO_META[c.estado]
                    return (
                      <TableRow key={`${c.numero}-${c.titulo}`}>
                        <TableCell className="font-mono text-xs text-muted-foreground align-top">
                          {c.numero}
                        </TableCell>
                        <TableCell className="align-top">
                          <p className="font-medium text-foreground text-sm">
                            {c.titulo}
                          </p>
                          {c.descripcion ? (
                            <p className="text-xs text-muted-foreground mt-0.5 max-w-md text-pretty">
                              {c.descripcion}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="align-top text-sm text-muted-foreground">
                          {c.valor || c.fuente_lipgo || "—"}
                        </TableCell>
                        <TableCell className="align-top">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                disabled={savingId === c.id}
                                className="inline-flex items-center gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                                aria-label={`Cambiar estado de la cláusula ${c.numero}`}
                              >
                                <Badge variant="outline" className={meta.className}>
                                  {savingId === c.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    meta.label
                                  )}
                                </Badge>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuLabel className="text-xs">
                                Estado manual
                              </DropdownMenuLabel>
                              {(
                                ["cumple", "parcial", "documental", "pendiente"] as EstadoISO[]
                              ).map((est) => (
                                <DropdownMenuItem
                                  key={est}
                                  onClick={() => cambiarEstado(c, est)}
                                  className="text-sm"
                                >
                                  <span
                                    className="mr-2 h-2 w-2 rounded-full"
                                    style={{ background: "currentColor" }}
                                  />
                                  {ESTADO_META[est].label}
                                  {c.estadoManual === est ? (
                                    <Check className="ml-auto h-3.5 w-3.5" />
                                  ) : null}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => cambiarEstado(c, null)}
                                className="text-sm text-muted-foreground"
                              >
                                Automático ({ESTADO_META[c.estadoAuto].label})
                                {c.estadoManual === null ? (
                                  <Check className="ml-auto h-3.5 w-3.5" />
                                ) : null}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {c.estadoManual ? (
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              Manual
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-col gap-1">
                            {c.evidenciaUrl ? (
                              <a
                                href={c.evidenciaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-[var(--chart-2)] hover:underline max-w-[10rem]"
                              >
                                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                <span className="truncate">
                                  {c.evidenciaNombre || "Ver archivo"}
                                </span>
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Sin evidencia
                              </span>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-fit px-2 text-xs"
                              disabled={uploadingId === c.id}
                              onClick={() => pedirArchivo(c)}
                            >
                              {uploadingId === c.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Upload className="h-3 w-3" />
                              )}
                              <span className="ml-1">
                                {c.evidenciaUrl ? "Re-subir" : "Subir"}
                              </span>
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          {c.codigo_sig ? (
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                              {c.codigo_sig}
                            </code>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="align-top text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => abrirEdicion(c)}
                            aria-label={`Editar cláusula ${c.numero}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}

      <p className="text-xs text-muted-foreground text-right">
        Generado: {new Date(data.generado).toLocaleString("es-CO")}
      </p>

      {/* Input oculto reutilizado para subir/re-subir evidencias. */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
        className="hidden"
        onChange={onArchivoElegido}
      />

      {/* Dialogo de edicion completa de una clausula. */}
      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar cláusula {editando?.numero}</DialogTitle>
            <DialogDescription>
              Modifica el requisito, la prueba/fuente, el estado y el documento del SIG.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="iso-titulo">Requisito</Label>
              <Input
                id="iso-titulo"
                value={editForm.titulo}
                onChange={(e) => setEditForm((f) => ({ ...f, titulo: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="iso-fuente">Prueba / fuente</Label>
              <Textarea
                id="iso-fuente"
                rows={2}
                value={editForm.fuente_lipgo}
                onChange={(e) => setEditForm((f) => ({ ...f, fuente_lipgo: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="iso-estado">Estado</Label>
                <Select
                  value={editForm.estado}
                  onValueChange={(v) =>
                    setEditForm((f) => ({ ...f, estado: v as EstadoISO | "auto" }))
                  }
                >
                  <SelectTrigger id="iso-estado">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      Automático{editando ? ` (${ESTADO_META[editando.estadoAuto].label})` : ""}
                    </SelectItem>
                    {(["cumple", "parcial", "documental", "pendiente"] as EstadoISO[]).map((e) => (
                      <SelectItem key={e} value={e}>
                        {ESTADO_META[e].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="iso-codigo">Doc. SIG</Label>
                <Input
                  id="iso-codigo"
                  value={editForm.codigo_sig}
                  onChange={(e) => setEditForm((f) => ({ ...f, codigo_sig: e.target.value }))}
                  placeholder="Ej. SST-FOR-30"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)} disabled={guardandoEdit}>
              Cancelar
            </Button>
            <Button onClick={guardarEdicion} disabled={guardandoEdit} className="gap-2">
              {guardandoEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
