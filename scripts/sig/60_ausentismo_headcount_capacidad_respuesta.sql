-- =====================================================================
-- 60 · Ausentismo cruzado con Head Count + nuevo indicador "Capacidad de
-- respuesta del equipo" (BSC · Gestión Humana)
-- ---------------------------------------------------------------------
-- IND-GH-02 (gh_ausentismo) dejó de dividir por filas de registroasistencia
-- y ahora divide por DÍAS-PERSONA ESPERADOS según headcount (fechainicio/
-- fecha_retiro cruzados con el período) -- el código ya se corrigió
-- (lib/sig-actions.ts, lib/ausentismos-actions.ts); este script solo
-- actualiza el texto de la ficha del indicador para que quede consistente
-- con la fórmula real.
--
-- Se agrega IND-GH-06 "Capacidad de respuesta del equipo" -- el cálculo
-- ANTERIOR de ausentismo (programado vs real del control diario) se
-- conserva como indicador operativo aparte, NO se elimina.
--
-- Aditivo e idempotente. Correr en Supabase SQL Editor. No borra datos.
-- =====================================================================

update public.sig_indicadores set
  nombre = 'Ausentismo médico (incapacidad)',
  formula = 'Turnos con incapacidad médica / días-persona esperados según Head Count (fechainicio/fecha_retiro) en el período',
  meta = 3, sentido = 'menor_mejor'
where idempresa = 100 and codigo = 'IND-GH-02';

insert into public.sig_indicadores
  (idempresa, codigo, proceso_codigo, nombre, tipo, formula, fuente, calculo_auto,
   unidad, meta, sentido, frecuencia, responsable, perspectiva, area, finalidad, activo, orden)
select * from (values
  (100,'IND-GH-06','GH','Capacidad de respuesta del equipo','resultado',
   'Turnos con incapacidad o licencia no remunerada / turnos programados (control diario: programación + asistencia + novedades)',
   'registroasistencia','gh_capacidad_respuesta',
   '%',3,'menor_mejor','mensual','Coordinador de Gestión Humana','procesos','Gestión Humana',
   'Medir qué tanto el personal PROGRAMADO ese día realmente respondió (indicador operativo, distinto del ausentismo real contra Head Count)',true,46)
) as x(idempresa,codigo,proceso_codigo,nombre,tipo,formula,fuente,calculo_auto,
       unidad,meta,sentido,frecuencia,responsable,perspectiva,area,finalidad,activo,orden)
 where not exists (select 1 from public.sig_indicadores e where e.idempresa = 100 and e.codigo = x.codigo);

-- =====================================================================
-- FIN.
-- =====================================================================
