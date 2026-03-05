import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const { data: quote, error } = await supabaseServer
      .from("quotes")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json({ error });
    }

    const { data: items } = await supabaseServer
      .from("quote_items")
      .select("*")
      .eq("quote_id", id);

    return NextResponse.json({
      data: {
        quote,
        items,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err });
  }
}