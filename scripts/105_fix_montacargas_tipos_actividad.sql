-- =====================================================================
-- CORRECCIÓN: ampliar los tipos de actividad de sst_mantenimientos.
--
-- `sst_mantenimientos` nació con un CHECK que solo admite 'preventivo' y
-- 'correctivo'. El módulo de Gestión de Montacargas ofrece dos tipos más
-- —'revision' y 'falla_reportada'— y sin esto la base los RECHAZA con el
-- error 23514: el operario llenaría el formulario desde el celular y al
-- guardar recibiría un error, sin entender por qué.
--
-- Esto FALTÓ en scripts/104_create_gestion_montacargas.sql. Se corre aparte para
-- no volver a tocar aquel; los dos son idempotentes y el orden entre ellos da
-- igual.
--
-- No cambia nada de lo que ya funciona: 'preventivo' y 'correctivo' se
-- conservan, solo se admiten dos valores más.
-- =====================================================================

-- El nombre del constraint puede variar según cómo se creó la tabla, así que
-- se buscan TODOS los CHECK que apliquen a `tipo` y se eliminan antes de
-- poner el nuevo. Sin esto, un constraint con otro nombre seguiría bloqueando.
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'sst_mantenimientos'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%tipo%'
  loop
    execute format('alter table public.sst_mantenimientos drop constraint %I', c.conname);
    raise notice 'Eliminado el constraint %', c.conname;
  end loop;
end $$;

alter table public.sst_mantenimientos
  add constraint sst_mantenimientos_tipo_check
  check (tipo in ('preventivo', 'correctivo', 'revision', 'falla_reportada'));

-- `estado_gestion` solo tiene dos valores válidos; conviene blindarlo igual
-- para que un error de código no meta un estado inventado que deje una falla
-- ni abierta ni cerrada.
do $$
begin
  if not exists (
    select 1 from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
     where rel.relname = 'sst_mantenimientos'
       and con.conname = 'sst_mantenimientos_estado_gestion_check'
  ) then
    alter table public.sst_mantenimientos
      add constraint sst_mantenimientos_estado_gestion_check
      check (estado_gestion in ('abierto', 'cerrado'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- VERIFICACIÓN
-- ---------------------------------------------------------------------
-- select conname, pg_get_constraintdef(oid) as definicion
--   from pg_constraint
--  where conrelid = 'public.sst_mantenimientos'::regclass
--    and contype = 'c';
