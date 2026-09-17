-- FRECUENCIA DE ENVÍO AUTOMÁTICO DE ANEXOS, POR PROYECTO.
-- Cada proyecto (ID) factura distinto -- unos semanal, otros a diario. En vez
-- de un cron fijo, esta tabla decide POR PROYECTO si hoy le toca enviar el
-- anexo automáticamente (ver app/api/cron/anexos-pendientes/route.ts, que
-- corre TODOS LOS DÍAS pero filtra usando esta configuración). Editable desde
-- la app (panel "Frecuencia de envío de anexos por Proyecto" dentro de Ciclo
-- de Facturación), sin tocar código ni vercel.json.
--
-- Sin fila para un proyecto -> default semanal, lunes (dia_semana=1).
-- Aditivo e idempotente.

create table if not exists public.condiciones_envio_anexo (
  idempresa integer primary key,
  frecuencia text not null default 'semanal',
  dia_semana integer, -- 0=domingo .. 6=sábado; solo aplica si frecuencia='semanal'
  activo boolean not null default true
);

do $$ begin
  alter table public.condiciones_envio_anexo
    add constraint condiciones_envio_anexo_frecuencia_chk
    check (frecuencia in ('diario', 'semanal'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.condiciones_envio_anexo
    add constraint condiciones_envio_anexo_dia_semana_chk
    check (dia_semana is null or (dia_semana >= 0 and dia_semana <= 6));
exception when duplicate_object then null;
end $$;

-- Verificación:
--   select * from public.condiciones_envio_anexo;
