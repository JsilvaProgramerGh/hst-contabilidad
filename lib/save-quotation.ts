import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

function optionalText(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}

export async function saveQuotation(request: Request, id: string | null = null) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Los datos de la cotización no son válidos." }, { status: 400 });
  }

  const quote = payload?.quote;
  const items = payload?.items;
  if (!quote || typeof quote !== "object" || Array.isArray(quote) ||
      ((id === null || items !== undefined) && (!Array.isArray(items) || !items.length))) {
    return NextResponse.json({ error: "Agrega al menos una línea a la cotización." }, { status: 400 });
  }

  const changes: Record<string, unknown> = {};
  for (const key of ["date", "valid_days", "iva_rate", "discount", "delivery", "paid"]) {
    if (Object.hasOwn(quote, key)) changes[key] = quote[key];
  }
  for (const key of [
    "client_name", "client_id", "client_phone", "client_email", "client_address",
    "terms", "notes", "pdf_url",
  ]) {
    if (Object.hasOwn(quote, key)) changes[key] = optionalText(quote[key]);
  }

  const revision = payload.pdf_revision;
  if (revision !== undefined) {
    if (id === null || typeof revision !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(revision) ||
        typeof changes.pdf_url !== "string" || Object.keys(changes).length !== 1 || items !== undefined) {
      return NextResponse.json({ error: "El vínculo del PDF no es válido." }, { status: 400 });
    }
    const { data, error } = await supabaseServer().from("quotes")
      .update({ pdf_url: changes.pdf_url }).eq("id", id).eq("pdf_revision", revision).select("*");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const updated = data?.[0];
    if (!updated) {
      return NextResponse.json({
        error: "La cotización cambió mientras se generaba el PDF. Guarda la versión actual para compartirla.",
      }, { status: 409 });
    }
    return NextResponse.json({ data: { quote: updated } });
  }

  const lines = items?.map((item: Record<string, unknown> | null) => ({
    qty: Number(item?.qty) || 0,
    description: optionalText(item?.description) ?? "",
    unit: Number(item?.unit) || 0,
    incl_vat: Boolean(item?.incl_vat),
    code: optionalText(item?.code),
    details: optionalText(item?.details),
    presentation: optionalText(item?.presentation),
    image_url: optionalText(item?.image_url),
  }));

  const { data, error } = await supabaseServer().rpc("save_quotation", {
    p_id: id,
    p_quote: changes,
    p_items: lines ?? null,
  });
  if (error) {
    const status = error.code === "P0001" ? 409 : error.code === "P0002" ? 404 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ data: { quote: data } }, { status: id === null ? 201 : 200 });
}
