import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseServer } from "@/app/lib/supabase-server";
const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const sb = supabaseServer();

    const { data: quote, error: qErr } = await sb
      .from("quotes")
      .select("id, quote_no, client_name, client_email, pdf_url")
      .eq("id", params.id)
      .single();

    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 400 });
    if (!quote?.client_email) return NextResponse.json({ error: "Cliente sin email" }, { status: 400 });

    if (!quote.pdf_url) {
      return NextResponse.json(
        { error: "Primero usa “Guardar + Subir PDF” para generar el link del PDF." },
        { status: 400 }
      );
    }

    const subject = `Cotización ${quote.quote_no} - ${quote.client_name || ""}`.trim();

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2 style="margin:0;">HST GLOBAL STORE</h2>
        <p style="margin:6px 0 0;">Estimado/a <b>${quote.client_name || "cliente"}</b>,</p>
        <p style="margin:10px 0 0;">
          Adjuntamos su cotización <b>${quote.quote_no}</b>. También puede descargarla aquí:
          <br/>
          <a href="${quote.pdf_url}">${quote.pdf_url}</a>
        </p>
        <p style="margin:14px 0 0; color:#555;">
          Si requiere cambios o confirmación, por favor responda a este correo.
        </p>
        <hr style="margin:16px 0;" />
        <p style="margin:0; font-size:12px; color:#777;">
          HST GLOBAL STORE — WhatsApp 0982124443
        </p>
      </div>
    `;

    const pdfRes = await fetch(quote.pdf_url);
    if (!pdfRes.ok) {
      return NextResponse.json({ error: "No se pudo descargar el PDF para adjuntar." }, { status: 400 });
    }
    const pdfArrayBuffer = await pdfRes.arrayBuffer();

    const from = process.env.EMAIL_FROM || "HST GLOBAL STORE <onboarding@resend.dev>";

    const { error } = await resend.emails.send({
      from,
      to: quote.client_email,
      subject,
      html,
      attachments: [
        {
          filename: `${quote.quote_no}.pdf`,
          content: Buffer.from(pdfArrayBuffer),
        },
      ],
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Error" }, { status: 500 });
  }
}