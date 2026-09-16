-- Create toneladasauxiliarespago table for daily payment tracking
CREATE TABLE toneladasauxiliarespago (
  -- Identificador único auto-incremental
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  
  -- ID de empresa
  idempresa INT2,
  
  -- Información del día
  fechacargue DATE,
  persona TEXT,
  
  -- Datos consolidados del día
  total_toneladas_dia NUMERIC(10, 2),
  total_pago_dia NUMERIC(10, 2),
  total_operaciones_realizadas INT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable real-time (optional for Supabase)
ALTER TABLE toneladasauxiliarespago REPLICA IDENTITY FULL;

-- Create indexes for better query performance
CREATE INDEX idx_toneladasauxiliarespagoo_empresa ON toneladasauxiliarespago(idempresa);
CREATE INDEX idx_toneladasauxiliarespago_fecha ON toneladasauxiliarespago(fechacargue);
CREATE INDEX idx_toneladasauxiliarespago_persona ON toneladasauxiliarespago(persona);
