"use client"

import { useMemo, useState } from "react"
import { CalendarRange, RotateCcw } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { PedidoCabecera, PedidoDetalle } from "./types"

/**
 * Hook compartido por las tabs para filtrar por anio/mes/dia a partir
 * de `pedidoscabecera.fechadeentrega` (fecha real de entrega al
 * cliente). Devuelve los datasets ya filtrados y los setters/estado
 * del control para que la tab pueda renderizar el componente
 * <PeriodFilter />.
 *
 * Por que `fechadeentrega` y no `fecha`:
 *   - El dashboard mide CUMPLIMIENTO comercial / logistico al cliente,
 *     y la fecha natural de comparacion mes-a-mes es la fecha de
 *     entrega (no la de creacion del pedido, que puede ser semanas
 *     antes y distorsiona la serie temporal).
 *   - Pedidos sin `fechadeentrega` (aun no entregados) quedan fuera de
 *     los filtros con año/mes/dia, pero siguen apareciendo cuando el
 *     usuario deja "Todos los años / Todos los meses". Esto es
 *     intencional: para metricas de cumplimiento, "sin entregar" no
 *     pertenece a ningun mes.
 *
 * Diseno (jerarquia año -> mes -> dia):
 *   - El filtro de mes solo aplica si hay un año seleccionado (un mes
 *     suelto entre años seria ambiguo).
 *   - El filtro de dia solo aplica si hay año Y mes seleccionados
 *     (un dia sin mes no tiene sentido); ademas la lista de dias
 *     disponibles se deriva de los datos del año/mes activo, asi el
 *     dropdown nunca ofrece dias sin pedidos.
 *   - Detalle se cruza por idpedido contra la cabecera filtrada. Asi
 *     un calculo basado en `detalle` (ej. eficiencia de carga) tambien
 *     respeta el periodo aunque la propia tabla `pedidosdetalle` no
 *     tenga campo de fecha.
 *   - El conteo final se expone en `meta.filteredPedidos` para mostrar
 *     un contador junto al control y dar feedback explicito.
 */
export function usePeriodFilter(
  cabecera: PedidoCabecera[],
  detalle?: PedidoDetalle[],
) {
  const [year, setYear] = useState<"all" | number>("all")
  const [month, setMonth] = useState<"all" | number>("all")
  const [day, setDay] = useState<"all" | number>("all")

  // Lista de años presentes en la data, descendente (más reciente arriba).
  // Usamos `slice(0, 4)` en lugar de Date para no caer en zonas horarias.
  // Se deriva de `fechadeentrega` para que el dropdown solo ofrezca años
  // con entregas reales (no fechas de creacion del pedido).
  const years = useMemo(() => {
    const set = new Set<number>()
    for (const p of cabecera) {
      if (!p.fechadeentrega) continue
      const y = Number(p.fechadeentrega.slice(0, 4))
      if (Number.isFinite(y)) set.add(y)
    }
    return Array.from(set).sort((a, b) => b - a)
  }, [cabecera])

  // Lista de dias disponibles para el año/mes activos. Si no hay año
  // o mes seleccionado, devolvemos array vacio (el select de dia
  // queda deshabilitado de todas formas). Asi evitamos mostrar "31"
  // en febrero o dias sin pedidos en ese periodo.
  const days = useMemo(() => {
    if (year === "all" || month === "all") return [] as number[]
    const set = new Set<number>()
    const mm = String(month).padStart(2, "0")
    const prefix = `${year}-${mm}-`
    for (const p of cabecera) {
      if (!p.fechadeentrega) continue
      if (!p.fechadeentrega.startsWith(prefix)) continue
      const d = Number(p.fechadeentrega.slice(8, 10))
      if (Number.isFinite(d)) set.add(d)
    }
    return Array.from(set).sort((a, b) => a - b)
  }, [cabecera, year, month])

  // Filtramos cabecera por `fechadeentrega`. Si no hay filtros activos
  // devolvemos la referencia original (evita clones innecesarios y
  // permite que las tabs detecten "no filtro" via identidad).
  const filteredCabecera = useMemo(() => {
    if (year === "all" && month === "all" && day === "all") return cabecera
    return cabecera.filter((p) => {
      if (!p.fechadeentrega) return false
      const y = Number(p.fechadeentrega.slice(0, 4))
      const m = Number(p.fechadeentrega.slice(5, 7))
      const d = Number(p.fechadeentrega.slice(8, 10))
      if (year !== "all" && y !== year) return false
      if (month !== "all" && year !== "all" && m !== month) return false
      if (
        day !== "all" &&
        year !== "all" &&
        month !== "all" &&
        d !== day
      )
        return false
      return true
    })
  }, [cabecera, year, month, day])

  // Si tenemos detalle, lo cruzamos por idpedido contra cabecera
  // filtrada. El Set evita O(n*m).
  const filteredDetalle = useMemo(() => {
    if (!detalle) return [] as PedidoDetalle[]
    if (filteredCabecera === cabecera) return detalle
    const ids = new Set(filteredCabecera.map((c) => c.idpedido))
    return detalle.filter((d) => ids.has(d.idpedido))
  }, [detalle, cabecera, filteredCabecera])

  const reset = () => {
    setYear("all")
    setMonth("all")
    setDay("all")
  }

  const isActive = year !== "all" || month !== "all" || day !== "all"

  // Wrappers para mantener la coherencia jerarquica: cambiar año o mes
  // resetea los niveles inferiores (mes/dia o solo dia) cuando ya no
  // tienen sentido. Esto evita estados invalidos como "Marzo, dia 31"
  // si el usuario cambia al año anterior donde marzo no tiene 31 dias
  // con pedidos.
  const handleSetYear = (v: "all" | number) => {
    setYear(v)
    if (v === "all") {
      setMonth("all")
      setDay("all")
    } else {
      setDay("all")
    }
  }

  const handleSetMonth = (v: "all" | number) => {
    setMonth(v)
    setDay("all")
  }

  return {
    year,
    month,
    day,
    setYear: handleSetYear,
    setMonth: handleSetMonth,
    setDay,
    years,
    days,
    reset,
    isActive,
    filteredCabecera,
    filteredDetalle,
    meta: {
      totalPedidos: cabecera.length,
      filteredPedidos: filteredCabecera.length,
    },
  }
}

