import { NextResponse } from "next/server";
import { supabaseServer } from "../../lib/supabase-server";

export async function GET() {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("quotes")
    .select("id, quote_no, date, client_name, created_at, pdf_url")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const sb = supabaseServer();
  const body = await req.json();

  const { quote, items } = body as { quote: any; items: any[] };

  const { data: q, error: qErr } = await sb
    .from("quotes")
    .upsert([{ ...quote, updated_at: new Date().toISOString() }], { onConflict: "quote_no" })
    .select("*")
    .single();

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 400 });

  // Reemplazar items
  const { error: delErr } = await sb.from("quote_items").delete().eq("quote_id", q.id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

  const payload = (items || []).map((it) => ({
    quote_id: q.id,
    qty: it.qty,
    description: it.description,
    unit: it.unit,
    incl_vat: it.incl_vat,
  }));

  const { error: insErr } = await sb.from("quote_items").insert(payload);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

  return NextResponse.json({ data: { quote: q } });
}