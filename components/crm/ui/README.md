# Lenguaje visual del CRM

Estas piezas existen para que el CRM y LIPgo se lean como un solo sistema. No
son adorno: se extrajeron midiendo los módulos reales de LIPgo, y cada una
resuelve algo que, dejado a criterio de cada pantalla, sale distinto veinticinco
veces.

## La regla que más se nota

**En una tabla, todo va en `text-xs`.** Cabeceras y celdas, siempre explícito.
El tamaño por defecto de shadcn es `text-sm`, y esa diferencia de dos píxeles es
la que separa un ERP denso de una web corriente. Por eso existe `Td`: para que
no dependa de que alguien se acuerde.

No hay filas cebra en ninguna parte. El hover y el borde inferior los pone la
primitiva; añadir rayas rompe el parecido de inmediato.

## Qué usar y cuándo

| Necesidad | Pieza | Archivo |
|---|---|---|
| Marco de una tabla | `MarcoTabla` | `modulo.tsx` |
| Celda de tabla | `Td` (`num` para cifras, `fuerte` para totales) | `modulo.tsx` |
| Cabecera de tabla | `CabeceraTabla` + `Th` | `modulo.tsx` |
| Cargando / vacío | `FilaCargando` / `FilaVacia` | `modulo.tsx` |
| Ver el detalle de algo | `DetalleDialog` | `detalle-dialog.tsx` |
| Dato suelto etiqueta/valor | `Dato`, `ResumenDatos` | `modulo.tsx` |
| Indicadores de un módulo | `KpiCompacto` + `TiraKpi` | `kpi-compacto.tsx` |
| Indicadores del tablero | `KpiCard` | `kpi-card.tsx` |
| Métrica dentro de un diálogo | `MiniKpi`, `BarraMeta` | `mini-kpi.tsx` |
| Varias vistas del mismo asunto | `SubNav` | `sub-nav.tsx` |
| Estado con color | `BadgeEstado` | `modulo.tsx` |
| Tabla que ordena y aguanta miles de filas | `TablaDatos` | `tabla-datos.tsx` |
| Cualquier gráfica | `GraficaArea`, `GraficaBarras`, `GraficaLineas`, `GraficaDonut`, `GraficaCumplimiento`, `GraficaCombinada` | `graficas.tsx` |
| Entrada y transiciones | `Aparece`, `ListaEscalonada`, `CambioDeVista`, `ValorVivo` | `movimiento.tsx` |

## Dos familias de KPI, y no se mezclan

`KpiCard` es la tarjeta del tablero: grande, con glow y valor animado. Va en
Inicio y en nada más.

`KpiCompacto` es la tira de un módulo: plana, sin sombra, `p-3`. Acompaña a una
tabla sin robarle protagonismo. Si se usara la premium en cada módulo, toda
pantalla parecería un tablero y la tabla —que es el dato que el usuario vino a
ver— quedaría relegada.

## Detalle: siempre diálogo

Se revisaron los módulos de LIPgo: 94 archivos usan `Dialog`, **cero** usan
`Sheet` y **cero** usan `Drawer`. La decisión ya está tomada allá; aquí se
respeta en vez de inventar una tercera forma.

Tamaños: `normal` (ficha de datos), `tabla` (con líneas dentro), `ancho`.
Con `pie`, solo el cuerpo desplaza y los botones quedan fijos — sin eso, en un
pedido de cuarenta líneas hay que desplazar hasta el final para poder cerrar.

## Cargando y vacío van DENTRO del cuerpo de la tabla

Como fila con `colSpan`, no sustituyendo el bloque entero. Así la cabecera no
desaparece mientras llegan los datos y el contenido no salta dos veces en cada
consulta. Es el detalle que más delata a una tabla que no sigue el patrón.

## Cifras y fechas

Números con `tabular-nums` y `toLocaleString("es-CO")`: sin cifras de ancho fijo
las unidades no quedan una debajo de otra y las columnas de dinero se leen mal.
Fechas siempre por `lib/crm-fechas.ts`, nunca `toISOString()` a pelo — eso
reintroduce el corrimiento de zona que ya se corrigió una vez.


## Lo que se añadió por encima de LIPgo

LIPgo y el CRM tienen exactamente las mismas dependencias; no faltaba nada para
igualarlo. Lo que sigue existe para **superarlo**, y cada cosa resuelve un
problema concreto que allá sigue abierto:

**`TablaDatos` (TanStack Table v9 + Virtual).** Ordenar pulsando la cabecera y
buscar sobre todas las columnas. En LIPgo, para ordenar una tabla hay que
exportar a Excel: se le pide al usuario que salga del sistema para hacer algo
que el sistema debería hacer. Además virtualiza por encima de cien filas, así
que una cartera de miles de facturas ya no congela el navegador.

Al definir columnas, ordenar por el **valor real** y no por el texto: usar
`accessorFn` que devuelva el número. Ordenar `"1.000.000"` como cadena lo pone
antes que `"900.000"`.

**dnd-kit en el embudo.** El arrastre era HTML5 nativo, que no responde a
tactil: el vendedor abre el embudo desde el teléfono en la calle, y allí era
sencillamente imposible mover una tarjeta. dnd-kit cubre ratón, dedo y teclado.
El asa de arrastre es solo la manija, no la tarjeta entera, para que el selector
de etapa siga siendo pulsable.

**`graficas.tsx`.** Recharts ya estaba, pero cada panel recableaba a mano ejes,
rejilla, degradado y tooltip: unas cuarenta líneas por gráfica, que es donde se
cuelan las diferencias de estilo. Ahora son seis tipos listos, con el formato de
pesos y los colores de marca ya puestos.

**`movimiento.tsx` (framer-motion).** LIPgo anima solo su dashboard de gerencia
y con clases CSS, que no saben escalonar una lista ni animar algo que
desaparece. Todo lo de aquí respeta `prefers-reduced-motion`: quien lo tenga
activado ve el contenido colocado, sin desplazamiento. No es un extra —a parte
de la gente este movimiento le produce mareo.
