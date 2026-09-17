"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Building2, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  getPendingProductionEntries,
  approveProductionEntry,
  rejectProductionEntry,
  type ProductionEntryPending,
} from "@/lib/inventory-actions"
import { getLocations, getAlmacenes } from "@/lib/inventory-actions"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"
import { useAuth } from "@/components/auth-provider"

// CORREGIDO 2026-09-16 (regresión del commit 90faa0f, 2026-08-12): para las
// filas que suben del LOGO (producción, `creadopor='LOGO'`), `invtrans.creado`
// guarda la hora de PARED de Colombia etiquetada como UTC (+00:00) -- NO es
// UTC real. Verificado con datos en vivo: la fila más reciente por id mostraba
// `creado` ~1 hora antes de la hora actual de Colombia, no ~6 horas (que sería
// lo esperado si `creado` fuera UTC real). Aplicarle un `Intl.DateTimeFormat`
// con `timeZone:"America/Bogota"` sobre `new Date(creado)` (como hacía la
// versión de agosto) RESTA 5 horas de más y muestra la producción 5 horas
// atrasada -- justo el reporte del usuario. Se extraen los dígitos literales
// del string, sin pasar por `Date`/zona horaria -- mismo patrón ya probado en
// `lib/liquidacion-tolva-actions.ts` (`partesLiterales`) para el turno de Tolva.
function formatCreadoExacto(creado: string | null | undefined): string {
  if (!creado) return "N/A"
  const m = String(creado).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!m) return creado
  const [, y, mo, d, h, mi] = m
  return `${d}/${mo}/${y} ${h}:${mi}`
}

