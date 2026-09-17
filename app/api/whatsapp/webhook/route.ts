// Webhook de WhatsApp: recibe los acuses de entrega y lectura.
//
// Dos verbos, dos propósitos:
//
//  GET  — Meta lo llama UNA vez al guardar la URL en el panel, con un desafío.
//         Hay que devolver el `hub.challenge` tal cual, pero SOLO si el
//         `hub.verify_token` coincide con el nuestro. Sin esa comprobación,
//         cualquiera podría registrar nuestro endpoint en su app.
//
//  POST — llega cada vez que un mensaje cambia de estado. Lo que interesa es
//         `statuses`: sent, delivered, read, failed.
//
// NUNCA devuelve un error a Meta salvo que la firma falle: si respondemos 500,
// Meta reintenta el mismo evento una y otra vez y termina desactivando el
// webhook. Un evento que no podemos procesar se registra y se responde 200.

import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import crypto from "crypto"

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const modo = p.get("hub.mode")
  const token = p.get("hub.verify_token")
  const challenge = p.get("hub.challenge")

  const esperado = process.env.WHATSAPP_VERIFY_TOKEN
  if (!esperado) {
    console.error("[v0] whatsapp webhook: falta WHATSAPP_VERIFY_TOKEN")
    return new NextResponse("Webhook sin configurar", { status: 500 })
  }

  if (modo === "subscribe" && token === esperado) {
    // Texto plano, sin comillas: Meta compara la respuesta carácter a carácter.
    return new NextResponse(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    })
  }

  return new NextResponse("Token de verificación incorrecto", { status: 403 })
}

/**
 * Comprueba que el evento venga de verdad de Meta.
 *
 * Meta firma el cuerpo con el App Secret. Sin esta validación, cualquiera que
 * conozca la URL podría marcar mensajes como entregados o inventar acuses.
 *
 * Si no hay APP_SECRET configurado se acepta el evento pero se avisa en el log:
 * se prefiere que el webhook funcione a medias durante la puesta en marcha
 * antes que rechazar todo en silencio.
 */
function firmaValida(crudo: string, cabecera: string | null): boolean {
  const secreto = process.env.WHATSAPP_APP_SECRET
  if (!secreto) {
    console.warn("[v0] whatsapp webhook: sin WHATSAPP_APP_SECRET, no se valida la firma")
    return true
  }
  if (!cabecera?.startsWith("sha256=")) return false
  const esperada = crypto.createHmac("sha256", secreto).update(crudo).digest("hex")
  const recibida = cabecera.slice(7)
  // timingSafeEqual exige el mismo largo; si difiere, la firma ya es inválida.
  if (esperada.length !== recibida.length) return false
  return crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(recibida))
}

export async function POST(request: NextRequest) {
  let crudo = ""
  try {
    crudo = await request.text()
    if (!firmaValida(crudo, request.headers.get("x-hub-signature-256"))) {
      return new NextResponse("Firma inválida", { status: 401 })
    }

    const cuerpo = JSON.parse(crudo || "{}")
    const sb: any = await getSupabaseAdmin()

    for (const entry of cuerpo?.entry ?? []) {
      for (const cambio of entry?.changes ?? []) {
        const valor = cambio?.value ?? {}

        // --- ACUSES DE ESTADO ---------------------------------------------
        for (const st of valor?.statuses ?? []) {
          const messageId = st?.id
          if (!messageId) continue

          // Meta usa "sent"; en la bitácora ya está como "enviado".
          const mapa: Record<string, string> = {
            sent: "enviado",
            delivered: "entregado",
            read: "leido",
            failed: "fallido",
          }
          const estado = mapa[String(st?.status ?? "")] ?? null
          if (!estado) continue

          const patch: any = { estado }
          // `timestamp` viene en segundos; Date espera milisegundos.
          const ts = st?.timestamp ? new Date(Number(st.timestamp) * 1000).toISOString() : null
          if (estado === "entregado" && ts) patch.entregado_at = ts
          if (estado === "leido" && ts) {
            patch.leido_at = ts
            // Un mensaje leído estuvo entregado, aunque ese acuse se perdiera.
            patch.entregado_at = ts
          }
          if (estado === "fallido") {
            const err = st?.errors?.[0] ?? {}
            patch.error_codigo = String(err.code ?? "")
            patch.error_detalle = err.error_data?.details ?? err.title ?? err.message ?? null
          }

          // No se degrada el estado: si ya está "leido", un acuse tardío de
          // "entregado" no puede hacerlo retroceder. Los acuses llegan sin
          // orden garantizado.
          const rango: Record<string, number> = { enviado: 1, entregado: 2, leido: 3, fallido: 4 }
          const { data: actual } = await sb
            .from("whatsapp_mensajes")
            .select("id, estado")
            .eq("message_id", messageId)
            .maybeSingle()
          if (!actual) continue
          if ((rango[actual.estado] ?? 0) > (rango[estado] ?? 0)) continue

          await sb.from("whatsapp_mensajes").update(patch).eq("id", actual.id)
        }

        // --- MENSAJES ENTRANTES -------------------------------------------
        // Todavía no se procesan: no hay flujo que responda. Se registran en el
        // log para poder ver que el webhook está recibiendo de verdad.
        for (const m of valor?.messages ?? []) {
          console.log("[v0] whatsapp entrante:", m?.from, m?.type)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    // Se responde 200 igual: con un 500, Meta reintenta el evento en bucle y
    // acaba desactivando el webhook.
    console.error("[v0] whatsapp webhook error:", e?.message ?? e)
    return NextResponse.json({ ok: true, nota: "error registrado" })
  }
}
