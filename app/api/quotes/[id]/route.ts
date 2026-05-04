import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

function getMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const sb = supabaseServer();
    const { data: quote, error } = await sb.from("quotes").select("*").eq("id", id).single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    const { data: items, error: itemsError } = await sb.from("quote_items").select("*").eq("quote_id", id);
    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 400 });
    }

    return NextResponse.json({ data: { quote, items: items ?? [] } });
  } catch (error) {
    return NextResponse.json({ error: getMessage(error) }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const sb = supabaseServer();
    const { error: itemsError } = await sb.from("quote_items").delete().eq("quote_id", id);
    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 400 });
    }

    const { error } = await sb.from("quotes").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: getMessage(error) }, { status: 500 });
  }
}
