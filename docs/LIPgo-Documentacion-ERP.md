# LIPgo — Documentación del sistema

Documento de respuesta a la solicitud de información sobre el ERP.

> **Cómo leer este documento.** Todo lo descrito corresponde a funcionalidad
> **verificada en el código fuente** de la aplicación. Los puntos marcados
> **(Pendiente)** no se pueden responder desde el sistema porque corresponden a
> decisiones comerciales, contractuales o de servicio que no están implementadas
> en la aplicación; los diligencia la empresa manualmente.

---

## 1. Descripción general del sistema

**LIPgo** es una aplicación de gestión operativa desarrollada a la medida para
**LIP S.A.S.**, empresa de servicios logísticos que opera dentro de las
instalaciones de sus clientes (operador logístico *in house*).

No es un ERP contable-financiero de propósito general. Es un **sistema de gestión
de operación logística, talento humano y facturación de servicios**, construido
alrededor del negocio real de LIP: mover toneladas de producto terminado y
materia prima en las plantas y centros de distribución de sus clientes, y
liquidar por ello tanto el **cobro al cliente** como el **pago a su personal**.

### Qué resuelve

| Eje | Alcance |
|---|---|
| **Operación** | Órdenes de cargue, descargue y distribución; picking y packing; báscula; control de vehículos y portería; inventario por lote y por estiba (QR) |
| **Producción** | Ingreso de producción, tolva, control de piso en tiempo real, paros de línea, reprocesos |
| **Talento humano** | Ciclo completo: selección, contratación, expediente, asistencia, turnos, ausentismo, bienestar, evaluación |
| **Compensación** | Nómina por destajo y por turno, horas extra, parafiscales, liquidaciones, archivo plano para el software contable |
| **Facturación** | Cobro por tonelada y por turno, prefacturas, cuadro de control de facturación, cargos fijos |
| **Certificaciones** | SIG (ISO 9001 · 14001 · 45001) y SG-SST bajo Decreto 0312 |

### Rasgo distintivo: multiempresa por proyecto

El sistema opera simultáneamente sobre varios **proyectos** (clientes), cada uno
identificado por un `idempresa`. Prácticamente toda la información está segregada
por ese identificador, y el usuario trabaja sobre el proyecto que seleccione en
la barra superior, limitado a los proyectos a los que tenga acceso.

Los proyectos incluyen plantas de producción (con báscula) y centros de
distribución (sin báscula), y **las reglas de negocio difieren entre ellos**: el
peso a facturar, la forma de pago del personal y las tarifas cambian según el
proyecto.

### Dimensión de la aplicación

Cifras del código fuente, como referencia de tamaño:

- **320** componentes de interfaz
- **97** módulos de lógica de servidor (*server actions*)
- **71** endpoints de API
- **197** scripts SQL versionados (esquema, vistas, migraciones)
- **142** permisos individuales de módulo
- Alrededor de **170** módulos funcionales en el menú, agrupados en 10 áreas

---

## 2. Arquitectura del ERP

**Arquitectura: 100 % en la nube.**

No requiere servidores, instalación ni mantenimiento en las sedes. Se accede por
navegador desde cualquier dispositivo con internet, incluidos móviles y tabletas
(la interfaz es responsiva y varios módulos operativos —asistencia, picking,
lectura de QR— están pensados para uso en piso desde celular).

### Componentes

| Capa | Tecnología | Función |
|---|---|---|
| **Aplicación** | Next.js 16 (App Router) + React 19 + TypeScript | Interfaz y lógica de servidor en un solo despliegue |
| **Base de datos** | PostgreSQL gestionado (Supabase) | Datos, vistas de cálculo, reglas en SQL |
| **Almacenamiento** | Supabase Storage | Documentos, fotos de asistencia, PDF, evidencias |
| **Autenticación** | Supabase Auth | Sesión y usuarios |
| **Alojamiento** | Vercel | Despliegue, CDN, funciones de servidor |
| **Estilos** | Tailwind CSS 4 | Interfaz |

### Decisiones de arquitectura relevantes

**Lógica de negocio crítica en la base de datos.** Los cálculos de nómina y
facturación no viven en la aplicación sino en **vistas SQL** (`pagonomina`,
`facturacion`, `facturacionturnos`, `archivoplano`, `toneladasauxiliarespago`).
Esto garantiza que todos los módulos que consultan un mismo concepto obtengan
exactamente el mismo número, y que el cálculo sea auditable de forma
independiente de la aplicación.

**Ejecución en servidor por defecto.** Las consultas pesadas y todo lo que toca
información sensible se ejecutan en el servidor con credenciales de servicio,
nunca desde el navegador.

**Renderizado dinámico.** Los módulos con información que cambia durante el día
se sirven sin caché, para evitar mostrar estado obsoleto.

---

## 3 y 4. Módulos disponibles, alcance y funcionalidades

Esta sección responde conjuntamente a los puntos 3 y 4 del requerimiento.

La solicitud plantea una lista estándar de módulos de ERP. A continuación se
indica, para cada uno, **qué existe en LIPgo y con qué alcance**, marcando
**(Pendiente)** cuando el módulo no existe.

---

### 3.1 Compras — (Pendiente)

No existe un módulo de compras (solicitudes de compra, órdenes de compra,
recepción contra orden, cuentas por pagar).

**Lo más cercano que sí existe:** dentro del módulo **MRP** hay *Gestión de
proveedores* e *Ingresos de materia prima*, y en **Gestión Financiera** existe
*Registrar Gasto* con carga de soporte. No constituyen un ciclo de compras.

---

### 3.2 Ventas — Parcial

LIPgo no vende producto: vende **servicio logístico**. No hay cotizaciones,
listas de precio comerciales ni facturación electrónica de venta.

**Lo que sí existe:**

- **Entrada de pedidos** — captura del pedido del cliente, con cliente, sucursal,
  productos, cantidades y condiciones de despacho.
- **Gestionar pedidos / Gestión integral de pedidos** — seguimiento del pedido
  hasta su conversión en orden de cargue; anulación protegida con clave.
- **Dashboard de Pedidos** — estado y avance.
- **Configuración comercial** — Clientes, Sucursales, Condiciones de Pago,
  Vendedores, Tipos de Despacho.

La **facturación del servicio** se cubre en Gestión Financiera (sección 3.6).

---

