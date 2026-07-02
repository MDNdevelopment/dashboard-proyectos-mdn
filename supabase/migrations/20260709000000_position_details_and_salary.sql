-- Agrega descripción y funciones (bullets) a los cargos,
-- y sueldo mensual a los empleados.
-- Relacionado con mejoras del módulo Métricas (EmployeeInfoModal,
-- auto-generación de Nómina, gating de pagos por nivel 4/admin).

alter table positions
  add column if not exists position_description text,
  add column if not exists position_functions   jsonb not null default '[]'::jsonb;

alter table users
  add column if not exists monthly_salary numeric;
