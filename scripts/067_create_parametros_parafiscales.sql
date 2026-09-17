-- =====================================================================
-- Submódulo "Parafiscales" (Gestión Humana › Nómina)
-- 1) Tabla de parámetros legales de Seguridad Social y Parafiscales por AÑO.
-- 2) Permiso `parafiscales` en permisos_usuarios.
-- Aditivo e idempotente: se puede correr varias veces sin efectos secundarios.
-- =====================================================================

create table if not exists public.parametros_parafiscales (
  anio int primary key,
  -- Pensión (Ley 100/1993 art. 20): 16% total = 12% empleador + 4% trabajador.
  pct_pension_empleador numeric not null default 12,
  pct_pension_empleado  numeric not null default 4,
  -- Salud (Ley 100/1993 art. 204): 12,5% total = 8,5% empleador + 4% trabajador.
  -- El 8,5% del empleador se EXONERA por el E.T. art. 114-1 (ver umbral abajo).
  pct_salud_empleador   numeric not null default 8.5,
  pct_salud_empleado    numeric not null default 4,
  -- Parafiscales. Caja NUNCA se exonera; SENA e ICBF sí (art. 114-1).
  pct_sena              numeric not null default 2,
  pct_icbf              numeric not null default 3,
  pct_caja              numeric not null default 4,
  -- E.T. art. 114-1: exoneración de salud/SENA/ICBF para quien devengue MENOS
  -- de este número de SMMLV.
  umbral_exoneracion_smlv numeric not null default 10,
  -- Ley 100/1993 art. 18: tope del IBC en SMLV.
  tope_ibc_smlv           numeric not null default 25,
  -- Clase de riesgo ARL (Decreto 1772/1994) por tipo de personal.
  -- I=0,522 · II=1,044 · III=2,436 · IV=4,350 · V=6,960
  clase_arl_admin      text not null default 'II',  -- headcount.admin = true → riesgo II (1,044%)
  clase_arl_operativo  text not null default 'III', -- el resto → riesgo III (2,436%)
  -- Sumar el auxilio de transporte a la base de Caja/SENA/ICBF.
  incluye_aux_parafiscales boolean not null default true,
  actualizado_at timestamptz default now(),
  constraint parametros_parafiscales_clase_admin_chk
    check (clase_arl_admin in ('I','II','III','IV','V')),
  constraint parametros_parafiscales_clase_oper_chk
    check (clase_arl_operativo in ('I','II','III','IV','V'))
);

-- Seed de los años en operación. `do nothing`: si ya existen, NO se pisan los
-- valores que el usuario haya ajustado desde el cuadro de control.
insert into public.parametros_parafiscales (anio) values (2025), (2026)
on conflict (anio) do nothing;

-- Migración de la clase de riesgo ARL a la real de LIP: operativos riesgo III
-- (2,436%) y administrativos riesgo II (1,044%). Alinea las filas ya existentes
-- (que traían el default anterior IV/I) con la norma aplicable. Idempotente.
-- Sigue siendo editable desde el cuadro de control del submódulo.
update public.parametros_parafiscales
   set clase_arl_operativo = 'III',
       clase_arl_admin     = 'II'
 where clase_arl_operativo = 'IV'
    or clase_arl_admin     = 'I';

-- Permiso del submódulo. Default false: no abre el módulo a nadie por defecto;
-- se entrega desde Gestión de Usuarios.
alter table public.permisos_usuarios
  add column if not exists parafiscales boolean not null default false;
