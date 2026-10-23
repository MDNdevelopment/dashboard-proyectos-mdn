-- Suscripciones: todo lo que paga la agencia aquí es software, así que el rubro de gasto
-- (`category`, keys de Finanzas) no sirve para distinguir una suscripción de otra. Se agrega
-- `service_type`: qué tipo de herramienta es (IA, imagen, video…). `category` se conserva
-- con su default para una futura integración con Finanzas, pero la UI ya no lo pide.
alter table public.company_subscriptions
  add column service_type text not null default 'otro';

alter table public.company_subscriptions
  add constraint company_subscriptions_service_type_check
  check (service_type in ('ia', 'imagen', 'video', 'diseno', 'almacenamiento', 'otro'));

-- Backfill por nombre para las suscripciones ya cargadas.
update public.company_subscriptions set service_type = 'ia'
 where name ~* '(claude|chatgpt|gemini|google ai|openai|midjourney)';
update public.company_subscriptions set service_type = 'imagen'
 where name ~* '(magnific|freepik|leonardo)';
update public.company_subscriptions set service_type = 'video'
 where name ~* '(capcut|tiktok|runway|higgsfield)';
