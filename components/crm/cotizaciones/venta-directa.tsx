"use client"

// Venta directa: el caso en que el cliente ya decidió y no hace falta cotizar.
//
// Reutiliza el formulario de cotización entero. Internamente crea la
// cotización con tipo_venta='directa' y la convierte en pedido de inmediato,
// en vez de tener un segundo formulario casi idéntico que habría que mantener
// en paralelo. El documento queda igual, solo que su ciclo dura un segundo.
//
// El pedido resultante pasa por las mismas dos autorizaciones: saltarse la
// cotización no es saltarse el control.

import { useState } from "react"
import { ShoppingCart, Info } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { convertirEnPedido } from "@/lib/crm-cotizaciones-actions"
import { CotizacionForm } from "./cotizacion-form"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "@/hooks/use-toast"

interface Props {
  onNavigate?: (modulo: string) => void
}

export function VentaDirecta({ onNavigate }: Props) {
  const { profile, selectedEmpresaId } = useAuth()
  const empresaId = selectedEmpresaId ?? 1
  const [abierto, setAbierto] = useState(false)

  // El formulario devuelve la cotización creada; aquí se convierte en pedido
  // sin pedir un paso más al vendedor.
  const alGuardar = async (cotizacionId?: number) => {
    setAbierto(false)

    if (!cotizacionId) {
      onNavigate?.("Cotizaciones")
      return
    }

    const res = await convertirEnPedido(cotizacionId, profile?.usuario ?? "desconocido", empresaId)

    if (!res.success) {
      // La cotización sí quedó creada: se avisa dónde encontrarla para que el
      // trabajo no se pierda.
      toast({
        title: "La venta quedó como cotización",
        description: `${res.error}. Puedes convertirla desde Cotizaciones.`,
        variant: "destructive",
      })
      onNavigate?.("Cotizaciones")
      return
    }

    toast({
      title: "Pedido creado",
      description: `${res.data?.numero} · pendiente de autorización`,
    })
    onNavigate?.("Pedidos CRM")
  }

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-[var(--chart-1)]/10 p-2 text-[var(--chart-1)]">
            <ShoppingCart className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Nueva venta</h1>
            <p className="text-sm text-muted-foreground">Para cuando el cliente ya decidió y no hace falta cotizar</p>
          </div>
        </div>
      </header>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          La venta directa genera el pedido de una vez, sin pasar por cotización.
          Aun así requiere las dos autorizaciones —contabilidad y gerencia— antes
          de viajar al sistema operativo.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="rounded-full bg-[var(--chart-1)]/10 p-4 text-[var(--chart-1)]">
            <ShoppingCart className="h-8 w-8" aria-hidden="true" />
          </span>

          <div className="space-y-1">
            <p className="font-medium">Registrar una venta</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Se captura igual que una cotización: cliente, productos y precios.
              El precio lo propone la lista del cliente.
            </p>
          </div>

          <Dialog open={abierto} onOpenChange={setAbierto}>
            <DialogTrigger asChild>
              <Button size="lg">
                <ShoppingCart className="mr-1.5 h-4 w-4" />
                Empezar
              </Button>
            </DialogTrigger>
            <CotizacionForm
              empresaId={empresaId}
              usuario={profile?.usuario ?? "desconocido"}
              tipoVenta="directa"
              onGuardado={alGuardar}
            />
          </Dialog>
        </CardContent>
      </Card>
    </div>
  )
}

export default VentaDirecta
