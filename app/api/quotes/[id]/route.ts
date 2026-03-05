import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase-server";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const sb = supabaseServer();

  const { data: quote, error: qErr } = await sb
    .from("quotes")
    .select("*")
    .eq("id", params.id)
    .single();

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 400 });

  const { data: items, error: iErr } = await sb
    .from("quote_items")
    .select("qty, description, unit, incl_vat")
    .eq("quote_id", params.id)
    .order("created_at", { ascending: true });

  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 });

  return NextResponse.json({ data: { quote, items } });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const sb = supabaseServer();

  const { error } = await sb.from("quotes").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}