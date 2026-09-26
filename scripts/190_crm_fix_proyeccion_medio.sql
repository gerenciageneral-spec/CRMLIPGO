-- ============================================================================
-- 190_crm_fix_proyeccion_medio.sql
-- ----------------------------------------------------------------------------
-- CORRECCION URGENTE de crm_proyectar_pedido_lipgo (script 187).
--
-- EL FALLO: la funcion insertaba en `pedidoscabecera.bodega`, una columna que
-- NO EXISTE. PL/pgSQL no valida las columnas al crear la funcion, solo al
-- ejecutarla, por eso el script 187 corrio sin error. Pero el primer pedido que
-- se autorizara habria fallado al viajar a LIPgo. No se habia notado porque
-- todavia no se ha autorizado ninguno (verificado: crm_pedidos esta vacia).
--
-- LO QUE SE CORRIGE, contrastado contra pedidos reales de LIPgo:
--   1. La sucursal de entrega va en `medio`, que es donde LIPgo la guarda y la
--      lee (order-entry-form.tsx). `bodega` no existe.
--   2. Se llena `empresafactura` con el owner. LIPgo filtra por esta columna a
--      los usuarios que tienen owners asignados (perfil_acceso_owners): sin
--      ella el pedido llega, pero esos usuarios no lo ven.
--   3. Se llena `empresa` con el nombre del centro de despacho, como hace
--      LIPgo en todos sus pedidos.
--
-- Todo lo demas de la funcion queda EXACTAMENTE igual que en el 187. La
-- version completa con owners, impuesto por linea y cartera dentro de la
-- transaccion llega en la fase 2.
--
-- Reemplaza la funcion (create or replace): idempotente.
-- ============================================================================

