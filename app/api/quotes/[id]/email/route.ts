import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseServer } from "@/lib/supabase-server";

const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM;

function getMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const body = (await req.json()) as { email?: string; pdf_url?: string | null };
    const email = body?.email?.trim();

    if (!email) {
      return NextResponse.json({ error: "Email requerido" }, { status: 400 });
    }

    if (!resendApiKey || resendApiKey === "tu_key_de_resend" || !emailFrom) {
      return NextResponse.json(
        { error: "Configura RESEND_API_KEY y EMAIL_FROM para enviar correos reales desde Vercel." },
        { status: 500 },
      );
    }

    const sb = supabaseServer();
    const { data, error } = await sb.from("quotes").select("*").eq("id", id).single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const resend = new Resend(resendApiKey);
    const pdfUrl = body?.pdf_url || data.pdf_url || null;

    const { data: emailData, error: sendError } = await resend.emails.send({
      from: emailFrom,
      to: email,
      subject: `Cotizacion ${data.quote_no} - ${data.client_name || "HST Global Store"}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
          <h2 style="margin-bottom:8px">HST Global Store</h2>
          <p>Hola${data.client_name ? ` ${data.client_name}` : ""},</p>
          <p>Te compartimos la cotizacion <strong>${data.quote_no}</strong>.</p>
          <ul>
            <li>Fecha: ${data.date || "-"}</li>
            <li>Cliente: ${data.client_name || "-"}</li>
          </ul>
          ${
            pdfUrl
              ? `<p>Puedes revisar el PDF aqui: <a href="${pdfUrl}" target="_blank" rel="noreferrer">${pdfUrl}</a></p>`
              : "<p>La cotizacion no tiene PDF adjunto todavia.</p>"
          }
          <p>Gracias por confiar en HST Global Store.</p>
        </div>
      `,
    });

    if (sendError) {
      return NextResponse.json(
        { error: sendError.message || "Resend no pudo enviar el correo." },
        { status: 400 },
      );
    }

    if (!emailData?.id) {
      return NextResponse.json(
        { error: "Resend no confirmo el envio del correo." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, id: emailData.id });
  } catch (error) {
    return NextResponse.json({ error: getMessage(error) }, { status: 500 });
  }
}
