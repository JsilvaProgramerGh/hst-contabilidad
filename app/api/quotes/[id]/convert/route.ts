import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

function nextInvoiceNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rnd = String(Math.floor(Math.random() * 900 + 100));
  return `FAC-${y}${m}${day}-${rnd}`;
}

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const sb = supabaseServer();

  const { data: q, error: qErr } = await sb.from("quotes").select("*").eq("id", params.id).single();
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 400 });

  const { data: items, error: iErr } = await sb
    .from("quote_items")
    .select("qty, description, unit, incl_vat")
    .eq("quote_id", params.id);

  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 });

  const invoice_no = nextInvoiceNo();

  const { data: inv, error: invErr } = await sb
    .from("invoices")
    .insert([{
      invoice_no,
      source_quote_id: q.id,
      date: q.date,
      client_name: q.client_name,
      client_id: q.client_id,
      client_phone: q.client_phone,
      client_email: q.client_email,
      client_address: q.client_address,
      iva_rate: q.iva_rate,
      discount: q.discount,
      delivery: q.delivery,
      paid: q.paid,
      notes: q.notes ?? null,
    }])
    .select("*")
    .single();

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 400 });

  const payload = (items ?? []).map((it) => ({
    invoice_id: inv.id,
    qty: it.qty,
    description: it.description,
    unit: it.unit,
    incl_vat: it.incl_vat,
  }));

  const { error: insErr } = await sb.from("invoice_items").insert(payload);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

  return NextResponse.json({ data: { invoice_id: inv.id, invoice_no: inv.invoice_no } });
}