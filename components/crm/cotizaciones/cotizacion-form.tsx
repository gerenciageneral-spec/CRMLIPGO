"use client"

// Formulario de cotización.
//
// Dos cosas que hace y el de LIPgo no hacía:
//
// 1. El precio lo resuelve la LISTA del cliente, no lo escribe el vendedor a
//    mano. Al elegir producto se consulta crm_resolver_precio y se propone; el
//    vendedor puede bajarlo, pero entonces se ve cuánto descuento está dando.
//
// 2. El tope de descuento sale de un parámetro. Pasarse no bloquea —el
//    vendedor puede tener razón— pero marca el documento para que alguien lo
//    revise antes de autorizar el pedido.

import { useEffect, useMemo, useState } from "react"
import { Loader2, Plus, Trash2, AlertTriangle } from "lucide-react"
import { crearCotizacion } from "@/lib/crm-cotizaciones-actions"
import { getClientesCrm, getProductosCrm, resolverPrecio } from "@/lib/crm-catalogos-actions"
import { getParamNumber } from "@/lib/crm-parametros-actions"
import { PARAM } from "@/lib/crm-parametros"
import { calcularTotales, descuentoSobreLista, money } from "@/lib/crm-cotizaciones"
import type { ClienteCrm, ProductoCrm } from "@/lib/crm-catalogos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toast } from "@/hooks/use-toast"

interface Linea {
  id: string
  producto_id: number | null
  producto_nombre: string
  categoria: string | null
  unidad: string | null
  cantidad: string
  precio_lista: number | null
  precio_unitario: string
  peso_unitario: number
  abierto: boolean
}

const lineaVacia = (): Linea => ({
  id: crypto.randomUUID(),
  producto_id: null,
  producto_nombre: "",
  categoria: null,
  unidad: null,
  cantidad: "",
  precio_lista: null,
  precio_unitario: "",
  peso_unitario: 0,
  abierto: false,
})

