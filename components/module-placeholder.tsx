'use client'

import { Button } from "@/components/ui/button"
import { ArrowLeft, Construction } from 'lucide-react'

interface ModulePlaceholderProps {
  moduleName: string
  /** Opcional: si no se pasa, no se pinta el boton de volver (el sidebar ya
   *  permite salir del modulo). */
  onBack?: () => void
}

export function ModulePlaceholder({ moduleName, onBack }: ModulePlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-4 animate-in fade-in zoom-in duration-300">
      <div className="p-6 rounded-full bg-muted/50">
        <Construction className="h-12 w-12 text-muted-foreground/50" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">{moduleName}</h2>
        <p className="text-muted-foreground max-w-[500px]">
          Este módulo está actualmente en desarrollo. Pronto estará disponible con todas sus funcionalidades.
        </p>
      </div>
      {onBack && (
        <Button onClick={onBack} variant="outline" className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver al menú
        </Button>
      )}
    </div>
  )
}
