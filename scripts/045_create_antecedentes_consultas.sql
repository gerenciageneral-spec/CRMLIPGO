-- Tabla de consultas de antecedentes contra la API de Compliance.
-- Guarda el resultado consolidado (JSON), el score de riesgo y la URL del PDF
-- Completo (subido a Storage). Multi-tenant por idempresa. Se accede con service
-- role (sin RLS), igual que el resto del backend de LIPgo.

create table if not exists public.antecedentes_consultas (
  id uuid primary key default gen_random_uuid(),
  idempresa integer,
  hoja_vida_id uuid,
  cedula text,
  tipo_documento text default 'cc',
  nombre text,
  id_dato_consultado bigint,           -- idDatoConsultado de Compliance (para PDF/score)
  id_consulta bigint,                  -- idConsulta interno de Compliance
  presenta_riesgo boolean,
  pep boolean,
  is_menor_edad boolean,
  total_fuentes_consultadas integer,
  total_fuentes_con_error integer,
  score_riesgo integer,                -- 0-100 (0-50 rojo, 51-84 amarillo, 85-100 verde)
  ro numeric,                          -- % Riesgo Operacional
  laft numeric,                        -- % Riesgo LAFT
  rr numeric,                          -- % Riesgo Reputacional
  mostrar_score boolean,
  resultado_json jsonb,                -- respuesta consolidada completa
  pdf_url text,                        -- PDF Completo guardado en Storage (bucket archivos)
  consultado_por text,
  created_at timestamptz default now()
);

create index if not exists idx_antecedentes_consultas_emp_cedula
  on public.antecedentes_consultas (idempresa, cedula);

create index if not exists idx_antecedentes_consultas_created
  on public.antecedentes_consultas (created_at desc);
