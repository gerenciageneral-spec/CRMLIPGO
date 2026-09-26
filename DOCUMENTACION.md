# LIPGO CRM — Qué hace hoy el sistema

**Estado a 26 de septiembre de 2026** · versión `251844f` · 208 archivos · ~36.900 líneas

Este documento describe **lo que está construido y funcionando**, no lo que se
planeó. Donde algo está a medias o pendiente de un dato que solo ustedes pueden
cargar, se dice explícitamente.

---

## 1. Qué es

Un CRM comercial para vender el producto de las plantas de INDUPAN (harina,
mogolla, salvado, huevos). Cubre el recorrido completo:

```
Prospecto → Embudo → Cotización → Pedido → Doble autorización
                                                 ↓
                                        LIPgo lo despacha
                                                 ↓
                                     Cartera → Cobro → Comisión
```

Nace de LIPgo, el ERP operativo que ya usa la empresa. Se le quitó todo lo
operativo (báscula, picking, nómina, producción) y se le construyó encima la
parte comercial, que LIPgo no tenía.

### La relación con LIPgo

Las dos aplicaciones **comparten la misma base de datos**. Esto es deliberado:

- El CRM **lee** los maestros de LIPgo: clientes, productos, bodegas.
- Cuando un pedido queda autorizado, el CRM lo **escribe** en las tablas de
  pedidos de LIPgo, y LIPgo lo despacha con su proceso de siempre.
- Son **dos aplicaciones distintas, en dos direcciones web distintas**. Tocar
  una no afecta el código de la otra.

Un pedido del CRM aparece en LIPgo como un pedido normal. Nadie en operaciones
tiene que aprender nada nuevo.

---

## 2. Los 26 módulos

### Inicio
| Módulo | Qué hace |
|---|---|
| **Dashboard Comercial** | Ventas del mes, pronóstico del embudo, tasa de cierre y cartera vencida. Gráfica de ventas por día. Se refresca solo cada minuto. |
| **Mi Agenda** | Los compromisos del vendedor: qué visita hoy, qué tiene atrasado. |

### Prospectos
| Módulo | Qué hace |
|---|---|
| **Registrar Prospecto** | Alta con **captura de GPS**, datos de contacto y productos de interés con cantidad. |
| **Embudo de Ventas** | Tablero kanban de 7 etapas. Se arrastra la tarjeta para cambiar de etapa; funciona con ratón, dedo y teclado. |
| **Actividades** | Bitácora de lo ya ocurrido: llamadas, visitas, correos. También con GPS. |
| **Calendario de Visitas** | Vista de mes con los compromisos programados. |

### Ventas
| Módulo | Qué hace |
|---|---|
| **Cotizaciones** | Emisión con vigencia parametrizable, PDF descargable, y versiones. |
| **Nueva Venta** | Venta directa, sin pasar por cotización. |
| **Pedidos CRM** | Listado y envío a LIPgo cuando están las dos firmas. |
| **Autorizar Pedidos** | La bandeja de firmas. Ver sección 4. |

### Clientes
| Módulo | Qué hace |
|---|---|
| **Gestión de Clientes** | Datos comerciales, cupo de crédito, plazo, lista de precios asignada, bloqueo por cartera. |
| **Sucursales** | Puntos de entrega con su GPS. |
| **Listas de Precios** | Precio fijo por producto **o** porcentaje de descuento. Nunca ambos. |

### Cartera
| Módulo | Qué hace |
|---|---|
| **Cuentas por Cobrar** | Facturas abiertas, ordenables por columna. Las vencidas se tiñen de rojo. |
| **Registrar Pago** | Abonos totales o parciales. |
| **Antigüedad de Cartera** | Aging por tramos, y a quién cobrar primero. |
| **Comisiones** | Liquidación por vendedor y período. |

### Inteligencia
| Módulo | Qué hace |
|---|---|
| **Rutas Óptimas** | Orden de visita más corto a partir del GPS de los clientes, con mapa. |
| **Oportunidades de Negocio** | Señales calculadas: quién bajó volumen, quién dejó de comprar, qué venderle a quién. |
| **Asistente IA** | Consulta en lenguaje natural sobre los datos del CRM. |
| **Reportes** | Informes comerciales. |

### Configuración
| Módulo | Qué hace |
|---|---|
| **Productos** | Solo lo comercial: fotos, descripción, precio base. No toca peso ni estiba, que son de LIPgo. |
| **Vendedores** | Zona, meta mensual, tasa de comisión, desempeño del mes. |
| **Parametrización** | Las 24 reglas del negocio. Ver sección 3. |
| **Gestión de Usuarios** | Alta de usuarios, contraseñas y permisos por módulo. |
| **Bitácora de Auditoría** | Registro de quién hizo qué. |

---

## 3. Nada está escrito en el código

