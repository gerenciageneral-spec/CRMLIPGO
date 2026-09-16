-- Crear tabla transacciones_inventario
CREATE TABLE IF NOT EXISTS transacciones_inventario (
  id SERIAL PRIMARY KEY,
  producto VARCHAR(255) NOT NULL,
  codigo_producto VARCHAR(100),
  lote VARCHAR(100),
  localizacion VARCHAR(50),
  cantidad NUMERIC(10, 2) NOT NULL,
  tipo_movimiento VARCHAR(20) NOT NULL CHECK (tipo_movimiento IN ('Entrada', 'Salida')),
  fecha_transaccion TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