### 3.3 Inventarios — Completo

Uno de los módulos más desarrollados del sistema.

**Movimientos y transacciones**

- **Transacciones de Inventario**, con dos formas de trabajo:
  - *Movimiento por código* (estilo SAP): se digita el código de la transacción y
    el formulario habilita únicamente los campos de ese movimiento. Cada código
    tiene su nomenclatura visible y su regla.
  - *Clásico*: formulario guiado por bodega → localización → producto → lote.
- **Saldo en línea** al consultar un artículo en su ubicación: disponible,
  reservado y total, con desglose por lote ordenado del más antiguo al más
  reciente (FIFO), y aviso cuando la cantidad excede lo disponible.
- **Traslados de producto** entre bodegas y entre localizaciones.
- **Gestión de transacciones** — consulta y corrección de movimientos, con
  historial de correcciones.

**Saldos y control**

- **Saldos de inventario** — detalle por producto, lote y localización, con
  **edad del lote en días**.
- **Saldos por producto** — consolidado.
- **Capacidad de bodega** — ocupación por localización.
- **Auditoría de Inventario** y **Cuadre de Inventario** — conteo cíclico, acta
  de cruce mensual por lote, ajustes reales y trazabilidad de correcciones.
- **Panel LIP Inventario** — exactitud de inventario y movimientos.

**Identificación por QR**

- **Registro de QR de estibas**, **Lectura de QR** e **Inventario por estiba**.
  Permite ubicar y mover una estiba completa escaneando su código, con cámara o
  digitación manual.

**Lotes**

- **Asignación de Lotes** e **Historial de lotes**, con trazabilidad hacia la
  orden de cargue.

---

### 3.4 Producción — Completo

- **Ingreso de Producción** — registro de producción terminada, manual o
  automático desde el sistema de la planta (LOGO). Distingue producción propia de
  producción de terceros, que genera inventario pero no se liquida ni se factura.
- **Aprobación de ingreso de producción** — control previo a que la producción
  impacte inventario y liquidación.
- **Tolva / Ver Tolva** — operación de tolva y su registro.
- **Liquidación Tolva del día** — reparte automáticamente las toneladas aprobadas
  del día entre Turno 1 y Turno 2 según el horario configurado, y genera la orden
  de servicio correspondiente con un clic.
- **Dashboard de Producción (Control de Piso)** — en tiempo real: velocidad de
  producción cada 2 minutos, cobertura del turno, cumplimiento hora a hora,
  cronómetro de inactividad, disponibilidad y **OEE** (disponibilidad ×
  rendimiento × calidad).
- **Reporte de Paros** — detección automática de paros de línea y justificación
  por parte del supervisor.
- **Reprocesos** — gestión de producto reprocesado.
- **Servicios Adicionales** — solicitudes del cliente fuera del alcance normal.

---

### 3.5 Planeación de Producción (MRP) — Parcial

Existe un grupo **MRP** con:

- **Creación de materiales**
- **Explosión de materiales** — descomposición del producto en sus componentes
- **Ingresos de materia prima**
- **Saldos de materia prima** y **Saldos de empaque**
- **Gestión de proveedores**

**No incluye** planeación de capacidad, cálculo de necesidades netas contra
pronóstico de demanda, ni programación maestra de producción (MPS). Es soporte de
materiales, no planeación.

---

### 3.6 Contabilidad — (Pendiente)

No existe contabilidad (plan de cuentas, comprobantes, libros, cierres, estados
financieros formales). La contabilidad se lleva en **Siigo**.

**Lo que sí existe y alimenta la contabilidad:**

- **Archivo plano de novedades de nómina** — genera el archivo que se carga a
  Siigo con las novedades de la quincena por trabajador.
- **Estado de Resultados** — un P&L de gestión por proyecto, con ingresos
  (facturación por tonelada, turnos y cargos fijos) y costos (nómina con
  provisiones prestacionales, gastos), calculado desde la operación real. Es una
  herramienta de análisis gerencial, **no un estado financiero contable**.
- **Gestión de Facturas** — control de las facturas emitidas y su amarre con el
  número de factura de Siigo, con conciliación por rango.

---

### 3.7 Tesorería — (Pendiente)

No existe tesorería (bancos, conciliación bancaria, flujo de caja, pagos,
cartera).

**Lo más cercano:** **Registrar Gasto** y **Dashboard de Gastos** permiten
registrar egresos con soporte y clasificarlos; el módulo de **Anticipos** del
portal del trabajador gestiona solicitudes de adelanto de nómina con su flujo de
aprobación y documento firmado. No sustituyen un módulo de tesorería.

---

### 3.8 Activos fijos — Parcial

No existe un módulo contable de activos fijos (depreciación, vida útil, avalúos,
bajas contables).

**Lo que sí existe** es gestión operativa de equipos:

- **Equipos y Mantenimiento** — maestro de equipos con su hoja de vida.
- **Gestión de Montacargas** — cada equipo amarrado a su código QR; para
  registrar bitácora o mantenimiento hay que leer el QR o digitarlo, de modo que
  el registro siempre corresponda al equipo real.
- **Registro Preoperacional** — inspección previa al uso del equipo, con firma.
- **Montacargas y personal día** — disponibilidad diaria.
- **Alquiler de montacargas** — se controla como cargo fijo en facturación.

---

### 3.9 Nómina — Completo

Es el módulo más complejo del sistema, porque LIP paga bajo **modelos mixtos**.

**Modelos de pago que soporta**

| Modelo | Cómo se liquida |
|---|---|
| **Destajo (por tonelada)** | Se reparte el peso de cada orden entre los auxiliares que la atendieron, por la tarifa vigente del proyecto y la operación |
| **Turno / especialidad** | Base diaria calculada desde el salario de contrato, con recargos por hora |
| **Base garantizada + bono** | Cada día trabajado paga su base; lo producido por encima se netea por quincena como bonificación de productividad |

**Funcionalidades**

- **Nómina de Personal** — total por auxiliar, detalle por orden, liquidación
  diaria por persona y turno, y archivo plano.
- **Liquidaciones** — liquidación definitiva de contrato.
- **Parafiscales** — planilla de seguridad social (PILA) con su IBC.
- **Revisión de nómina** — cruce entre lo que calcula LIPgo y lo que resulta del
  archivo plano, para detectar diferencias antes de pagar.
