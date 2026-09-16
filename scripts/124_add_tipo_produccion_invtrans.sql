-- =====================================================================
-- `invtrans.tipo_produccion`: separa la produccion que LIP ejecuta como
-- SERVICIO (facturable) de la produccion PROPIA de Harinera.
--
-- PROBLEMA QUE RESUELVE
-- El modulo "Registro de QR estibas" registra produccion contra un
-- servicio externo que inserta en `public.produccion`; el trigger
-- `trg_produccion_after_insert` la copia a `invtrans`, y de ahi el
-- ingreso sigue a Aprobacion y a Liquidacion Tolva, que crea la orden en
-- `cabeceraoc` y genera la facturacion.
--
-- La produccion propia de Harinera debe generar inventario y pasar por
-- aprobacion, pero NO debe llegar nunca a `cabeceraoc`. Esta columna es
-- la marca que permite aislarla.
--
-- SEMANTICA DE LOS VALORES
--   NULL        -> LIP. Es el valor de TODO lo historico y de todo lo que
--                  sube el LOGO directamente (que nunca pasa por LIPgo).
--   'Harinera'  -> produccion propia de Harinera. Excluida de todo camino
--                  de cobro.
--
-- Se deja nullable a proposito en vez de poner DEFAULT 'LIP': el trigger
-- `fn_sync_produccion_to_invtrans` NO menciona esta columna, asi que sus
-- filas quedarian con el default igual. Un NULL explicito deja claro que
-- esa fila nunca fue clasificada, y los filtros ya lo contemplan.
--
-- OJO AL FILTRAR: en Postgres `tipo_produccion <> 'Harinera'` es NULL
-- para las filas nulas, que quedarian EXCLUIDAS por error. Hay que usar
-- siempre la forma explicita:
--     .or("tipo_produccion.is.null,tipo_produccion.neq.Harinera")
--
-- Correr en Supabase ANTES de desplegar: LIPgo ya escribe esta columna.
-- =====================================================================

alter table public.invtrans
  add column if not exists tipo_produccion text;

comment on column public.invtrans.tipo_produccion is
  'Origen de la produccion: NULL = LIP (servicio facturable, valor de todo lo historico y de lo que sube el LOGO); ''Harinera'' = produccion propia de Harinera, genera inventario pero NUNCA llega a cabeceraoc ni a facturacion.';

-- Los filtros de Liquidacion Tolva y de la conciliacion consultan por esta
-- columna junto con status/origen.
create index if not exists invtrans_tipo_produccion_idx
  on public.invtrans (tipo_produccion);

-- =====================================================================
-- VERIFICACION
-- =====================================================================

select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'invtrans'
   and column_name = 'tipo_produccion';

-- Reparto actual. Antes de usar el modulo todo debe salir en `lip_o_historico`.
select
  count(*) filter (where tipo_produccion is null)          as lip_o_historico,
  count(*) filter (where tipo_produccion = 'Harinera')     as harinera,
  count(*)                                                  as total
from public.invtrans
where tipomov = 'Entrada'
  and origen ilike '%ingreso producci%';
