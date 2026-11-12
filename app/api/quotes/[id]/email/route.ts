import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseServer } from "@/lib/supabase-server";

const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM;

function getMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const body = (await req.json()) as { email?: string; pdf_revision?: string };
    const email = typeof body?.email === "string" ? body.email.trim() : "";

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
    const [{ data, error }, { data: profile, error: profileError }] = await Promise.all([
      sb.from("quotes").select("quote_no,date,client_name,pdf_url,pdf_revision").eq("id", id).single(),
      sb.from("quote_company_profile").select("name").eq("id", "default").maybeSingle(),
    ]);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }
    if (body.pdf_revision && body.pdf_revision !== data.pdf_revision) {
      return NextResponse.json({ error: "La cotización cambió. Prepara el PDF de la versión actual." }, { status: 409 });
    }

    const pdfUrl = data.pdf_url;
    if (!pdfUrl || !/^https?:\/\//i.test(pdfUrl)) {
      return NextResponse.json({ error: "Guarda el PDF antes de enviar la cotización." }, { status: 400 });
    }

    const company = profile?.name?.trim();
    const client = escapeHtml(data.client_name || "");
    const number = escapeHtml(data.quote_no);
    const link = escapeHtml(pdfUrl);
    const resend = new Resend(resendApiKey);
    const { data: emailData, error: sendError } = await resend.emails.send({
      from: emailFrom,
      to: email,
      subject: [`Cotización ${data.quote_no}`, company].filter(Boolean).join(" · "),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
          ${company ? `<h2>${escapeHtml(company)}</h2>` : ""}
          <p>Hola${client ? ` ${client}` : ""},</p>
          <p>Te compartimos la cotización <strong>${number}</strong>.</p>
          <p>Fecha de emisión: ${escapeHtml(data.date || "-")}</p>
          <p><a href="${link}" target="_blank" rel="noreferrer">Ver cotización en PDF</a></p>
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