- **Bonos** — bonos no prestacionales aprobados por concepto.
- **Proyecciones de nómina** y **Ajuste de proyecciones**.
- **Vacaciones** — causación y disfrute, con saldo por trabajador.
- **Asignación de apoyo en cargue** — permite sumar personal de turno fijo a una
  orden puntual para que participe del reparto de toneladas de ese día.

**Reglas de negocio implementadas en la liquidación**

- Parámetros legales por **intervalo de vigencia** (jornada, recargo dominical,
  porcentajes de hora extra): al cambiar la ley se actualiza el parámetro y la
  liquidación se ajusta sola desde la fecha correspondiente.
- **Mes calendario de 30 días**: el día 31 no paga base salarial.
- **Domingo trabajado**: paga base más recargo dominical; si además no descansó
  en la semana ni tiene compensatorio, el recargo se refuerza.
- **Festivo trabajado**: paga base más recargo completo.
- **Horas extra**: solo se liquidan las que estén **aprobadas**.
- **Corte por vínculo laboral**: no liquida días anteriores al ingreso ni
  posteriores al retiro.
- Todas las reglas están documentadas dentro del propio script SQL de la vista,
  con el motivo de negocio y el caso real que las originó.

---

### 3.10 Recursos Humanos — Completo

Cubre el ciclo completo del colaborador.

**Reclutamiento, selección y contratación**

- Solicitud de personal y su aprobación
- Hojas de vida
- **Antecedentes** — integración con el servicio *Compliance* para consulta
  automática, además de carga manual de certificados de Policía, Procuraduría y
  Contraloría
- Entrevistas
- Exámenes médicos, con control de aptitud como requisito de contratación
- Gestión de contratos

**Directorio y expediente**

- **Head Count** — maestro de personal por proyecto, con cargo, salario, estado,
  fechas de ingreso y retiro
- **Gestión de Colaboradores** — directorio ampliado
- **Carpetas de Trabajadores** — expediente digital con control de los documentos
  obligatorios
- **Panel LIP Gestión Humana** — indicadores del área

**Asistencia, turnos y tiempos**

- **Registro de Asistencia** — marcación por cédula con **fotografía obligatoria**
  tomada por cámara; sin foto no se registra la marcación
- **Tabla de Asistencia** — el supervisor asigna puesto o registra novedad;
  permite **cambiar el puesto del día exigiendo un motivo escrito**, que queda
  registrado
- **Programación de turnos** — programación anticipada por persona y puesto,
  incluida la doble jornada
- **Asignación de horas extra** y su aprobación
- **Visor de asistencia** e historial

**Relaciones laborales, ausentismo y bienestar**

- Novedades de personal, Ausentismos, Recobro de incapacidades
- Programa de bienestar con participación y evidencias

**Formación y desempeño**

- Inducciones con evidencia, Gestión de capacitaciones, Asistencia a
  capacitaciones, Evaluaciones de desempeño

**Portal del Trabajador** *(aplicación aparte, para el empleado)*

Acceso con documento de identidad. Permite consultar y solicitar:

- Certificados laborales
- **Anticipos** de nómina, con firma digital del documento de autorización
- **Permisos**, con flujo de doble aprobación (Gestión Humana y Coordinación)
- Novedades, desprendible de pago, balance de toneladas y horas extra
- Inducciones asignadas
- *Mi aporte* — cómo contribuye el trabajador a las metas del proyecto

Solo puede ingresar personal **activo** en Head Count; al inactivarse, la sesión
se cierra automáticamente.

---

### 3.11 Mantenimiento — Parcial

- **Equipos y Mantenimiento** — registro de mantenimientos por equipo.
- **Gestión de Montacargas** — bitácora y mantenimientos, con lectura obligatoria
  del QR del equipo.
- **Registro Preoperacional** — inspección diaria previa al uso.

**No incluye** mantenimiento preventivo programado con calendario automático,
órdenes de trabajo con repuestos y mano de obra, ni indicadores de confiabilidad
(MTBF / MTTR).

---

### 3.12 Calidad — Completo (enfoque de sistema de gestión)

El módulo de calidad está construido sobre las normas, no sobre control
estadístico de proceso.

**Sistema Integrado de Gestión (SIG)** — transversal a ISO 9001, 14001 y 45001:

- Análisis de contexto (DOFA)
- Matriz integrada de las tres normas
- Objetivos y metas (numeral 6.2)
- **No conformidades** (10.2) con acciones correctivas
- **Indicadores SIG / Cuadro de Mando Integral (BSC)**
- Evaluación de desempeño por área
- Mapa de interacción de procesos
- **Satisfacción y PQRSF** (9.1.2), incluida la calificación del conductor
- Repositorio documental por norma y repositorio universal

**ISO 9001** — Centro de evidencia y repositorio documental.

**ISO 14001** — Aspectos e impactos ambientales, matriz legal ambiental.

**Seguridad y Salud en el Trabajo (SG-SST)** — es un área completa por sí misma:

- **Autoevaluación Decreto 0312** con la matriz de 60 estándares, repositorio de
  soportes y plan de mejoramiento
- **IPEVR** (GTC 45) — identificación de peligros y valoración de riesgos
- Entrega y dotación de **EPP**
- **Investigación de accidentes de trabajo** (SST-FOR-21) con repositorio
- Alertas de AT, MEDEVAC, perfil sociodemográfico
- Comunicación, autorreporte, gestión del cambio, actividades y comités
- Indicadores SG-SST

---

### 3.13 CRM — (Pendiente)

No existe CRM (oportunidades, embudo comercial, seguimiento de contactos,
campañas).

**Lo más cercano:** el maestro de **Clientes** y **Sucursales** con sus datos y
condiciones, y el módulo de **Satisfacción y PQRSF**, que captura la percepción
del cliente y del conductor.

---

### 3.14 Servicio al Cliente — Parcial

- **Satisfacción y PQRSF** — captura de peticiones, quejas, reclamos y
  sugerencias, de clientes y de conductores, con su tratamiento dentro del SIG.
- **Calificación del Conductor** — evaluación inmediata al finalizar el servicio.
- **Bitácora** — registro de novedades de la operación.

**No incluye** mesa de ayuda con tiquetes, SLA por caso ni base de conocimiento.

---

### 3.15 Gestión Documental — Completo

