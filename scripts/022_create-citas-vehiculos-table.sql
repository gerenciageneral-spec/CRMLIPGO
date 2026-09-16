-- Crear tabla de citas de vehículos
CREATE TABLE IF NOT EXISTS citas_vehiculos (
  id SERIAL PRIMARY KEY,
  placa VARCHAR(20) NOT NULL,
  nombre_conductor VARCHAR(100) NOT NULL,
  telefono VARCHAR(20) NOT NULL,
  transporte VARCHAR(100) NOT NULL,
  tipo_vehiculo VARCHAR(50) NOT NULL,
  tipo_producto VARCHAR(50) NOT NULL,
  fecha_cita TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
