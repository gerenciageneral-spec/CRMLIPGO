-- =====================================================================
-- Barrido end-to-end: SQL de apoyo para 2 de los fixes de código.
-- Idempotente y seguro (correr en el SQL Editor de Supabase). NO toca
-- cabeceraoc ni invtrans (su patrón de id es intencional y se deja igual).
-- =====================================================================

-- 1) registroasistencia.id (SERIAL): resincronizar la SECUENCIA con el máximo id.
--    Antes, varios caminos fijaban el id a mano (max+1) sin avanzar la secuencia,
--    dejándola por detrás de max(id). Ya se corrigió el código para que TODOS los
--    inserts usen el SERIAL (nextval); este setval sana el desfase acumulado para
--    que el próximo nextval no choque con ids ya existentes.
--    Seguro de correr aunque ya esté sana (setval es idempotente).
DO $$
DECLARE
  mx bigint;
  seqname text := pg_get_serial_sequence('public.registroasistencia', 'id');
BEGIN
  IF seqname IS NULL THEN
    RAISE NOTICE 'registroasistencia.id no tiene secuencia asociada; nada que resincronizar.';
    RETURN;
  END IF;
  SELECT COALESCE(MAX(id), 0) INTO mx FROM public.registroasistencia;
  IF mx > 0 THEN
    PERFORM setval(seqname, mx, true);      -- próximo nextval = mx + 1
  ELSE
    PERFORM setval(seqname, 1, false);      -- tabla vacía: próximo nextval = 1
  END IF;
  RAISE NOTICE 'Secuencia % resincronizada a max(id)=%', seqname, mx;
END $$;

-- 2) Bitácora de Auditoría: vista con los módulos DISTINCT ya registrados.
--    getAuditoriaModulos la usa para llenar el desplegable de filtro sin toparse
--    con el límite de 1000 filas de PostgREST (el DISTINCT se calcula en el motor,
--    devuelve pocas filas). Si no se crea, el código cae a un muestreo acotado.
CREATE OR REPLACE VIEW public.auditoria_modulos_usados AS
  SELECT DISTINCT modulo
  FROM public.auditoria
  WHERE modulo IS NOT NULL;

-- Verificación rápida (opcional):
-- SELECT modulo FROM public.auditoria_modulos_usados ORDER BY modulo;