- **Repositorio Universal de Documentos** — documentos con control de versión y
  cobertura por norma.
- **Repositorio por Norma SIG**, **Repositorio ISO 9001**, **Repositorio de
  Soportes** de la matriz de estándares, **Repositorio de Investigaciones**.
- **Carpetas de Trabajadores** — expediente digital por colaborador, con control
  de qué documentos obligatorios faltan.
- **Generación automática de PDF** — órdenes de cargue y descargue, packing,
  liquidación de tolva, certificados laborales, autorización de anticipo,
  investigación de AT, evaluaciones, entre otros.
- Todos los archivos se almacenan en el *storage* del sistema con enlace
  permanente desde el registro que los originó.

---

### 3.16 BI (Inteligencia de Negocios) — Completo

- **Dashboards operativos**: Despachos/Recepción, Pedidos, Producción (control de
  piso en tiempo real), Operación, Operaciones LIP, Gastos, Gerencia.
- **Paneles LIP** por área: Inventario, Operación (tablero del coordinador),
  Gestión Humana.
- **Cuadro de Mando Integral (BSC)** con indicadores del SIG.
- **Estado de Resultados** por proyecto.
- **Cuadro de Control de Facturación** con semáforo por estado.
- **Exportación a Excel** en prácticamente todos los módulos de consulta.
- **Asistente IA (LIPbot)** — asistente conversacional que responde preguntas
  sobre los datos del sistema en lenguaje natural, consulta indicadores y puede
  ejecutar acciones operativas puntuales previa confirmación explícita del
  usuario. Funciona sobre modelos de lenguaje de Anthropic (Claude).

---

### 3.17 Comercio electrónico — (Pendiente)

No existe. El sistema no tiene tienda en línea, catálogo público, carrito ni
pasarela de pago.

---

### 3.18 Logística y distribución — Completo

Es el núcleo del sistema.

**Órdenes de servicio**

- **Generar Órdenes de Cargue**, **de Descargue** y **de Distribución**
- **Gestión de Órdenes** — seguimiento, edición y anulación
- **Recepción de Traslado** — recepción de traslados entre bodegas conservando el
  lote de origen
- Generación automática de la orden de distribución para vehículos propios, con
  las reglas propias de cada proyecto

**Ejecución en piso**

- **Picking** — alistamiento con validación contra el pedido, con o sin QR,
  asignación de personal y captura de fotos
- **Packing** — verificación de lo alistado, asignación de personal, cierre con
  fotografías
- **Pausar / Reanudar** la operación de una orden, con registro del tiempo de paro
- **Ver Picking/Packing** — seguimiento

**Vehículos y portería**

- **Registrar Vehículos** y **Ver Vehículos** — citas y control de entrada
- **Registro sanitario** del vehículo e **Historial de inspección**

**Báscula**

- **Báscula** — registro del pesaje con tiquete
- **Historial de Báscula** con toneladas por producto y diferencia contra el
  detalle

**Control**

- **Control de Toneladas** — toneladas movidas por día, proyecto y persona
- **Torre de Control** — visión consolidada de la operación del día

---

### 3.19 Importaciones y exportaciones — (Pendiente)

No existe. El sistema no maneja declaraciones de importación, DEX, régimen
aduanero ni documentos de comercio exterior.

---

### 3.20 Gestión de proyectos — Parcial (interpretación distinta)

En LIPgo, **"proyecto" significa cliente o sede operativa**, no proyecto en el
sentido de gestión de proyectos (cronograma, tareas, recursos, ruta crítica).

Bajo esa lectura, la gestión por proyecto es completa: cada proyecto tiene sus
propias tarifas, reglas de facturación, personal, metas, indicadores y estado de
resultados; y existe un **coordinador responsable por proyecto** con su tablero y
su evaluación de desempeño.

Si el requerimiento se refiere a gestión de proyectos en el sentido clásico
(cronogramas, hitos, avance): **(Pendiente)** — no existe.

---

## 5. Flujo de información entre los módulos

El sistema está construido sobre **una sola base de datos compartida**: no hay
integraciones internas ni sincronizaciones entre módulos, porque todos leen y
escriben las mismas tablas. Un dato registrado una vez queda disponible de
inmediato para todos los módulos que lo necesiten.

### Cadena principal: del pedido al cobro y al pago

```
                    ┌──────────────────┐
                    │  Entrada de      │
                    │  Pedidos         │
                    └────────┬─────────┘
                             │  pedidoscabecera / pedidosdetalle
                             ▼
                    ┌──────────────────┐
                    │  Asignación de   │──── historicolotes
                    │  Lotes           │
                    └────────┬─────────┘
                             ▼
                    ┌──────────────────┐
                    │  Orden de Cargue │  cabeceraoc / detalleoc
                    │  (o Descargue /  │  ← DOCUMENTO CENTRAL
                    │   Distribución)  │     del sistema
                    └────────┬─────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Picking /   │    │   Báscula    │    │  Asignación  │
│  Packing     │    │  (pesaje)    │    │  de personal │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │ movimientos       │ pesovascula       │ auxiliares
       ▼                   ▼                   ▼
┌──────────────┐    ┌─────────────────────────────────┐
│  invtrans    │    │   Cierre de la orden            │
│ (inventario) │    │   (fincargue)                   │
└──────┬───────┘    └───────┬─────────────────┬───────┘
       │                    │                 │
       ▼                    ▼                 ▼
┌───────────────┐   ┌──────────────┐   ┌──────────────┐
│saldoinvdetalle│   │  facturacion │   │  pagonomina  │
│   (saldos)    │   │  (COBRO al   │   │  (PAGO al    │
└───────────────┘   │   cliente)   │   │   personal)  │
                    └──────┬───────┘   └──────┬───────┘
                           ▼                  ▼
                    ┌──────────────┐   ┌──────────────┐
                    │  Prefactura  │   │ archivoplano │
                    │  Cuadro de   │   │  → SIIGO     │
                    │  Control     │   └──────────────┘
                    └──────────────┘
```

**El punto clave:** la **orden de servicio cerrada** es el hecho que dispara
simultáneamente el **cobro al cliente** y el **pago al personal**. Ambos se
calculan del mismo dato —el peso movido y las personas que lo movieron— pero con
tarifas distintas: `tarifasoperacion` para cobrar y `tarifaspersonal` para pagar.
Eso garantiza que lo que se factura y lo que se paga correspondan siempre a la
misma operación real.

