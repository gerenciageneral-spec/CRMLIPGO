# Despliegue — Nuevo modelo de nómina (base garantizada + bono neto de quincena)

Cambia cómo se liquida el destajo: **cada día trabajado paga su BASE**; el excedente de
producción se **netea por quincena** y se paga como **bonificación prestacional** (todo
cotiza); las **horas extra van completas** (ya no se nivelan). El IBC de LIPgo queda
**igual al archivo plano = Siigo** (LIPgo es la fuente de verdad).

Todo son **vistas** (no tocan datos) + un ajuste de código. **Reversible en cualquier momento.**

## Orden de despliegue (Supabase SQL Editor)

**PASO 0 — Ventana de reversa (OBLIGATORIO primero).**
Corre [`scripts/086_CAPTURA_rollback_nomina.sql`](086_CAPTURA_rollback_nomina.sql). Copia las
**dos celdas** de resultado y guárdalas en un archivo, p.ej. `rollback_nomina_2026-07-28.sql`.
Ese archivo es tu botón de **deshacer** (restaura las vistas tal como están hoy).

**PASO 1 — pagonomina.** Corre [`scripts/053_pagonomina_reemplazo.sql`](053_pagonomina_reemplazo.sql).
- Día de destajo → liquida la **base** (no el valor de sus toneladas).
- `bonif_prestacional` = excedente del día **con signo, sin tope** (todo prestacional).

**PASO 2 — archivoplano.** Corre [`scripts/059_archivoplano_reemplazo.sql`](059_archivoplano_reemplazo.sql).
- Bono = `MAX(0, Σ excedente neto de la quincena)`.
- **Horas extra completas** (se eliminó la nivelación que las recortaba).

**PASO 3 — Código (ya desplegado con este commit).** Todos los consumidores del modelo
quedaron alineados para sumar el **bono neto de quincena** (piso 0, todo prestacional):
- `getParafiscales` (IBC) → IBC LIPgo = archivo plano = Siigo.
- `liquidaciones-actions` (retirados): nómina pendiente + **cesantías, intereses, prima y
  vacaciones** sobre base + bono (neteando por bucket mes+quincena en períodos multi-mes).
- `use-costo-nomina` (Estado de Resultados): costo de nómina y provisiones = base + bono.
- `nominapersonal`: tarjetas de **Bono productividad** y **Pago real (base + bono)** (el
  total diario sigue cuadrando con la tabla/Excel).
- Nuevo módulo **Gestión Humana › Revisión de nómina** (cuadro por colaborador) + permiso
  `revision_nomina` (correr `scripts/087_add_revision_nomina_permission.sql`).

**PASO 4 — Permiso del módulo.** Corre [`scripts/087_add_revision_nomina_permission.sql`](087_add_revision_nomina_permission.sql)
y otorga `revision_nomina` a quien deba ver el módulo.

> Importante: el PASO 3 (código) y los PASOS 1-2 (SQL) deben quedar vigentes **juntos**.
> Si corres el SQL, asegúrate de que el deploy de la app (Vercel/main) con este commit ya
> esté arriba; así el IBC lee el modelo nuevo de forma consistente.

## Verificación (después de correr)
- En una persona con días bajos de destajo (p.ej. LUIS ÁNGEL ZAMBRANO, emp2, Q2 jul):
  cada día de destajo = base; el turno (Huevos) conserva sus horas extra completas.
- Parafiscales: el IBC del mes debe cuadrar con el total del archivo plano por trabajador.

## Reversa
Si algo no cuadra: corre el archivo `rollback_nomina_2026-07-28.sql` guardado en el PASO 0
(primero pagonomina, luego archivoplano) y, si hace falta, revierte el commit de código.
Las vistas vuelven al estado previo sin pérdida de información.
