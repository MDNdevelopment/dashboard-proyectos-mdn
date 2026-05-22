import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { assignee_id, campaign_name, created_by_name } = await req.json()

    if (!assignee_id || !campaign_name) {
      return new Response(
        JSON.stringify({ error: 'assignee_id y campaign_name son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email, first_name, last_name')
      .eq('user_id', assignee_id)
      .single()

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Assignee not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@mdnpublicidad.com'

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY no configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const emailBody = {
      from: fromEmail,
      to: [user.email],
      subject: `Nueva campaña asignada: ${campaign_name}`,
      html: `
        <p>Hola ${user.first_name},</p>
        <p>
          Has sido asignado como <strong>responsable</strong> de la campaña
          <strong>"${campaign_name}"</strong>.
        </p>
        ${created_by_name ? `<p>Asignado por: ${created_by_name}</p>` : ''}
        <p>Ingresa al dashboard para ver los detalles de la campaña.</p>
        <p>— MDN Publicidad</p>
      `,
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailBody),
    })

    if (!resendResponse.ok) {
      const resendError = await resendResponse.text()
      console.error('Resend error:', resendError)
      return new Response(
        JSON.stringify({ error: 'Error al enviar el correo' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const resendData = await resendResponse.json()
    return new Response(
      JSON.stringify({ ok: true, email_id: resendData.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