### Cadena de producción

```
LOGO (sistema de planta)                 Ingreso manual (LIPgo)
        │                                          │
        └──────────► produccion ◄──────────────────┘
                         │  trigger automático
                         ▼
                     invtrans   (entrada a inventario, pendiente)
                         │
                         ▼
              Aprobación de ingreso   (status = Aprobado)
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
      Liquidación Tolva      saldoinvdetalle
      (orden de servicio)      (disponible)
              │
              ▼
        pago y cobro
```

### Cadena de talento humano

```
Solicitud de Personal → Hoja de Vida → Antecedentes → Exámenes → Contrato
                                                                    │
                                                                    ▼
                                                              HEAD COUNT
                                                       (maestro de personal)
                                                                    │
        ┌───────────────────┬───────────────────┬───────────────────┤
        ▼                   ▼                   ▼                   ▼
   Asistencia          Programación         Ausentismos         Portal del
   (con foto)          de turnos            / Novedades         Trabajador
        │                   │                   │
        └───────────────────┴───────────────────┘
                            │  registroasistencia
                            ▼
                      pagonomina  →  archivoplano  →  SIIGO
```

**Regla de propiedad del dato:** cada dato tiene **un solo módulo dueño** que
puede modificarlo. Por ejemplo, el **cargo** del colaborador solo se define en
Head Count; ningún otro módulo puede sobrescribirlo, aunque lo sincronice.

---

## 6. Diagramas de procesos y flujos de trabajo

Los diagramas de flujo de datos están en la sección 5. A continuación, los
**flujos de trabajo** con sus estados y responsables.

### 6.1 Ciclo de una orden de cargue

```
[Pedido aprobado]
      │
      ▼
[Lote asignado] ────────── Coordinador de inventario
      │
      ▼
[Orden generada] ───────── Auxiliar de despacho
      │
      ▼
[Picking: alistamiento] ── Personal asignado · Fotos · Puede PAUSARSE
      │
      ▼
[Báscula: pesaje] ──────── Tiquete registrado
      │
      ▼
[Packing: verificación] ── Personal asignado · Fotos
      │
      ▼
[Orden cerrada — fincargue]
      │
      ├──► Facturación al cliente
      └──► Liquidación al personal
```

### 6.2 Ciclo de asistencia diaria

```
El trabajador marca con su cédula
   └─► FOTO OBLIGATORIA  (sin foto no hay marcación)
   └─► Se registra la hora real de llegada
        │
        ▼
El supervisor abre "Tabla de Asistencia"
   ├─ Presente  → asigna PUESTO (Operaciones o Especialidad)
   └─ Ausente   → registra NOVEDAD (incapacidad, permiso, vacaciones…)
        │
        ▼
¿Cambio durante la jornada?
   └─► Cambiar puesto EXIGE motivo escrito → queda registrado
        │
        ▼
El personal con puesto y llegada confirmada aparece disponible
en los selectores de Picking y Packing
```

### 6.3 Flujo de aprobación de permiso (portal del trabajador)

```
Trabajador solicita permiso
   │  (mínimo 3 días de anticipación, contando hoy)
   ▼
Estado: PENDIENTE
   │
   ├──────────────► Gestión Humana    ─┐
   │                                   ├─► ambos aprueban → APROBADA
   └──────────────► Coordinación      ─┘
                                        cualquiera rechaza → RECHAZADA
```

### 6.4 Flujo de anticipo de nómina

```
Trabajador solicita anticipo (máx. $300.000)
   │
   ├─ ¿Tiene novedades de asistencia en los últimos 30 días?
   │     └─ Sí → BLOQUEADO   (vacaciones y descansos NO bloquean)
   │
   ├─ ¿Ya tiene una solicitud en curso o aprobada este mes?
   │     └─ Sí → BLOQUEADO   (una RECHAZADA no consume el cupo)
   │
   ▼
PENDIENTE → RRHH aprueba → APROBADA
                              │
                              ▼
                   Se genera el documento de autorización
                              │
                              ▼
                   El trabajador FIRMA en el portal → COMPLETADA
                              │
                              ▼
                   Entra al archivo plano como deducción
```

### 6.5 Ciclo de facturación mensual

```
Órdenes cerradas del período
      │
      ▼
Vista `facturacion` — valoriza cada línea por tarifa, owner y operación
      │
      ▼
PREFACTURA — se selecciona qué facturar (por owner × servicio)
      │  + conceptos de producción sin orden
      │  + cargos fijos del proyecto
      ▼
Revisión en el CUADRO DE CONTROL DE FACTURACIÓN
      │  semáforo: por facturar · en proceso · facturado
      ▼
Emisión en Siigo → se amarra el número de factura a las órdenes
```

**(Pendiente)** — Diagramas en formato BPMN o Visio, si se requieren para el
proceso de certificación.

---

## 7. Roles y perfiles de usuario

### Modelo de permisos

LIPgo **no usa roles predefinidos**. Usa **permisos individuales por módulo**:
existen **142 permisos** independientes, uno por cada módulo o submódulo, que se
activan o desactivan por usuario en *Configuración → Accesos de Usuario*.

Esto permite construir el perfil exacto de cada persona, sin encasillarla en un
rol rígido. Para agilizar la creación de un usuario nuevo, el sistema permite
**copiar los permisos de un usuario existente** y ajustar lo puntual.

### Doble control de acceso

Cada usuario tiene, de forma independiente:

1. **Qué módulos ve** — los 142 permisos.
2. **Qué proyectos ve** — los proyectos a los que tiene acceso. El selector de la
   barra superior solo ofrece los autorizados, y toda la información queda
   filtrada por el proyecto activo.

### Perfiles típicos en operación

Aunque el modelo es granular, en la práctica se configuran perfiles como:

| Perfil | Alcance habitual |
|---|---|
| **Gerencia** | Todos los módulos, todos los proyectos, dashboards gerenciales |
| **Coordinador de proyecto** | Operación completa de su proyecto, su tablero e indicadores |
| **Auxiliar de despacho** | Órdenes, picking, packing, báscula |
| **Coordinador de inventario** | Inventario, lotes, cuadre, auditoría |
| **Gestión Humana** | Ciclo de personal, asistencia, ausentismo, bienestar |
| **Nómina** | Compensación, parafiscales, archivo plano |
| **SST / Calidad** | SIG, SG-SST, certificaciones |
| **Trabajador** | Solo el Portal del Trabajador (aplicación aparte) |