create or replace function public.crm_proyectar_pedido_lipgo(
  p_pedido_id  bigint,
  p_usuario_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ped        record;
  v_cliente    record;
  v_vendedor   text;
  v_bodega     record;
  v_idpedido   bigint;
  v_transid    bigint;
  v_linea      record;
  v_faltantes  text[];
  v_n          int := 0;
  v_condicion  text;
  v_despacho   text;
  v_empresa    text;
  v_owner      text;
begin
  -- ---------------------------------------------------------------------
  -- 1. Tomar el pedido BLOQUEANDO la fila. Si hay dos peticiones a la vez,
  --    la segunda espera aqui y al entrar ve el estado ya cambiado.
  -- ---------------------------------------------------------------------
  select * into v_ped
    from public.crm_pedidos
   where id = p_pedido_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'El pedido no existe');
  end if;

  if v_ped.idpedido_lipgo is not null then
    -- Idempotente: reintentar no duplica, informa lo que ya paso.
    return jsonb_build_object(
      'ok', true, 'ya_proyectado', true,
      'idpedido', v_ped.idpedido_lipgo,
      'mensaje', format('El pedido ya habia viajado a LIPgo como %s', v_ped.idpedido_lipgo));
  end if;

  if v_ped.estado <> 'autorizado' then
    return jsonb_build_object('ok', false,
      'error', format('El pedido esta en estado "%s"; solo viaja un pedido autorizado', v_ped.estado));
  end if;

  -- Cinturon y tirantes: el estado 'autorizado' deberia implicar las dos
  -- firmas, pero se comprueba igual porque es lo que separa un pedido
  -- legitimo de uno que alguien empujo con un UPDATE manual.
  if v_ped.auth_contabilidad_en is null or v_ped.auth_gerencia_en is null then
    return jsonb_build_object('ok', false,
      'error', 'Faltan autorizaciones: se requieren contabilidad y gerencia');
  end if;

  -- ---------------------------------------------------------------------
  -- 2. VALIDAR LOS NOMBRES DE PRODUCTO CONTRA EL CATALOGO DE LIPGO.
  --    Esta es la validacion que evita romper produccion ajena.
  --
  --    NO se filtra por `productos.activo` a proposito: un producto
  --    descontinuado despues de cotizar sigue existiendo en el catalogo y su
  --    pedido debe poder despacharse. Lo que rompe a LIPgo es un nombre que NO
  --    EXISTE, no uno inactivo. (Ademas `activo` es TEXT en esta base, con
  --    'true'/'false' como cadenas, asi que usarlo como condicion booleana
  --    directa fallaria.)
  -- ---------------------------------------------------------------------
  select array_agg(distinct d.producto_nombre) into v_faltantes
    from public.crm_pedido_detalle d
   where d.pedido_id = p_pedido_id
     and not exists (
       select 1 from public.productos pr
        where pr.nombre = d.producto_nombre
          and pr.id_empresa = v_ped.idempresa
     );

  if v_faltantes is not null and array_length(v_faltantes, 1) > 0 then
    update public.crm_pedidos
       set error_lipgo = format('Productos que no existen en el catalogo de LIPgo: %s',
                                array_to_string(v_faltantes, ', ')),
           actualizado_en = now()
     where id = p_pedido_id;

    return jsonb_build_object(
      'ok', false,
      'error', 'Hay productos cuyo nombre no coincide con el catalogo',
      'productos_faltantes', to_jsonb(v_faltantes));
  end if;

  if not exists (select 1 from public.crm_pedido_detalle where pedido_id = p_pedido_id) then
    return jsonb_build_object('ok', false, 'error', 'El pedido no tiene lineas');
  end if;

  -- ---------------------------------------------------------------------
  -- 3. Resolver los textos que LIPgo espera. Su modelo guarda NOMBRES, no
  --    ids, en casi todas estas columnas.
  -- ---------------------------------------------------------------------
  select * into v_cliente from public.clientes where id = v_ped.cliente_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'El cliente del pedido no existe');
  end if;

  select nombre into v_vendedor from public.vendedores where idvendedor = v_ped.vendedor_id;
  select * into v_bodega from public.bodegas where idbodega = v_ped.bodega_id;

  select nombrecondicion into v_condicion
    from public.condicionespago where idcondicion = v_ped.condicion_pago_id;

  select nombretipodespacho into v_despacho
    from public.tipodespacho where idtipodespacho = v_ped.tipo_despacho_id;

  -- `empresa` es el nombre del centro de despacho (id_empresa) y
  -- `empresafactura` el owner que factura. LIPgo filtra por esta ultima a los
  -- usuarios con owners asignados: sin ella el pedido existe pero no lo ven.
  -- Mientras no exista el maestro de owners del CRM (fase 1), el owner es el
  -- de LIPgo con el mismo id que la empresa: hoy el CRM solo vende productos
  -- de la empresa 1, cuyo owner es "Harinera Indupan" (owners.id = 1).
  select nombre into v_empresa from public.empresas where id = v_ped.idempresa;
  select nombre into v_owner   from public.owners   where id = v_ped.idempresa;

  -- ---------------------------------------------------------------------
  -- 4. Insertar en pedidoscabecera.
  --    El id se pide a crm_siguiente_id, que sincroniza la secuencia con el
  --    MAX real: LIPgo inserta ids explicitos sin consumirla y la deja atras.
  -- ---------------------------------------------------------------------
  v_idpedido := public.crm_siguiente_id('pedidoscabecera', 'idpedido');

  insert into public.pedidoscabecera (
    idpedido, id_empresa, fecha, fecha_programada,
    vendedor, cliente, destino, direccion,
    condicion_pago, tipo_despacho, orden_de_compra,
    medio, empresa, empresafactura,
    total_linea, total_pagar, descuentoiva, descuentopp,
    observaciones, aprobado, estado,
    revisioncartera, revisiongerencia
  ) values (
    v_idpedido, v_ped.idempresa, v_ped.fecha, v_ped.fecha_programada,
    coalesce(v_vendedor, ''), v_cliente.nombre,
    coalesce(v_ped.destino, v_bodega.ciudad, ''),
    coalesce(v_ped.direccion, v_bodega.direccion, ''),
    coalesce(v_condicion, ''), coalesce(v_despacho, ''),
    coalesce(v_ped.orden_compra, ''),
    -- La sucursal va en `medio`: es donde la lee LIPgo (order-entry-form).
    coalesce(v_bodega.nombrebodega, ''),
    coalesce(v_empresa, ''), coalesce(v_owner, ''),
    v_ped.subtotal, v_ped.total, v_ped.iva_valor, v_ped.descuento_valor,
    -- Se deja rastro del origen en las observaciones: quien vea el pedido en
    -- LIPgo debe poder saber que nacio en el CRM y con que numero.
    trim(coalesce(v_ped.observaciones, '') || format(' [Origen: CRM %s]', v_ped.numero)),
    'si', 'aprobado',
    -- LIPgo guarda aqui el NOMBRE de quien reviso; se traslada el de cada firma.
    coalesce(v_ped.auth_contabilidad_nombre, 'CRM'),
    coalesce(v_ped.auth_gerencia_nombre, 'CRM')
  );

  -- ---------------------------------------------------------------------
  -- 5. Insertar el detalle.
  -- ---------------------------------------------------------------------
  for v_linea in
    select * from public.crm_pedido_detalle where pedido_id = p_pedido_id order by linea
  loop
    v_transid := public.crm_siguiente_id('pedidosdetalle', 'transid');

    insert into public.pedidosdetalle (
      transid, idpedido, id_empresa,
      producto, unidades, precio_und,
      total_linea, iva, descuentopp, subtotal, peso, categoria
    ) values (
      v_transid, v_idpedido, v_ped.idempresa,
      v_linea.producto_nombre, v_linea.cantidad, v_linea.precio_unitario,
      v_linea.total_linea,
      round(v_linea.subtotal * v_ped.iva_pct / 100.0, 2),
      v_linea.descuento_valor, v_linea.subtotal,
      v_linea.peso, coalesce(v_linea.categoria, '')
    );

    v_n := v_n + 1;
  end loop;

  -- ---------------------------------------------------------------------
  -- 6. Cerrar el puente. El indice unico parcial sobre idpedido_lipgo es la
  --    ultima defensa contra la doble proyeccion.
  -- ---------------------------------------------------------------------
  update public.crm_pedidos
     set idpedido_lipgo    = v_idpedido,
         estado            = 'enviado_lipgo',
         enviado_lipgo_en  = now(),
         enviado_lipgo_por = p_usuario_id,
         error_lipgo       = null,
         actualizado_en    = now()
   where id = p_pedido_id;

  return jsonb_build_object(
    'ok', true,
    'idpedido', v_idpedido,
    'lineas', v_n,
    'mensaje', format('Pedido %s proyectado a LIPgo como %s (%s lineas)', v_ped.numero, v_idpedido, v_n));

