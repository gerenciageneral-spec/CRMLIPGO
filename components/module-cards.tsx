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
 * Los dos colores hacen un degradado: el tile no queda plano y el icono cobra
 * profundidad. Se eligieron saturados pero no chillones, y con suficiente
 * contraste entre sí para distinguirse de un vistazo incluso en pantallas
 * malas o con luz de sol encima.
 *
 * OJO: la clave debe ser el `key` de un grupo de lib/dashboard-data.ts. Una
 * clave que no exista deja la tarjeta en el gris de respaldo — fue lo que
 * pasaba al heredar este archivo de LIPgo, que listaba sus áreas operativas y
 * dejaba las siete tarjetas del CRM del mismo gris apagado.
 */
const AREA: Record<string, { de: string; a: string; icono: typeof LayoutDashboard }> = {
  inicio:        { de: "#2563eb", a: "#0ea5e9", icono: LayoutDashboard }, // azul
  prospectos:    { de: "#7c3aed", a: "#a855f7", icono: UserPlus },        // violeta
  ventas:        { de: "#ea580c", a: "#f59e0b", icono: ShoppingCart },    // naranja
  clientes:      { de: "#0891b2", a: "#06b6d4", icono: Users },           // cian
  cartera:       { de: "#059669", a: "#10b981", icono: Wallet },          // verde
  inteligencia:  { de: "#c026d3", a: "#ec4899", icono: Sparkles },        // magenta
  configuracion: { de: "#475569", a: "#64748b", icono: Settings },        // gris
}

const RESPALDO = { de: "#475569", a: "#64748b", icono: LayoutDashboard }

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
        .apps-grid{ --r:20px; }

        .app-tile{
          position:relative; display:flex; flex-direction:column; gap:14px;
          border-radius:var(--r); padding:18px;
          background:var(--card,#fff); border:1px solid #e7edf4;
          text-align:left; cursor:pointer; overflow:hidden;
          transition:transform .22s cubic-bezier(.2,.8,.3,1), box-shadow .22s, border-color .22s;
        }

        /* Halo de color en la esquina. Se intensifica y crece al pasar por
           encima, para que la tarjeta responda al puntero. */
        .app-tile::after{
          content:""; position:absolute; top:-45%; right:-32%;
          width:170px; height:170px; border-radius:50%;
          background:radial-gradient(closest-side,
            color-mix(in srgb, var(--de) 34%, transparent), transparent);
          opacity:.42; transition:opacity .28s, transform .28s; pointer-events:none;
        }

        /* Filo de color: invisible en reposo, se enciende en hover. */
        .app-tile::before{
          content:""; position:absolute; inset:0; border-radius:var(--r);
          padding:1.4px; pointer-events:none; opacity:0; transition:opacity .22s;
          background:linear-gradient(135deg, var(--de), var(--a) 55%, transparent 80%);
          -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite:xor; mask-composite:exclude;
        }

        .app-tile:hover{
          transform:translateY(-4px); border-color:transparent;
          box-shadow:0 20px 42px color-mix(in srgb, var(--de) 30%, transparent),
                     0 6px 16px rgba(20,42,68,.07);
        }
        .app-tile:hover::before{ opacity:1; }
        .app-tile:hover::after{ opacity:.72; transform:scale(1.18); }
        .app-tile:active{ transform:translateY(-1px); }

        /* Foco visible para quien navega con teclado. */
        .app-tile:focus-visible{
          outline:none;
          box-shadow:0 0 0 3px color-mix(in srgb, var(--de) 35%, transparent),
                     0 18px 38px color-mix(in srgb, var(--de) 26%, transparent);
        }

        /* El icono ya nace con su degradado, no espera al hover: es lo que
           da vida a la pantalla cuando se abre. */
        .app-ico{
          position:relative; z-index:1;
          width:52px; height:52px; border-radius:16px;
          display:flex; align-items:center; justify-content:center;
          color:#fff;
          background:linear-gradient(140deg, var(--de), var(--a));
          box-shadow:0 8px 18px color-mix(in srgb, var(--de) 38%, transparent),
                     inset 0 1px 0 rgba(255,255,255,.28);
          transition:transform .24s cubic-bezier(.2,.8,.3,1), box-shadow .24s;
        }
        .app-tile:hover .app-ico{
          transform:scale(1.08) rotate(-4deg);
          box-shadow:0 14px 26px color-mix(in srgb, var(--de) 52%, transparent),
                     inset 0 1px 0 rgba(255,255,255,.36);
        }

        /* Brillo que cruza el icono al pasar por encima. */
        .app-ico::after{
          content:""; position:absolute; inset:0; border-radius:inherit;
          background:linear-gradient(115deg, transparent 38%, rgba(255,255,255,.42) 50%, transparent 62%);
          transform:translateX(-120%); transition:transform .5s ease;
        }
        .app-tile:hover .app-ico::after{ transform:translateX(120%); }

        .app-name{
          position:relative; z-index:1;
          font-size:15.5px; font-weight:800; line-height:1.15;
          color:#132a44; letter-spacing:-.01em;
        }
        .app-foot{
          position:relative; z-index:1;
          display:flex; align-items:center; justify-content:space-between;
        }
        .app-count{ font-size:11.5px; color:#7387a0; font-weight:500; }
        .app-enter{
          display:inline-flex; align-items:center; gap:3px;
          font-size:11.5px; font-weight:800; color:var(--de);
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
                  "--de": area.de,
                  "--a": area.a,
                  // Cada tarjeta entra un poco después que la anterior.
                  animationDelay: `${i * 55}ms`,
                } as CSSProperties
              }
            >
              <span className="app-ico">
                <Icono className="h-[24px] w-[24px]" aria-hidden="true" />
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
