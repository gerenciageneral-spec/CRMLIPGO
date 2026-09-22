// Permisos del CRM.
//
// SIN "use server" A PROPOSITO: Next prohibe exportar valores no-async desde un
// modulo con esa directiva, y aqui se exportan una interfaz y un objeto. Las
// funciones que CONSULTAN permisos viven en permissions-actions.ts.
//
// La tabla `permisos_usuarios` es COMPARTIDA con LIPgo, que sigue en produccion
// con sus ~153 columnas operativas. El script 186 agrega las columnas crm_*
// sin borrar ninguna: para el CRM las viejas simplemente no existen, y para
// LIPgo las nuevas son invisibles.

/** Columnas crm_* de `permisos_usuarios` (ver scripts/186_crm_permisos.sql). */
export interface UserPermissions {
  usuario_id: string

  // Inicio
  crm_dashboard: boolean
  crm_agenda: boolean

  // Prospectos
  crm_prospectos: boolean
  crm_embudo: boolean
  crm_actividades: boolean

  // Ventas
  crm_cotizaciones: boolean
  crm_pedidos: boolean
  /** Primera firma del pedido. */
  crm_autorizar_contabilidad: boolean
  /** Segunda firma. Con ambas, el pedido viaja a LIPgo. */
  crm_autorizar_gerencia: boolean

  // Clientes
  crm_clientes: boolean
  crm_listas_precios: boolean

  // Cartera
  crm_cartera: boolean
  crm_pagos: boolean
  crm_comisiones: boolean

  // Inteligencia
  crm_ia_rutas: boolean
  crm_ia_oportunidades: boolean
  crm_reportes: boolean

  // Configuracion
  crm_productos: boolean
  crm_vendedores: boolean
  crm_parametros: boolean
  crm_usuarios: boolean
  crm_auditoria: boolean
}

/**
 * Nombre visible del modulo -> columna de permiso.
 *
 * La llave debe coincidir EXACTAMENTE con `Module.name` de dashboard-data.ts y
 * con la entrada de MODULE_REGISTRY. Un modulo que no aparezca aqui NO esta
 * protegido y lo ve cualquiera; uno que aparezca con una columna inexistente
 * no lo ve nadie.
 */
export const MODULE_PERMISSION_MAP: Record<string, keyof UserPermissions> = {
  // Inicio
  "Dashboard Comercial": "crm_dashboard",
  "Mi Agenda": "crm_agenda",

  // Prospectos
  "Registrar Prospecto": "crm_prospectos",
  "Embudo de Ventas": "crm_embudo",
  "Actividades": "crm_actividades",
  // El calendario y la agenda comparten permiso: son la misma informacion,
  // una en rejilla mensual y otra como lista del dia.
  "Calendario de Visitas": "crm_agenda",

  // Ventas
  "Cotizaciones": "crm_cotizaciones",
  // "Nueva Venta" es la venta directa, que se salta la cotizacion: por eso
  // depende del permiso de pedidos y no del de cotizaciones.
  "Nueva Venta": "crm_pedidos",
  "Pedidos CRM": "crm_pedidos",
  // La bandeja de firmas se muestra a quien pueda dar CUALQUIERA de las dos.
  // Cual de los dos botones aparece lo decide el componente, que vuelve a
  // consultar el permiso concreto.
  "Autorizar Pedidos": "crm_autorizar_contabilidad",

  // Clientes
  "Gestión de Clientes": "crm_clientes",
  "Sucursales": "crm_clientes",
  "Listas de Precios": "crm_listas_precios",

  // Cartera
  "Cuentas por Cobrar": "crm_cartera",
  "Registrar Pago": "crm_pagos",
  "Antigüedad de Cartera": "crm_cartera",
  "Comisiones": "crm_comisiones",

  // Inteligencia
  "Rutas Óptimas": "crm_ia_rutas",
  "Oportunidades de Negocio": "crm_ia_oportunidades",
  "Asistente IA": "crm_dashboard",
  "Reportes": "crm_reportes",

  // Configuracion
  "Productos": "crm_productos",
  "Vendedores": "crm_vendedores",
  "Parametrización": "crm_parametros",
  "Gestión de Usuarios": "crm_usuarios",
  "Bitácora de Auditoría": "crm_auditoria",
}

/** Todas las columnas de permiso, para crear un usuario con todo en false. */
export const TODOS_LOS_PERMISOS: (keyof UserPermissions)[] = [
  "crm_dashboard", "crm_agenda",
  "crm_prospectos", "crm_embudo", "crm_actividades",
  "crm_cotizaciones", "crm_pedidos", "crm_autorizar_contabilidad", "crm_autorizar_gerencia",
  "crm_clientes", "crm_listas_precios",
  "crm_cartera", "crm_pagos", "crm_comisiones",
  "crm_ia_rutas", "crm_ia_oportunidades", "crm_reportes",
  "crm_productos", "crm_vendedores", "crm_parametros", "crm_usuarios", "crm_auditoria",
]

/** Permisos que no cuelgan de un modulo del menu, para la grilla de checkboxes. */
export const PERMISOS_EXTRA: { key: keyof UserPermissions; etiqueta: string; grupo: string }[] = [
  {
    key: "crm_autorizar_contabilidad",
    etiqueta: "Autorizar pedidos — Contabilidad",
    grupo: "Ventas",
  },
  {
    key: "crm_autorizar_gerencia",
    etiqueta: "Autorizar pedidos — Gerencia",
    grupo: "Ventas",
  },
]
