-- Extrae la ESTRUCTURA y DEFINICIÓN de las vistas/tablas financieras.
-- Corre este script en el SQL Editor de Supabase y comparte los 4 resultados;
-- con eso completo docs/estructura-vistas-financieras.md con los CREATE VIEW reales.

-- 1) Tipo de cada objeto (vista / vista materializada / tabla)
select c.relname as objeto,
       case c.relkind
         when 'v' then 'vista'
         when 'm' then 'vista materializada'
         when 'r' then 'tabla'
         else c.relkind::text
       end as tipo
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('pagonomina','archivoplano','facturacion','facturacionturnos','toneladasauxiliarespago')
order by 1;

-- 2) Definición de las VISTAS estándar (SELECT que las define)
select viewname as vista, definition
from pg_views
where schemaname = 'public'
  and viewname in ('pagonomina','archivoplano','facturacion','facturacionturnos','toneladasauxiliarespago')
order by 1;

-- 3) Definición de VISTAS MATERIALIZADAS (si alguna lo es)
select matviewname as vista_materializada, definition
from pg_matviews
where schemaname = 'public'
  and matviewname in ('pagonomina','archivoplano','facturacion','facturacionturnos','toneladasauxiliarespago')
order by 1;

-- 4) Columnas y tipos (útil para las que sean TABLA)
select table_name, ordinal_position, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('pagonomina','archivoplano','facturacion','facturacionturnos','toneladasauxiliarespago')
order by table_name, ordinal_position;