### Protecciones adicionales

Algunos módulos sensibles exigen una **clave específica** además del permiso:
movimientos manuales de inventario, Gestión Financiera, anulación de pedidos y
asignación de personal a órdenes.

**(Pendiente)** — Matriz formal de segregación de funciones (SoD), si se requiere
para auditoría.

---

## 8. Parametrizaciones y configuraciones permitidas

Todo lo siguiente se configura desde la aplicación, sin intervención técnica:

**Maestros comerciales**
- Clientes y sucursales
- Condiciones de pago
- Vendedores

**Maestros de producto**
- Productos, con peso unitario, categoría y subcategoría
- Categorías y subcategorías

**Maestros logísticos**
- Bodegas y localizaciones (con letra y número para el orden de recorrido)
- Tipos de despacho, transportadoras, tipos de vehículo
- Placas de distribución (vehículos propios por proyecto)

**Tarifas** *(el corazón de la parametrización)*
- **Tarifas de operación** — lo que se le cobra al cliente, por operación, owner
  y subcategoría de producto, con vigencia por fechas
- **Tarifas de personal** — lo que se le paga al trabajador por tonelada, por
  operación y proyecto, con vigencia
- **Tarifas de turnos** — puestos de turno, si son de especialidad y su vigencia
- **Tarifas de facturación de turnos**
- **Cargos fijos por proyecto** — conceptos mensuales fijos

**Parámetros legales por vigencia**
- Salario mínimo, auxilio de transporte
- Jornada laboral, días calendario del mes
- Porcentajes de recargo dominical, hora extra diurna, nocturna, festiva y
  recargo nocturno

Al cambiar la ley se crea una nueva vigencia con su fecha de inicio, y **toda la
liquidación se ajusta automáticamente** desde esa fecha, sin alterar lo
histórico.

**Operación**
- Horario de tolva por día, proyecto y turno
- Metas de toneladas por proyecto
- Festivos
- Puestos de trabajo

**Usuarios**
- Usuarios, permisos por módulo, acceso por proyecto

---

## 9. Automatizaciones y reglas de negocio

### Automatizaciones

| Automatización | Qué hace |
|---|---|
| **Sincronización LOGO → inventario** | La producción que registra el sistema de planta entra automáticamente a inventario mediante un *trigger* de base de datos, sin intervención de LIPgo |
| **Cálculo de horas extra** | Un *trigger* calcula las horas extra al registrar la asistencia, según la jornada y la tolerancia configuradas |
| **Orden de distribución automática** | Al cerrar un cargue con vehículo propio se genera automáticamente la orden de distribución asociada |
| **Liquidación de tolva** | Reparte las toneladas aprobadas del día entre los turnos y genera la orden de servicio con un clic |
| **Generación de cargos fijos** | Crea mensualmente los conceptos fijos de cada proyecto, sin duplicar si se ejecuta dos veces |
| **Alertas** | Rendimiento, asistencia, evaluaciones pendientes, accidentes, conteo cíclico, operaciones del día |
| **Notificaciones por WhatsApp** | Envío al personal mediante la API de Meta (con modo de prueba que registra sin enviar) |
| **Generación de PDF** | Órdenes, actas, certificados, autorizaciones y evidencias |

### Reglas de negocio destacadas

**Facturación**
- El peso a facturar es el de **báscula** en plantas y el del **detalle** en
  centros de distribución, con normalización y validación del dato del tiquete.
- Cada transportadora paga su propio cargue: en ciertos proyectos el movimiento
  de vehículos de terceros se le cobra al tercero, no al cliente.
- Los movimientos con vehículo propio del cliente están cubiertos por el cargo
  fijo mensual y se facturan en cero.

**Nómina** — ver sección 3.9.

**Inventario**
- No se puede despachar más de lo disponible.
- La producción de terceros genera inventario pero nunca llega a facturación.
- El lote codifica su fecha, lo que permite control de antigüedad y rotación.

**Operación**
- Sin fotografía no hay marcación de asistencia.
- Solo el personal con llegada confirmada aparece disponible para asignar a una
  orden.
- Cambiar el puesto del día exige un motivo escrito.
- Solo personal activo puede ingresar al portal del trabajador.

---

## 10. Integraciones disponibles

### Integraciones activas

| Sistema | Tipo | Alcance |
|---|---|---|
| **LOGO** (sistema de planta) | Base de datos compartida (*trigger*) | La producción registrada en planta entra automáticamente al inventario de LIPgo, sin depender de la aplicación |
| **Siigo** (contable/nómina) | Archivo plano | LIPgo genera el archivo de novedades de la quincena que se carga en Siigo. En sentido inverso, el número de factura de Siigo se amarra a las órdenes para el control de facturación |
| **Compliance** (app.compliance.com.co) | API REST | Consulta automática de antecedentes (Policía, Procuraduría, Contraloría) |
| **WhatsApp** (Meta Cloud API) | API REST | Notificaciones al personal |
| **Anthropic (Claude)** | API | Asistente conversacional LIPbot |
| **Supabase** | API / SDK | Base de datos, autenticación y almacenamiento |

### Capacidad de integración

La base de datos es **PostgreSQL estándar** y expone automáticamente una **API
REST** sobre sus tablas y vistas, con autenticación por token y control de acceso
por fila. Esto permite que un tercero consulte o escriba información sin
desarrollo adicional del lado de LIPgo.

Adicionalmente, la aplicación expone **71 endpoints** propios para operaciones
específicas.

### Oracle — (Pendiente)

No existe integración con Oracle. Es técnicamente viable a través de la API REST
de la base de datos o de un proceso de intercambio de archivos, pero requiere
definir alcance.

---

## 11. Reportes estándar y reportes personalizados

### Reportes estándar

Todos los módulos de consulta incluyen **filtros** (fecha, proyecto, producto,
persona, estado, según aplique) y **exportación a Excel** del resultado filtrado.

Reportes con formato definido:

