// Canal de WhatsApp del CRM (INT-12), sobre la misma cuenta de Meta que LIPgo.
//
// Se copio el envio de LIPgo (lib/whatsapp.ts y enviarAvisoEstandar de
// lib/whatsapp-actions.ts) en vez de importarlo: son aplicaciones distintas en
// despliegues distintos. Lo que SI se comparte es lo importante: el numero, las
// credenciales y la plantilla `plantilla_estandar`, ya aprobada por Meta. Asi
// el aviso de "pedido aprobado" funciona el mismo dia, sin esperar a que Meta
// revise una plantilla nueva.
//
// Variables de entorno (los mismos nombres que en LIPgo):
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_VERSION
//   WHATSAPP_ENABLED = "true" para enviar de verdad. Cualquier otro valor, o
//   que falte, deja el canal DESACTIVADO: el mensaje se registra en el log de
//   integraciones y no sale. Aqui, a diferencia de LIPgo, apagado es el valor
//   por defecto: el CRM no debe empezar a escribirle a nadie por un despliegue.

import type { AvisoEstandar, CanalNotificacion, ResultadoEnvio } from "./tipos"

const PLANTILLA = "plantilla_estandar"
const IDIOMA = "es_CO"

/** Celular colombiano a E.164 sin "+". null si no parece un movil valido. */
export function normalizarCelularCO(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = String(raw).replace(/\D/g, "")
  if (!d) return null
  if (d.startsWith("00")) d = d.slice(2)
  if (d.length === 12 && d.startsWith("57") && d[2] === "3") return d
  if (d.length === 10 && d.startsWith("3")) return "57" + d
  return null
}

/** WhatsApp rechaza saltos de linea y espacios repetidos dentro de una variable. */
export function limpiarVariable(t: string): string {
  return String(t ?? "").replace(/\s*\n+\s*/g, " · ").replace(/\s{2,}/g, " ").trim()
}

function whatsappActivo(): boolean {
  return process.env.WHATSAPP_ENABLED === "true"
}

export const canalWhatsapp: CanalNotificacion = {
  nombre: "whatsapp",
  get activo() {
    return whatsappActivo()
  },

  async enviarAviso(p: AvisoEstandar): Promise<ResultadoEnvio> {
    const celular = normalizarCelularCO(p.celular)
    if (!celular) return { ok: false, reintentable: false, error: `Celular inválido: "${p.celular}"` }

    const cuerpo = {
      messaging_product: "whatsapp",
      to: celular,
      type: "template",
      template: {
        name: PLANTILLA,
        language: { code: IDIOMA },
        components: [
          { type: "header", parameters: [{ type: "text", parameter_name: "nombre_reporte", text: limpiarVariable(p.titulo) }] },
          {
            type: "body",
            parameters: [
              { type: "text", parameter_name: "usuario", text: limpiarVariable(p.destinatario) },
              { type: "text", parameter_name: "contenido", text: limpiarVariable(p.contenido) },
            ],
          },
        ],
      },
    }

    if (!whatsappActivo()) {
      // Desactivado: no es un error, es la configuracion. Se devuelve ok para
      // que la bandeja lo cierre, con la marca para distinguirlo en el log.
      return { ok: true, referencia: "SIMULADO", respuesta: { simulado: true }, request: cuerpo }
    }

    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
    const token = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN
    if (!phoneId || !token) {
      return { ok: false, reintentable: false, error: "Falta WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID.", request: cuerpo }
    }

    const version = process.env.WHATSAPP_API_VERSION || process.env.WHATSAPP_GRAPH_VERSION || "v21.0"
    try {
      const r = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      })
      const data = (await r.json()) as { messages?: { id: string }[]; error?: { message?: string } }
      if (!r.ok) {
        return {
          ok: false,
          reintentable: r.status >= 500 || r.status === 429,
          error: data?.error?.message || `HTTP ${r.status}`,
          respuesta: data as Record<string, unknown>,
          request: cuerpo,
          httpStatus: r.status,
        }
      }
      return { ok: true, referencia: data.messages?.[0]?.id, respuesta: data as Record<string, unknown>, request: cuerpo, httpStatus: r.status }
    } catch (e) {
      return { ok: false, reintentable: true, error: e instanceof Error ? e.message : "Error de red con Meta", request: cuerpo }
    }
  },
}
