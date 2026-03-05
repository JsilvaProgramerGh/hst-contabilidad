import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    // opcional: ?id=UUID para traer una cotización específica
    const id = url.searchParams.get("id");

    // ✅ IMPORTANTE: crear el cliente (sb) llamando a la función
    const sb = supabaseServer(); // si tu helper fuera async: const sb = await supabaseServer();

    // 1) Traer una cotización específica
    if (id) {
      const { data: quote, error } = await sb
        .from("quotes")
        .select("*")
        .eq("id", id)
        .single();

      if (error) return NextResponse.json({ error }, { status: 400 });

      const { data: items, error: itemsError } = await sb
        .from("quote_items")
        .select("*")
        .eq("quote_id", id);

      if (itemsError) return NextResponse.json({ error: itemsError }, { status: 400 });

      return NextResponse.json({ data: { quote, items: items || [] } });
    }

    // 2) Listado de cotizaciones (últimas 50)
    const { data: quotes, error } = await sb
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