- Órdenes de cargue, descargue y distribución (PDF)
- Packing y picking, con fotografías (PDF)
- Liquidación de tolva del día
- **Archivo plano de novedades** para Siigo
- Prefactura y su anexo de soporte, con desglose por owner y por orden
- Certificados laborales y autorización de anticipo (PDF)
- Investigación de accidentes de trabajo (SST-FOR-21)
- Perfil sociodemográfico
- Actas de cruce de inventario
- Evaluaciones de desempeño

### Reportes personalizados

- **Desde la aplicación:** cualquier consulta filtrada puede exportarse a Excel,
  lo que cubre la mayoría de las necesidades puntuales.
- **Con el Asistente IA:** el usuario puede preguntar en lenguaje natural y
  obtener el dato consultando directamente la información del sistema.
- **Con SQL:** al ser PostgreSQL estándar, se puede construir cualquier consulta
  o conectar una herramienta de BI externa (Power BI, Metabase, Looker Studio).

**(Pendiente)** — Generador visual de reportes para el usuario final, sin
conocimientos técnicos. No existe.

---

## 12. Indicadores (KPI) y tableros de control

### Tableros existentes

| Tablero | Indicadores principales |
|---|---|
| **Control de Piso (Producción)** | OEE, disponibilidad, rendimiento, calidad, velocidad cada 2 min, cumplimiento hora a hora, cobertura del turno, tiempo de inactividad, paros |
| **Dashboard de Operación** | Órdenes del día por estado, cargues, descargues, vehículos atendidos, personal asignado |
| **Panel LIP Operación** *(coordinador)* | Cumplimiento de metas, SLA por sitio, toneladas movidas |
| **Panel LIP Inventario** | Exactitud de inventario, movimientos, diferencias |
| **Panel LIP Gestión Humana** | Indicadores del área de personal |
| **Dashboard de Pedidos** | Estado y avance de pedidos |
| **Dashboard Despachos/Recepción** | Operación del día |
| **Dashboard de Gastos** | Gasto por concepto y proyecto |
| **Dashboard Gerencia** | Consolidado, top operarios |
| **Estado de Resultados** | Ingresos, costo de nómina con provisiones, gastos, margen por proyecto |
| **Cuadro de Mando Integral (BSC)** | Indicadores del SIG por perspectiva |
| **Indicadores SG-SST** | Frecuencia, severidad, ausentismo |
| **Cuadro de Control de Facturación** | Por facturar / en proceso / facturado, con alertas de diferencias |

### Indicadores calculados automáticamente

Toneladas movidas por día, proyecto, persona y operación · Cumplimiento de meta
diaria · OEE y sus tres componentes · Exactitud de inventario · Rotación y edad
de lotes · Ausentismo y su clasificación · Accidentalidad · Costo de nómina por
proyecto · Margen por proyecto · Cumplimiento de facturación · Satisfacción del
cliente y del conductor · Evaluación de desempeño por área y por coordinador

---

## 13. Manejo de documentos electrónicos

- **Generación de PDF** en la propia aplicación para todos los documentos
  operativos (órdenes, actas, certificados, autorizaciones, evidencias).
- **Almacenamiento en la nube** con enlace permanente desde el registro que lo
  originó.
- **Firma digital** en el portal del trabajador: el empleado firma en pantalla y
  la firma se incorpora al documento.
- **Captura fotográfica** como evidencia: asistencia (ingreso y salida), picking,
  packing, inspecciones, entrega de EPP.
- **Códigos QR** para identificación de estibas y equipos.
- **Carga de documentos** con validación de tipo, en expedientes de personal,
  soportes de gasto, evidencias del SIG y repositorios documentales.

### Facturación electrónica — (Pendiente)

LIPgo **no emite facturación electrónica** ni se integra con la DIAN. La emisión
se hace en Siigo; LIPgo prepara la información y controla el amarre con el número
de factura emitido.

---

## 14. Trazabilidad y auditoría de la información

### Bitácora de auditoría automática

El sistema tiene una **tabla central de auditoría** alimentada por *triggers* de
base de datos. Cada cambio queda registrado con:

| Campo | Contenido |
|---|---|
| `ts` | Fecha y hora exacta |
| `actor_id` / `actor_nombre` | Quién lo hizo (o "sistema" si fue automático) |
| `idempresa` | Proyecto afectado |
| `modulo` / `tabla` | Dónde ocurrió |
| `operacion` | INSERT · UPDATE · DELETE |
| `registro_id` | Registro afectado |
| `descripcion` | Resumen legible del cambio |
| `antes` / `despues` | Estado completo del registro antes y después |
| `campos_cambiados` | Exactamente qué campos cambiaron |

Se consulta desde **Configuración → Bitácora de Auditoría**, con filtros por
fecha, usuario, módulo, tabla y operación.

**Opera a nivel de base de datos**, no de aplicación: registra el cambio aunque
se haga por fuera de la interfaz.

### Trazabilidad operativa

- **Del producto:** lote → orden de cargue → cliente → fecha de despacho.
- **De la estiba:** QR → producto, lote, ubicación y todos sus movimientos.
- **Del inventario:** cada movimiento con su origen, responsable, fecha y motivo;
  las correcciones quedan en un historial aparte.
- **De la orden:** desde el pedido hasta la factura, con quién ejecutó cada paso.
- **De la nómina:** cada peso liquidado se puede rastrear hasta la orden y la
  tarifa que lo originaron.
- **Del personal:** asistencia con foto y hora real; cambios de puesto con motivo
  escrito.

---

## 15. Seguridad, permisos y copias de respaldo

### Seguridad

- **Autenticación** gestionada por Supabase Auth.
- **Seguridad a nivel de fila (RLS)** en la base de datos.
- **Segregación por proyecto**: el usuario solo ve la información de los
  proyectos autorizados.
- **142 permisos** individuales por módulo.
- **Claves adicionales** en módulos sensibles.
- **Credenciales de servicio nunca expuestas al navegador**: la información
  sensible se consulta desde el servidor.
- **Cifrado en tránsito** (HTTPS) y en reposo, provisto por la plataforma.
- **Variables de entorno** para todas las credenciales, fuera del código fuente.

### Copias de respaldo

Las copias de respaldo las provee la plataforma de base de datos gestionada
(Supabase), que incluye respaldos automáticos y recuperación a un punto en el
tiempo según el plan contratado.

**(Pendiente)** — Política formal de respaldo: frecuencia contratada, retención,
RTO/RPO y procedimiento de restauración probado.

---

## 16. Requisitos técnicos para la implementación

