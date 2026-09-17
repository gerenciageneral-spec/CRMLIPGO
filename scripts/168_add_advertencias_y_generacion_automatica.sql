-- ============================================================================
-- Auto-generación de prefacturas: advertencias persistidas + frecuencia propia
-- ----------------------------------------------------------------------------
-- Extiende el Ciclo de Facturación para que la GENERACIÓN de la prefactura
-- (no solo el envío de su anexo) también pueda ser automática por proyecto.
--
-- `prefacturas.advertencias`: guarda las advertencias (sin tarifa, sin
-- gestionar, pago que no cuadra, alertas de producción) que hoy solo se
-- muestran en pantalla en el momento de generar -- al generar sin que haya
-- una persona mirando, hay que dejarlas guardadas para que el Jefe las
-- revise después (decisión del negocio: "generar igual y avisar después").
--
-- `condiciones_generacion_prefactura`: separada de `condiciones_envio_anexo`
-- a propósito -- son decisiones distintas (generar el documento vs. enviar
-- el anexo de uno que ya existe) y cada proyecto puede querer una cadencia
-- distinta para cada una. A diferencia de la de envío (que sin fila asume
-- semanal-lunes), esta por defecto es `activo=false`: generar un documento
-- financiero real de la nada es más delicado que solo enviar uno que un
-- humano ya aprobó, así que cada proyecto se activa a mano, explícito.
-- ============================================================================

alter table public.prefacturas
  add column if not exists advertencias jsonb not null default '[]'::jsonb;

create table if not exists public.condiciones_generacion_prefactura (
  idempresa integer primary key,
  frecuencia text not null default 'semanal' check (frecuencia in ('diario', 'semanal')),
  dia_semana integer check (dia_semana between 0 and 6), -- 0=domingo..6=sábado; solo aplica si frecuencia='semanal'
  activo boolean not null default false
);
