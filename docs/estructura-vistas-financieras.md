# Estructura de vistas — Parte financiera (LIPgo)

Documento de referencia de las **vistas/tablas** que alimentan la parte financiera
(nómina, facturación y liquidación). Las columnas están tomadas de la BD real y de
cómo las consume la app. Las **definiciones SQL** de las vistas viven en Supabase
(no en el repo); para traerlas y pegarlas aquí, corre
[`scripts/048_dump_vistas_financieras.sql`](../scripts/048_dump_vistas_financieras.sql) y
comparte el resultado (ver sección final).

> Convención multi-empresa: casi todas filtran por una columna de empresa
> (`idempresa`), salvo nómina que usa `idempresaliquidacion`.

---

## Mapa rápido

| Objeto | Propósito | Filas≈ | Columna empresa | Columna fecha | Se usa en |
|---|---|---|---|---|---|
| `pagonomina` | Liquidación diaria de nómina por persona | 31.887 | `idempresaliquidacion` (y `idempresa`) | `fecha` (date) | Nómina, Estado de Resultados (costo nómina), Portal |
| `archivoplano` | Archivo plano de novedades por quincena | 1.672 | `idempresa` | `fechainicio`/`fechafin` | Nómina (archivo plano) |
| `facturacion` | Facturación por tonelada / orden de cargue | 15.411 | `idempresa` | `fechacargue` (timestamp) | Estado de Resultados (ingresos), Facturación Proyectos, SIG |
| `facturacionturnos` | Facturación por turnos (auxiliares/especialidad) | 7.679 | `idempresa` | `fecha` (date) | Estado de Resultados (ingresos), Facturación Turnos |
| `toneladasauxiliarespago` | Resumen diario de toneladas y pago por auxiliar | 5.843 | `idempresa` | `fechacargue` | Nómina (totales de auxiliares) |

---

## 1. `pagonomina` — liquidación diaria de nómina
Una fila por **persona + día**, ya liquidada (produccion, recargos, horas extra y total).

**Columnas (26):** `fecha`, `idempresa`, `idempresaliquidacion`, `persona`,
`actividad_registrada`, `novedad_reportada`, `especialidad`, `toneladas`,
`pago_produccion`, `base_dia`, `bonif_prestacional`, `bonif_no_prestacional`,
`horas_hed`, `horas_hedf`, `horas_hen`, `horas_hef`, `horas_hn`,
`hed`, `hedf`, `hen`, `hef`, `hn`, `total_recargos`, `pago_domingo`,
`recargodominical`, `total_liquidado_dia`.

- **Recargos/horas extra:** `horas_*` = horas; `hed/hedf/hen/hef/hn` = valores $
  (diurna, diurna festiva, nocturna, festiva, recargo nocturno). Alimentadas por el
  trigger [`calcular_y_asignar_horas_extras`](../scripts/049_fn_calcular_y_asignar_horas_extras.sql)
  sobre `registroasistencia` para el personal de especialidad.
- **Se usa en:** `components/nominapersonal.tsx` (liquidaciones, filtra por
  `idempresaliquidacion` + rango `fecha`); `components/estado-resultados/use-costo-nomina.ts`
  (`total_liquidado_dia` = costo de nómina); `lib/portal-actions.ts`, `portal-shell`.

## 2. `archivoplano` — novedades por quincena (archivo plano)
Una fila por **empleado + novedad + quincena** para exportar el archivo plano de nómina.

**Columnas (12):** `mes`, `quincena`, `idempresa`, `identificacionempleado`,
`contratoempleado`, `nombrenovedad`, `tiponovedad`, `cantidadvalor`,
`nominaproyectada`, `fechainicio`, `fechafin`, `diasnohabiles`.

- **Se usa en:** `components/nominapersonal.tsx` (pestaña archivo plano).

## 3. `facturacion` — facturación por tonelada / orden
Una fila por **orden de cargue / tiquete de báscula** con su valor a facturar.

