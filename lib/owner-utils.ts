import { getSupabaseAdmin } from "@/lib/supabase-admin"

// OWNER = razón social dueña del producto, determinada por el `id_empresa` al que
// está asignado el producto en la tabla `productos`. Es la MISMA fuente y las
// MISMAS etiquetas que usa la vista `facturacion` (ver
// scripts/068_facturacion_owner_harinera_indupan.sql), para que el PDF de la orden de
// cargue, la trazabilidad y el cobro COINCIDAN.
//
// Nota de negocio (confirmada): id_empresa 1 y 6 son el MISMO owner "Harinera
// Indupan". 3 y 4 son "Molinos del Atlántico".
export function ownerDeIdEmpresa(id: number | null | undefined): string {
  switch (Number(id)) {
    case 1:
    case 6:
      return "Harinera Indupan"
    case 2:
      return "AVIMOL"
    case 3:
    case 4:
      return "Molinos del Atlántico"
    default:
      return id != null ? `Empresa ${id}` : "SIN OWNER"
  }
}

export interface ResolucionOwners {
  /** owner (razón social) por nombre de producto. */
  ownerPorNombre: Map<string, string>
  /** id_empresa dueño por nombre de producto. */
  idPorNombre: Map<string, number | null>
  /** nombres de producto amarrados a 2+ id_empresa (ambigüedad a depurar). */
  ambiguos: string[]
  /** nombres de producto que no existen en el maestro `productos`. */
  noEncontrados: string[]
}

/**
 * Resuelve el owner de cada producto por su NOMBRE, cruzando con
 * `productos.id_empresa`. Detecta productos ambiguos (mismo nombre en 2+
 * id_empresa) y no encontrados. Una sola consulta al maestro (catálogo chico).
 */
export async function resolverOwnerPorNombre(nombres: string[]): Promise<ResolucionOwners> {
  const norm = (s: string | null | undefined) => String(s ?? "").trim()
  const wanted = new Set(nombres.map(norm).filter(Boolean))

  const ownerPorNombre = new Map<string, string>()
  const idPorNombre = new Map<string, number | null>()
  const ambiguos: string[] = []
  const noEncontrados: string[] = []
  if (wanted.size === 0) return { ownerPorNombre, idPorNombre, ambiguos, noEncontrados }

  const supabase = await getSupabaseAdmin()
  const { data } = await supabase.from("productos").select("nombre, id_empresa")

  const idsPorNombre = new Map<string, Set<number>>()
  for (const p of data ?? []) {
    const n = norm(p.nombre)
    if (!wanted.has(n)) continue
    if (!idsPorNombre.has(n)) idsPorNombre.set(n, new Set())
    if (p.id_empresa != null) idsPorNombre.get(n)!.add(Number(p.id_empresa))
  }

  for (const n of wanted) {
    const ids = idsPorNombre.get(n)
    if (!ids || ids.size === 0) {
      noEncontrados.push(n)
      ownerPorNombre.set(n, "SIN OWNER")
      idPorNombre.set(n, null)
      continue
    }
    if (ids.size > 1) ambiguos.push(n)
    const id = [...ids][0]
    idPorNombre.set(n, id)
    ownerPorNombre.set(n, ownerDeIdEmpresa(id))
  }
  return { ownerPorNombre, idPorNombre, ambiguos, noEncontrados }
}
