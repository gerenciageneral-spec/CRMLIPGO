"use client"

// Tarjetas de la pantalla de Inicio: una por área del CRM.
//
// Cada área tiene su color. No es decoración: con siete tarjetas iguales hay
// que leerlas todas para encontrar la que se busca, mientras que el color se
// reconoce de reojo y el usuario aprende "cartera es la verde" sin proponérselo.

import type { CSSProperties } from "react"
import {
  ArrowRight, LayoutDashboard, UserPlus, ShoppingCart, Users, Wallet,
  Sparkles, Settings,
} from "lucide-react"
import { groups, filterGroupsByPermissions } from "@/lib/dashboard-data"
import type { GroupKey } from "@/lib/dashboard-data"
import { useModulePermissions } from "@/hooks/use-module-permissions"

interface ModuleCardsProps {
  onSelectGroup: (group: GroupKey) => void
  onSelectModule?: (module: string) => void
}

/**
 * Color e icono por área.
 *
 * UN SOLO tinte por área, no un degradado. Es la decisión de LIPgo y aquí se
 * respeta: allá el icono nace pastel sobre blanco y solo se rellena de color
 * al pasar por encima. Un icono con degradado saturado en reposo se ve más
 * llamativo en una captura, pero al lado de LIPgo canta que son dos sistemas
 * distintos, que es justo lo que no puede pasar.
 *
 * Los tonos son los mismos de la paleta de LIPgo, reasignados a las áreas del
 * CRM, para que quien use los dos reconozca la familia de color.
 *
 * OJO: la clave debe ser el `key` de un grupo de lib/dashboard-data.ts. Una
 * clave que no exista deja la tarjeta en el gris de respaldo — fue lo que
 * pasaba al heredar este archivo de LIPgo, que listaba sus áreas operativas y
 * dejaba las siete tarjetas del CRM del mismo gris apagado.
 */
const AREA: Record<string, { tinte: string; icono: typeof LayoutDashboard }> = {
  inicio:        { tinte: "#4f63c4", icono: LayoutDashboard }, // azul
  prospectos:    { tinte: "#7b57c9", icono: UserPlus },        // violeta
  ventas:        { tinte: "#c56a2a", icono: ShoppingCart },    // naranja
  clientes:      { tinte: "#1f8fb0", icono: Users },           // cian
  cartera:       { tinte: "#2f9b64", icono: Wallet },          // verde
  inteligencia:  { tinte: "#c65893", icono: Sparkles },        // magenta
  configuracion: { tinte: "#6b7683", icono: Settings },        // gris
}

const RESPALDO = { tinte: "#5b6b7f", icono: LayoutDashboard }

function contarModulos(group: (typeof groups)[number]): number {
  const directos = group.modules?.length ?? 0
  const enSubgrupos = group.subgroups?.reduce((n, sg) => n + sg.modules.length, 0) ?? 0
  return directos + enSubgrupos
}

