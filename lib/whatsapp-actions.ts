"use server"

// ---------------------------------------------------------------------------
// MENSAJERÍA POR WHATSAPP (WhatsApp Business Cloud API)
//
// EL TOKEN NUNCA SALE DEL SERVIDOR. Vive en WHATSAPP_TOKEN y solo se usa acá:
// quien lo tenga puede escribirle a cualquiera en nombre de la empresa, así que
// ni se guarda en la base ni se devuelve a la pantalla. Lo único que la interfaz
// recibe son los últimos 4 caracteres, para confirmar cuál está activo.
//
// TODO SE ENVÍA POR PLANTILLA. WhatsApp no permite texto libre a alguien que no
// escribió primero: hay una ventana de 24 h desde su último mensaje, y fuera de
// ella solo se aceptan plantillas aprobadas por Meta. Como los avisos los inicia
// LIPgo, siempre estamos fuera de esa ventana.
//
// CADA MENSAJE SE COBRA. Por eso todo envío queda en `whatsapp_mensajes`, con
// su origen, para poder medir volumen y costo por flujo.
// ---------------------------------------------------------------------------

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentUsuarioForInsert } from "@/lib/user-context"
import type {
  EnviarPlantillaInput,
  EstadoConfigWhatsapp,
  MensajeWhatsapp,
  PlantillaWhatsapp,
  ResultadoEnvio,
} from "@/lib/whatsapp-tipos"

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0"

/**
 * Normaliza un número al formato que exige WhatsApp: E.164 sin el "+".
 *
 * En Colombia la gente escribe "311 580 5557", "3115805557" o "+57 311...".
 * WhatsApp exige el indicativo del país SIEMPRE: sin él, el mensaje se rechaza
 * con un error genérico que no dice que el problema era el formato.
 *
 * Un móvil colombiano son 10 dígitos y empieza por 3. Si llegan exactamente 10
 * y empieza por 3, se le antepone el 57.
 */
export async function normalizarTelefono(valor: string): Promise<string | null> {
  const solo = String(valor ?? "").replace(/\D/g, "")
  if (!solo) return null
  if (solo.length === 10 && solo.startsWith("3")) return `57${solo}`
  if (solo.length === 12 && solo.startsWith("57")) return solo
  // Números de otros países se aceptan tal cual si tienen largo razonable.
  if (solo.length >= 11 && solo.length <= 15) return solo
  return null
}

function faltaTabla(msg: string | undefined): boolean {
  const m = String(msg ?? "").toLowerCase()
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation")
}

/**
 * Estado de la configuración. NO devuelve el token.
 *
 * Además de comprobar que las variables existan, consulta a Meta por el número:
 * es la única forma de saber si el token sirve DE VERDAD. Una variable puesta
 * con un token caducado se ve igual de bien que una correcta.
 */
export async function getEstadoWhatsapp(): Promise<EstadoConfigWhatsapp> {
  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
  const verify = process.env.WHATSAPP_VERIFY_TOKEN

  const faltantes: string[] = []
  if (!token) faltantes.push("WHATSAPP_TOKEN")
  if (!phoneId) faltantes.push("WHATSAPP_PHONE_NUMBER_ID")
  if (!wabaId) faltantes.push("WHATSAPP_BUSINESS_ACCOUNT_ID")
  if (!verify) faltantes.push("WHATSAPP_VERIFY_TOKEN")

  const base: EstadoConfigWhatsapp = {
    configurado: faltantes.length === 0,
    faltantes,
    tokenFinal: token ? token.slice(-4) : null,
    phoneNumberId: phoneId ?? null,
    apiVersion: API_VERSION,
    numeroVerificado: null,
    nombreVerificado: null,
    mensajeError: null,
  }

  if (!base.configurado) return base

  try {
    const r = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${phoneId}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    )
    const j = await r.json()
    if (!r.ok) {
      // El error de Meta viene anidado; el mensaje de arriba suele ser genérico.
      base.mensajeError =
        j?.error?.message ??
        `Meta respondió ${r.status}. Revisa que el token siga vigente y tenga los permisos de WhatsApp.`
      return base
    }
    base.numeroVerificado = j?.display_phone_number ?? null
    base.nombreVerificado = j?.verified_name ?? null
  } catch (e: any) {
    base.mensajeError = e?.message || "No se pudo contactar a Meta."
  }
  return base
}