### Para el usuario final

- **Navegador web** actualizado (Chrome, Edge, Firefox o Safari).
- **Conexión a internet** estable.
- Para módulos de piso: dispositivo con **cámara** (celular o tableta) —
  asistencia, lectura de QR, captura de evidencias.
- **No requiere instalación** de software, ni licencias por equipo, ni servidores
  en sede.

### Para la infraestructura

- Cuenta en la plataforma de base de datos gestionada.
- Cuenta en la plataforma de despliegue.
- Credenciales de los servicios integrados que se vayan a usar (Compliance,
  WhatsApp, asistente IA).

### Para la integración con el sistema de planta

- Acceso a la base de datos del sistema de planta, o que este escriba en la tabla
  correspondiente, para que el *trigger* de sincronización opere.

---

## 17. Metodología de implementación

**(Pendiente)**

---

## 18. Tiempos estimados de implementación por módulo

**(Pendiente)**

---

## 19. Capacitación para usuarios y administradores — Parcial

**Lo que existe dentro del sistema:**

- **Módulo de Aprendizaje** — documentación en línea de cada módulo, que describe
  qué hace y qué puede hacer cada usuario según sus permisos.
- **Asistente IA (LIPbot)** — responde preguntas sobre el uso del sistema y sobre
  los datos, y orienta al usuario hacia el módulo correspondiente.
- **Módulo de Inducciones** — permite cargar material de formación, asignarlo al
  personal y dejar evidencia de su realización, incluida la formación sobre el
  propio sistema.

**(Pendiente)** — Plan formal de capacitación: contenidos, intensidad horaria,
modalidad, evaluación y certificación.

---

## 20. Soporte técnico, SLA y canales de atención

**(Pendiente)**

---

## 21. Frecuencia de actualizaciones y mejoras del sistema — Parcial

El sistema está en **desarrollo continuo**: las mejoras se despliegan de forma
incremental, sin ventanas de mantenimiento ni interrupción del servicio, y sin
que el usuario deba actualizar nada.

Todo el código está bajo **control de versiones (Git)**, con historial completo
de qué cambió, cuándo, por qué y quién lo hizo. Las reglas de negocio quedan
documentadas dentro del propio código, con el caso real que las originó.

**(Pendiente)** — Frecuencia comprometida de liberación y política de versiones.

---

## 22. Casos de éxito o empresas que utilizan el ERP — Parcial

LIPgo es un desarrollo **a la medida de LIP S.A.S.** y opera actualmente sobre
sus proyectos activos, que incluyen plantas de producción y centros de
distribución.

**(Pendiente)** — Relación de casos de éxito con nombre del cliente, alcance y
resultados medibles, si se requiere para presentación comercial.

---

## 23. Manuales de usuario y administrador — Parcial

Existe el **módulo de Aprendizaje** dentro del sistema, que documenta cada módulo
y lo que cada usuario puede hacer según sus permisos, y documentación técnica
versionada junto al código (estructura de vistas financieras, mapeo de accesos,
guías de despliegue).

**(Pendiente)** — Manual de usuario y manual de administrador en documento formal
descargable.

---

## 24. Limitaciones conocidas del sistema

Se declaran de forma explícita, por transparencia:

### Alcance funcional

1. **No es un ERP contable.** No tiene contabilidad, tesorería, cartera, cuentas
   por pagar ni activos fijos contables. La contabilidad se lleva en Siigo.
2. **No tiene módulo de compras** ni ciclo de abastecimiento.
3. **No tiene CRM** ni gestión comercial.
4. **No tiene comercio electrónico.**
5. **No maneja comercio exterior.**
6. **No emite facturación electrónica** ni se integra con la DIAN.
7. **El MRP es parcial:** soporta materiales, no planeación de capacidad ni
   programación maestra de producción.
8. **El mantenimiento es correctivo y de registro**, sin programación preventiva
   automática ni indicadores de confiabilidad.
9. **No hay gestión de proyectos** en el sentido de cronogramas y hitos.

### Técnicas

10. **Depende de conexión a internet.** No opera sin conectividad.
11. **La liquidación de nómina es computacionalmente pesada.** El cálculo
    reconstruye un calendario persona×día sobre todo el histórico, lo que exige
    consultar por rangos acotados. Está identificado como deuda técnica y su
    solución de fondo —materializar el histórico cerrado— está pendiente de
    definir una ventana de mantenimiento.
12. **Sin generador visual de reportes** para el usuario final.
13. **Dependencia de la calidad del dato de origen.** Un dato mal digitado en un
    maestro puede afectar cálculos aguas abajo; el sistema incorpora
    validaciones, pero no todas las posibles.

### Organizacionales

14. **Desarrollo a la medida:** las reglas implementadas responden a la operación
    de LIP y no son necesariamente trasladables a otra empresa sin ajuste.

---

## 25. Licenciamiento y costos asociados

**(Pendiente)**

---

## Anexo — Glosario de términos del sistema

| Término | Significado |
|---|---|
| **Proyecto / Empresa (`idempresa`)** | Cliente o sede donde LIP presta el servicio. Segrega toda la información |
| **Orden de cargue** | Documento central de la operación: qué se mueve, para quién, con qué vehículo y quién lo ejecuta |
| **Owner** | A quién se le factura una línea; puede diferir del dueño del producto |
| **Destajo** | Pago por tonelada movida, repartido entre los auxiliares de la orden |
| **Especialidad** | Puesto de turno fijo; se paga por jornada y recargos, no por tonelada |
| **Tolva** | Operación de descargue a granel; se liquida por turno |
| **Estiba** | Unidad física de almacenamiento, identificable por QR |
| **Archivo plano** | Archivo de novedades de nómina de la quincena que se carga en Siigo |
| **Prefactura** | Documento previo a la factura: qué se le va a cobrar a cada owner |
| **SIG** | Sistema Integrado de Gestión (ISO 9001 · 14001 · 45001) |
| **IPEVR** | Identificación de Peligros, Evaluación y Valoración de Riesgos (GTC 45) |
| **LOGO** | Sistema de la planta del cliente que reporta la producción |
| **LIPbot** | Asistente conversacional de LIPgo |

---

*Documento elaborado a partir del análisis del código fuente de LIPgo.*
*Los puntos marcados **(Pendiente)** deben ser diligenciados por la empresa.*
