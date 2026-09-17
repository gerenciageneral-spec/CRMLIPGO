-- ============================================================================
--  Tabla `gastos`
--  Registro de los gastos operativos de cada empresa. Cada fila representa
--  un gasto (servicio publico, nomina, arriendo, mantenimiento, etc.) con
--  un soporte opcional (factura/comprobante) almacenado en Supabase Storage.
-- ============================================================================

create table if not exists public.gastos (
  id            bigserial primary key,
  idempresa     integer not null,
  fecha_gasto   date    not null default current_date,
  categoria     text    not null,
  monto         numeric(14, 2) not null check (monto >= 0),
  descripcion   text,
  url_soporte   text,
  created_at    timestamptz not null default now()
);

-- Indice para los filtros principales del dashboard:
-- WHERE idempresa = ? ORDER BY fecha_gasto DESC.
create index if not exists idx_gastos_empresa_fecha
  on public.gastos (idempresa, fecha_gasto desc);

-- Indice para el KPI "categoria con mas gasto" del dashboard.
create index if not exists idx_gastos_empresa_categoria
  on public.gastos (idempresa, categoria);

-- ============================================================================
--  Storage bucket `soportes_gastos`
--  Almacena los archivos (PDF/JPG/PNG) que el usuario sube como soporte.
--  Se crea via insert en `storage.buckets` (mas portable que la API admin).
--  Si el bucket ya existe, la sentencia es idempotente gracias al ON CONFLICT.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('soportes_gastos', 'soportes_gastos', true)
on conflict (id) do nothing;

-- Politica permisiva para lectura publica de los soportes (los URLs del
-- dashboard se abren en pestana nueva). Si quieres soportes privados,
-- borra esta policy y usa `createSignedUrl()` en el dashboard.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'gastos_public_read'
  ) then
    execute $p$
      create policy gastos_public_read on storage.objects
        for select using (bucket_id = 'soportes_gastos');
    $p$;
  end if;
end $$;

-- Permite a usuarios anonimos subir archivos (necesario porque el cliente
-- usa la anon key). Si necesitas que solo subir usuarios autenticados,
-- cambia `to anon, authenticated` por `to authenticated`.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'gastos_anon_insert'
  ) then
    execute $p$
      create policy gastos_anon_insert on storage.objects
        for insert with check (bucket_id = 'soportes_gastos');
    $p$;
  end if;
end $$;
