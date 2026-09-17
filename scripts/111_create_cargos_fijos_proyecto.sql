-- =====================================================================
-- CARGOS FIJOS DEL PROYECTO — conceptos que se facturan por un monto o
-- una cantidad fija cada mes, sin relación con órdenes de cargue ni con
-- turnos ejecutados. Dos casos confirmados por el usuario (2026-08-02):
--
--   · ID1 e ID3: $2.000.000/mes cada uno por "Manejo de Inventario y
--     Aplicación LIPgo" — monto fijo directo (cantidad/tarifa en NULL).
--   · ID2 (Avimol): 600 toneladas fijas/mes en DOS tramos de 300 ton,
--     cada tramo a su propia tarifa (300×$15.099 + 300×$37.800). Es la
--     contrapartida de facturación del puesto "Distribución Turno": ese
--     puesto se paga siempre como nómina normal, pero NO se factura por
--     turno (solo los turnos ADICIONALES vía Solicitudes Adicionales se
--     facturan así — ver lib/conciliacion-avimol-actions.ts). Estas 600
--     toneladas son su vía de facturación real.
--
-- VIGENTE TODO EL AÑO (confirmado): fechainicio = 2026-01-01. El próximo
-- año se agrega una fila nueva con la tarifa/valor reajustado, sin tocar
-- la de este año.
-- =====================================================================

create table if not exists public.cargos_fijos_proyecto (
  id bigint generated always as identity primary key,
  idempresa integer not null,
  concepto text not null,
  -- Cantidad fija (300 en los tramos de ID2) y tarifa vigente (puede
  -- cambiar de vigencia como cualquier tarifa). NULL en el fijo directo.
  cantidad numeric,
  tarifa numeric,
  -- Monto fijo directo (2.000.000 en ID1/ID3). NULL cuando el valor sale
  -- de cantidad × tarifa (tramos de ID2).
  valor numeric,
  tipo text not null check (tipo in ('ingreso', 'gasto')),
  fechainicio date not null,
  fechafin date not null,
  creado_en timestamptz not null default now(),
  constraint cargos_fijos_proyecto_vigencia_chk check (fechafin >= fechainicio),
  constraint cargos_fijos_proyecto_valor_chk check (
    (valor is not null and cantidad is null and tarifa is null)
    or (valor is null and cantidad is not null and tarifa is not null)
  )
);

create index if not exists cargos_fijos_proyecto_idempresa_idx
  on public.cargos_fijos_proyecto (idempresa, fechainicio);

comment on table public.cargos_fijos_proyecto is
  'Conceptos de facturación fija mensual por proyecto (no ligados a órdenes ni turnos): $2M Manejo de Inventario (id1/id3), 600 ton fijas Avimol (id2).';

-- =====================================================================
-- Semilla — valores confirmados por el usuario.
-- =====================================================================
insert into public.cargos_fijos_proyecto (idempresa, concepto, cantidad, tarifa, valor, tipo, fechainicio, fechafin)
values
  (1, 'Manejo de Inventario y Aplicación LIPgo', null, null, 2000000, 'ingreso', '2026-01-01', '2026-12-31'),
  (3, 'Manejo de Inventario y Aplicación LIPgo', null, null, 2000000, 'ingreso', '2026-01-01', '2026-12-31'),
  (2, 'Distribución fija — tramo 1', 300, 15099, null, 'ingreso', '2026-01-01', '2026-12-31'),
  (2, 'Distribución fija — tramo 2', 300, 37800, null, 'ingreso', '2026-01-01', '2026-12-31');

-- Verificación: debe dar 4 filas, con el tramo de ID2 sumando $15.869.700/mes.
select idempresa, concepto, cantidad, tarifa, valor,
       coalesce(valor, cantidad * tarifa) as valor_mensual
  from public.cargos_fijos_proyecto
 order by idempresa, concepto;
