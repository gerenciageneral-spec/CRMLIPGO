-- =====================================================================
-- ACUERDO DE VOLÚMENES por proyecto — INFORMACIÓN CONFIDENCIAL DE GERENCIA.
--
-- Cada proyecto tiene una estructura acordada con el cliente: actividades
-- con TARIFA y VOLUMEN MENSUAL acordados, más la estructura de personal
-- (auxiliares, coordinador, bonificaciones) que la sostiene. Como LIP paga
-- fijo por turno y cobra por tonelada, el volumen acordado es el MÍNIMO
-- para no perder dinero: si el volumen real del mes queda por debajo, el
-- faltante SE DEBE FACTURAR al cliente.
--
-- Alimenta la pestaña "Análisis Financiero" del Estado de Resultados
-- (lib/analisis-financiero-actions.ts): acordado vs real, déficit y
-- $ adicionales a facturar.
--
-- Filas con tarifa+volumen = actividades facturables (llevan
-- actividad_codigo, la clave con la que el análisis les casa el volumen
-- REAL del período). Filas sin tarifa/volumen = estructura informativa.
--
-- VIGENCIAS: ID1/ID3/ID4 una sola (ene-dic 2026). ID2 tiene DOS: el
-- acuerdo cambió el 1 de julio (volúmenes y tarifas de producción).
-- Los reajustes futuros (IPC) se agregan como vigencia nueva sin tocar
-- la historia.
-- =====================================================================

create table if not exists public.acuerdo_volumenes (
  id bigint generated always as identity primary key,
  idempresa integer not null,
  actividad text not null,
  -- Clave del mapeo a volumen real (NULL = fila de estructura, no se mide):
  --   aux_cargue_descargue · cargue_subproducto · tolva · tolva_domingo ·
  --   estibado_pt · estibado_pt_festivo · salvado · salvado_festivo ·
  --   cargue · descargue · distribucion ·
  --   cargue_propios · cargue_cliente_recoge · descargue_distribucion · descargue_terceros
  actividad_codigo text,
  auxiliares numeric,
  muelle text,
  tarifa numeric,
  volumen_acordado numeric, -- toneladas/mes acordadas
  fechainicio date not null,
  fechafin date not null,
  creado_en timestamptz not null default now(),
  constraint acuerdo_volumenes_vigencia_chk check (fechafin >= fechainicio)
);

create index if not exists acuerdo_volumenes_idempresa_idx
  on public.acuerdo_volumenes (idempresa, fechainicio);

comment on table public.acuerdo_volumenes is
  'CONFIDENCIAL gerencia: estructura acordada por proyecto (tarifa × volumen mensual mínimo + personal). Si el volumen real no se cumple, el faltante se factura.';

-- =====================================================================
-- SEMILLA — los cuadros entregados por gerencia (2026-08-02).
-- =====================================================================

-- ---------------------------------------------------------------------
-- ID1 · Harinera Indupan — vigencia única 2026.
-- ---------------------------------------------------------------------
insert into public.acuerdo_volumenes (idempresa, actividad, actividad_codigo, auxiliares, muelle, tarifa, volumen_acordado, fechainicio, fechafin) values
  (1, 'Auxiliar de Cargue / Descargue', 'aux_cargue_descargue', 13, '2.3', 12650, 3500, '2026-01-01', '2026-12-31'),
  (1, 'Cargue Sub Producto',            'cargue_subproducto',   13, '1',   18400, 1000, '2026-01-01', '2026-12-31'),
  (1, 'Operario de Montacargas',        null, 1,   '1.2.3', null, null, '2026-01-01', '2026-12-31'),
  (1, 'Coordinador',                    null, 1,   '1.2.3', null, null, '2026-01-01', '2026-12-31'),
  (1, 'Bonificación coordinador y Líder', null, 1, null,    null, null, '2026-01-01', '2026-12-31'),
  (1, 'Bonificación por Montacargas',   null, 3,   null,    null, null, '2026-01-01', '2026-12-31'),
  (1, 'Tolva',                          'tolva',         7, null, 10189, 2800, '2026-01-01', '2026-12-31'),
  (1, 'Tolva domingo',                  'tolva_domingo', 5, null, 18340,  500, '2026-01-01', '2026-12-31'),
  (1, 'Líder Logístico',                null, 1, null, null, null, '2026-01-01', '2026-12-31');

