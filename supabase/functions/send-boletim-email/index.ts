import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY não configurada');
    }

    const { to, studentName, templateName, pdfBase64 } = await req.json();

    if (!to || !studentName || !pdfBase64) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios: to, studentName, pdfBase64' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Fleming Corretor <onboarding@resend.dev>',
        to: [to],
        subject: `Boletim de Desempenho - ${templateName || 'Simulado'}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #16a34a;">Fleming - Boletim de Desempenho</h2>
            <p>Olá <strong>${studentName}</strong>,</p>
            <p>Segue em anexo seu boletim de desempenho referente ao simulado <strong>${templateName || ''}</strong>.</p>
            <p>Em caso de dúvidas, entre em contato com seu professor.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
            <p style="font-size: 12px; color: #6b7280;">Este é um e-mail automático enviado pelo sistema Fleming Corretor.</p>
          </div>
        `,
        attachments: [
          {
            filename: `boletim_${studentName.replace(/\s+/g, '_')}.pdf`,
            content: pdfBase64,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Resend API error [${response.status}]: ${JSON.stringify(data)}`);
    }

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error sending email:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
