"use client"

// Rejilla de modulos de un grupo. Es lo que se ve tras elegir un grupo del
// menu y antes de entrar a un modulo concreto.
//
// Solo muestra lo que el usuario puede abrir: filterGroupsByPermissions aplica
// el mismo criterio que el sidebar, para que no aparezca una tarjeta que al
// pulsarla no pinte nada.

import { useMemo } from "react"
import { ArrowRight, ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useModulePermissions } from "@/hooks/use-module-permissions"
import { filterGroupsByPermissions, type GroupKey } from "@/lib/dashboard-data"

/** Color por area. Los mismos de las tarjetas de Inicio: entrar a un area no
 *  deberia cambiarle el color al usuario a medio camino. */
const TINTE_AREA: Record<string, string> = {
  inicio: "#4f63c4",
  prospectos: "#7b57c9",
  ventas: "#c56a2a",
  clientes: "#1f8fb0",
  cartera: "#2f9b64",
  inteligencia: "#c65893",
  configuracion: "#6b7683",
}

interface ModulesViewProps {
  selectedGroup: GroupKey
  onSelectModule: (moduleName: string) => void
  onBack?: () => void
}

export function ModulesView({ selectedGroup, onSelectModule, onBack }: ModulesViewProps) {
  const { allowedModules, loaded, isModuleVisible } = useModulePermissions()

  const grupo = useMemo(() => {
    const visibles = filterGroupsByPermissions(isModuleVisible, loaded, new Set(allowedModules))
    return visibles.find((g) => g.key === selectedGroup)
  }, [selectedGroup, isModuleVisible, loaded, allowedModules])

  if (!grupo) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-muted-foreground">No tienes acceso a los módulos de esta sección.</p>
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Volver
          </Button>
        )}
      </div>
    )
  }

  const IconoGrupo = grupo.icon
  const tinte = TINTE_AREA[selectedGroup] ?? TINTE_AREA.configuracion

  // Se aplana la estructura para pintar: los subgrupos se muestran como
  // encabezados dentro de la misma rejilla.
  const secciones = grupo.subgroups?.length
    ? grupo.subgroups.map((sg) => ({ titulo: sg.title, modulos: sg.modules }))
    : [{ titulo: null as string | null, modulos: grupo.modules ?? [] }]

  return (
    <div className="space-y-6">
      {/* Tarjeta de módulo horizontal y compacta, calcada de LIPgo: icono,
          nombre y flecha en una sola fila. Apiladas en vertical ocupaban casi
          el doble de alto y en un área de veinte módulos obligaban a
          desplazarse para ver lo que cabía de sobra en pantalla. */}
      <style>{`
        .mod-card{
          position:relative; display:flex; align-items:center; gap:11px;
          border-radius:14px; padding:11px 12px;
          background:var(--card,#fff); border:1px solid #e7edf4;
          text-align:left; cursor:pointer; overflow:hidden;
          transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease;
        }
        .mod-card::before{
          content:""; position:absolute; inset:0; border-radius:14px;
          padding:1.2px; pointer-events:none; opacity:0; transition:opacity .16s;
          background:linear-gradient(135deg,
            color-mix(in srgb, var(--tint) 68%, transparent), transparent 60%);
          -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite:xor; mask-composite:exclude;
        }
        .mod-card:hover{
          transform:translateY(-2px); border-color:transparent;
          box-shadow:0 12px 26px color-mix(in srgb, var(--tint) 22%, transparent),
                     0 4px 10px rgba(20,42,68,.05);
        }
        .mod-card:hover::before{ opacity:1; }
        .mod-card:focus-visible{
          outline:none;
          box-shadow:0 0 0 3px color-mix(in srgb, var(--tint) 35%, transparent);
        }
        .mod-ico{
          position:relative; z-index:1; width:34px; height:34px; flex:none;
          border-radius:10px; display:flex; align-items:center; justify-content:center;
          background:color-mix(in srgb, var(--tint) 14%, #fff); color:var(--tint);
          box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--tint) 20%, transparent);
          transition:transform .16s, background .16s, color .16s, box-shadow .16s;
        }
        .mod-card:hover .mod-ico{
          transform:scale(1.06); color:#fff;
          background:linear-gradient(135deg, var(--tint),
            color-mix(in srgb, var(--tint) 62%, #000));
          box-shadow:0 6px 14px color-mix(in srgb, var(--tint) 40%, transparent);
        }
        .mod-name{
          position:relative; z-index:1; flex:1; min-width:0;
          font-size:13px; font-weight:700; line-height:1.15;
          color:#132a44; letter-spacing:-.01em;
        }
        .mod-arrow{
          position:relative; z-index:1; flex:none; color:var(--tint);
          opacity:0; transform:translateX(-5px);
          transition:opacity .16s, transform .16s;
        }
        .mod-card:hover .mod-arrow{ opacity:1; transform:none; }
        @media (prefers-reduced-motion:reduce){
          .mod-card, .mod-card *{ transition:none !important; }
          .mod-card:hover{ transform:none }
        }
      `}</style>

      <div className="flex items-center gap-3">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Volver">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
        <span
          className="flex h-11 w-11 flex-none items-center justify-center rounded-xl"
          style={{
            background: `color-mix(in srgb, ${tinte} 14%, #fff)`,
            color: tinte,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tinte} 22%, transparent)`,
          }}
        >
          <IconoGrupo className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">{grupo.title}</h2>
      </div>

      {secciones.map((seccion, i) => (
        <section key={seccion.titulo ?? i} className="space-y-3">
          {seccion.titulo && (
            <h3 className="text-sm font-medium text-muted-foreground">{seccion.titulo}</h3>
          )}

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {seccion.modulos.map((modulo) => {
              const Icono = modulo.icon
              return (
                <button
                  key={modulo.name}
                  onClick={() => onSelectModule(modulo.name)}
                  className="mod-card"
                  style={{ "--tint": tinte } as React.CSSProperties}
                >
                  <span className="mod-ico">
                    <Icono className="h-[17px] w-[17px]" aria-hidden="true" />
                  </span>
                  <span className="mod-name">{modulo.label ?? modulo.name}</span>
                  <ArrowRight className="mod-arrow h-4 w-4" aria-hidden="true" />
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

export default ModulesView
