-- ============================================================================
-- Sincronizacion de columnas de permisos en `permisos_usuarios`.
--
-- Crea (si faltan) UNA columna boolean por cada modulo del menu, de modo que
-- TODOS los modulos queden mapeados con su campo de permiso. Es idempotente:
-- usa `ADD COLUMN IF NOT EXISTS`, asi que puede ejecutarse varias veces sin
-- romper columnas existentes ni datos. Por defecto cada permiso es `false`.
--
-- Generado a partir de lib/dashboard-data.ts + lib/permissions-map.ts.
-- ============================================================================

ALTER TABLE permisos_usuarios
  -- ---------------------- Gestion de Pedidos -------------------------------
  ADD COLUMN IF NOT EXISTS entrada_pedidos            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gestionar_pedidos          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gestion_integral_pedidos   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dashboardpedidos           boolean NOT NULL DEFAULT false,
  -- ---------------------- Despachos / Recepcion ----------------------------
  ADD COLUMN IF NOT EXISTS generar_ordenes_cargue     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS generar_ordenes_descargue  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS distribucion               boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gestion_ordenes            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ver_solicitudes_traslado   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dashboardrecepcion         boolean NOT NULL DEFAULT false,
  -- ---------------------- Vehiculos ----------------------------------------
  ADD COLUMN IF NOT EXISTS registrar_vehiculos        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ver_vehiculos              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registro_sanitario         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ver_historial_inspeccion   boolean NOT NULL DEFAULT false,
  -- ---------------------- Bascula ------------------------------------------
  ADD COLUMN IF NOT EXISTS bascula                    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS historial_bascula          boolean NOT NULL DEFAULT false,
  -- ---------------------- Almacenamiento -----------------------------------
  ADD COLUMN IF NOT EXISTS transacciones_inventario   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS saldos_inventario          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS saldos_producto            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS traslados_producto         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gestion_transacciones      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS capacidad_bodega           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS montacargasdia             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asignacion_lotes           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS historial_lotes            boolean NOT NULL DEFAULT false,
  -- ---------------------- Produccion ---------------------------------------
  ADD COLUMN IF NOT EXISTS ingreso_produccion         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tolva                      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ver_tolva                  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ver_ingresos_produccion    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aprobacion_produccion      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS controlpiso                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS historial_aprobaciones     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reprocesos                 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS solicitudturnos            boolean NOT NULL DEFAULT false,
  -- ---------------------- Auditoria ----------------------------------------
  ADD COLUMN IF NOT EXISTS auditoria_inventario       boolean NOT NULL DEFAULT false,
  -- ---------------------- Gestion Integral ---------------------------------
  ADD COLUMN IF NOT EXISTS dashboard_operacion        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asistenteia                boolean NOT NULL DEFAULT false,
  -- ---------------------- Gestion LIP --------------------------------------
  ADD COLUMN IF NOT EXISTS picking                    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS packing                    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ver_picking                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registro_qr_estibas        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lectura_qr_estibas         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inventario_estiba          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dashboardop                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prechequeo                 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aprobacionturnos           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bitacora                   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS solicitud_personal         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS programacionturnos         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registro_asistencia        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS facturacion_proyectos      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tarifas                    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gestionfacturas            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gastos                     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS estadoresultados           boolean NOT NULL DEFAULT false,
  -- ---------------------- Gestion Humana -----------------------------------
  ADD COLUMN IF NOT EXISTS gestionsolicitudes         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gh_entrevistas             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gestion_contratos          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dotacion_epp               boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gestion_colaboradores      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS headcount                  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gh_carpetas                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inducciones                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidenciasinducciones      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS capacitaciones             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asistencia_capacitaciones  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evaluacionpersonal         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS novedades_personal         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ausentismos                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gh_bienestar               boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gh_participacion           boolean NOT NULL DEFAULT false,
  -- ---------------------- Certificaciones LIP · SST ------------------------
  ADD COLUMN IF NOT EXISTS sst_auditoria              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sst_autoevaluacion         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sst_repositorio_soportes   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sst_incidentes             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sst_alertas_at             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sst_investigaciones        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sst_ipevr                  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sst_plan_mejora            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sst_indicadores            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sst_epp                    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sst_mantenimiento          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sst_comunicacion           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sst_gestion_cambio         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sst_actividades            boolean NOT NULL DEFAULT false,
  -- ---------------------- Certificaciones LIP · ISO 9001 -------------------
  ADD COLUMN IF NOT EXISTS evidenciasido              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iso_repositorio            boolean NOT NULL DEFAULT false,
  -- ---------------------- Compensacion -------------------------------------
  ADD COLUMN IF NOT EXISTS tabla_asistencia           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visor                      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gestionturnos              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asignacion_horas_extra     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nominapersonal             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proyecciones               boolean NOT NULL DEFAULT false,
  -- ---------------------- MRP ----------------------------------------------
  ADD COLUMN IF NOT EXISTS creacion_materiales        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ingresos_mp                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS explosion_materiales       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gestion_proveedores        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS saldos_empaque             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS saldos_materia_prima       boolean NOT NULL DEFAULT false,
  -- ---------------------- Configuracion ------------------------------------
  ADD COLUMN IF NOT EXISTS config_clientes            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS config_sucursales          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS config_productos           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS config_categorias          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS config_subcategorias       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS config_bodegas             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS config_localizaciones      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS config_tipos_despacho      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS config_transportadoras     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS config_tipos_vehiculos     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS config_condiciones_pago    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS config_destinos            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS config_grupos              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS config_medios              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS config_vendedores          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gestion_usuarios           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accesos_usuario            boolean NOT NULL DEFAULT false;

-- ============================================================================
-- Verificacion: lista las columnas creadas/existentes (opcional).
-- ============================================================================
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'permisos_usuarios' ORDER BY column_name;
