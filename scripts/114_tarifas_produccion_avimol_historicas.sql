-- =====================================================================
-- TARIFAS HISTÓRICAS de producción de AVIMOL (id 2) — ENERO a JUNIO 2026.
--
-- La producción de Avimol (aprobaciones de ingreso de producción, invtrans)
-- de enero a junio 2026 hoy se valora en $0 en el Estado de Resultados y en
-- la Conciliación, porque las tarifas de Estibado/Salvado del maestro
-- `tarifasoperacion` solo existen con vigencia desde el 1-jul-2026.
-- Medido: hay entre 213 y 4.602 toneladas/mes aprobadas en esos meses.
--
-- Este script inserta la vigencia HISTÓRICA (2026-01-01 → 2026-06-30) con
-- las tarifas REALES que regían antes del cambio del 1 de julio, tomadas
-- del cuadro de estructura del proyecto (confirmado por gerencia
-- 2026-08-02):
--
--   Estibado Ordinario PT            $ 7.158
--   Estibado Festivo PT              $12.885
--   Estibado Subproducto Ordinario   $ 9.926  (Salvado)
--   Estibado Subproducto Festivo     $17.867  (Salvado Festivo)
--
-- Desde el 1-jul-2026 siguen aplicando las que ya están en el maestro
-- ($8.271 / $15.715 / $11.926 / $22.659). La conciliación escoge la tarifa
-- por vigencia (fechainicio/fechafin), así que con estas filas los meses
-- viejos se valoran solos — sin tocar ni una línea de código.
--
-- SOLO AFECTA AL ID 2. Idempotente: no duplica si ya existen.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 0 · Resincronizar la secuencia del id de tarifasoperacion.
-- Descubierto al correrlo (2026-08-02): la tabla tiene filas insertadas
-- con id explícito y el contador automático quedó atrás — el insert
-- intentaba asignar id=3, que ya existe (error 23505). Esto lo alinea al
-- máximo actual y de paso sana la tabla para cualquier insert futuro
-- (incluido el módulo de Tarifas de la app, que habría fallado igual).
-- ---------------------------------------------------------------------
select setval(
  pg_get_serial_sequence('public.tarifasoperacion', 'id'),
  (select max(id) from public.tarifasoperacion)
);

insert into public.tarifasoperacion
  (fechainicio, fechafin, empresaid, operacion, tarifa, descripcion, empresafactura, producto)
select v.fechainicio, v.fechafin, v.empresaid, v.operacion, v.tarifa, v.descripcion, v.empresafactura, v.producto
from (values
  ('2026-01-01'::date, '2026-06-30'::date, 2, 'Estibado PT',         '7158',
   'Tarifa histórica ene-jun 2026 (antes del cambio del 1-jul). Valora la producción aprobada de esos meses.',
   'Avimol', 'Estibado PT ordinario'),
  ('2026-01-01'::date, '2026-06-30'::date, 2, 'Estibado PT Festivo', '12885',
   'Tarifa histórica ene-jun 2026 (antes del cambio del 1-jul).',
   'Avimol', 'Estibado PT Festivo'),
  ('2026-01-01'::date, '2026-06-30'::date, 2, 'Salvado',             '9926',
   'Tarifa histórica ene-jun 2026 (antes del cambio del 1-jul). Subproducto/Mogolla.',
   'Avimol', 'Sub Producto Mogolla'),
  ('2026-01-01'::date, '2026-06-30'::date, 2, 'Salvado Festivo',     '17867',
   'Tarifa histórica ene-jun 2026 (antes del cambio del 1-jul). Subproducto/Mogolla festivo.',
   'Avimol', 'Sub Producto Mogolla')
) as v(fechainicio, fechafin, empresaid, operacion, tarifa, descripcion, empresafactura, producto)
where not exists (
  select 1 from public.tarifasoperacion t
   where t.empresaid = v.empresaid
     and trim(upper(t.operacion)) = trim(upper(v.operacion))
     and t.fechainicio = v.fechainicio
);

-- ---------------------------------------------------------------------
-- VERIFICACIÓN
-- ---------------------------------------------------------------------

-- a) Deben quedar DOS vigencias por operación de producción: ene-jun y jul-dic.
select operacion, tarifa, fechainicio, fechafin
  from public.tarifasoperacion
 where empresaid = 2
   and operacion in ('Estibado PT','Estibado PT Festivo','Salvado','Salvado Festivo')
 order by operacion, fechainicio;

-- b) Toneladas de producción aprobadas por mes (por LOTE) que ahora se
--    pueden valorar. Referencia medida: feb 3.109 t · mar 4.602 t ·
--    abr 3.578 t · may 4.265 t · jun 3.322 t.
select substring(i.lote, 1, 6) as anio_mes,
       round(sum(i.cantidad * coalesce(p.peso_unitkg, 0) / 1000.0), 1) as toneladas
  from public.invtrans i
  left join public.productos p on p.nombre = i.nombreproducto
 where i.idempresa = 2
   and i.tipomov = 'Entrada'
   and i.status = 'Aprobado'
   and i.origen ilike '%ingreso producci%'
   and i.lote ~ '^\d{8}$'
   and substring(i.lote, 1, 6) between '202601' and '202606'
 group by 1
 order by 1;
