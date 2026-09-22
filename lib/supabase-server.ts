import { createServerClient as createSupabaseServerClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

// Tipo de esquema PERMISIVO (ver nota en supabase-client.ts): sin tipos generados
// de la BD el cliente resolvía cada tabla a `never`. Type-only, no afecta runtime.
type DBClient = SupabaseClient<any, any, any>

/**
 * Cliente de Supabase para el SERVIDOR, que lee la sesión de las cookies.
 *
 * ES ASÍNCRONO y hay que esperarlo. En Next.js 16 `cookies()` devuelve una
 * promesa, así que no hay forma de construirlo de manera síncrona.
 *
 * USA LA API getAll/setAll, que es la que espera @supabase/ssr 0.8. La versión
 * anterior de este archivo implementaba get/set/remove, la API de las
 * versiones 0.x antiguas: la librería no la reconocía, nunca leía la cookie de
 * sesión y getUser() devolvía null aunque el usuario estuviera dentro. El
 * efecto visible era que ningún módulo cargaba y el menú salía vacío, porque
 * todo el sistema de permisos cuelga de esa lectura.
 */
export async function createServerClient(): Promise<DBClient> {
  const cookieStore = await cookies()

  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Desde un Server Component las cookies son de solo lectura y esto
            // lanza. Se ignora a propósito: el refresco de sesión lo hace el
            // middleware, que sí puede escribirlas.
          }
        },
      },
    },
  )
}

export { createServerClient as createClient }
