"use client"

// Rejilla de modulos de un grupo. Es lo que se ve tras elegir un grupo del
// menu y antes de entrar a un modulo concreto.
//
// Solo muestra lo que el usuario puede abrir: filterGroupsByPermissions aplica
// el mismo criterio que el sidebar, para que no aparezca una tarjeta que al
// pulsarla no pinte nada.

import { useMemo } from "react"
import { ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useModulePermissions } from "@/hooks/use-module-permissions"
import { filterGroupsByPermissions, type GroupKey } from "@/lib/dashboard-data"

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

  // Se aplana la estructura para pintar: los subgrupos se muestran como
  // encabezados dentro de la misma rejilla.
  const secciones = grupo.subgroups?.length
    ? grupo.subgroups.map((sg) => ({ titulo: sg.title, modulos: sg.modules }))
    : [{ titulo: null as string | null, modulos: grupo.modules ?? [] }]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Volver">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
        <IconoGrupo className="h-6 w-6 text-[var(--chart-1)]" aria-hidden="true" />
        <h2 className="text-xl font-semibold tracking-tight">{grupo.title}</h2>
      </div>

      {secciones.map((seccion, i) => (
        <section key={seccion.titulo ?? i} className="space-y-3">
          {seccion.titulo && (
            <h3 className="text-sm font-medium text-muted-foreground">{seccion.titulo}</h3>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {seccion.modulos.map((modulo) => {
              const Icono = modulo.icon
              return (
                <button
                  key={modulo.name}
                  onClick={() => onSelectModule(modulo.name)}
                  className="group flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="rounded-lg bg-[var(--chart-1)]/10 p-2 text-[var(--chart-1)]">
                    <Icono className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-medium leading-tight">
                    {modulo.label ?? modulo.name}
                  </span>
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
