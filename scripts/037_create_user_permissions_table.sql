-- Tabla de permisos de usuarios por módulo
CREATE TABLE IF NOT EXISTS permisos_usuarios (
  id SERIAL PRIMARY KEY,
  usuario_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Gestión de Pedidos
  entrada_pedidos BOOLEAN DEFAULT true,
  gestionar_pedidos BOOLEAN DEFAULT true,
  
  -- Despachos/Recepción
  generar_ordenes_cargue BOOLEAN DEFAULT true,
  gestion_ordenes BOOLEAN DEFAULT true,
  
  -- Vehículos
  registrar_vehiculos BOOLEAN DEFAULT true,
  ver_vehiculos BOOLEAN DEFAULT true,
  
  -- Báscula
  bascula BOOLEAN DEFAULT true,
  
  -- Almacenamiento
  transacciones_inventario BOOLEAN DEFAULT true,
  saldos_inventario BOOLEAN DEFAULT true,
  saldos_producto BOOLEAN DEFAULT true,
  reprocesos BOOLEAN DEFAULT true,
  gestion_transacciones BOOLEAN DEFAULT true,
  solicitudes_traslados BOOLEAN DEFAULT true,
  ver_solicitudes_traslado BOOLEAN DEFAULT true,
  traslados_producto BOOLEAN DEFAULT true,
  capacidad_bodega BOOLEAN DEFAULT true,
  
  -- MRP (now independent group)
  creacion_materiales BOOLEAN DEFAULT true,
  ingresos_mp BOOLEAN DEFAULT true,
  explosion_materiales BOOLEAN DEFAULT true,
  gestion_proveedores BOOLEAN DEFAULT true,
  saldos_empaque BOOLEAN DEFAULT true,
  saldos_materia_prima BOOLEAN DEFAULT true,
  
  -- Producción
  ingreso_produccion BOOLEAN DEFAULT true,
  ver_ingresos_produccion BOOLEAN DEFAULT true,
  aprobacion_produccion BOOLEAN DEFAULT true,
  asignacion_lotes BOOLEAN DEFAULT true,
  historial_lotes BOOLEAN DEFAULT true,
  registro_sanitario BOOLEAN DEFAULT true,
  ver_historial_inspeccion BOOLEAN DEFAULT true,
  historial_aprobaciones BOOLEAN DEFAULT true,
  
  -- Auditoría
  auditoria_inventario BOOLEAN DEFAULT true,
  
  -- Gestión Integral
  dashboard_operacion BOOLEAN DEFAULT true,
  
  -- Gestión LIP (added new modules)
  head_count BOOLEAN DEFAULT true,
  registro_asistencia BOOLEAN DEFAULT true,
  tabla_asistencia BOOLEAN DEFAULT true,
  picking BOOLEAN DEFAULT true,
  registro_qr_estibas BOOLEAN DEFAULT true,
  lectura_qr_estibas BOOLEAN DEFAULT true,
  inventario_estiba BOOLEAN DEFAULT true,
  
  -- Configuración
  config_bodegas BOOLEAN DEFAULT true,
  config_categorias BOOLEAN DEFAULT true,
  config_subcategorias BOOLEAN DEFAULT true,
  config_clientes BOOLEAN DEFAULT true,
  config_condiciones_pago BOOLEAN DEFAULT true,
  config_destinos BOOLEAN DEFAULT true,
  config_grupos BOOLEAN DEFAULT true,
  config_medios BOOLEAN DEFAULT true,
  config_productos BOOLEAN DEFAULT true,
  config_sucursales BOOLEAN DEFAULT true,
  config_tipos_despacho BOOLEAN DEFAULT true,
  config_transportadoras BOOLEAN DEFAULT true,
  config_tipos_vehiculos BOOLEAN DEFAULT true,
  config_vendedores BOOLEAN DEFAULT true,
  config_localizaciones BOOLEAN DEFAULT true,
  gestion_usuarios BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(usuario_id)
);

-- Índice para búsquedas rápidas por usuario
CREATE INDEX IF NOT EXISTS idx_permisos_usuarios_usuario_id ON permisos_usuarios(usuario_id);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_permisos_usuarios_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_permisos_usuarios_updated_at
  BEFORE UPDATE ON permisos_usuarios
  FOR EACH ROW
  EXECUTE FUNCTION update_permisos_usuarios_updated_at();

-- Insertar permisos por defecto para usuarios existentes
INSERT INTO permisos_usuarios (usuario_id)
SELECT id FROM profiles
ON CONFLICT (usuario_id) DO NOTHING;