/** Plantillas registradas en LIPgo. */
export async function getPlantillas(): Promise<{
  success: boolean
  data?: PlantillaWhatsapp[]
  faltaMigracion?: boolean
  message?: string
}> {
  try {
    const sb: any = await getSupabaseAdmin()
    const { data, error } = await sb
      .from("whatsapp_plantillas")
      .select("*")
      .order("nombre", { ascending: true })
    if (error) {
      if (faltaTabla(error.message)) return { success: true, data: [], faltaMigracion: true }
      return { success: false, message: error.message }
    }
    return {
      success: true,
      data: (data ?? []).map((p: any) => ({
        id: Number(p.id),
        nombre: p.nombre,
        idioma: p.idioma ?? "es",
        descripcion: p.descripcion ?? null,
        uso: p.uso ?? null,
        variables: p.variables ?? { header: [], body: [] },
        activa: p.activa !== false,
      })),
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "No se pudieron leer las plantillas." }
  }
}

/**
 * Plantillas tal como están en Meta, con su estado de aprobación.
 *
 * Es la forma de saber si la plantilla ya pasó la revisión: en LIPgo puede
 * estar registrada y en Meta seguir en PENDING, y entonces el envío falla.
 */
export async function getPlantillasDeMeta(): Promise<{
  success: boolean
  data?: { nombre: string; idioma: string; estado: string; categoria: string }[]
  message?: string
}> {
  const token = process.env.WHATSAPP_TOKEN
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
  if (!token || !wabaId) {
    return { success: false, message: "Falta configurar WHATSAPP_TOKEN o WHATSAPP_BUSINESS_ACCOUNT_ID." }
  }
  try {
    const r = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${wabaId}/message_templates?fields=name,language,status,category&limit=100`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    )
    const j = await r.json()
    if (!r.ok) return { success: false, message: j?.error?.message ?? `Meta respondió ${r.status}.` }
    return {
      success: true,
      data: (j?.data ?? []).map((t: any) => ({
        nombre: t.name,
        idioma: t.language,
        estado: t.status,
        categoria: t.category,
      })),
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "No se pudo consultar a Meta." }
  }
}

/**
 * Envía un mensaje de plantilla y lo deja en la bitácora.
 *
 * Que la API acepte el mensaje NO significa que llegó: el estado inicial es
 * "enviado" y solo pasa a "entregado" o "leido" cuando Meta lo confirma por
 * webhook. Decir "enviado con éxito" cuando el número no existe sería mentir.
 */
export async function enviarPlantilla(input: EnviarPlantillaInput): Promise<ResultadoEnvio> {
  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneId) {
    return { success: false, message: "Falta configurar el token o el identificador del número." }
  }
  if (!input.plantilla) return { success: false, message: "Indica la plantilla." }

  const telefono = await normalizarTelefono(input.telefono)
  if (!telefono) {
    return {
      success: false,
      message: `"${input.telefono}" no parece un número válido. En Colombia son 10 dígitos empezando por 3.`,
    }
  }

  const sb: any = await getSupabaseAdmin()
  const usuario = await getCurrentUsuarioForInsert().catch(() => null)

  // Los componentes van en el orden que espera Meta. Cada valor ocupa una
  // posición: {{1}}, {{2}}... Si el orden no coincide con el de la plantilla
  // aprobada, el mensaje sale con los valores cruzados y NO da error.
  const componentes: any[] = []
  if (input.header?.length) {
    componentes.push({
      type: "header",
      parameters: input.header.map((v) => ({ type: "text", text: String(v ?? "") })),
    })
  }
  if (input.body?.length) {
    componentes.push({
      type: "body",
      parameters: input.body.map((v) => ({ type: "text", text: String(v ?? "") })),
    })
  }

  const cuerpo = {
    messaging_product: "whatsapp",
    to: telefono,
    type: "template",
    template: {
      name: input.plantilla,
      language: { code: input.idioma || "es" },
      ...(componentes.length ? { components: componentes } : {}),
    },
  }

  // La fila de bitácora se arma antes para poder registrar TAMBIÉN los fallos:
  // un envío que nunca llegó a la API es justo lo que hay que poder revisar.
  const fila: any = {
    idempresa: input.empresaId ?? null,
    telefono,
    identificacion: input.identificacion ?? null,
    nombre: input.nombre ?? null,
    plantilla: input.plantilla,
    idioma: input.idioma || "es",
    parametros: { header: input.header ?? [], body: input.body ?? [] },
    origen: input.origen ?? null,
    enviado_por: usuario,
  }

  try {
    const r = await fetch(`https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    })
    const j = await r.json()

    if (!r.ok) {
      const err = j?.error ?? {}
      await sb.from("whatsapp_mensajes").insert({
        ...fila,
        estado: "fallido",
        error_codigo: String(err.code ?? r.status),
        // `error_data.details` trae el motivo real; `message` suele ser genérico.
        error_detalle: err.error_data?.details ?? err.message ?? `HTTP ${r.status}`,
      })
      let msg = err.error_data?.details ?? err.message ?? `Meta respondió ${r.status}.`
      // El error 132001 dice "template name does not exist in <idioma>", que se
      // lee como si faltara la plantilla. Casi siempre existe pero en OTRO
      // idioma: Meta trata "es" y "es_CO" como distintos. Se traduce para no
      // mandar a nadie a buscar una plantilla que ya está creada.
      if (String(err.code) === "132001") {
        msg = `La plantilla "${input.plantilla}" no existe en el idioma "${input.idioma || "es"}". Suele estar aprobada en otro idioma (por ejemplo es_CO): revisa el idioma exacto en WhatsApp Manager y ajústalo. Detalle de Meta: ${msg}`
      }
      return {
        success: false,
        codigo: String(err.code ?? r.status),
        message: msg,
      }
    }

    const messageId = j?.messages?.[0]?.id ?? null
    await sb.from("whatsapp_mensajes").insert({
      ...fila,
      estado: "enviado",
      message_id: messageId,
    })
    return { success: true, messageId: messageId ?? undefined }
  } catch (e: any) {
    try {
      await sb.from("whatsapp_mensajes").insert({
        ...fila,
        estado: "error",
        error_detalle: e?.message ?? "Error de red",
      })
    } catch {
      // Si ni la bitácora se puede escribir, al menos queda en el log.
      console.error("[v0] enviarPlantilla: no se pudo registrar el fallo")
    }
    console.error("[v0] enviarPlantilla excepción:", e?.message ?? e)
    return { success: false, message: e?.message || "No se pudo enviar el mensaje." }
  }
}

