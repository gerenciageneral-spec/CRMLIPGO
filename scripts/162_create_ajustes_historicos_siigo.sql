-- ============================================================================
-- ajustes_historicos_siigo — reconciliación histórica LIPgo vs Siigo.
--
-- CONTEXTO (2026-09-08): tras corregir la fórmula del bono de destajo (órdenes
-- fantasma de "proyección" excluidas) el agregado de los 55 activos quedó en
-- -0,8% contra Siigo — pero persona por persona quedan diferencias reales de
-- 10-30% en varios casos (verificado con los Acumulados reales de Siigo,
-- ene-ago 2026). El usuario pidió cerrar esto al 100%: no cambiar la fórmula
-- otra vez (ya quedó correcta hacia adelante), sino DEJAR REGISTRADA la
-- diferencia real de cada quincena ya ocurrida, para que cualquier consumidor
-- que necesite el valor REAL (Liquidaciones, reportes) lo pueda sumar.
--
-- NO se reutiliza `ajustes_proyeccion`: esa tabla es específicamente para el
-- día de cierre de quincena (diferir producción no cerrada a tiempo), con su
-- propio flujo de aprobación en Revisión de Nómina. Meterle 100+ correcciones
-- de reconciliación histórica ahí confundiría ese historial con algo que no
-- tiene relación con el día de cierre.
--
-- USO: `valor_ajuste` = valor_siigo_real − valor_lipgo_calculado. Sumado al
-- cálculo de LIPgo para esa persona/quincena, el resultado es EXACTO al real
-- de Siigo. Positivo = Siigo pagó más que lo que LIPgo calcula; negativo = al
-- revés (ej. las 40 órdenes fantasma, antes del fix, habrían dado ajustes
-- negativos si se hubieran corregido así en vez de arreglando la fórmula).
--
-- Un registro por (identificacion, anio, mes, quincena, concepto) — permite
-- extender a otros conceptos (no solo "bono_destajo") sin cambiar el esquema.
-- ============================================================================

create table if not exists public.ajustes_historicos_siigo (
  id bigint generated always as identity primary key,
  identificacion text not null,
  nombre text not null,
  idempresa integer,
  anio integer not null,
  mes integer not null check (mes between 1 and 12),
  quincena integer not null check (quincena in (1, 2)),
  concepto text not null default 'bono_destajo',
  valor_lipgo_calculado numeric not null default 0,
  valor_siigo_real numeric not null default 0,
  valor_ajuste numeric not null default 0,
  fuente text,
  observacion text,
  creado_por text,
  creado timestamptz not null default now(),
  unique (identificacion, anio, mes, quincena, concepto)
);

comment on table public.ajustes_historicos_siigo is
  'Diferencia real (Siigo − LIPgo) por persona/quincena/concepto, para que los módulos que necesiten el valor histórico exacto lo sumen sin tocar la fórmula vigente.';

create index if not exists idx_ajustes_historicos_siigo_identificacion
  on public.ajustes_historicos_siigo (identificacion, anio, mes, quincena);
