import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getContexto } from "@/lib/crm-auth"

// Endpoint para subir PDFs generados por la app (ej. PDF de
// Aprobacion de Turnos). Antes usaba `@vercel/blob`, que estaba
// devolviendo "Upload failed" generico — el mismo problema que ya
// tuvimos con `/api/upload-signature`. Unificamos al patron de
// Supabase Storage (bucket `archivos`) que es el que funciona en el
// resto del proyecto. La carpeta destino llega como `folder` en el
// FormData (ej. "aprobacionturnos") y, si no viene, cae a
// "documentos".
//
// SEGURIDAD: el endpoint escribe con la llave de servicio en un bucket
// PUBLICO. Sin sesion, cualquiera en internet podia subir archivos y obtener
// una URL servida desde nuestro dominio. Y como `folder` llega del cliente,
// un "../" o una ruta absoluta dejaba escribir en carpetas de otros modulos.
export async function POST(request: NextRequest) {
  try {
    const ctx = await getContexto()
    if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const folder = carpetaSegura(formData.get("folder"))
    if (!folder) {
      return NextResponse.json({ error: "Carpeta no válida" }, { status: 400 })
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const supabaseAdmin = await getSupabaseAdmin()
    const timestamp = Date.now()
    const filePath = `${folder}/documento_${timestamp}.pdf`

    const { error: uploadError } = await supabaseAdmin.storage
      .from("archivos")
      .upload(filePath, file, {
        contentType: file.type || "application/pdf",
        upsert: false,
      })

    if (uploadError) {
      // Propagamos el mensaje real de Supabase para no perder
      // visibilidad del problema en el cliente.
      console.error("[v0] upload-pdf error:", uploadError)
      return NextResponse.json(
        { error: uploadError.message || "Upload failed" },
        { status: 500 },
      )
    }

    const { data: urlData } = supabaseAdmin.storage
      .from("archivos")
      .getPublicUrl(filePath)

    return NextResponse.json({ url: urlData.publicUrl })
  } catch (error: any) {
    console.error("[v0] upload-pdf exception:", error)
    return NextResponse.json(
      { error: error?.message || "Upload failed" },
      { status: 500 },
    )
  }
}

/**
 * Carpeta destino saneada, o null si no es aceptable.
 *
 * Solo segmentos de letras, numeros, guion y guion bajo separados por "/".
 * Asi no cabe "..", ni una ruta absoluta, ni barras invertidas, ni segmentos
 * vacios: lista blanca de caracteres en vez de buscar cada truco conocido.
 */
function carpetaSegura(valor: FormDataEntryValue | null): string | null {
  const bruto = typeof valor === "string" ? valor.trim() : ""
  if (!bruto) return "documentos"
  if (bruto.startsWith("/") || bruto.includes("..")) return null
  const segmentos = bruto.split("/")
  if (!segmentos.every((s) => /^[A-Za-z0-9_-]+$/.test(s))) return null
  return segmentos.join("/")
}
