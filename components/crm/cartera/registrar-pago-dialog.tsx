"use client"

// Registro de un abono sobre una cuenta por cobrar.
//
// El saldo NO se toca desde aquí: lo recalcula un trigger de la base a partir
// de la suma de pagos. Así el saldo no puede quedar diciendo una cosa y los
// pagos otra, que es el defecto clásico de una cartera mantenida a mano.

import { useEffect, useState } from "react"
import { Loader2, Banknote, Paperclip, History } from "lucide-react"
import { registrarPago, getPagos, anularPago } from "@/lib/crm-cartera-actions"
import { MEDIOS_PAGO, money, type CuentaPorCobrar, type Pago } from "@/lib/crm-cartera"
import { hoyISO } from "@/lib/crm-fechas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { DatePickerField } from "@/components/ui/date-picker-field"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"

export function RegistrarPagoDialog({
  cuenta, empresaId, usuario, onCerrar, onPagado,
}: {
  cuenta: CuentaPorCobrar | null
  empresaId: number
  usuario: string
  onCerrar: () => void
  onPagado: () => void
}) {
  const [valor, setValor] = useState("")
  const [fecha, setFecha] = useState(hoyISO())
  const [medio, setMedio] = useState("transferencia")
  const [referencia, setReferencia] = useState("")
  const [observacion, setObservacion] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [historial, setHistorial] = useState<Pago[]>([])

  useEffect(() => {
    if (!cuenta) return
    // El valor arranca en el saldo completo: el caso más común es pagar todo,
    // y así el usuario solo lo cambia cuando es un abono parcial.
    setValor(String(cuenta.saldo))
    setFecha(hoyISO())
    setMedio("transferencia")
    setReferencia("")
    setObservacion("")

    getPagos(cuenta.id).then((r) => r.success && setHistorial(r.data ?? []))
  }, [cuenta])

  if (!cuenta) return null

  const monto = Number(valor) || 0
  const saldo = Number(cuenta.saldo) || 0
  const excede = monto > saldo
  const saldaTodo = monto > 0 && monto >= saldo

  const guardar = async () => {
    setGuardando(true)
    const res = await registrarPago(
      {
        cuenta_cobrar_id: cuenta.id,
        valor: monto,
        fecha_pago: fecha,
        medio_pago: medio,
        referencia: referencia.trim() || undefined,
        observacion: observacion.trim() || undefined,
      },
      usuario,
      empresaId,
    )
    setGuardando(false)

    if (!res.success) {
      toast({ title: "No se registró el abono", description: res.error, variant: "destructive" })
      return
    }

    toast({
      title: res.data?.saldoNuevo === 0 ? "Factura saldada" : "Abono registrado",
      description: res.data?.liquidoComision
        ? "Se liquidó la comisión del vendedor."
        : res.data?.saldoNuevo
          ? `Queda un saldo de ${money(res.data.saldoNuevo)}`
          : undefined,
    })
    onPagado()
  }

  const anular = async (pagoId: number) => {
    const res = await anularPago(pagoId, empresaId)
    if (!res.success) {
      toast({ title: "No se pudo anular", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: "Abono anulado" })
    onPagado()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar abono</DialogTitle>
          <DialogDescription>
            {cuenta.cliente_nombre}
            {cuenta.numero_factura && ` · ${cuenta.numero_factura}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Valor original</p>
              <p className="font-medium tabular-nums">{money(cuenta.valor_original)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saldo actual</p>
              <p className="font-semibold tabular-nums">{money(saldo)}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Valor del abono *</Label>
            <Input
              type="number" min="0" max={saldo}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className={excede ? "border-destructive" : undefined}
            />
            {excede ? (
              <p className="text-xs text-destructive">
                Supera el saldo de {money(saldo)}
              </p>
            ) : saldaTodo ? (
              <p className="text-xs text-[var(--chart-2)]">Salda la factura completa</p>
            ) : monto > 0 ? (
              <p className="text-xs text-muted-foreground">
                Quedaría un saldo de {money(saldo - monto)}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Fecha</Label>
              <DatePickerField value={fecha} onChange={setFecha} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Medio</Label>
              <Select value={medio} onValueChange={setMedio}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEDIOS_PAGO.map((m) => (
                    <SelectItem key={m.valor} value={m.valor}>{m.etiqueta}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Referencia</Label>
            <Input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Número de transferencia, cheque…"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Observación</Label>
            <Textarea rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
          </div>

          {historial.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <History className="h-3.5 w-3.5 text-muted-foreground" />
                  Abonos anteriores
                </p>

                {historial.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-xs">
                    <span className="tabular-nums font-medium">{money(p.valor)}</span>
                    <span className="text-muted-foreground">{p.fecha_pago}</span>
                    {p.referencia && <span className="text-muted-foreground">· {p.referencia}</span>}
                    {p.soporte_url && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                    <Button
                      variant="ghost" size="sm"
                      className="ml-auto h-6 px-2 text-xs text-destructive"
                      onClick={() => anular(p.id)}
                    >
                      Anular
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando || monto <= 0 || excede}>
            {guardando ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Banknote className="mr-1.5 h-4 w-4" />
            )}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default RegistrarPagoDialog
