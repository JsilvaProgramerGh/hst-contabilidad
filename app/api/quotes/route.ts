import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { saveQuotation } from "@/lib/save-quotation";

function getMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const quoteNo = url.searchParams.get("quote_no");
    const sb = supabaseServer();

    if (id) {
      const { data: quote, error } = await sb.from("quotes").select("*").eq("id", id).single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      const { data: items, error: itemsError } = await sb.from("quote_items").select("*").eq("quote_id", id).order("line_position", { nullsFirst: false });
      if (itemsError) {
        return NextResponse.json({ error: itemsError.message }, { status: 400 });
      }

      return NextResponse.json({ data: { quote, items: items ?? [] } });
    }

    if (quoteNo) {
      const { data: quote, error } = await sb.from("quotes").select("*").eq("quote_no", quoteNo).maybeSingle();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ data: { quote: quote ?? null } });
    }

    const { data: quotes, error } = await sb.from("quotes").select("*").order("created_at", { ascending: false }).limit(50);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: { quotes: quotes ?? [] } });
  } catch (error) {
    return NextResponse.json({ error: getMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    return await saveQuotation(request);
  } catch (error) {
    return NextResponse.json({ error: getMessage(error) }, { status: 500 });
  }
}
