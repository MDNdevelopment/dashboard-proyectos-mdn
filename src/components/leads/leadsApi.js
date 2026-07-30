/**
 * Capa de acceso a datos para el módulo Leads (formularios de contacto de la web).
 * Todas las funciones hacen queries a Supabase y retornan { data, error }.
 * Solo visible/editable por usuarios nivel 3, 4 o admin (ver RLS en
 * supabase/migrations/20260730010000_leads_status_rls.sql).
 */
import { supabase } from "../../supabase";

export async function loadLeads() {
  return supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });
}

export async function updateLeadStatus(leadId, status, userId) {
  return supabase
    .from("leads")
    .update({ status, updated_by: userId, updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .select()
    .single();
}