/** Últimos mensajes enviados. */
export async function getMensajes(
  empresaId?: number | null,
  limite = 50,
): Promise<{ success: boolean; data?: MensajeWhatsapp[]; faltaMigracion?: boolean; message?: string }> {
  try {
    const sb: any = await getSupabaseAdmin()
    let q = sb
      .from("whatsapp_mensajes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limite)
    if (empresaId) q = q.eq("idempresa", empresaId)
    const { data, error } = await q
    if (error) {
      if (faltaTabla(error.message)) return { success: true, data: [], faltaMigracion: true }
      return { success: false, message: error.message }
    }
    return {
      success: true,
      data: (data ?? []).map((m: any) => ({
        id: String(m.id),
        telefono: m.telefono,
        nombre: m.nombre ?? null,
        plantilla: m.plantilla ?? null,
        estado: m.estado,
        errorCodigo: m.error_codigo ?? null,
        errorDetalle: m.error_detalle ?? null,
        origen: m.origen ?? null,
        enviadoPor: m.enviado_por ?? null,
        creadoEn: m.created_at,
        entregadoEn: m.entregado_at ?? null,
        leidoEn: m.leido_at ?? null,
        parametros: m.parametros ?? null,
      })),
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "No se pudieron leer los mensajes." }
  }
}
