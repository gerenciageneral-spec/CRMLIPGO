"use client"

// Reportes exportables a Excel.
//
// Todo lo que se consulta en el CRM se puede bajar con el mismo filtro que se
// ve en pantalla. Es lo que evita que alguien copie una tabla a mano cuando
// gerencia pide "lo mismo pero en un archivo".

import { useState } from "react"
import {
  Loader2, Download, FileSpreadsheet, Users, FileText, ShoppingCart,
  Wallet, Percent, UserPlus,
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { getProspectos } from "@/lib/crm-prospectos-actions"
import { getCotizaciones } from "@/lib/crm-cotizaciones-actions"
import { getPedidos } from "@/lib/crm-pedidos-actions"
import { getAging, getComisiones } from "@/lib/crm-cartera-actions"
import { getClientesCrm } from "@/lib/crm-catalogos-actions"
import { hoyISO, rangoDelMes } from "@/lib/crm-fechas"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { DatePickerField } from "@/components/ui/date-picker-field"
import { toast } from "@/hooks/use-toast"
import type { LucideIcon } from "lucide-react"

interface Reporte {
  id: string
  nombre: string
  descripcion: string
  icono: LucideIcon
  usaFechas: boolean
  generar: (empresaId: number, desde: string, hasta: string) => Promise<Record<string, unknown>[]>
}

const REPORTES: Reporte[] = [
  {
    id: "prospectos",
    nombre: "Prospectos",
    descripcion: "El embudo completo con su etapa, valor y próximo contacto",
    icono: UserPlus,
    usaFechas: false,
    generar: async (empresaId) => {
      const res = await getProspectos(empresaId)
      return (res.data ?? []).map((p) => ({
        Código: p.codigo,
        "Razón social": p.razon_social,
        Contacto: p.contacto_nombre,
        Celular: p.contacto_celular,
        Ciudad: p.ciudad,
        Etapa: p.etapa?.nombre,
        "Valor estimado": p.valor_estimado,
        Fuente: p.fuente,
        "Próximo contacto": p.proxima_fecha,
        Acción: p.proxima_accion,
        "Tiene GPS": p.latitud != null ? "Sí" : "No",
        Creado: p.creado_en?.slice(0, 10),
      }))
    },
  },
  {
    id: "cotizaciones",
    nombre: "Cotizaciones",
    descripcion: "Emitidas con su estado, vigencia y valor",
    icono: FileText,
    usaFechas: true,
    generar: async (empresaId, desde, hasta) => {
      const res = await getCotizaciones(empresaId)
      return (res.data ?? [])
        .filter((c) => c.fecha_emision >= desde && c.fecha_emision <= hasta)
        .map((c) => ({
          Número: c.numero,
          Cliente: c.cliente_nombre ?? c.prospecto_nombre,
          Emisión: c.fecha_emision,
          Vence: c.fecha_vencimiento,
          Estado: c.estado,
          Subtotal: c.subtotal,
          IVA: c.iva_valor,
          Total: c.total,
          "Requiere autorización": c.requiere_autorizacion_descuento ? "Sí" : "No",
        }))
    },
  },
  {
    id: "pedidos",
    nombre: "Pedidos",
    descripcion: "Con sus autorizaciones y el número en operación",
    icono: ShoppingCart,
    usaFechas: true,
    generar: async (empresaId, desde, hasta) => {
      const res = await getPedidos(empresaId)
      return (res.data ?? [])
        .filter((p) => p.fecha >= desde && p.fecha <= hasta)
        .map((p) => ({
          Número: p.numero,
          Cliente: p.cliente_nombre,
          Fecha: p.fecha,
          Pago: p.forma_pago === "credito" ? `Crédito ${p.dias_credito} días` : "Contado",
          Estado: p.estado,
          Subtotal: p.subtotal,
          Total: p.total,
          "Autorizó contabilidad": p.auth_contabilidad_nombre,
          "Autorizó gerencia": p.auth_gerencia_nombre,
          "Pedido en operación": p.idpedido_lipgo,
        }))
    },
  },
  {
    id: "cartera",
    nombre: "Cartera",
    descripcion: "Pendiente con su antigüedad y días vencidos",
    icono: Wallet,
    usaFechas: false,
    generar: async (empresaId) => {
      const res = await getAging(empresaId)
      return (res.data?.cuentas ?? []).map((c) => ({
        Cliente: c.cliente_nombre,
        Factura: c.numero_factura,
        "Fecha factura": c.fecha_factura,
        Vence: c.fecha_vencimiento,
        "Días vencido": c.dias_vencido,
        Antigüedad: c.tramo_aging,
        "Valor original": c.valor_original,
        Abonado: c.valor_abonado,
        Saldo: c.saldo,
        Estado: c.estado,
      }))
    },
  },
  {
    id: "comisiones",
    nombre: "Comisiones",
    descripcion: "Liquidadas con su base y porcentaje aplicado",
    icono: Percent,
    usaFechas: false,
    generar: async (empresaId) => {
      const res = await getComisiones(empresaId)
      return (res.data ?? []).map((c) => ({
        Vendedor: c.vendedor_nombre,
        Período: c.periodo,
        Base: c.base_calculo,
        "% aplicado": c.porcentaje,
        Comisión: c.valor,
        Estado: c.estado,
        Liquidada: c.liquidado_en?.slice(0, 10),
      }))
    },
  },
  {
    id: "clientes",
    nombre: "Clientes",
    descripcion: "Con cupo, lista de precios y datos de contacto",
    icono: Users,
    usaFechas: false,
    generar: async (empresaId) => {
      const res = await getClientesCrm(empresaId)
      return (res.data ?? []).map((c) => ({
        Nombre: c.nombre,
        Documento: c.documento,
        Contacto: c.personacontacto,
        Celular: c.celular,
        Correo: c.correo,
        Segmento: c.segmento,
        "Lista de precios": c.lista_precio_nombre,
        "Cupo de crédito": c.cupo_credito,
        "Días de crédito": c.dias_credito,
        Bloqueado: c.bloqueado_cartera ? "Sí" : "No",
        "Tiene GPS": c.latitud != null ? "Sí" : "No",
      }))
    },
  },
]

export function ReportesPanel() {
  const { selectedEmpresaId } = useAuth()
  const empresaId = selectedEmpresaId ?? 1

  const mes = rangoDelMes(hoyISO())
  const [desde, setDesde] = useState(mes.desde)
  const [hasta, setHasta] = useState(mes.hasta)
  const [generando, setGenerando] = useState<string | null>(null)

  const descargar = async (reporte: Reporte) => {
    setGenerando(reporte.id)

    try {
      const filas = await reporte.generar(empresaId, desde, hasta)

      if (!filas.length) {
        toast({
          title: "Sin datos",
          description: "No hay información para ese período.",
        })
        return
      }

      // xlsx se importa de forma dinámica: es pesada y solo hace falta al
      // exportar, no en cada carga del módulo.
      const XLSX = await import("xlsx")
      const hoja = XLSX.utils.json_to_sheet(filas)
      const libro = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(libro, hoja, reporte.nombre.slice(0, 31))

      const sufijo = reporte.usaFechas ? `_${desde}_${hasta}` : `_${hoyISO()}`
      XLSX.writeFile(libro, `${reporte.nombre}${sufijo}.xlsx`)

      toast({
        title: "Descargado",
        description: `${filas.length} fila(s) en ${reporte.nombre}.xlsx`,
      })
    } catch (err) {
      toast({
        title: "No se pudo generar",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      })
    } finally {
      setGenerando(null)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Descarga la información del CRM en Excel
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Desde</Label>
            <DatePickerField value={desde} onChange={setDesde} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Hasta</Label>
            <DatePickerField value={hasta} onChange={setHasta} />
          </div>
          <p className="text-xs text-muted-foreground">
            El rango aplica solo a los reportes que dependen de fechas.
            <br />
            Los demás traen el estado actual.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {REPORTES.map((r) => {
          const Icono = r.icono
          const ocupado = generando === r.id

          return (
            <Card key={r.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  <span className="rounded-lg bg-[var(--chart-1)]/10 p-2 text-[var(--chart-1)]">
                    <Icono className="h-4 w-4" aria-hidden="true" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.nombre}</p>
                    <p className="text-xs text-muted-foreground">{r.descripcion}</p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => descargar(r)}
                  disabled={ocupado}
                >
                  {ocupado ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Descargar
                  {r.usaFechas && <span className="ml-1 text-xs opacity-60">· con fechas</span>}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <FileSpreadsheet className="h-3.5 w-3.5" />
        Los archivos se generan en el navegador: no pasan por el servidor ni
        quedan almacenados.
      </p>
    </div>
  )
}

export default ReportesPanel