export function ProductionApproval() {
  // Filtro dinamico de empresa desde la barra superior
  const { selectedEmpresaId, selectedEmpresaNombre, profile } = useAuth()
  const [entries, setEntries] = useState<ProductionEntryPending[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<number | null>(null)
  const [locations, setLocations] = useState<Array<{ codigo: string; bodega: number }>>([])
  const [almacenes, setAlmacenes] = useState<Array<{ id: number; nombre: string }>>([])
  const [selectedLocations, setSelectedLocations] = useState<Record<number, string>>({})
  const [selectedAlmacenes, setSelectedAlmacenes] = useState<Record<number, string>>({})
  const [observaciones, setObservaciones] = useState<Record<number, string>>({})
  const [approvingId, setApprovingId] = useState<number | null>(null)
  const { toast } = useToast()

  const loadEntries = async () => {
    setLoading(true)
    // Filtrar pendientes por la empresa activa del filtro dinamico
    const data = await getPendingProductionEntries(selectedEmpresaId)
    setEntries(data)
    setLoading(false)
  }

  const loadLocations = async (almacenId?: number) => {
    const locs = await getLocations(almacenId, selectedEmpresaId ?? undefined)
    setLocations(locs as any)
  }

  const loadAlmacenes = async () => {
    // Usar la empresa del filtro dinamico si esta disponible, si no la de la sesion
    const empresaId = selectedEmpresaId ?? (await getCurrentEmpresaIdForInsert())
    const alms = await getAlmacenes(empresaId)
    setAlmacenes(alms)
  }

  useEffect(() => {
    loadEntries()
    loadAlmacenes()
    // Al cambiar la empresa activa, cerrar cualquier fila en modo edicion y limpiar selects
    // (porque los almacenes/localizaciones pertenecen a la empresa anterior).
    setApprovingId(null)
    setSelectedAlmacenes({})
    setSelectedLocations({})
    setLocations([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId])

  useEffect(() => {
    const initialObservaciones: Record<number, string> = {}
    entries.forEach((entry) => {
      initialObservaciones[entry.id] = entry.observaciones || ""
    })
    setObservaciones(initialObservaciones)
  }, [entries])

  // Al entrar en modo aprobación, precargamos los selectores de Almacén
  // y Localización con los valores originales del registro (campos
  // `almacen` y `location` de invtrans) en lugar de dejarlos vacíos, y
  // cargamos las localizaciones del almacén para que el select muestre
  // la opción ya seleccionada.
  const handleStartApprove = async (entry: ProductionEntryPending) => {
    setApprovingId(entry.id)

    if (entry.almacen) {
      setSelectedAlmacenes((prev) => ({ ...prev, [entry.id]: entry.almacen as string }))
      if (entry.location) {
        setSelectedLocations((prev) => ({ ...prev, [entry.id]: entry.location }))
      }
      const almacen = almacenes.find((a) => a.nombre === entry.almacen)
      if (almacen) {
        await loadLocations(almacen.id)
      }
    }
  }

  const handleAlmacenChange = async (entryId: number, almacenNombre: string) => {
    const almacen = almacenes.find((a) => a.nombre === almacenNombre)
    if (almacen) {
      setSelectedAlmacenes((prev) => ({ ...prev, [entryId]: almacenNombre }))
      setSelectedLocations((prev) => {
        const newState = { ...prev }
        delete newState[entryId]
        return newState
      })
      await loadLocations(almacen.id)
    }
  }

  const handleApprove = async (id: number) => {
    const almacen = selectedAlmacenes[id]
    const location = selectedLocations[id]
    const obs = observaciones[id]

    if (!almacen || !location) {
      toast({
        title: "Error",
        description: "Debe seleccionar un almacén y una localización antes de aprobar",
        variant: "destructive",
      })
      return
    }

    setProcessingId(id)
    // Pasar el empresaId del filtro dinamico para que el historial quede asociado a la empresa activa
    const result = await approveProductionEntry(id, location, almacen, obs, selectedEmpresaId)

    if (result.success) {
      toast({
        title: "Éxito",
        description: result.message,
      })
      setSelectedLocations((prev) => {
        const newState = { ...prev }
        delete newState[id]
        return newState
      })
      setSelectedAlmacenes((prev) => {
        const newState = { ...prev }
        delete newState[id]
        return newState
      })
      setObservaciones((prev) => {
        const newState = { ...prev }
        delete newState[id]
        return newState
      })
      setApprovingId(null)
      await loadEntries()
    } else {
      toast({
        title: "Error",
        description: result.message,
        variant: "destructive",
      })
    }
    setProcessingId(null)
  }

  const handleReject = async (id: number) => {
    setProcessingId(id)
    const result = await rejectProductionEntry(id)

    if (result.success) {
      toast({
        title: "Éxito",
        description: result.message,
      })
      await loadEntries()
    } else {
      toast({
        title: "Error",
        description: result.message,
        variant: "destructive",
      })
    }
    setProcessingId(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Nombre de empresa a mostrar: prioriza el filtro dinamico, cae al de la sesion del usuario
  const empresaActivaNombre = selectedEmpresaNombre || profile?.empresa_nombre || null

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Aprobación de Ingreso de Producción</CardTitle>
            <CardDescription>Aprobar o rechazar ingresos de producción pendientes</CardDescription>
          </div>
          {/* Indicador visual de la empresa activa del filtro dinamico de la barra superior */}
          {selectedEmpresaId ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs md:text-sm">
              <Building2 className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Empresa activa:</span>
              <span className="font-semibold text-foreground">{empresaActivaNombre || `ID ${selectedEmpresaId}`}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs md:text-sm text-amber-900">
              <Building2 className="h-4 w-4" />
              <span>Selecciona una empresa en la barra superior</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!selectedEmpresaId ? (
          <div className="text-center py-8 text-muted-foreground">
            Selecciona una empresa en la barra superior para ver los ingresos pendientes de aprobación
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No hay ingresos pendientes de aprobación</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>QR Estiba</TableHead>
                  <TableHead>Almacén</TableHead>
                  <TableHead>Localización</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Observaciones</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Creado por</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-sm">{entry.codproducto}</TableCell>
                    <TableCell>{entry.nombreproducto}</TableCell>
                    <TableCell className="font-mono text-sm">{entry.lote}</TableCell>
                    <TableCell className="font-mono text-sm">{entry.qrestiba ?? "N/A"}</TableCell>
                    <TableCell>
                      {approvingId === entry.id ? (
                        <Select
                          value={selectedAlmacenes[entry.id] || ""}
                          onValueChange={(value) => handleAlmacenChange(entry.id, value)}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Seleccionar almacén" />
                          </SelectTrigger>
                          <SelectContent>
                            {almacenes.map((almacen) => (
                              <SelectItem key={almacen.id} value={almacen.nombre}>
                                {almacen.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        entry.almacen || "Sin asignar"
                      )}
                    </TableCell>
                    <TableCell>
                      {approvingId === entry.id ? (
                        <Select
                          value={selectedLocations[entry.id] || ""}
                          onValueChange={(value) => setSelectedLocations((prev) => ({ ...prev, [entry.id]: value }))}
                          disabled={!selectedAlmacenes[entry.id]}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Seleccionar localización" />
                          </SelectTrigger>
                          <SelectContent>
                            {locations.map((loc) => (
                              <SelectItem key={loc.codigo} value={loc.codigo}>
                                {loc.codigo}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        entry.location || "Sin asignar"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">{entry.cantidad.toLocaleString()}</TableCell>
                    <TableCell>
                      {approvingId === entry.id ? (
                        <Textarea
                          value={observaciones[entry.id] || ""}
                          onChange={(e) =>
                            setObservaciones((prev) => ({
                              ...prev,
                              [entry.id]: e.target.value,
                            }))
                          }
                          placeholder="Agregar observaciones..."
                          className="min-w-[250px] max-w-[300px]"
                          rows={3}
                        />
                      ) : (
                        <div className="max-w-[250px] text-sm text-muted-foreground">
                          {entry.observaciones || "Sin observaciones"}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{formatCreadoExacto(entry.creado)}</TableCell>
                    <TableCell className="text-sm">{entry.creadopor}</TableCell>
                    <TableCell className="text-sm">{entry.origen || "N/A"}</TableCell>
                    {/* `null` = LIP: valor de todo lo historico y de lo que sube
                        el LOGO. Harinera se resalta porque no se facturará. */}
                    <TableCell className="text-sm">
                      {(entry as any).tipo_produccion === "Harinera" ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                          Harinera
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">LIP</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {approvingId === entry.id ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 border-green-600 hover:bg-green-50 bg-transparent"
                              onClick={() => handleApprove(entry.id)}
                              disabled={
                                processingId === entry.id ||
                                !selectedAlmacenes[entry.id] ||
                                !selectedLocations[entry.id]
                              }
                            >
                              {processingId === entry.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle2 className="h-4 w-4 mr-1" />
                                  Confirmar
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setApprovingId(null)
                                setSelectedLocations((prev) => {
                                  const newState = { ...prev }
                                  delete newState[entry.id]
                                  return newState
                                })
                                setSelectedAlmacenes((prev) => {
                                  const newState = { ...prev }
                                  delete newState[entry.id]
                                  return newState
                                })
                                setObservaciones((prev) => ({
                                  ...prev,
                                  [entry.id]: entry.observaciones || "",
                                }))
                              }}
                              disabled={processingId === entry.id}
                            >
                              Cancelar
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 border-green-600 hover:bg-green-50 bg-transparent"
                              onClick={() => handleStartApprove(entry)}
                              disabled={processingId === entry.id}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Aprobar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-600 hover:bg-red-50 bg-transparent"
                              onClick={() => handleReject(entry.id)}
                              disabled={processingId === entry.id}
                            >
                              {processingId === entry.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Rechazar
                                </>
                              )}
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