exception
  when others then
    -- El RAISE deshace TODA la transaccion: no queda cabecera sin detalle en
    -- la tabla de LIPgo. El mensaje se guarda aparte, en una transaccion
    -- propia, para que el error quede registrado aunque esta se revierta.
    raise warning 'crm_proyectar_pedido_lipgo(%) fallo: %', p_pedido_id, sqlerrm;
    raise;
end $$;


comment on function public.crm_proyectar_pedido_lipgo(bigint, uuid) is
  'Proyecta un pedido autorizado del CRM a pedidoscabecera/pedidosdetalle de LIPgo, en una sola transaccion. Sucursal en `medio`, owner en `empresafactura` (corregido en el script 190). Es el UNICO punto donde el CRM escribe en tablas de LIPgo.';


-- ============================================================================
-- VERIFICACION
-- ============================================================================

-- 1. La funcion ya no menciona la columna inexistente (esperado: false)
select position('bodega,' in pg_get_functiondef('public.crm_proyectar_pedido_lipgo(bigint,uuid)'::regprocedure)) > 0
       as sigue_usando_bodega;

-- 2. Y si usa medio y empresafactura (esperado: true, true)
select position('medio, empresa, empresafactura' in pg_get_functiondef('public.crm_proyectar_pedido_lipgo(bigint,uuid)'::regprocedure)) > 0
       as usa_medio_y_owner;

-- 3. Un pedido inexistente sigue respondiendo con error controlado
select public.crm_proyectar_pedido_lipgo(-1, null) as respuesta_esperada_error;


-- ============================================================================
-- REVERSION (comentada)
-- ----------------------------------------------------------------------------
-- Volver a correr la funcion del script 187 la deja como estaba, es decir,
-- ROTA. No tiene sentido revertir esta correccion.
-- ============================================================================
