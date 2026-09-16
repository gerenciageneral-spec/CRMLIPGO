"use client"

// Módulo "Programación de Turnos": dos formas de trabajar la misma información.
//
//  · Programar el día — la pantalla que ya existía: elegir una fecha, marcar
//    personas y crear sus turnos. Es la ÚNICA que escribe turnos nuevos, porque
//    conoce las reglas de inserción (deduplicación, especialidad del puesto,
//    copia de la marcación si la persona ya entró).
//
//  · Vista de quincena — la quincena completa: cobertura por puesto, equipos y
//    patrones, y la grilla persona × día.
//
// Se dejan como pestañas y no se fusionan a propósito: crear turnos y revisar
// la quincena son dos tareas distintas, y mezclarlas haría que una pantalla que
// escribe en nómina se parezca a una de solo lectura.

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ProgramacionTurnos from "@/components/rrhh/programacion-turnos"
import { ProgramacionQuincena } from "@/components/rrhh/programacion-quincena"

export default function ProgramacionPersonal() {
  return (
    <Tabs defaultValue="dia" className="p-4">
      <TabsList>
        <TabsTrigger value="dia">Programar el día</TabsTrigger>
        <TabsTrigger value="quincena">Vista de quincena</TabsTrigger>
      </TabsList>

      {/* La pantalla original, sin cambios: sigue siendo la que crea turnos. */}
      <TabsContent value="dia" className="pt-2">
        <ProgramacionTurnos />
      </TabsContent>

      <TabsContent value="quincena" className="pt-2">
        <ProgramacionQuincena />
      </TabsContent>
    </Tabs>
  )
}
