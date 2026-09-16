-- Crear tabla locations si no existe
CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) UNIQUE NOT NULL,
  "Descripción" TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insertar algunas localizaciones de ejemplo
INSERT INTO locations (codigo, "Descripción") VALUES
  ('ALM-01', 'Almacén Principal'),
  ('ALM-02', 'Almacén Secundario'),
  ('PROD-01', 'Área de Producción 1'),
  ('PROD-02', 'Área de Producción 2'),
  ('DESP-01', 'Área de Despacho')
ON CONFLICT (codigo) DO NOTHING;
