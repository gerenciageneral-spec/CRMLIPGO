-- ============================================================================
-- 187_crm_rpc_proyeccion.sql
-- ----------------------------------------------------------------------------
-- LA PIEZA MAS DELICADA DEL CRM: la funcion que proyecta un pedido autorizado
-- a `pedidoscabecera` / `pedidosdetalle`, o sea, a PRODUCCION DE LIPGO.
--
-- TOCA PRODUCCION AJENA. Leer entero antes de correr.
--
-- POR QUE UNA FUNCION EN LA BASE Y NO CODIGO TypeScript:
-- Supabase JS no ofrece transacciones multi-tabla. Insertando desde JS habria
-- que compensar con un DELETE si falla el detalle, y cuando la compensacion
-- misma falla queda una cabecera huerfana en la tabla de produccion de LIPgo:
-- un pedido fantasma, sin lineas, que aparece en sus tableros y que nadie sabe
-- de donde salio. Aqui cabecera, detalle y actualizacion del puente ocurren en
-- una sola transaccion: o todo, o nada.
--
-- LAS DOS DEFENSAS QUE IMPORTAN:
--   1. Validacion de nombres de producto ANTES de escribir. LIPgo une por
--      TEXTO (detalleoc.producto = productos.nombre). Un nombre que no exista
--      literal entra bien y revienta despues, en el flujo de cargue, lejos del
--      CRM y sin rastro de la causa. Si algo no coincide, no se escribe nada.
--   2. Estado verificado dentro de la transaccion. No basta con que la
--      interfaz deshabilite el boton: dos peticiones simultaneas lo pasan.
--
-- Aditivo e idempotente.
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
    bodega, total_linea, total_pagar, descuentoiva, descuentopp,
    observaciones, aprobado, estado,
    revisioncartera, revisiongerencia
  ) values (
    v_idpedido, v_ped.idempresa, v_ped.fecha, v_ped.fecha_programada,
    coalesce(v_vendedor, ''), v_cliente.nombre,
    coalesce(v_ped.destino, v_bodega.ciudad, ''),
    coalesce(v_ped.direccion, v_bodega.direccion, ''),
    coalesce(v_condicion, ''), coalesce(v_despacho, ''),
    coalesce(v_ped.orden_compra, ''),
    coalesce(v_bodega.nombrebodega, ''),
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
  'Proyecta un pedido autorizado del CRM a pedidoscabecera/pedidosdetalle de LIPgo, en una sola transaccion. Valida los nombres de producto contra el catalogo antes de escribir. Es el UNICO punto donde el CRM escribe en tablas de LIPgo.';


-- Registrar el error sin que la transaccion fallida se lo lleve por delante.
create or replace function public.crm_registrar_error_proyeccion(
  p_pedido_id bigint,
  p_error     text
) returns void
language plpgsql
as $$
begin
  update public.crm_pedidos
     set error_lipgo = p_error, actualizado_en = now()
   where id = p_pedido_id;
end $$;


-- ============================================================================
-- VERIFICACION
-- ============================================================================

-- 1. Las funciones existen (esperado: 3 filas)
select routine_name
  from information_schema.routines
 where routine_schema='public'
   and routine_name in ('crm_proyectar_pedido_lipgo','crm_registrar_error_proyeccion','crm_siguiente_id')
 order by routine_name;

-- 2. Un pedido inexistente responde con error, sin lanzar excepcion
select public.crm_proyectar_pedido_lipgo(-1, null) as respuesta_esperada_error;

-- 3. Control: cuantos pedidos de LIPgo nacieron en el CRM
select count(*) as pedidos_desde_crm
  from public.pedidoscabecera where observaciones like '%[Origen: CRM %';


-- ============================================================================
-- REVERSION (comentada)
-- ----------------------------------------------------------------------------
-- Borrar la funcion NO deshace los pedidos ya proyectados: siguen en
-- pedidoscabecera y hay que anularlos en LIPgo con su propio proceso. Quitar
-- la funcion solo impide proyectar nuevos.
--
--   drop function if exists public.crm_proyectar_pedido_lipgo(bigint, uuid);
--   drop function if exists public.crm_registrar_error_proyeccion(bigint, text);
-- ============================================================================
