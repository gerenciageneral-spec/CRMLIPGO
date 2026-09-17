-- =====================================================================
-- METAS DE CLASE MUNDIAL (benchmark de operadores logísticos 3PL) para el
-- BSC y la Evaluación por Área. Sube las metas de sig_indicadores (LIP=100)
-- a estándares de talla mundial. VALIDAR contra los SLA de contrato antes de
-- fijarlas como definitivas — son objetivos de referencia, editables.
--
-- NOTA: solo cambia el OBJETIVO (meta). Los valores se siguen calculando en
-- vivo por proyecto. No toca metas regulatorias (0312 Art. 28), tasas SG-SST
-- (3.3.x), ni metas ya óptimas (tonelaje 100, cobertura 100, ausentismo ≤3,
-- AT 0, días 0, legal 100, SIG 100).
-- =====================================================================

-- OPERACIONES (gestión — coordinadores por proyecto)
UPDATE sig_indicadores SET meta = 99   WHERE idempresa=100 AND codigo='IND-G-03';   -- Cumplimiento de cargues 98→99
UPDATE sig_indicadores SET meta = 98   WHERE idempresa=100 AND codigo='IND-CD-07';  -- SLA de tiempos 95→98
UPDATE sig_indicadores SET meta = 98   WHERE idempresa=100 AND codigo='IND-CD-06';  -- Facturación 95→98
UPDATE sig_indicadores SET meta = 98   WHERE idempresa=100 AND codigo='IND-CD-04';  -- Evidencia fotográfica 95→98
UPDATE sig_indicadores SET meta = 90   WHERE idempresa=100 AND codigo='IND-G-02';   -- Satisfacción conductor 85→90
UPDATE sig_indicadores SET meta = 98   WHERE idempresa=100 AND codigo='IND-G-05';   -- Ciclo de orden cerrado (nueva meta)

-- ALMACENAMIENTO E INVENTARIOS
UPDATE sig_indicadores SET meta = 99.5 WHERE idempresa=100 AND codigo='IND-AI-01';  -- Exactitud de movimientos 98→99.5
UPDATE sig_indicadores SET meta = 99.5 WHERE idempresa=100 AND codigo='IND-AI-03';  -- Exactitud inventario físico (ERI) 98→99.5

-- GESTIÓN HUMANA
UPDATE sig_indicadores SET meta = 95   WHERE idempresa=100 AND codigo='IND-GH-04';  -- Recobro de incapacidades 90→95
UPDATE sig_indicadores SET meta = 95   WHERE idempresa=100 AND codigo='IND-GH-03';  -- Formación aprobada 90→95

-- DIRECCIÓN ESTRATÉGICA / CLIENTE
UPDATE sig_indicadores SET meta = 98   WHERE idempresa=100 AND codigo='IND-G-06';   -- Nivel de servicio global (SLA) 95→98

-- SST
UPDATE sig_indicadores SET meta = 95   WHERE idempresa=100 AND codigo='IND-SST-04'; -- IPEVR 90→95
UPDATE sig_indicadores SET meta = 12   WHERE idempresa=100 AND codigo='IND-SST-ROTAC'; -- Rotación de personal (nueva meta ≤12%/año, menor_mejor)

-- COMPRAS Y EVALUACIÓN
UPDATE sig_indicadores SET meta = 95   WHERE idempresa=100 AND codigo='IND-CO-01';  -- Evaluación de proveedores 90→95
UPDATE sig_indicadores SET meta = 95   WHERE idempresa=100 AND codigo='IND-EM-01';  -- NC cerradas a tiempo 90→95

-- =====================================================================
-- OPCIONALES (decisión gerencial — descomentar si se aprueban):
-- 0312: 86 es el umbral "aceptable" de la Res. 0312 (Art. 28). Subir a 90 es
--       una meta INTERNA por encima del mínimo legal. OJO: sincronizar también
--       kpis-area.ts (meta del KPI) para que no quede desfasada (código).
-- UPDATE sig_indicadores SET meta = 90 WHERE idempresa=100 AND codigo='IND-SST-0312';
-- Satisfacción del cliente 90→92 (world-class ≥90; +NPS como indicador nuevo).
-- UPDATE sig_indicadores SET meta = 92 WHERE idempresa=100 AND codigo='IND-G-01';
-- =====================================================================

-- Verificación
SELECT area, codigo, nombre, meta, sentido
FROM sig_indicadores
WHERE idempresa=100 AND activo=true AND meta IS NOT NULL
ORDER BY area, codigo;