export function ModuleCards({ onSelectGroup }: ModuleCardsProps) {
  const { loaded, allowedModules, isModuleVisible } = useModulePermissions()
  const visibleGroups = filterGroupsByPermissions(isModuleVisible, loaded, allowedModules)

  return (
    <div>
      <style>{`
        .apps-grid{ --r:18px; }

        .app-tile{
          position:relative; display:flex; flex-direction:column; gap:12px;
          border-radius:var(--r); padding:16px;
          background:var(--card,#fff); border:1px solid #e7edf4;
          text-align:left; cursor:pointer; overflow:hidden;
          transition:transform .2s ease, box-shadow .2s ease, border-color .2s ease;
        }

        /* Halo del color del área en la esquina, tenue en reposo. */
        .app-tile::after{
          content:""; position:absolute; top:-40%; right:-30%;
          width:140px; height:140px; border-radius:50%;
          background:radial-gradient(closest-side,
            color-mix(in srgb, var(--tint) 28%, transparent), transparent);
          opacity:.35; transition:opacity .25s, transform .25s; pointer-events:none;
        }

        /* Filo de color: invisible en reposo, se enciende al pasar por encima. */
        .app-tile::before{
          content:""; position:absolute; inset:0; border-radius:var(--r);
          padding:1.3px; pointer-events:none; opacity:0; transition:opacity .2s;
          background:linear-gradient(135deg,
            color-mix(in srgb, var(--tint) 70%, transparent), transparent 62%);
          -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite:xor; mask-composite:exclude;
        }

        .app-tile:hover{
          transform:translateY(-3px); border-color:transparent;
          box-shadow:0 18px 38px color-mix(in srgb, var(--tint) 26%, transparent),
                     0 6px 14px rgba(20,42,68,.06);
        }
        .app-tile:hover::before{ opacity:1; }
        .app-tile:hover::after{ opacity:.6; transform:scale(1.15); }
        .app-tile:active{ transform:translateY(-1px); }

        /* Foco visible para quien navega con teclado. LIPgo no lo tiene y es
           un descuido suyo: sin esto el tabulador recorre la rejilla a ciegas. */
        .app-tile:focus-visible{
          outline:none;
          box-shadow:0 0 0 3px color-mix(in srgb, var(--tint) 35%, transparent),
                     0 18px 38px color-mix(in srgb, var(--tint) 26%, transparent);
        }

        /* Icono pastel sobre blanco, como en LIPgo. Solo se rellena de color
           al pasar por encima; en reposo la pantalla queda serena y el color
           sirve para reconocer el área, no para gritar. */
        .app-ico{
          position:relative; z-index:1;
          width:46px; height:46px; border-radius:14px;
          display:flex; align-items:center; justify-content:center;
          background:color-mix(in srgb, var(--tint) 14%, #fff);
          color:var(--tint);
          box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--tint) 22%, transparent);
          transition:transform .2s, background .2s, color .2s, box-shadow .2s;
        }
        .app-tile:hover .app-ico{
          transform:scale(1.06) rotate(-3deg); color:#fff;
          background:linear-gradient(135deg, var(--tint),
            color-mix(in srgb, var(--tint) 62%, #000));
          box-shadow:0 10px 22px color-mix(in srgb, var(--tint) 42%, transparent);
        }

        .app-name{
          position:relative; z-index:1;
          font-size:15px; font-weight:800; line-height:1.15;
          color:#132a44; letter-spacing:-.01em;
        }
        .app-foot{
          position:relative; z-index:1;
          display:flex; align-items:center; justify-content:space-between;
        }
        .app-count{ font-size:11.5px; color:#7387a0; font-weight:500; }
        .app-enter{
          display:inline-flex; align-items:center; gap:3px;
          font-size:11.5px; font-weight:800; color:var(--tint);
          opacity:0; transform:translateX(-6px);
          transition:opacity .2s, transform .2s;
        }
        .app-tile:hover .app-enter{ opacity:1; transform:none; }

        /* Entrada escalonada: las tarjetas aparecen una tras otra, lo que da
           sensación de que el sistema arranca en vez de aparecer de golpe. */
        @keyframes app-in{
          from{ opacity:0; transform:translateY(10px) }
          to{ opacity:1; transform:none }
        }
        .app-tile{ animation:app-in .38s both; }

        /* Se respeta a quien pidió menos movimiento: sin animación de entrada
           ni desplazamiento, aunque el color se conserva. */
        @media (prefers-reduced-motion:reduce){
          .app-tile, .app-tile *{ transition:none !important; animation:none !important; }
          .app-tile:hover{ transform:none }
          .app-tile:hover .app-ico{ transform:none }
        }
      `}</style>

      <div className="mb-3 flex items-baseline gap-2 sm:mb-5">
        <h2 className="text-sm font-extrabold tracking-tight text-foreground sm:text-lg">
          Aplicaciones
        </h2>
        <span className="text-xs text-muted-foreground">· elige un área para entrar</span>
      </div>

      <div className="apps-grid grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {visibleGroups.map((group, i) => {
          const area = AREA[group.key] ?? RESPALDO
          const Icono = area.icono
          const modulos = contarModulos(group)

          return (
            <button
              key={group.key}
              onClick={() => onSelectGroup(group.key as GroupKey)}
              className="app-tile"
              style={
                {
                  "--tint": area.tinte,
                  // Cada tarjeta entra un poco después que la anterior.
                  animationDelay: `${i * 55}ms`,
                } as CSSProperties
              }
            >
              <span className="app-ico">
                <Icono className="h-[22px] w-[22px]" aria-hidden="true" />
              </span>

              <span className="app-name">{group.title}</span>

              <span className="app-foot">
                <span className="app-count">
                  {modulos} módulo{modulos === 1 ? "" : "s"}
                </span>
                <span className="app-enter">
                  Entrar <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
