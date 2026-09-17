-- Crear tabla de registros de báscula
CREATE TABLE IF NOT EXISTS bascula (
  id SERIAL PRIMARY KEY,
  orden_cargue VARCHAR(100),
  placa_vehiculo VARCHAR(50),
  hora_inicio TIMESTAMP,
  hora_fin TIMESTAMP,
  peso_neto_bascula DECIMAL(10,2),
  numero_tiquete VARCHAR(100),
  observaciones TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