export function CotizacionForm({
  empresaId, usuario, onGuardado, tipoVenta = "cotizacion",
}: {
  empresaId: number
  usuario: string
  /** Recibe el id de lo creado, para que quien llame pueda seguir el flujo
   *  (la venta directa lo usa para convertirlo en pedido de inmediato). */
  onGuardado: (cotizacionId?: number) => void
  /** "directa" salta el ciclo de cotizacion: el documento nace y se convierte. */
  tipoVenta?: "cotizacion" | "directa"
}) {
  const [clientes, setClientes] = useState<ClienteCrm[]>([])
  const [productos, setProductos] = useState<ProductoCrm[]>([])
  const [ivaPct, setIvaPct] = useState(0)
  const [topeDescuento, setTopeDescuento] = useState(10)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  const [clienteId, setClienteId] = useState<string>("")
  const [clienteAbierto, setClienteAbierto] = useState(false)
  const [formaPago, setFormaPago] = useState<"contado" | "credito">("contado")
  const [diasCredito, setDiasCredito] = useState("30")
  const [observaciones, setObservaciones] = useState("")
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()])

  useEffect(() => {
    Promise.all([
      getClientesCrm(empresaId),
      getProductosCrm(empresaId),
      getParamNumber(PARAM.IVA, empresaId),
      getParamNumber(PARAM.DESCUENTO_MAXIMO_VENDEDOR, empresaId),
      getParamNumber(PARAM.CREDITO_DIAS_DEFAULT, empresaId),
    ]).then(([cRes, pRes, iva, tope, dias]) => {
      if (cRes.success) setClientes(cRes.data ?? [])
      if (pRes.success) setProductos(pRes.data ?? [])
      setIvaPct(iva)
      setTopeDescuento(tope)
      setDiasCredito(String(dias))
      setCargando(false)
    })
  }, [empresaId])

  const cliente = useMemo(
    () => clientes.find((c) => String(c.id) === clienteId),
    [clientes, clienteId],
  )

  // Al elegir cliente se repropone el precio de todas las líneas: su lista
  // puede ser distinta de la del cliente anterior.
  useEffect(() => {
    if (!cliente) return
    lineas.forEach((l) => {
      if (l.producto_id) reproponerPrecio(l.id, l.producto_id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente?.id])

  const reproponerPrecio = async (lineaId: string, productoId: number) => {
    const res = await resolverPrecio(productoId, cliente?.lista_precio_id ?? null, empresaId)
    if (!res.success || res.data == null) return

    setLineas((prev) =>
      prev.map((l) =>
        l.id === lineaId
          ? { ...l, precio_lista: res.data!, precio_unitario: String(res.data) }
          : l,
      ),
    )
  }

  const elegirProducto = (lineaId: string, producto: ProductoCrm) => {
    setLineas((prev) =>
      prev.map((l) =>
        l.id === lineaId
          ? {
              ...l,
              producto_id: producto.id,
              producto_nombre: producto.nombre,
              categoria: producto.categoria,
              unidad: producto.unidad ?? "kg",
              peso_unitario: producto.peso_unitkg ?? 0,
              abierto: false,
            }
          : l,
      ),
    )
    reproponerPrecio(lineaId, producto.id)
  }

  const set = (id: string, campo: keyof Linea) => (valor: string) =>
    setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)))

  // Los totales se recalculan en cada tecla: ver el total moverse mientras se
  // escribe es lo que evita el error de digitación que nadie revisa.
  const lineasCalculo = useMemo(
    () =>
      lineas.map((l) => ({
        cantidad: Number(l.cantidad) || 0,
        precio_unitario: Number(l.precio_unitario) || 0,
        descuento_pct: descuentoSobreLista(l.precio_lista, Number(l.precio_unitario) || 0),
        peso: (Number(l.cantidad) || 0) * l.peso_unitario,
      })),
    [lineas],
  )

  const totales = useMemo(() => calcularTotales(lineasCalculo, ivaPct), [lineasCalculo, ivaPct])

  const hayExceso = lineasCalculo.some((l) => l.descuento_pct > topeDescuento)

  const guardar = async () => {
    if (!clienteId) {
      toast({ title: "Elige el cliente", variant: "destructive" })
      return
    }

    const utiles = lineas.filter((l) => l.producto_nombre && Number(l.cantidad) > 0)
    if (!utiles.length) {
      toast({ title: "Agrega al menos un producto con cantidad", variant: "destructive" })
      return
    }

    setGuardando(true)
    const res = await crearCotizacion(
      {
        cliente_id: Number(clienteId),
        tipo_venta: tipoVenta,
        forma_pago: formaPago,
        dias_credito: formaPago === "credito" ? Number(diasCredito) || 0 : 0,
        lista_precio_id: cliente?.lista_precio_id ?? null,
        observaciones: observaciones.trim() || null,
        lineas: utiles.map((l, i) => ({
          linea: i + 1,
          producto_id: l.producto_id,
          producto_nombre: l.producto_nombre,
          categoria: l.categoria,
          unidad: l.unidad,
          cantidad: Number(l.cantidad),
          precio_lista: l.precio_lista,
          precio_unitario: Number(l.precio_unitario),
          descuento_pct: descuentoSobreLista(l.precio_lista, Number(l.precio_unitario)),
          descuento_valor: 0, // lo calcula el servidor
          subtotal: 0,
          total_linea: 0,
          peso: (Number(l.cantidad) || 0) * l.peso_unitario,
        })),
      },
      usuario,
      empresaId,
    )
    setGuardando(false)

    if (!res.success) {
      toast({ title: "No se guardó", description: res.error, variant: "destructive" })
      return
    }

    // En venta directa no se anuncia la cotizacion: para el vendedor eso es un
    // detalle interno, y quien llama muestra el aviso del pedido.
    if (tipoVenta === "cotizacion") {
      toast({ title: "Cotización creada", description: res.data?.numero ?? "" })
    }
    onGuardado(res.data?.id)
  }

  if (cargando) {
    return (
      <DialogContent className="max-w-3xl">
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DialogContent>
    )
  }

  return (
    <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{tipoVenta === "directa" ? "Nueva venta" : "Nueva cotización"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-5 py-2">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm">Cliente *</Label>
            <Popover open={clienteAbierto} onOpenChange={setClienteAbierto}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {cliente?.nombre ?? "Buscar cliente…"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Escribe para buscar…" />
                  <CommandList>
                    <CommandEmpty>Ningún cliente coincide.</CommandEmpty>
                    <CommandGroup>
                      {clientes.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.nombre}
                          onSelect={() => {
                            setClienteId(String(c.id))
                            setClienteAbierto(false)
                          }}
                        >
                          <span className="truncate">{c.nombre}</span>
                          {c.lista_precio_nombre && (
                            <Badge variant="outline" className="ml-auto text-[10px]">
                              {c.lista_precio_nombre}
                            </Badge>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {cliente && (
              <p className="text-xs text-muted-foreground">
                {cliente.lista_precio_nombre
                  ? `Lista: ${cliente.lista_precio_nombre}`
                  : "Sin lista asignada: se cotiza a precio base"}
                {cliente.cupo_credito > 0 && ` · Cupo: ${money(cliente.cupo_credito)}`}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Pago</Label>
            <Select value={formaPago} onValueChange={(v) => setFormaPago(v as "contado" | "credito")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contado">Contado</SelectItem>
                <SelectItem value="credito">Crédito</SelectItem>
              </SelectContent>
            </Select>
            {formaPago === "credito" && (
              <Input
                type="number"
                value={diasCredito}
                onChange={(e) => setDiasCredito(e.target.value)}
                placeholder="Días"
                className="mt-1.5"
              />
            )}
          </div>
        </div>

        <Separator />

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Productos</h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => setLineas((l) => [...l, lineaVacia()])}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Agregar línea
            </Button>
          </div>

          <div className="space-y-2">
            {lineas.map((l, i) => {
              const dto = descuentoSobreLista(l.precio_lista, Number(l.precio_unitario) || 0)
              const excede = dto > topeDescuento

              return (
                <div key={l.id} className="grid grid-cols-12 items-end gap-2">
                  <div className="col-span-12 sm:col-span-5">
                    {i === 0 && <Label className="mb-1.5 block text-xs">Producto</Label>}
                    <Popover
                      open={l.abierto}
                      onOpenChange={(o) =>
                        setLineas((prev) => prev.map((x) => (x.id === l.id ? { ...x, abierto: o } : x)))
                      }
                    >
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                          <span className="truncate">{l.producto_nombre || "Buscar producto…"}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Escribe para buscar…" />
                          <CommandList>
                            <CommandEmpty>Ningún producto coincide.</CommandEmpty>
                            <CommandGroup>
                              {productos.map((p) => (
                                <CommandItem key={p.id} value={p.nombre} onSelect={() => elegirProducto(l.id, p)}>
                                  <span className="truncate">{p.nombre}</span>
                                  {p.precio_base != null && (
                                    <span className="ml-auto text-xs text-muted-foreground">
                                      {money(p.precio_base)}
                                    </span>
                                  )}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="col-span-4 sm:col-span-2">
                    {i === 0 && <Label className="mb-1.5 block text-xs">Cantidad</Label>}
                    <Input
                      type="number" min="0" value={l.cantidad}
                      onChange={(e) => set(l.id, "cantidad")(e.target.value)}
                    />
                  </div>

                  <div className="col-span-5 sm:col-span-3">
                    {i === 0 && <Label className="mb-1.5 block text-xs">Precio unitario</Label>}
                    <Input
                      type="number" min="0" value={l.precio_unitario}
                      onChange={(e) => set(l.id, "precio_unitario")(e.target.value)}
                      className={excede ? "border-[var(--chart-3)]" : undefined}
                    />
                    {dto > 0 && (
                      <p className={`mt-0.5 text-[11px] ${excede ? "text-[var(--chart-3)]" : "text-muted-foreground"}`}>
                        {dto}% de descuento{excede && ` · supera el ${topeDescuento}%`}
                      </p>
                    )}
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <Button
                      type="button" variant="ghost" size="icon"
                      disabled={lineas.length === 1}
                      onClick={() => setLineas((prev) => prev.filter((x) => x.id !== l.id))}
                      aria-label="Quitar línea"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {hayExceso && (
          <div className="flex items-start gap-2 rounded-lg border border-[var(--chart-3)]/40 bg-[var(--chart-3)]/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--chart-3)]" />
            <p className="text-xs">
              Hay descuentos por encima del {topeDescuento}%. La cotización queda marcada y
              el pedido requerirá revisión antes de autorizarse.
            </p>
          </div>
        )}

        <Separator />

        <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
          <Fila etiqueta="Subtotal" valor={money(totales.subtotal)} />
          {totales.descuento > 0 && (
            <Fila etiqueta="Descuento" valor={`- ${money(totales.descuento)}`} />
          )}
          <Fila etiqueta={`IVA (${ivaPct}%)`} valor={money(totales.iva)} />
          <Separator />
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{money(totales.total)}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Observaciones</Label>
          <Textarea
            rows={2} value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Condiciones de entrega, notas para el cliente…"
          />
        </div>
      </div>

      <DialogFooter>
        <Button onClick={guardar} disabled={guardando}>
          {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {tipoVenta === "directa" ? "Registrar venta" : "Crear cotización"}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{etiqueta}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  )
}

export default CotizacionForm
