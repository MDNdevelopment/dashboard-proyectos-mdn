/**
 * notify-dispatch — Supabase Edge Function
 *
 * Called by a Supabase Database Webhook on INSERT into public.notifications
 * (only rows where email = true need to trigger an email; the webhook fires
 * for all inserts, so we guard with `if (!record.email) return ok`).
 *
 * Webhook payload shape (sent by Supabase Webhooks):
 *   { type: 'INSERT', table: 'notifications', record: NotificationRow, ... }
 *
 * Environment secrets (set in Supabase dashboard → Edge Functions → Secrets):
 *   RESEND_API_KEY          — Resend bearer token
 *   SENDER_EMAIL            — from-address (fallback: noreply@mdnpublicidad.com)
 *   SUPABASE_URL            — injected automatically by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — injected automatically by Supabase
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NotificationRecord {
  id: string
  company_id: string
  user_id: string
  type: string
  title: string
  body: string
  entity_type: string | null
  entity_id: string | null
  email: boolean
  read: boolean
  dedupe_key: string | null
  created_at: string
}

function buildEmailHtml(notif: NotificationRecord, firstName: string): string {
  const typeLabels: Record<string, string> = {
    task_assigned:               'tarea',
    task_comment:                'comentario en tarea',
    checklist_item_assigned:     'ítem de checklist',
    project_added:               'proyecto',
    client_anniversary:     'aniversario de cliente',
    client_mdn_anniversary: 'aniversario MDN de cliente',
    client_contact_birthday:'cumpleaños de contacto',
    employee_birthday:      'cumpleaños',
    employee_mdn_anniversary:'aniversario MDN',
    meeting_invite:          'reunión agendada',
    meeting_reminder_day:    'recordatorio de reunión (mañana)',
    meeting_reminder_hour:   'recordatorio de reunión (en 1 hora)',
    report_close_reminder:  'recordatorio de cierre de reporte',
    report_autoclosed:      'reporte cerrado automáticamente',
  }
  const typeLabel = typeLabels[notif.type] ?? 'notificación'

  const introLines: Record<string, string> = {
    task_assigned:           `Has sido asignado/a a una nueva <strong>tarea</strong>:<br><em>${notif.body}</em>`,
    task_comment:            `Hay un nuevo comentario en una tarea asignada a ti:<br><em>${notif.body}</em>`,
    checklist_item_assigned: `Te asignaron un ítem del checklist:<br><em>${notif.body}</em>`,
    project_added:           `Fuiste incluido/a en el proyecto <strong>"${notif.body}"</strong>.`,
    meeting_invite:          `Te agregaron a una <strong>reunión</strong>:<br><em>${notif.body}</em>`,
    meeting_reminder_day:    `Tienes una reunión <strong>mañana</strong>:<br><em>${notif.body}</em>`,
    meeting_reminder_hour:   `Tu reunión empieza <strong>en 1 hora</strong>:<br><em>${notif.body}</em>`,
    report_close_reminder:  `${notif.body}`,
    report_autoclosed:      `${notif.body}`,
  }
  const intro = introLines[notif.type]
    ?? `Tienes una nueva notificación de <strong>${typeLabel}</strong>: ${notif.body}`

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f2f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#FFB800;padding:20px 32px;">
            <span style="font-size:22px;font-weight:900;color:#111;letter-spacing:-0.5px;">MDN Publicidad</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 12px;font-size:17px;color:#111;">Hola ${firstName},</p>
            <p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.6;">${intro}</p>
            <a href="https://dashboard.mdnpublicidad.com"
               style="display:inline-block;padding:10px 22px;background:#111;color:#fff;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;">
              Ver en el dashboard →
            </a>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #ece9df;">
            <p style="margin:0;font-size:12px;color:#aaa;">MDN Publicidad · Notificación automática. No respondas a este correo.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function subjectForType(type: string, body: string): string {
  const subjects: Record<string, string> = {
    task_assigned:           `Nueva tarea asignada: ${body.slice(0, 60)}`,
    task_comment:            `Nuevo comentario en tarea: ${body.slice(0, 60)}`,
    checklist_item_assigned: `Ítem del checklist asignado: ${body.slice(0, 60)}`,
    project_added:           `Te incluyeron en el proyecto: ${body.slice(0, 60)}`,
    meeting_invite:          `Nueva reunión: ${body.slice(0, 60)}`,
    meeting_reminder_day:    `Recordatorio: reunión mañana — ${body.slice(0, 50)}`,
    meeting_reminder_hour:   `Recordatorio: reunión en 1 hora — ${body.slice(0, 50)}`,
    report_close_reminder:  `Recordatorio: cierre de reporte — ${body.slice(0, 50)}`,
    report_autoclosed:      `Reporte cerrado automáticamente — ${body.slice(0, 50)}`,
  }
  return subjects[type] ?? `Nueva notificación MDN: ${body.slice(0, 80)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    // Support both direct calls with { record } and Supabase Webhook shape
    const record: NotificationRecord = payload.record ?? payload

    // Skip non-email notifications
    if (!record?.email) {
      return new Response(JSON.stringify({ ok: true, skipped: 'not an email notification' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!record.user_id) {
      return new Response(JSON.stringify({ error: 'Missing user_id in notification record' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look up recipient email and name
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email, first_name, last_name')
      .eq('user_id', record.user_id)
      .single()

    if (userError || !user?.email) {
      console.error('User lookup error:', userError)
      return new Response(JSON.stringify({ error: 'Recipient not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const fromEmail = Deno.env.get('SENDER_EMAIL') ?? 'noreply@mdnpublicidad.com'

    const emailPayload = {
      from: fromEmail,
      to: [user.email],
      subject: subjectForType(record.type, record.body),
      html: buildEmailHtml(record, user.first_name),
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    })

    if (!resendRes.ok) {
      const errText = await resendRes.text()
      console.error('Resend error:', errText)
      return new Response(JSON.stringify({ error: 'Email delivery failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resendData = await resendRes.json()
    return new Response(JSON.stringify({ ok: true, email_id: resendData.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
