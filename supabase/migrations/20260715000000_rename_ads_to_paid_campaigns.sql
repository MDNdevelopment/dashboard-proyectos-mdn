-- Renombra la tabla `ads` a `paid_campaigns`.
-- Motivo: los bloqueadores de anuncios (uBlock Origin y similares) bloquean por
-- defecto peticiones REST cuya URL trae "/ads?..." (patrón típico de endpoints
-- de redes publicitarias), lo que rompía crear/editar/eliminar ads en el
-- navegador del usuario (ERR_BLOCKED_BY_CLIENT). Ver también migración
-- 20260714000001_create_ads.sql (creación original) y el gotcha de naming en
-- ARQUITECTURA.md.
alter table public.ads rename to paid_campaigns;

alter policy "ads_select"        on public.paid_campaigns rename to "paid_campaigns_select";
alter policy "ads_manage_insert" on public.paid_campaigns rename to "paid_campaigns_manage_insert";
alter policy "ads_manage_update" on public.paid_campaigns rename to "paid_campaigns_manage_update";
alter policy "ads_manage_delete" on public.paid_campaigns rename to "paid_campaigns_manage_delete";

-- Exponer a Supabase Realtime (no estaba habilitado para la tabla original).
alter publication supabase_realtime add table public.paid_campaigns;
