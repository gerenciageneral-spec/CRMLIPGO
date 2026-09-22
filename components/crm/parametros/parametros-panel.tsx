"use client"

// Parametrizacion: los numeros de los que dependen las reglas de negocio.
//
// La pantalla NO conoce ningun parametro. Se dibuja entera desde los metadatos
// de crm_parametros: agrupa por `grupo`, elige el control segun `tipo`, valida
// con `min_valor`/`max_valor` y muestra `descripcion` como ayuda.
//
// Eso significa que agregar un parametro nuevo es un INSERT en la tabla: no
// hay que tocar este archivo ni volver a desplegar. Es la diferencia entre
// "parametrizable" y "configurable solo por el que tenga el codigo".

import { useEffect, useMemo, useState } from "react"
import { Loader2, Save, RotateCcw, Info, AlertTriangle } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { listarParametros, setParam } from "@/lib/crm-parametros-actions"
import { GRUPOS_PARAMETROS, type CrmParametro, type ParamKey } from "@/lib/crm-parametros"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip"
import { toast } from "@/hooks/use-toast"

/** Parametros que son SECRETOS: se pintan como campo de contrasena para que no
 *  queden a la vista de quien pase por detras. Siguen siendo editables; lo que
 *  cambia es que no se muestran. */
const SECRETOS = new Set(["pedido.clave_contabilidad", "pedido.clave_gerencia"])

/** Parametros de texto con opciones cerradas. Se declaran aqui y no en la
 *  base porque son valores que el CODIGO interpreta: agregar una opcion exige
 *  implementarla, no solo escribirla. */
const OPCIONES: Record<string, { valor: string; etiqueta: string }[]> = {
  "comision.momento_causacion": [
    { valor: "recaudo", etiqueta: "Cuando el cliente paga" },
    { valor: "despacho", etiqueta: "Cuando se despacha" },
    { valor: "autorizacion", etiqueta: "Cuando se autoriza el pedido" },
  ],
  "comision.base": [
    { valor: "subtotal", etiqueta: "Subtotal (sin IVA)" },
    { valor: "total", etiqueta: "Total (con IVA)" },
  ],
}

