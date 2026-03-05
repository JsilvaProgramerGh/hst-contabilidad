import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    // opcional: ?id=UUID para traer una cotización específica
    const id = url.searchParams.get("id");

    if (id) {
      const { data: quote, error } = await supabaseServer
        .from("quotes")
        .select("*")
        .eq("id", id)
        .single();

      if (error) return NextResponse.json({ error }, { status: 400 });

      const { data: items } = await supabaseServer
        .from("quote_items")
        .select("*")
        .eq("quote_id", id);

      return NextResponse.json({ data: { quote, items: items || [] } });
    }

    // listado de cotizaciones (últimas 50)
    const { data: quotes, error } = await supabaseServer
      .from("quotes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error }, { status: 400 });

    return NextResponse.json({ data: { quotes: quotes || [] } });
  } catch (err) {
    return NextResponse.json({ error: err }, { status: 500 });
  }
}