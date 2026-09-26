export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { fetchConfigData } from "@/lib/config-actions"
import { empresaPermitida, getContexto } from "@/lib/crm-auth"
import { NextResponse } from "next/server"

// Lectura generica de las tablas de configuracion heredadas de LIPgo (la usa
// generic-crud-table). Tenia tres agujeros:
//   1. Respondia sin sesion.
//   2. Aceptaba CUALQUIER nombre de tabla y la leia entera: con sesion se
//      podian pedir tarifas, proveedores o los accesos de otros usuarios.
//   3. Confiaba en el `empresaId` del navegador: se podian pedir los datos de
//      otra empresa cambiando un numero en la URL.
//
// Solo expone GET. Si algun dia se agrega POST/PUT/PATCH/DELETE aqui, debe
// exigir ademas uno de crm_maestros_admin, crm_productos, crm_clientes o
// crm_vendedores (con `tienePermiso`), no solo sesion.

/** Tablas que el CRM tiene motivo para leer. Todo lo demas se niega. */
const TABLAS_PERMITIDAS = new Set([
  "bodegas", "categorias", "subcategorias", "clientes", "condicionespago",
  "destinos", "productos", "tipodespacho", "vendedores",
])

export async function GET(request: Request) {
  try {
    const ctx = await getContexto()
    if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const tableName = searchParams.get("table")
    const empresaIdParam = searchParams.get("empresaId")

    if (!tableName) {
      return NextResponse.json({ success: false, error: "Table name is required" }, { status: 400 })
    }
    if (!TABLAS_PERMITIDAS.has(tableName)) {
      return NextResponse.json({ success: false, error: "Tabla no permitida" }, { status: 403 })
    }

    // La empresa pedida tiene que ser la del usuario o una a la que tenga
    // acceso explicito; si no, se usa la suya.
    const empresaId = await empresaPermitida(ctx, empresaIdParam ? Number.parseInt(empresaIdParam, 10) : null)

    const result = await fetchConfigData(tableName, empresaId)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[API] Error fetching config data:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