const MESES = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
]

interface PeriodFilterProps {
  year: "all" | number
  month: "all" | number
  day: "all" | number
  setYear: (v: "all" | number) => void
  setMonth: (v: "all" | number) => void
  setDay: (v: "all" | number) => void
  years: number[]
  days: number[]
  reset: () => void
  isActive: boolean
  totalPedidos: number
  filteredPedidos: number
}

/**
 * Control visual del filtro: icono + tres selects compactos (año,
 * mes, dia) + boton limpiar (visible solo cuando hay filtros activos)
 * + badge con el conteo "X / Y pedidos".
 *
 * Jerarquia visual: el select de mes se deshabilita sin año, y el de
 * dia se deshabilita sin año+mes. Esto guia al usuario a refinar el
 * periodo de mayor a menor granularidad y evita combinaciones
 * invalidas. La lista de dias disponibles se calcula dinamicamente a
 * partir de los datos del periodo activo.
 *
 * Se renderiza como un strip horizontal que cabe arriba de cualquier
 * tab. En mobile se apila por flex-wrap.
 */
export function PeriodFilter({
  year,
  month,
  day,
  setYear,
  setMonth,
  setDay,
  years,
  days,
  reset,
  isActive,
  totalPedidos,
  filteredPedidos,
}: PeriodFilterProps) {
  const monthDisabled = year === "all"
  const dayDisabled = year === "all" || month === "all"

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <CalendarRange className="h-4 w-4 text-primary" />
        <span className="hidden sm:inline">Período:</span>
      </div>

      <Select
        value={year === "all" ? "all" : String(year)}
        onValueChange={(v) => setYear(v === "all" ? "all" : Number(v))}
      >
        <SelectTrigger className="h-8 w-[130px] text-xs">
          <SelectValue placeholder="Año" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los años</SelectItem>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={month === "all" ? "all" : String(month)}
        onValueChange={(v) => setMonth(v === "all" ? "all" : Number(v))}
        disabled={monthDisabled}
      >
        <SelectTrigger
          className="h-8 w-[150px] text-xs"
          aria-label="Filtrar por mes"
        >
          <SelectValue placeholder="Mes" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los meses</SelectItem>
          {MESES.map((m) => (
            <SelectItem key={m.value} value={String(m.value)}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={day === "all" ? "all" : String(day)}
        onValueChange={(v) => setDay(v === "all" ? "all" : Number(v))}
        disabled={dayDisabled}
      >
        <SelectTrigger
          className="h-8 w-[120px] text-xs"
          aria-label="Filtrar por día"
        >
          <SelectValue placeholder="Día" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los días</SelectItem>
          {days.map((d) => (
            <SelectItem key={d} value={String(d)}>
              Día {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Badge variant="secondary" className="ml-auto tabular-nums">
        {filteredPedidos === totalPedidos
          ? `${totalPedidos.toLocaleString("es-CO")} pedidos`
          : `${filteredPedidos.toLocaleString("es-CO")} / ${totalPedidos.toLocaleString(
              "es-CO",
            )}`}
      </Badge>

      {isActive ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          className="h-8 px-2 text-xs"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Limpiar
        </Button>
      ) : null}
    </div>
  )
}
