-- Alta de 9 personas reales (cruce Siigo/acumulados_siigo + PILA real de
-- agosto-2026) que trabajaban/trabajan para LIP pero nunca tuvieron registro
-- en Head Count -- confirmado 2026-09-11 con el usuario (MAC DONALD: Avimol,
-- retiro 2026-08-30, Sin Justa Causa; YEFERSON: proyecto fuera de LIPgo,
-- retiro real 2026-08-19 tomado del campo fecha_retiro del archivo PILA ya
-- radicado; los otros 6 son administrativos activos de la matriz "LiP
-- Progressive Integral Logistics", sin proyecto operativo específico).
--
-- Sin "on conflict": headcount.identificacion NO tiene constraint único
-- (ver 032_create_headcount_table.sql), por eso el guard es NOT EXISTS.
insert into public.headcount
  (identificacion, nombre, idempresa, admin, estado, salario, contratosiigo, fecha_retiro, motivo_retiro,
   administradora_pension, administradora_salud, administradora_caja, tipo_cotizante, subtipo_cotizante, centro_trabajo, actividad_economica)
select v.identificacion, v.nombre, v.idempresa::integer, v.admin, v.estado, v.salario, v.contratosiigo, v.fecha_retiro::date, v.motivo_retiro,
       v.administradora_pension, v.administradora_salud, v.administradora_caja, v.tipo_cotizante, v.subtipo_cotizante, v.centro_trabajo, v.actividad_economica
from (values
  ('7551122', 'GUSTAVO ALONSO MERCHAN JARAMILLO', null, true, 'Activo', 1750905, '7551122-1', null, null, '25-14', 'EPS010', 'CCF24', '01', '00', '2', '2522401'),
  ('24581547', 'CLAUDIA MARIA JIMENEZ HENAO', null, true, 'Activo', 1750905, '24581547-1', null, null, '25-14', 'EPS010', 'CCF24', '01', '00', '2', '2522401'),
  ('56057109', 'YELVIS DEL CARMEN JIMENEZ SOLANO', null, true, 'Activo', 1750905, '56057109-1', null, null, '25-14', 'EPS005', 'CCF06', '01', '00', '2', '2773001'),
  ('80027128', 'YILFRED JIMENEZ SOLANO', null, true, 'Activo', 3000000, '80027128', null, null, '230301', 'EPS010', 'CCF24', '01', '00', '2', '2522401'),
  ('80075406', 'JEFFREY JOEL JIMENEZ RODRIGUEZ', null, true, 'Activo', 3000000, '80075406', null, null, '231001', 'EPS005', 'CCF15', '01', '00', '2', '2522401'),
  ('1092338456', 'YEFERSON ARLEY FONSECA SUAREZ', null, true, 'Inactivo', 1750905, '1092338456-1', '2026-08-19', null, '25-14', 'EPS037', 'CCF37', '01', '00', '3', '3522401'),
  ('1094951357', 'MANUELA MERCHAN JIMENEZ', null, true, 'Activo', 3000000, '1094951357-1', null, null, '230301', 'EPS010', 'CCF24', '01', '00', '2', '2522401'),
  ('1129527210', 'OMAR YESID CASTELLANOS OSPINA', 1, false, 'Activo', 1750905, '1129527210-1', null, null, '230201', 'EPS002', 'CCF24', '01', '00', '3', '3522401'),
  ('1140816546', 'MAC DONALD DONADO MEJIA', 2, true, 'Inactivo', 2000000, '1140816546-1', '2026-08-30', 'Sin Justa Causa', '25-14', 'EPS010', 'CCF06', '01', '00', '3', '3522401')
) as v(identificacion, nombre, idempresa, admin, estado, salario, contratosiigo, fecha_retiro, motivo_retiro,
       administradora_pension, administradora_salud, administradora_caja, tipo_cotizante, subtipo_cotizante, centro_trabajo, actividad_economica)
where not exists (
  select 1 from public.headcount h where trim(h.identificacion) = v.identificacion
);