**Columnas (17):** `numeroorden`, `tiquetebascula`, `placa`, `fechacargue`,
`pesobascula`, `cliente`, `producto`, `toneladas`, `owner`, `subcategoria`,
`idempresa`, `fechaorden`, `transporte`, `tipooperacion`, `tarifa`,
`valor_a_facturar`, `idorden`.

- **Fecha:** `fechacargue` es **timestamp** → filtrar con `gte`/`lt` día+1 exclusivo.
- **Se usa en:** `components/estado-resultados/use-ingresos.ts` (`valor_a_facturar`);
  `components/facturacion-proyectos.tsx`; `lib/sig-actions.ts`;
  `app/api/facturacion/filters/route.ts` (owner, placa, subcategoria, idempresa, transporte).

## 4. `facturacionturnos` — facturación por turnos (especialidad)
Una fila por **persona + turno/día**, con tarifa, costo, valor extra y utilidad.

**Columnas (23):** `id`, `fecha`, `nombre`, `identificacion`, `puesto`, `asistencia`,
`hed`, `hedf`, `hen`, `hef`, `hn`, `idempresa`, `especialidad`, `tarifaturno`,
`tarifahoraextra`, `costoturno`, `costohoraextra`, `estado_tarifa`, `valorextra`,
`facturacion_total`, `costoextra`, `costo_total`, `utilidad`.

- **Fecha:** `fecha` es **DATE** → filtrar con `gte`/`lte` inclusive.
- **Ingreso:** `facturacion_total`. Se relaciona con las tarifas de la tabla
  `tarifasfacturacionturnos` (ver módulo Financiera → Tarifas).
- **Se usa en:** `components/estado-resultados/use-ingresos.ts` (`facturacion_total`);
  `app/api/facturacion/turnos/route.ts`; `app/api/facturacion/filters/route.ts` (puesto).

## 5. `toneladasauxiliarespago` — resumen diario de auxiliares
Una fila por **auxiliar + día** con toneladas movidas, pago y operaciones.

**Columnas (6):** `fechacargue`, `idempresa`, `persona`, `total_toneladas_dia`,
`total_pago_dia`, `total_operaciones_realizadas`.

- **Se usa en:** `components/nominapersonal.tsx` (totales de auxiliares por
  `idempresa`, orden desc por `fechacargue`).
- Existe un script de tabla asociado: `scripts/036_create_toneladasauxilirespago_table.sql`.

---

## Trigger de horas extra
La función [`calcular_y_asignar_horas_extras`](../scripts/049_fn_calcular_y_asignar_horas_extras.sql)
(BEFORE INSERT/UPDATE en `registroasistencia`) calcula `hed`/`hedf` para el personal de
especialidad (regla de 30 min de tolerancia, jornada base 7.3333h + 1h descanso, truncado
a 2 decimales, domingo→`hedf`). Estas columnas fluyen hacia `pagonomina` y `facturacionturnos`.

## Definiciones SQL (DDL)
El **DDL real** (los `CREATE OR REPLACE VIEW`) está versionado en
[`scripts/050_vistas_financieras.sql`](../scripts/050_vistas_financieras.sql). Las 5 son
**vistas** (no tablas). Orden de dependencias:

```
cabeceraoc, detalleoc, productos ─┐
tarifaspersonal ──────────────────┼─► pagonomina ──► archivoplano
registroasistencia, tarifasturnos ┘        │
festivos, headcount ───────────────────────┘
tarifasoperacion ─► facturacion
tarifasfacturacionturnos, registroasistencia ─► facturacionturnos
cabeceraoc, tarifaspersonal ─► toneladasauxiliarespago
```

## Dependencias y lógica de negocio

### `pagonomina` (la vista núcleo)
Construye un **calendario persona×día** (rango min/max de `cabeceraoc.fechacargue` y
`registroasistencia.fecha`) y para cada celda liquida el día:
- **Producción (destajo):** explota `cabeceraoc.auxiliares` (CSV) y reparte el peso
  (`pesoorden` para empresas 3/4, si no `pesovascula`) entre los auxiliares × `tarifaspersonal`.
