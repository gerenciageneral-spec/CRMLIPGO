-- =====================================================================
-- Registro Preoperacional: vincular la inspeccion con la PERSONA del
-- headcount y capturar su hora de entrada del dia.
--
-- Objetivo del negocio: poder comparar, en el Historial, la hora en que
-- la persona marco su entrada contra la hora en que diligencio el
-- preoperacional.
--
--  · identificacion_operador  -> cedula de la persona seleccionada en el
--    combobox (viene de `headcount`). `nombre_operador` se conserva tal
--    cual para no romper el PDF, el dashboard ni los registros historicos
--    que se digitaron a mano.
--
--  · hora_entrada_operador    -> FOTO de la hora de entrada del dia,
--    tomada de `asistencia` (fuente de verdad del ingreso diario) en el
--    momento de guardar. Queda en TEXT y no en TIME a proposito: el
--    endpoint /api/attendance/register escribe `hora` como string
--    "HH:MM:SS" y el tipo real de esa columna en produccion pudo derivar
--    del script de creacion. Guardarlo como texto normalizado evita
--    depender de esa coercion.
--
--    Puede quedar NULL si el preoperacional se diligencia ANTES de que la
--    persona marque entrada. No es un error: el Historial resuelve esos
--    casos consultando `asistencia` al momento de leer.
--
-- Correr en Supabase ANTES de desplegar este cambio: `savePreoperacional`
-- ya escribe estas dos columnas.
-- =====================================================================

alter table public.inspecciones_montacargas
  add column if not exists identificacion_operador text;

alter table public.inspecciones_montacargas
  add column if not exists hora_entrada_operador text;

-- Se consulta por (identificacion_operador, fecha) al resolver la hora de
-- entrada faltante en el Historial.
create index if not exists inspecciones_montacargas_identificacion_operador_idx
  on public.inspecciones_montacargas (identificacion_operador);

-- Verificacion
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'inspecciones_montacargas'
   and column_name in ('identificacion_operador', 'hora_entrada_operador')
 order by column_name;
