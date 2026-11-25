import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { accountingLedger, treasuryLedger, tokenDigest } from "@/lib/accounting-server";
import { ecuadorDate } from "@/lib/accounting";

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const reply = (data: object, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(value + "T00:00:00Z").toJSON()?.slice(0, 10) === value;

export async function POST(request: Request) {
  const key = process.env.HST_ACCOUNTING_ACCESS_KEY;
  if (!key || key.length < 32) return reply({ error: "Configura la clave del panel contable." }, 503);
  try {
    const raw = await request.text();
    if (raw.length > 300_000) return reply({ error: "Solicitud demasiado larga." }, 413);
    const { action, id, values = {} } = JSON.parse(raw) ?? {};
    const db = supabaseServer();
    if (action === "load") {
      const [ledger, treasury] = await Promise.all([accountingLedger(db),treasuryLedger(db)]);
      return reply({ ledger, treasury });
    }
    if (action === "attachment") {
      let path: string | undefined;
      if (/^\d+$/.test(String(values.legacy_id))) {
        const { data, error } = await db.from("facturas").select("pdf_url").eq("id", values.legacy_id).maybeSingle();
        if (error) throw error;
        if (/^hst\/[\w-]+\.pdf$/i.test(data?.pdf_url ?? "")) path = data!.pdf_url;
      } else if (uuid.test(String(values.document_id)) && ["sale", "purchase"].includes(values.kind)) {
        const table = values.kind === "sale" ? "account_sales" : "account_purchases";
        const { data, error } = await db.from(table).select("pdf_path").eq("id", values.document_id).maybeSingle();
        if (error) throw error;
        if (data?.pdf_path?.startsWith("accounting/")) path = data.pdf_path;
      }
      if (!path) return reply({ error: "No hay un comprobante archivado." }, 404);
      const signed = await db.storage.from("invoices").createSignedUrl(path, 60);
      if (signed.error) throw signed.error;
      return reply({ url: signed.data.signedUrl });
    }
    if (action === "upload" && uuid.test(String(id)) && /^[a-f0-9]{64}$/.test(values.file_hash)) {
      const bucket = await db.storage.getBucket("invoices");
      if (bucket.error || bucket.data.public) return reply({ error: "El archivo de facturas debe ser privado para guardar PDFs." }, 503);
      const path = `accounting/${id}-${values.file_hash}.pdf`;
      const files = db.storage.from("invoices");
      const existing = await files.exists(path);
      if (existing.data) return reply({ path });
      const signed = await files.createSignedUploadUrl(path, { upsert: false });
      if (signed.error) throw signed.error;
      return reply({ path, token: signed.data.token });
    }
    if (!uuid.test(String(id)) || !["sale", "legacy_details", "purchase", "purchase_vat", "sale_vat", "payment", "allocate", "cash", "share", "revoke", "treasury_settings", "treasury_entry"].includes(action)) {
      return reply({ error: "Operación inválida." }, 400);
    }
    let payload = { ...values, action };
    delete payload.pdf_path;
    if ((action === "sale" || action === "purchase") && values.file_hash) {
      if (!/^[a-f0-9]{64}$/.test(values.file_hash)) return reply({ error: "Adjunto inválido." }, 400);
      const path = `accounting/${id}-${values.file_hash}.pdf`;
      const bucket = await db.storage.getBucket("invoices");
      if (bucket.error || bucket.data.public) return reply({ error: "El archivo de facturas debe ser privado para guardar PDFs." }, 503);
      const existing = await db.storage.from("invoices").exists(path);
      if (!existing.data) return reply({ error: "El PDF aún no se ha cargado." }, 409);
      payload.pdf_path = path;
    }
    let token: string | undefined;
    if (action === "share") {
      if (!date(values.expires) || values.expires < ecuadorDate() || (values.from && !date(values.from)) ||
        (values.to && !date(values.to)) || (values.from && values.to && values.from > values.to)) return reply({ error: "Revisa las fechas del enlace." }, 400);
      token = createHmac("sha256", key).update(`accounting-share:${id}`).digest("hex");
      payload = { action, digest: tokenDigest(token), from: values.from, to: values.to, expires: values.expires };
    }
    const { error } = await db.rpc(action.startsWith("treasury_") ? "hst_treasury_write" : "hst_account_write", { p_id: id, p_data: payload });
    if (error) {
      if (error.code === "P0001") return reply({ error: error.message }, 409);
      if (error.code === "23505") return reply({ error: "Ya existe ese número o referencia de documento." }, 409);
      if (/^(22|23)/.test(error.code)) return reply({ error: "Revisa los datos y montos del formulario." }, 400);
      throw error;
    }
    return reply(token ? { path: `/reporte/${token}` } : { saved: true });
  } catch {
    return reply({ error: "No se pudo completar la operación contable." }, 502);
  }
}
