-- ============================================================================
-- 189_crm_claves_autorizacion.sql
-- ----------------------------------------------------------------------------
-- Las dos claves compartidas que pide la autorizacion de pedidos: una para
-- contabilidad y otra para gerencia.
--
-- POR QUE VIVEN EN LA TABLA DE PARAMETROS Y NO EN EL CODIGO: LIPgo tenia las
-- suyas escritas literalmente en un archivo fuente
-- (["LIP123456","Avimol2026"] en annulOrder). Cambiarlas exigia un despliegue,
-- y cualquiera con acceso al repositorio las veia. Aqui se cambian desde la
-- pantalla de Parametrizacion, y quedan con su historial de vigencias.
--
-- LO QUE UNA CLAVE COMPARTIDA NO PUEDE HACER: decir QUIEN autorizo. Por eso el
-- CRM ademas exige permiso individual y guarda el usuario de la sesion en
-- auth_contabilidad_por / auth_gerencia_por. La clave dice "alguien de
-- gerencia"; la sesion dice quien fue.
--
-- TOCA DINERO: de estas dos claves depende que un pedido viaje a produccion.
--
-- Aditivo e idempotente.
-- ============================================================================

insert into public.crm_parametros
  (idempresa, clave, valor, tipo, grupo, etiqueta, unidad, descripcion, editable)
values
  (1, 'pedido.clave_contabilidad', 'CAMBIAR', 'string', 'pedidos',
   'Clave de autorización — Contabilidad', null,
   'La pide el sistema al dar la primera firma del pedido. Compartida por el área; quien firma queda igualmente identificado por su sesión. CAMBIAR antes de usar.',
   true),

  (1, 'pedido.clave_gerencia', 'CAMBIAR', 'string', 'pedidos',
   'Clave de autorización — Gerencia', null,
   'La pide el sistema al dar la segunda firma del pedido. Compartida por el área; quien firma queda igualmente identificado por su sesión. CAMBIAR antes de usar.',
   true)
on conflict (idempresa, clave, vigente_desde) do nothing;


-- ============================================================================
-- VERIFICACION
-- ============================================================================

-- 1. Las dos claves existen (esperado: 2 filas)
select clave, etiqueta, valor, editable
  from public.crm_parametros
 where idempresa = 1
   and clave in ('pedido.clave_contabilidad', 'pedido.clave_gerencia')
   and vigente_hasta is null;

-- 2. AVISO: si alguna sigue en 'CAMBIAR', hay que cambiarla desde
--    Configuracion -> Parametrizacion ANTES de autorizar el primer pedido.
--    Esta consulta devuelve las que faltan por configurar.
select clave, 'Sigue con la clave de ejemplo: cambiala antes de usar' as aviso
  from public.crm_parametros
 where idempresa = 1
   and clave in ('pedido.clave_contabilidad', 'pedido.clave_gerencia')
   and vigente_hasta is null
   and valor = 'CAMBIAR';

-- 3. Quien puede autorizar hoy (sin esto, la clave no sirve de nada)
select p.usuario,
       pu.crm_autorizar_contabilidad as contabilidad,
       pu.crm_autorizar_gerencia     as gerencia
  from public.permisos_usuarios pu
  join public.profiles p on p.id = pu.usuario_id
 where pu.crm_autorizar_contabilidad or pu.crm_autorizar_gerencia
 order by p.usuario;


-- ============================================================================
-- REVERSION (comentada)
-- ----------------------------------------------------------------------------
-- Sin estas claves NINGUN pedido se puede autorizar: la funcion de
-- autorizacion se niega y avisa que falta configurarlas.
--
--   delete from public.crm_parametros
--    where idempresa = 1
--      and clave in ('pedido.clave_contabilidad', 'pedido.clave_gerencia');
-- ============================================================================
