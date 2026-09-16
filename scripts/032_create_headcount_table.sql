create table headcount (
  -- Identificador único auto-incremental
  id bigint primary key generated always as identity,
  
  -- ID de empresa (smallint es el equivalente a int2)
  idempresa int2,
  
  -- Campos de información básica
  identificacion text,
  nombre text,
  estado text,
  
  -- Campos de documentos (todos tipo texto)
  hoja_de_vida text,
  copia_doc_id text,
  afiliacion_arl text,
  afiliacion_eps text,
  afiliacion_afp text,
  afiliacion_caja text,
  cert_laborales text,
  cert_personales text,
  antecedentes text,
  doc_beneficia text,
  examenes_ing text,
  cert_m_alimentos text,
  cert_eva_med text,
  acta_dotacion text,
  cert_cuenta text,
  contrato text,
  contratosiigo text
);

-- Habilitar el acceso en tiempo real (opcional para Supabase)
alter table headcount replica identity full;
