-- Decisión de antecedentes (aceptar/rechazar) + datos de la consulta Compliance.
-- Columnas NUEVAS y nullable (no rompen datos existentes).

-- Registro de antecedentes: estado + PDF/score de la consulta Compliance.
alter table if exists public.antecedentes
  add column if not exists estado text default 'pendiente',   -- pendiente | aceptado | rechazado
  add column if not exists compliance_pdf_url text,
  add column if not exists compliance_pdf_nombre text,
  add column if not exists id_dato_consultado bigint,
  add column if not exists score_riesgo integer,
  add column if not exists presenta_riesgo boolean,
  add column if not exists pep boolean,
  add column if not exists decidido_por text,
  add column if not exists decidido_en timestamptz;

-- Hoja de vida: slot propio para el PDF de antecedentes (sin pisar el CV).
alter table if exists public.hojas_de_vida
  add column if not exists antecedentes_url text,
  add column if not exists antecedentes_nombre text,
  add column if not exists antecedentes_estado text,          -- aceptado | rechazado
  add column if not exists antecedentes_score integer;