Se pidió que **cada regla tuviera su tabla**, y así está. Hay **24 parámetros**
que se cambian desde Configuración → Parametrización, sin tocar código ni
esperar a un programador:

| Grupo | Parámetros |
|---|---|
| **Fiscal** | IVA por defecto |
| **Cotizaciones** | Días de vigencia · días de aviso antes de vencer |
| **Prospectos** | Días sin gestión para alertar · días para darlo por frío · radio de validación del GPS |
| **Comisiones** | Porcentaje por defecto · base de cálculo · **cuándo se causa** |
| **Cartera** | Los 3 tramos de aging · días de aviso · si bloquea por mora · días de mora para bloquear |
| **Crédito** | Si valida cupo · plazo por defecto |
| **Descuentos** | Tope que puede dar un vendedor sin autorización |
| **Pedidos** | Si exige doble firma · monto desde el que entra gerencia · las 2 claves |
| **Rutas** | Máximo de paradas por día · velocidad promedio |

**Los parámetros tienen vigencia.** Cambiar la comisión hoy no reescribe la
liquidación del mes pasado: cada cambio abre un período nuevo y el anterior
queda cerrado con su valor. Lo mismo con el IVA — cada documento guarda la tasa
con la que se emitió.

---

## 4. La doble autorización

Es el control central del sistema. Un pedido **no llega a LIPgo** hasta tener
dos firmas: **contabilidad** y **gerencia**.

Cada firma pide una clave compartida del área. Pero la clave sola no basta:

1. El usuario debe **tener el permiso** de ese rol.
2. Debe escribir la **clave del área**, que se configura en Parametrización.
3. **Quien firma queda identificado por su sesión**, con nombre y hora exacta.

Y tres reglas que el sistema no deja saltarse:

- **La misma persona no puede dar las dos firmas.**
- **Nadie autoriza un pedido que él mismo creó.**
- Todo queda en una bitácora que **no se puede editar ni borrar**, incluso si la
  autorización falla.

### Cuando el pedido pasa a LIPgo

Con las dos firmas, el pedido viaja a las tablas de pedidos de LIPgo. Hay dos
protecciones:

- **Se valida antes de escribir** que todos los productos existan con el nombre
  exacto que LIPgo espera. Si uno falla, no se escribe nada — ni siquiera a
  medias. Un pedido parcial en producción se rompería después, lejos del CRM y
  difícil de rastrear.
- **Doble clic no duplica.** Aunque se pulse dos veces, la base de datos impide
  que el mismo pedido entre dos veces.

---

## 5. Cartera y comisiones

**La cartera nace sola.** Al autorizarse un pedido a crédito se crea la cuenta
por cobrar, con vencimiento calculado desde el plazo del cliente.

**El saldo no se mantiene a mano.** Es una columna calculada por la base de
datos: valor original menos abonos. Un `UPDATE` olvidado no puede dejar cartera
fantasma, porque no hay nada que actualizar.

**El aging lee los tramos de los parámetros.** Cambiar "rango 1 hasta 30 días"
por 15 reclasifica todo el aging sin tocar código.

**Las comisiones congelan su porcentaje.** Una comisión ya liquidada guarda el
porcentaje con el que se calculó. Cambiar la regla hoy no reescribe el pasado.

---

## 6. Multiempresa desde el primer día

Hoy opera solo la **empresa 1 (Harinera Indupan)**, pero todas las tablas
nuevas llevan la columna de empresa, los índices la incluyen, y cada consulta
filtra por ella.

Los consecutivos se numeran **por empresa**: dos empresas pueden tener su
cotización 0001 sin chocar. Los parámetros también son por empresa: cada una
puede tener su propio IVA y sus propios tramos de cartera.

Incorporar una segunda empresa será dar de alta sus datos, no migrar el sistema.

---

## 7. Lo que hay debajo

**19 tablas nuevas**, todas con prefijo `crm_`, que no tocan las de LIPgo:

```
Prospectos   crm_prospectos · crm_prospecto_interes · crm_etapas
             crm_actividades · crm_agenda
Ventas       crm_cotizaciones · crm_cotizacion_detalle
             crm_pedidos · crm_pedido_detalle · crm_autorizaciones_log
Precios      crm_listas_precios · crm_lista_precio_detalle
Cartera      crm_cuentas_cobrar · crm_pagos
             crm_comisiones · crm_reglas_comision
Sistema      crm_parametros · crm_consecutivos · crm_vendedores_detalle
```

Más **1 vista** (el aging, que lee los tramos de los parámetros) y **10
funciones** en la base de datos, entre ellas la que proyecta el pedido a LIPgo
en una sola transacción y la que resuelve el precio de un producto para un
cliente.

A las tablas compartidas con LIPgo **solo se les agregaron columnas**; no se
borró ni se renombró nada. Por eso LIPgo sigue funcionando igual.