- **Turnos/especialidad:** los recargos y `base_turno` se **calculan POR PERSONA** desde el
  salario de contrato (`headcount.salario`) y los parámetros de `parametros_legales_anio`
  (`dias_calendario`, `jornada_horas`, `pct_*`). El auxilio de transporte **NO entra en la base**
  (norma CO). `HOD = salario/(dias×jornada)`; `hed/hen/hedf/hef = cant × HOD × (1+%/100)` (hora
  completa) y `hn = cant × HOD × %/100` (recargo puro). El JOIN a `tarifasturnos` se conserva solo
  como **registro de qué puestos son de turno** (vigencia/`especialidad`); sus columnas de dinero
  (`base/hed/…`) ya **no se leen**. Ver `scripts/051_extend_parametros_nomina.sql`.
- **Valor base día:** `salario/30` (o 58.364 por defecto) según asistencia/novedad;
  incapacidades (100/66/50%), vacaciones, descansos y festivos con sus reglas.
- **Domingo:** paga solo si la semana previa (ventana 6 días) no tuvo faltas, vacíos ni
  novedades bloqueantes y no hay compensatorio posterior; `recargodominical` =
  `pct_recargo_dominical/100 × día` (hoy 90%, era 0.8) para especialidad sin toneladas.
- **Bono destajo:** excedente (pago_produccion − valor_diario_ley) partido en
  `bonif_prestacional` (tope 9.948) y `bonif_no_prestacional` (resto).
- **Salida:** una fila por persona×día con `total_liquidado_dia`. Filtra `fecha <= CURRENT_DATE`.

### `archivoplano`
Se construye **sobre `pagonomina`** (+ `headcount` por nombre→identificación/contrato).
Agrupa por **quincena** (día ≤15 → 1, si no 2) y **nivela** bonos vs déficit del período.
Emite un `UNION ALL` de novedades para el archivo plano de nómina (SIIGO): bonificación de
ajuste de toneladas, novedades reportadas (días), HED niveladas, HEDF, HEN, HEF, recargo
nocturno y recargos dominicales/festivos (con códigos tipo `10-`, `11-`, `25-`, etc.).

### `facturacion`
`detalleoc` × `productos` × `cabeceraoc`; `owner` se mapea desde `productos.id_empresa`
(1→INDUPAN, 2→AVIMOL, 3/4→Molinos del Atlántico, 6→INDUPAN). LEFT JOIN a `tarifasoperacion`
por empresa+operación con reglas por producto/`empresafactura`/transporte (caso especial
empresa 6 y TOLVA). `valor_a_facturar = tarifa × toneladas` (texto; `'SIN TARIFA EN MAESTRO'`
si no hay match).

### `facturacionturnos`
`registroasistencia` × `tarifasfacturacionturnos` (por `puesto` y `fecha` dentro de
`[fechainicio, fechafin]`). A las horas extra se les **resta 0.66** antes de valorizar.
`facturacion_total = tarifaturno + tarifahoraextra×hed`; también `costo_total` y `utilidad`.
Dos ramas `UNION ALL`: puestos "de planta" (Estibado PT, Salvado, Montacargas, Cargue/
Descargue, Auxiliar Mixto, Tolva…) y el resto. `estado_tarifa` = `SIN TARIFA` si no hay match.

### `toneladasauxiliarespago`
Misma explosión de `cabeceraoc.auxiliares` × `tarifaspersonal` que `pagonomina`, pero
**agregada** por `fechacargue`+`idempresa`+auxiliar → `total_toneladas_dia`,
`total_pago_dia`, `total_operaciones_realizadas`.

> Para volver a extraer/actualizar estas definiciones desde Supabase:
> [`scripts/048_dump_vistas_financieras.sql`](../scripts/048_dump_vistas_financieras.sql).
