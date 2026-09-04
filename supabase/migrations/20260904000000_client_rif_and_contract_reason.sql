-- RIF (identificación fiscal) y motivo de fin de contrato de un cliente (marca).
-- El motivo se captura al archivar la cuenta desde ClientsView, junto con la fecha
-- real de fin de contrato (contract_end), para que "clientes por mes" quede exacto.

alter table public.metric_clients
  add column if not exists rif text,
  add column if not exists contract_end_reason text;

comment on column public.metric_clients.rif is
  'RIF / identificación fiscal del cliente. Texto libre (J-12345678-9).';
comment on column public.metric_clients.contract_end_reason is
  'Motivo por el que terminó el contrato, capturado al archivar la cuenta.';