**23 permisos** independientes, uno por módulo más los dos de autorización. El
permiso se valida en el navegador *y otra vez en el servidor* — ocultar un botón
no es seguridad.

---

## 8. Cómo se ve

El CRM y LIPgo comparten paleta y componentes. Las reglas que los hacen ver
igual:

- Todo el texto de las tablas va en tamaño pequeño, que es lo que da el aspecto
  denso de ERP.
- Ver el detalle de algo **siempre** abre una ventana emergente. Nunca un panel
  lateral.
- Al cargar, la tabla no desaparece: el encabezado se queda y el aviso ocupa el
  cuerpo. Así el contenido no salta dos veces por consulta.
- Hay **dos tipos de tarjeta de indicador** y no se mezclan: una para tableros,
  otra para módulos.
- Todo movimiento respeta la preferencia del sistema de "reducir animaciones".

### Lo que se hizo mejor que LIPgo

| | LIPgo | El CRM |
|---|---|---|
| Ordenar una tabla | Hay que exportar a Excel | Se pulsa la cabecera |
| Tablas grandes | Se traban con miles de filas | Solo dibuja lo visible |
| Arrastrar en móvil | No funciona | Funciona con dedo y teclado |
| Gráficas | 6 tipos, cableadas a mano en cada pantalla | 6 tipos listos para usar |

---

## 9. Antes de empezar a usarlo

Hay **dos cosas pendientes que solo ustedes pueden hacer**, y sin ellas el
sistema no se puede usar en serio:

### 1. Cambiar las dos claves de autorización 🔴

Están sembradas con el valor `CAMBIAR`. Mientras sigan así, **cualquiera que
conozca ese valor puede firmar un pedido**.

> Configuración → Parametrización → grupo "pedidos"

### 2. Cargar los precios base 🔴

La última vez que se revisó, **ningún producto tenía precio base**. Sin precio
base no se puede emitir una cotización, porque no hay sobre qué aplicar el
descuento de la lista.

> Configuración → Productos — verificar y cargar los que falten

### Recomendado

Rotar las credenciales técnicas que se compartieron por chat durante el
desarrollo (la clave de servicio de la base de datos y la del asistente de IA).

---

## 10. Lo que no está hecho

Para que quede claro el alcance actual:

- **Las gráficas y tablas nuevas están aplicadas en una parte de los módulos**,
  no en todos. Los ~20 restantes funcionan, pero con la tabla sencilla.
- **El asistente de IA está conectado**, pero aún responde sobre un conjunto
  acotado de consultas comerciales.
- **No hay app móvil.** El sistema se ve bien en teléfono, pero desde el
  navegador.
- **No hay integración con WhatsApp ni correo** para enviar cotizaciones. Se
  descarga el PDF y se envía a mano.
- **El módulo de Reportes es básico.** No hay constructor de informes a medida.

---

## 11. Qué revisar antes de dar por bueno el sistema

Un recorrido de una hora que prueba lo importante:

1. Entrar y comprobar que el menú muestra solo lo permitido.
2. Cambiar la vigencia de cotización de 15 a 10 días en Parametrización.
3. Crear un prospecto **desde el teléfono** y confirmar que captura el GPS.
4. Arrastrarlo de etapa en el embudo. Refrescar: debe seguir donde se dejó.
5. Crear una lista de precios con 8% de descuento y asignarla a un cliente.
6. Cotizar a ese cliente: **el precio debe salir con el 8%** y el vencimiento
   **a 10 días, no a 15** — eso prueba que el parámetro se está leyendo.
7. Aceptar la cotización y verificar que el pedido copia los precios exactos.
8. Firmar con contabilidad. **Intentar la segunda firma con el mismo usuario:
   debe rechazarla.**
9. Firmar con gerencia y **abrir LIPgo**: el pedido debe verse allá como uno
   normal.
10. Pulsar "Enviar" dos veces seguidas: el segundo intento debe fallar limpio.
11. Registrar un abono parcial y ver que el saldo baja solo.
12. Cambiar un tramo del aging y comprobar que la clasificación cambia sola.

Si los puntos 6, 8, 9, 10 y 12 pasan, lo esencial del sistema está bien.

---

## 12. Dónde está todo

- **Código**: `github.com/gerenciageneral-spec/CRMLIPGO`
- **Base de datos**: la misma de LIPgo (Supabase)
- **Scripts de base de datos**: carpeta `scripts/`, numerados 181 a 189. Ya
  están ejecutados.
- **Guía visual para desarrolladores**: `components/crm/ui/README.md`

> ⚠️ **El repositorio es público.** Contiene los 806 commits heredados de
> LIPgo, con datos de nómina, facturación y nombres de clientes reales.
> Conviene pasarlo a privado.
