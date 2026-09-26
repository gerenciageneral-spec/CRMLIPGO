// Procesa la bandeja de integraciones. La invoca el cron de Vercel.
//
// Protegida con CRON_SECRET: Vercel manda "Authorization: Bearer <secreto>" en
// cada ejecucion. Sin la variable configurada la ruta NO corre: una ruta que
// dispara envios a SAP no puede quedar abierta por olvido.
//
// El middleware deja pasar /api/cron/ sin sesion; la proteccion es esta.

import { NextResponse, type NextRequest } from "next/server"
import { procesarLote } from "@/lib/integraciones/outbox"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET
  if (!secreto) {
    return NextResponse.json({ error: "CRON_SECRET no está configurado" }, { status: 503 })
  }
  if (request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const resumen = await procesarLote(50, "cron")
  return NextResponse.json({ ok: true, ...resumen })
}
