-- =====================================================================
-- Verificación del bucket `archivos` de Supabase Storage.
--
-- Correr si una subida sigue fallando después de migrar un endpoint desde
-- Vercel Blob. Las tres causas típicas, en orden:
--
--   1. El bucket no existe con ese nombre exacto.
--   2. El bucket es PRIVADO, así que `getPublicUrl` devuelve una URL que
--      después no abre (la subida sí funciona; lo que falla es verla).
--   3. Hay un límite de tamaño o una lista de tipos MIME que deja fuera el PDF.
--
-- Todas leen catálogo: responden al instante y no tocan datos.
-- =====================================================================

-- 1) ¿Existe el bucket y es público? ¿Tiene topes?
select id,
       name,
       public                as es_publico,
       file_size_limit       as limite_bytes,
       pg_size_pretty(file_size_limit) as limite_legible,
       allowed_mime_types    as tipos_permitidos,
       created_at
from storage.buckets
order by name;

-- 2) ¿Qué se ha subido a la carpeta `epp/`? Después de una subida exitosa
--    aquí debe aparecer el archivo con su tamaño.
select name,
       (metadata ->> 'size')::bigint            as bytes,
       metadata ->> 'mimetype'                  as tipo,
       created_at
from storage.objects
where bucket_id = 'archivos'
  and name like 'epp/%'
order by created_at desc
limit 20;

-- 3) Políticas de Storage sobre el bucket.
--    OJO: el endpoint sube con la CLAVE DE SERVICIO, que se salta RLS. Si la
--    subida falla por permisos, el problema no son estas políticas sino que la
--    clave de servicio no esté configurada en el entorno de despliegue
--    (SUPABASE_SERVICE_ROLE_KEY).
select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- =====================================================================
-- SI EL BUCKET `archivos` NO EXISTE, crearlo público y sin tope de tipos:
--
--   insert into storage.buckets (id, name, public)
--   values ('archivos', 'archivos', true)
--   on conflict (id) do nothing;
--
-- Si existe pero tiene `allowed_mime_types` sin 'application/pdf', ampliarlo
-- desde el panel de Supabase (Storage → archivos → Configuration).
-- =====================================================================
