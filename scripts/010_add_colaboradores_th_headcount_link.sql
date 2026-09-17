-- =====================================================================
-- Vincula cada colaborador (colaboradores_th) con su registro espejo en
-- la tabla headcount. Al crear/editar un colaborador en Gestion de
-- Colaboradores tambien se crea/actualiza su registro en headcount, y
-- este vinculo permite recuperarlo y mantenerlo sincronizado.
-- =====================================================================

alter table colaboradores_th
  add column if not exists headcount_id integer;

-- Indice para resolver el vinculo rapidamente.
create index if not exists idx_colaboradores_th_headcount_id
  on colaboradores_th (headcount_id);
