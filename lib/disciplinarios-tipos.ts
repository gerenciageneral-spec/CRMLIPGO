// Tipos del módulo de procesos disciplinarios.
//
// Aparte del archivo de acciones porque ese es "use server" y esos archivos
// solo pueden exportar funciones async.

export interface SoporteAdjunto {
  url: string
  nombre: string
  subidoEn: string
}

export interface ProcesoDisciplinario {
  id: string
  radicado: string
  identificacion: string
  nombre: string
  cargo: string | null

  conducta: string
  norma: string | null
  medidaSugerida: string | null
  fechaHecho: string
  horaHecho: string | null
  lugar: string | null
  relato: string
  testigo: string | null
  testigoCargo: string | null

  estado: string
  fechaCitacionDescargos: string | null
  fechaDescargos: string | null
  medidaAplicada: string | null
  fechaResolucion: string | null
  motivoArchivo: string | null

  radicadoPor: string | null
  responsable: string | null
  areaResponsable: string | null

  documentoUrl: string | null
  documentoNombre: string | null
  soportes: SoporteAdjunto[]

  creadoEn: string | null
}

export interface EntradaBitacora {
  id: number
  estadoAnterior: string | null
  estadoNuevo: string
  nota: string | null
  actor: string | null
  creadoEn: string
}

export interface TrabajadorDisciplinario {
  identificacion: string
  nombre: string
  cargo: string | null
}

export interface DisciplinariosData {
  casos: ProcesoDisciplinario[]
  trabajadores: TrabajadorDisciplinario[]
  resumen: {
    total: number
    radicados: number
    enDescargos: number
    resueltos: number
    archivados: number
  }
  avisos: string[]
  /** true = falta correr el script de esta entrega. */
  faltaMigracion: boolean
}

export interface CrearProcesoInput {
  empresaId: number
  identificacion: string
  nombre: string
  cargo?: string | null
  conductaId: string
  fechaHecho: string
  horaHecho?: string | null
  lugar?: string | null
  relato: string
  testigo?: string | null
  testigoCargo?: string | null
}