-- ---------------------------------------------------------------------
-- ID2 · Avimol — DOS vigencias: ene-jun y jul-dic (cambió el 1-jul).
-- ---------------------------------------------------------------------
-- ENERO-JUNIO
insert into public.acuerdo_volumenes (idempresa, actividad, actividad_codigo, auxiliares, muelle, tarifa, volumen_acordado, fechainicio, fechafin) values
  (2, 'Auxiliar de Cargue / Descargue', 'aux_cargue_descargue', 12, '2.3', 15099, 4000, '2026-01-01', '2026-06-30'),
  (2, 'Cargue Sub Producto',            'cargue_subproducto',   12, '1',   19416, 1200, '2026-01-01', '2026-06-30'),
  (2, 'Operario de Montacargas',        null, 1,   '1.2.3', null, null, '2026-01-01', '2026-06-30'),
  (2, 'Coordinador',                    null, 0.5, '1.2.3', null, null, '2026-01-01', '2026-06-30'),
  (2, 'Equipo de Montacargas Eléctrico', null, 1,  '2.3',   null, null, '2026-01-01', '2026-06-30'),
  (2, 'Estibado Ordinario PT',          'estibado_pt',         3, null,  7158, 3455, '2026-01-01', '2026-06-30'),
  (2, 'Estibado Festivo PT',            'estibado_pt_festivo', 3, null, 12885,  658, '2026-01-01', '2026-06-30'),
  (2, 'Estibado Subproducto Ordinario', 'salvado',             3, null,  9926, 1017, '2026-01-01', '2026-06-30'),
  (2, 'Estibado Subproducto Festivo',   'salvado_festivo',     3, null, 17867,  224, '2026-01-01', '2026-06-30'),
  (2, 'Operario de Montacargas (producción)', null, 1,   null, null, null, '2026-01-01', '2026-06-30'),
  (2, 'Coordinador (producción)',             null, 0.5, null, null, null, '2026-01-01', '2026-06-30'),
  (2, 'Montacargas Eléctrico (producción)',   null, 1,   null, null, null, '2026-01-01', '2026-06-30'),
  (2, 'Líder Logístico',                      null, null, null, null, null, '2026-01-01', '2026-06-30');

-- JULIO-DICIEMBRE
-- Nota: la tarifa acordada de producción del cuadro jul+ ($8.561 Estibado PT)
-- difiere levemente del maestro operativo ($8.271). El acuerdo guarda lo del
-- cuadro; si el correcto es el maestro, se edita desde la UI del análisis.
insert into public.acuerdo_volumenes (idempresa, actividad, actividad_codigo, auxiliares, muelle, tarifa, volumen_acordado, fechainicio, fechafin) values
  (2, 'Auxiliar de Cargue / Descargue', 'aux_cargue_descargue', 11, '2.3', 15099, 3350, '2026-07-01', '2026-12-31'),
  (2, 'Cargue Sub Producto',            'cargue_subproducto',   11, '1',   19416,  875, '2026-07-01', '2026-12-31'),
  (2, 'Operario de Montacargas',        null, 1,   '1.2.3', null, null, '2026-07-01', '2026-12-31'),
  (2, 'Coordinador',                    null, 0.5, '1.2.3', null, null, '2026-07-01', '2026-12-31'),
  (2, 'Equipo de Montacargas Eléctrico', null, 1,  '2.3',   null, null, '2026-07-01', '2026-12-31'),
  (2, 'Estibado Ordinario PT',          'estibado_pt',         3, null,  8561, 3000, '2026-07-01', '2026-12-31'),
  (2, 'Estibado Festivo PT',            'estibado_pt_festivo', 3, null, 15410,  420, '2026-07-01', '2026-12-31'),
  (2, 'Estibado Subproducto Ordinario', 'salvado',             3, null, 11926,  880, '2026-07-01', '2026-12-31'),
  (2, 'Estibado Subproducto Festivo',   'salvado_festivo',     3, null, 21467,  200, '2026-07-01', '2026-12-31'),
  (2, 'Operario de Montacargas (producción)', null, 1,   null, null, null, '2026-07-01', '2026-12-31'),
  (2, 'Coordinador (producción)',             null, 0.5, null, null, null, '2026-07-01', '2026-12-31'),
  (2, 'Montacargas Eléctrico (producción)',   null, 1,   null, null, null, '2026-07-01', '2026-12-31');

