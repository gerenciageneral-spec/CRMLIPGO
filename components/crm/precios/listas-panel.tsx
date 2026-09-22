"use client"

// Listas de precios: personalizadas por producto, por porcentaje, o ambas.

import { useEffect, useMemo, useState } from "react"
import {
  Loader2, Plus, Tag, Users, Package, Percent, Pencil, Eye, Search, Trash2,
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import {
  getListas, crearLista, getDetalleLista, fijarPrecioProducto, quitarPrecioProducto, aplicarDescuentoMasivo, previsualizarLista, type ListaPrecios, type LineaLista, type TipoLista,
} from "@/lib/crm-precios-actions"
import { TIPO_LISTA_LABEL } from "@/lib/crm-precios"
import { getProductosCrm } from "@/lib/crm-catalogos-actions"
import type { ProductoCrm } from "@/lib/crm-catalogos"
import { money } from "@/lib/crm-cotizaciones"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import { MarcoTabla, FilaCargando, FilaVacia } from "@/components/crm/ui/modulo"

export function ListasPanel() {
  const { profile, selectedEmpresaId } = useAuth()
  const empresaId = selectedEmpresaId ?? 1

  const [listas, setListas] = useState<ListaPrecios[]>([])
  const [cargando, setCargando] = useState(true)
  const [nuevaAbierta, setNuevaAbierta] = useState(false)
  const [editando, setEditando] = useState<ListaPrecios | null>(null)
  const [previendo, setPreviendo] = useState<ListaPrecios | null>(null)

  const cargar = async () => {
    const res = await getListas(empresaId)
    if (res.success) setListas(res.data ?? [])
    else toast({ title: "No se pudieron cargar", description: res.error, variant: "destructive" })
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  if (cargando) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-[var(--chart-1)]/10 p-2 text-[var(--chart-1)]">
            <Tag className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Listas de precios</h1>
            <p className="text-sm text-muted-foreground">El precio que ve el vendedor al cotizar sale de la lista del cliente</p>
          </div>
        </div>

        <Dialog open={nuevaAbierta} onOpenChange={setNuevaAbierta}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-8">
              <Plus className="mr-1.5 h-4 w-4" />
              Nueva lista
            </Button>
          </DialogTrigger>
          <FormularioLista
            empresaId={empresaId}
            usuario={profile?.usuario ?? "desconocido"}
            onGuardado={() => {
              setNuevaAbierta(false)
              cargar()
            }}
          />
        </Dialog>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {listas.map((l) => (
          <Card key={l.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-medium">
                    <Tag className="h-4 w-4 text-[var(--chart-1)]" aria-hidden="true" />
                    <span className="truncate">{l.nombre}</span>
                  </p>
                  {l.descripcion && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{l.descripcion}</p>
                  )}
                </div>
                {l.es_default && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    Por defecto
                  </Badge>
                )}
              </div>

              <p className="text-xs text-muted-foreground">{TIPO_LISTA_LABEL[l.tipo]}</p>

              {l.descuento_global > 0 && (
                <p className="flex items-center gap-1 text-sm font-medium text-[var(--chart-2)]">
                  <Percent className="h-3.5 w-3.5" />
                  {l.descuento_global}% sobre el precio base
                </p>
              )}

              <Separator />

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  {l.productos_con_precio ?? 0} producto{l.productos_con_precio === 1 ? "" : "s"}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {l.clientes_asignados ?? 0} cliente{l.clientes_asignados === 1 ? "" : "s"}
                </span>
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditando(l)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Precios
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPreviendo(l)}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {listas.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Tag className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No hay listas. Sin lista, se cotiza al precio base del producto.
            </p>
          </CardContent>
        </Card>
      )}

      {editando && (
        <EditorPrecios
          lista={editando}
          empresaId={empresaId}
          onCerrar={() => {
            setEditando(null)
            cargar()
          }}
        />
      )}

      {previendo && (
        <VistaPrevia lista={previendo} empresaId={empresaId} onCerrar={() => setPreviendo(null)} />
      )}
    </div>
  )
}

function FormularioLista({
  empresaId, usuario, onGuardado,
}: {
  empresaId: number
  usuario: string
  onGuardado: () => void
}) {
  const [nombre, setNombre] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [tipo, setTipo] = useState<TipoLista>("mixta")
  const [descuento, setDescuento] = useState("0")
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    setGuardando(true)
    const res = await crearLista(
      {
        nombre,
        descripcion,
        tipo,
        descuento_global: Number(descuento) || 0,
      },
      usuario,
      empresaId,
    )
    setGuardando(false)

    if (!res.success) {
      toast({ title: "No se creó", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: "Lista creada", description: "Ahora define los precios de los productos." })
    onGuardado()
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Nueva lista de precios</DialogTitle>
      </DialogHeader>

      <div className="space-y-4 py-1">
        <div className="space-y-1.5">
          <Label className="text-sm">Nombre *</Label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Mayorista, Institucional…"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Descripción</Label>
          <Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Cómo se arma</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoLista)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(TIPO_LISTA_LABEL) as TipoLista[]).map((t) => (
                <SelectItem key={t} value={t}>{TIPO_LISTA_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {tipo === "manual" && "Cada producto lleva su precio escrito a mano."}
            {tipo === "descuento_global" && "Un mismo porcentaje para todo el catálogo."}
            {tipo === "mixta" && "Un porcentaje general, con excepciones por producto. Es lo más usado."}
          </p>
        </div>

        {tipo !== "manual" && (
          <div className="space-y-1.5">
            <Label className="text-sm">Descuento general (%)</Label>
            <Input
              type="number" min="0" max="100"
              value={descuento}
              onChange={(e) => setDescuento(e.target.value)}
            />
          </div>
        )}
      </div>

      <DialogFooter>
        <Button onClick={guardar} disabled={guardando || !nombre.trim()}>
          {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Crear
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

/** Editor del detalle: precio por producto y acciones masivas. */
function EditorPrecios({
  lista, empresaId, onCerrar,
}: {
  lista: ListaPrecios
  empresaId: number
  onCerrar: () => void
}) {
  const [productos, setProductos] = useState<ProductoCrm[]>([])
  const [detalle, setDetalle] = useState<LineaLista[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState("")
  const [masivo, setMasivo] = useState("")

  const cargar = async () => {
    const [pRes, dRes] = await Promise.all([
      getProductosCrm(empresaId),
      getDetalleLista(lista.id),
    ])
    if (pRes.success) setProductos(pRes.data ?? [])
    if (dRes.success) setDetalle(dRes.data ?? [])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista.id])

  const porProducto = useMemo(
    () => new Map(detalle.map((d) => [d.producto_id, d])),
    [detalle],
  )

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return productos
    return productos.filter((p) => p.nombre.toLowerCase().includes(t))
  }, [productos, busqueda])

  const fijar = async (p: ProductoCrm, campo: "precio" | "pct", valor: string) => {
    const n = Number(valor)
    if (!valor || Number.isNaN(n)) {
      // Vaciar el campo quita el producto de la lista: vuelve a regirse por el
      // descuento global.
      await quitarPrecioProducto(lista.id, p.id)
      setDetalle((prev) => prev.filter((d) => d.producto_id !== p.id))
      return
    }

    const res = await fijarPrecioProducto(
      {
        lista_id: lista.id,
        producto_id: p.id,
        producto_nombre: p.nombre,
        precio_manual: campo === "precio" ? n : null,
        descuento_pct: campo === "pct" ? n : null,
      },
      empresaId,
    )

    if (!res.success) {
      toast({ title: "No se guardó", description: res.error, variant: "destructive" })
      return
    }

    setDetalle((prev) => {
      const sin = prev.filter((d) => d.producto_id !== p.id)
      return [...sin, res.data!]
    })
  }

  const aplicarMasivo = async () => {
    const pct = Number(masivo)
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      toast({ title: "El porcentaje debe estar entre 0 y 100", variant: "destructive" })
      return
    }

    const res = await aplicarDescuentoMasivo(
      lista.id,
      visibles.map((p) => ({ id: p.id, nombre: p.nombre })),
      pct,
      empresaId,
    )

    if (!res.success) {
      toast({ title: "No se aplicó", description: res.error, variant: "destructive" })
      return
    }

    toast({ title: `${pct}% aplicado a ${res.data} producto(s)` })
    setMasivo("")
    cargar()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lista.nombre}</DialogTitle>
          <DialogDescription>
            Define precio fijo o porcentaje por producto. Lo que dejes vacío se rige
            por el descuento general de la lista
            {lista.descuento_global > 0 && ` (${lista.descuento_global}%)`}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar producto…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Acción masiva: armar una lista producto por producto con un
                catálogo grande no es realista. */}
            <div className="flex gap-1.5">
              <Input
                type="number" min="0" max="100"
                placeholder="%"
                value={masivo}
                onChange={(e) => setMasivo(e.target.value)}
                className="w-20"
              />
              <Button variant="outline" onClick={aplicarMasivo} disabled={!masivo}>
                Aplicar a {busqueda ? "los filtrados" : "todos"}
              </Button>
            </div>
          </div>

          {/* La tabla no desaparece mientras carga: la cabecera se queda en su
              sitio y el aviso de carga ocupa el cuerpo. Cambiar el bloque
              entero por un spinner hace saltar el diálogo al terminar. */}
          <MarcoTabla>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-semibold">Producto</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Base</TableHead>
                  <TableHead className="text-xs font-semibold w-32">Precio fijo</TableHead>
                  <TableHead className="text-xs font-semibold w-24">Descuento</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {cargando ? (
                  <FilaCargando columnas={5} />
                ) : visibles.length === 0 ? (
                  <FilaVacia
                    columnas={5}
                    mensaje={
                      busqueda
                        ? "Ningún producto coincide con la búsqueda."
                        : "No hay productos en el catálogo."
                    }
                  />
                ) : (
                  visibles.slice(0, 150).map((p) => {
                  const d = porProducto.get(p.id)
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs max-w-[240px] truncate">{p.nombre}</TableCell>

                      <TableCell className="text-xs text-right tabular-nums text-muted-foreground">
                        {p.precio_base != null ? money(p.precio_base) : "—"}
                      </TableCell>

                      <TableCell className="text-xs">
                        <Input
                          type="number" min="0"
                          defaultValue={d?.precio_manual ?? ""}
                          placeholder="—"
                          disabled={d?.descuento_pct != null}
                          onBlur={(e) => fijar(p, "precio", e.target.value)}
                          className="h-8"
                        />
                      </TableCell>

                      <TableCell className="text-xs">
                        <Input
                          type="number" min="0" max="100"
                          defaultValue={d?.descuento_pct ?? ""}
                          placeholder="—"
                          disabled={d?.precio_manual != null}
                          onBlur={(e) => fijar(p, "pct", e.target.value)}
                          className="h-8"
                        />
                      </TableCell>

                      <TableCell className="text-xs">
                        {d && (
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => fijar(p, "precio", "")}
                            aria-label="Quitar de la lista"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                  })
                )}
              </TableBody>
            </Table>
          </MarcoTabla>

          {visibles.length > 150 && (
            <p className="text-xs text-muted-foreground">
              Se muestran 150 de {visibles.length}. Usa la búsqueda para acotar.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onCerrar}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Vista previa: cómo queda el precio de cada producto con esta lista. */
function VistaPrevia({
  lista, empresaId, onCerrar,
}: {
  lista: ListaPrecios
  empresaId: number
  onCerrar: () => void
}) {
  const [filas, setFilas] = useState<{ producto_id: number; nombre: string; base: number; final: number; ahorro: number }[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    previsualizarLista(lista.id, empresaId).then((res) => {
      if (res.success) setFilas(res.data ?? [])
      setCargando(false)
    })
  }, [lista.id, empresaId])

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vista previa · {lista.nombre}</DialogTitle>
          <DialogDescription>
            Así quedarían los precios. Se calcula con la misma función que usan
            las cotizaciones, así que es exactamente lo que verá el vendedor.
          </DialogDescription>
        </DialogHeader>

        {/* Mismo criterio que en el editor: la cabecera se queda en su sitio
            mientras se calcula la previsualización. */}
        <MarcoTabla>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">Producto</TableHead>
                <TableHead className="text-xs font-semibold text-right">Base</TableHead>
                <TableHead className="text-xs font-semibold text-right">Con esta lista</TableHead>
                <TableHead className="text-xs font-semibold text-right">Dif.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cargando ? (
                <FilaCargando columnas={4} />
              ) : filas.length === 0 ? (
                <FilaVacia columnas={4} mensaje="No hay productos para previsualizar." />
              ) : (
                filas.map((f) => (
                <TableRow key={f.producto_id}>
                  <TableCell className="text-xs max-w-[240px] truncate">{f.nombre}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums text-muted-foreground">
                    {money(f.base)}
                  </TableCell>
                  <TableCell className="text-xs text-right font-medium tabular-nums">
                    {money(f.final)}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums">
                    {f.ahorro > 0 ? (
                      <span className="text-[var(--chart-2)]">-{f.ahorro}%</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </MarcoTabla>

        <DialogFooter>
          <Button onClick={onCerrar}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ListasPanel
