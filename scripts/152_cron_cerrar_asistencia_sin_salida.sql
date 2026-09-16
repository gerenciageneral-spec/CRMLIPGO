-- ============================================================================
-- Cierre automático de asistencia sin hora de salida — 11pm hora Colombia
-- ----------------------------------------------------------------------------
-- Pedido por el usuario 2026-08-28: todos los días a las 11pm (hora
-- Colombia), si una persona marcó ENTRADA pero no marcó SALIDA ese mismo
-- día, se le registra automáticamente `horasalida = horasalidaprogramada`
-- (su hora de salida programada) y se marca `horafinauto = true` para dejar
-- trazabilidad de que esa salida NO fue marcada por la persona, sino
-- cerrada por el sistema.
--
-- Alcance de la fila afectada:
--   - fecha = HOY en Colombia (calculado con America/Bogota, sin depender
--     del timezone de la sesión de Postgres).
--   - horaingreso IS NOT NULL (sí llegó / marcó entrada).
--   - horasalida IS NULL (no marcó salida).
--   - horasalidaprogramada IS NOT NULL (hay un valor válido para copiar;
--     sin esto no hay nada sensato que asignar, se deja la fila como está).
--
-- EFECTO COLATERAL ESPERADO Y DESEADO: al ser un UPDATE real de
-- `horasalida`, si el trigger `trg_calcular_horas_extras` (función
-- calcular_y_asignar_horas_extras(), scripts/fn_calcular_y_asignar_horas_
-- extras.sql) está activo, se dispara solo. Como horasalida queda IGUAL a
-- horasalidaprogramada, el exceso de salida da 0 (dentro de la tolerancia
-- de 45 min) y el cálculo de horas extra da 0 para esa fila — correcto: no
-- se le puede inventar hora extra a alguien de quien no se sabe la hora
-- real de salida.
--
-- CORRERLO COMPLETO Y DE CORRIDO:
--   PASO 0. Vista previa (solo lectura) de quién se cerraría HOY si se
--           corriera la función ahora mismo.
--   PASO 1. Crear/reemplazar la función.
--   PASO 2. Habilitar pg_cron (si no está) y programar el job diario a las
--           23:00 hora Colombia (04:00 UTC — Colombia es UTC-5 todo el año,
--           sin horario de verano).
--   PASO 3. Verificar que el job quedó programado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PASO 0 (solo lectura) — quién se cerraría HOY si se corriera ahora.
-- ----------------------------------------------------------------------------
select r.id, r.fecha, r.idempresa, r.nombre, r.identificacion, r.puesto,
       r.horaingreso, r.horasalida, r.horasalidaprogramada, r.horafinauto
  from public.registroasistencia r
 where r.fecha = (now() at time zone 'America/Bogota')::date
   and r.horaingreso is not null
   and r.horasalida is null
   and r.horasalidaprogramada is not null
 order by r.nombre;

-- ----------------------------------------------------------------------------
-- PASO 1 — función.
-- ----------------------------------------------------------------------------
create or replace function public.cerrar_asistencia_sin_salida()
returns void
language plpgsql
as $function$
DECLARE
    fecha_colombia DATE;
BEGIN
    fecha_colombia := (now() at time zone 'America/Bogota')::date;

    UPDATE public.registroasistencia
       SET horasalida   = horasalidaprogramada,
           horafinauto  = true
     WHERE fecha = fecha_colombia
       AND horaingreso IS NOT NULL
       AND horasalida IS NULL
       AND horasalidaprogramada IS NOT NULL;
END;
$function$;

-- ----------------------------------------------------------------------------
-- PASO 2 — programar el job diario a las 23:00 hora Colombia.
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;

-- Si el job ya existe (re-ejecución de este script), se quita primero para
-- no duplicarlo.
select cron.unschedule(jobid)
  from cron.job
 where jobname = 'cerrar_asistencia_sin_salida_23h_colombia';

select cron.schedule(
  'cerrar_asistencia_sin_salida_23h_colombia',
  '0 4 * * *',  -- 04:00 UTC = 23:00 (11pm) hora Colombia (UTC-5 fijo, sin horario de verano)
  $$select public.cerrar_asistencia_sin_salida();$$
);

-- ----------------------------------------------------------------------------
-- PASO 3 (solo lectura) — confirmar que quedó programado.
-- ----------------------------------------------------------------------------
select jobid, jobname, schedule, active, command
  from cron.job
 where jobname = 'cerrar_asistencia_sin_salida_23h_colombia';

-- ============================================================================
-- Para probarlo manualmente AHORA MISMO (sin esperar a las 11pm):
--   select public.cerrar_asistencia_sin_salida();
-- Para ver el historial de corridas del job (después de que corra alguna vez):
--   select * from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'cerrar_asistencia_sin_salida_23h_colombia')
--    order by start_time desc limit 20;
-- Para desactivar el job sin borrarlo:
--   select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'cerrar_asistencia_sin_salida_23h_colombia'), active := false);
-- Para borrarlo del todo:
--   select cron.unschedule(jobid) from cron.job where jobname = 'cerrar_asistencia_sin_salida_23h_colombia';
-- ============================================================================