-- ---------------------------------------------------------------------
-- ID3 · Cedi Funza — vigencia única 2026.
-- ---------------------------------------------------------------------
insert into public.acuerdo_volumenes (idempresa, actividad, actividad_codigo, auxiliares, muelle, tarifa, volumen_acordado, fechainicio, fechafin) values
  (3, 'Auxiliar de Cargue / Descargue', 'cargue',       8, '1,2,3,4', 14844, 1100, '2026-01-01', '2026-12-31'),
  (3, 'Descargue',                      'descargue',    8, '1,2,3,4', 19792, 1100, '2026-01-01', '2026-12-31'),
  (3, 'Distribución',                   'distribucion', 8, '1,2,3,4', 18555,  200, '2026-01-01', '2026-12-31'),
  (3, 'Operario de Montacargas',        null, 2, '1,2,3,4', null, null, '2026-01-01', '2026-12-31'),
  (3, 'Coordinador',                    null, 1, '1.2.3',   null, null, '2026-01-01', '2026-12-31'),
  (3, 'Bonificación coordinador y Líder', null, 1, null,    null, null, '2026-01-01', '2026-12-31'),
  (3, 'Bonificación por Montacargas',   null, 3, null,      null, null, '2026-01-01', '2026-12-31');

-- ---------------------------------------------------------------------
-- ID4 · Cedi Medellín (Molinos del Atlántico) — vigencia única 2026.
-- ---------------------------------------------------------------------
insert into public.acuerdo_volumenes (idempresa, actividad, actividad_codigo, auxiliares, muelle, tarifa, volumen_acordado, fechainicio, fechafin) values
  (4, 'Cargue Propios',         'cargue_propios',        4, '1,2', 18942, 230, '2026-01-01', '2026-12-31'),
  (4, 'Cargue Cliente Recoge',  'cargue_cliente_recoge', 4, '1,2', 19792, 230, '2026-01-01', '2026-12-31'),
  (4, 'Descargue distribución', 'descargue_distribucion', 2, '1,2', 18942, 230, '2026-01-01', '2026-12-31'),
  (4, 'Descargue Terceros',     'descargue_terceros',    4, '1,2', 19792, 993, '2026-01-01', '2026-12-31'),
  (4, 'Coordinador',            null, 1, null, null, null, '2026-01-01', '2026-12-31');

-- ---------------------------------------------------------------------
-- VERIFICACIÓN: factura acordada mensual por proyecto y vigencia.
-- Esperado: id1 $62.675.000 op + $37.699.300 prod · id2 ene-jun $83.696.580 +
-- $47.307.650 · id2 jul-dic $67.571.864 + $46.943.356 (aprox por redondeos
-- del cuadro) · id3 $41.810.600 · id4 $32.918.936.
-- ---------------------------------------------------------------------
select idempresa, fechainicio, fechafin,
       count(*) filter (where volumen_acordado is not null) as actividades,
       sum(volumen_acordado) as ton_mes,
       round(sum(coalesce(tarifa,0) * coalesce(volumen_acordado,0))) as factura_acordada_mes
  from public.acuerdo_volumenes
 group by idempresa, fechainicio, fechafin
 order by idempresa, fechainicio;
