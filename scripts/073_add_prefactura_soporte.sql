-- Respaldo del SOPORTE (anexo) de cada prefactura: detalle de órdenes CONGELADO al
-- guardar/aprobar (foto fiel de lo facturado). Aditivo e idempotente.
-- `soporte` = arreglo JSON de líneas {owner, operacion, servicio, fecha, numeroorden,
-- placa, cliente, producto, toneladas, tarifa, valor}.

alter table public.prefacturas
  add column if not exists soporte jsonb not null default '[]'::jsonb;