export function ParametrosPanel() {
  const { profile, selectedEmpresaId } = useAuth()
  const empresaId = selectedEmpresaId ?? 1

  const [parametros, setParametros] = useState<CrmParametro[]>([])
  const [borrador, setBorrador] = useState<Record<string, string>>({})
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    setCargando(true)

    listarParametros(empresaId)
      .then((res) => {
        if (cancelado) return
        if (res.success && res.data) {
          setParametros(res.data)
          // El borrador arranca igual a lo guardado: lo que se compara para
          // saber si hay cambios sin guardar.
          setBorrador(Object.fromEntries(res.data.map((p) => [p.clave, p.valor])))
        } else {
          toast({ title: "No se pudieron cargar los parámetros", description: res.error, variant: "destructive" })
        }
      })
      .finally(() => !cancelado && setCargando(false))

    return () => { cancelado = true }
  }, [empresaId])

  const porGrupo = useMemo(() => {
    const mapa = new Map<string, CrmParametro[]>()
    for (const p of parametros) {
      if (!mapa.has(p.grupo)) mapa.set(p.grupo, [])
      mapa.get(p.grupo)!.push(p)
    }
    return mapa
  }, [parametros])

  const cambiado = (p: CrmParametro) => borrador[p.clave] !== p.valor

  const guardar = async (p: CrmParametro) => {
    const valor = borrador[p.clave]
    if (valor === p.valor) return

    setGuardando(p.clave)
    const res = await setParam(p.clave as ParamKey, valor, profile?.usuario ?? "desconocido", empresaId)
    setGuardando(null)

    if (!res.success || !res.data) {
      toast({ title: "No se guardó", description: res.error, variant: "destructive" })
      return
    }

    // Se reemplaza la fila con la que devolvio el servidor: al cambiar un
    // parametro se cierra el anterior y se abre otro, con id nuevo.
    setParametros((prev) => prev.map((x) => (x.clave === p.clave ? res.data! : x)))
    toast({
      title: "Parámetro actualizado",
      description: `${p.etiqueta}: ${valor}${p.unidad ? " " + p.unidad : ""}. Se aplica en menos de un minuto.`,
    })
  }

  const descartar = (p: CrmParametro) => {
    setBorrador((b) => ({ ...b, [p.clave]: p.valor }))
  }

  if (cargando) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Parametrización</h1>
          <p className="text-sm text-muted-foreground">
            Los valores de los que dependen las reglas del sistema. Cambiar uno afecta
            solo a lo que ocurra de aquí en adelante: los documentos ya emitidos conservan
            el valor con el que se hicieron.
          </p>
        </header>

        {[...porGrupo.entries()].map(([grupo, items]) => (
          <Card key={grupo}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {GRUPOS_PARAMETROS[grupo] ?? grupo}
              </CardTitle>
            </CardHeader>

            <CardContent className="grid gap-5 sm:grid-cols-2">
              {items.map((p) => (
                <div key={p.clave} className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor={p.clave} className="text-sm">
                      {p.etiqueta}
                    </Label>

                    {p.descripcion && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{p.descripcion}</TooltipContent>
                      </Tooltip>
                    )}

                    {!p.editable && (
                      <Badge variant="outline" className="ml-auto text-[10px]">
                        Solo técnico
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {p.tipo === "boolean" ? (
                      <Switch
                        id={p.clave}
                        checked={borrador[p.clave] === "true"}
                        disabled={!p.editable}
                        onCheckedChange={(v) =>
                          setBorrador((b) => ({ ...b, [p.clave]: v ? "true" : "false" }))
                        }
                      />
                    ) : OPCIONES[p.clave] ? (
                      <Select
                        value={borrador[p.clave]}
                        disabled={!p.editable}
                        onValueChange={(v) => setBorrador((b) => ({ ...b, [p.clave]: v }))}
                      >
                        <SelectTrigger id={p.clave} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OPCIONES[p.clave].map((o) => (
                            <SelectItem key={o.valor} value={o.valor}>
                              {o.etiqueta}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="relative flex-1">
                        <Input
                          id={p.clave}
                          type={
                            SECRETOS.has(p.clave)
                              ? "password"
                              : p.tipo === "number"
                                ? "number"
                                : "text"
                          }
                          autoComplete={SECRETOS.has(p.clave) ? "new-password" : undefined}
                          value={borrador[p.clave] ?? ""}
                          disabled={!p.editable}
                          min={p.min_valor ?? undefined}
                          max={p.max_valor ?? undefined}
                          onChange={(e) =>
                            setBorrador((b) => ({ ...b, [p.clave]: e.target.value }))
                          }
                          className={p.unidad ? "pr-12" : undefined}
                        />
                        {p.unidad && (
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            {p.unidad}
                          </span>
                        )}
                      </div>
                    )}

                    {cambiado(p) && (
                      <>
                        <Button
                          size="icon"
                          variant="default"
                          onClick={() => guardar(p)}
                          disabled={guardando === p.clave}
                          aria-label="Guardar"
                        >
                          {guardando === p.clave ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => descartar(p)}
                          aria-label="Descartar cambio"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>

                  {p.tipo === "number" && (p.min_valor != null || p.max_valor != null) && (
                    <p className="text-[11px] text-muted-foreground">
                      {p.min_valor != null && p.max_valor != null
                        ? `Entre ${p.min_valor} y ${p.max_valor}`
                        : p.min_valor != null
                          ? `Mínimo ${p.min_valor}`
                          : `Máximo ${p.max_valor}`}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        {parametros.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No hay parámetros cargados. Falta correr <code>scripts/181_crm_fundacion.sql</code>.
            </p>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

export default ParametrosPanel
