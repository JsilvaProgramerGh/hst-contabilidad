import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

type QuotePayload = {
  quote: {
    quote_no: string;
    date: string;
    valid_days: number;
    client_name: string;
    client_id: string;
    client_phone: string;
    client_email: string;
    client_address: string;
    iva_rate: number;
    discount: number;
    delivery: number;
    paid: number;
    terms: string;
    notes: string;
    pdf_url?: string;
  };
  items: Array<{
    qty: number;
    description: string;
    unit: number;
    incl_vat: boolean;
  }>;
};

function getMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const sb = supabaseServer();

    if (id) {
      const { data: quote, error } = await sb.from("quotes").select("*").eq("id", id).single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      const { data: items, error: itemsError } = await sb.from("quote_items").select("*").eq("quote_id", id);
      if (itemsError) {
        return NextResponse.json({ error: itemsError.message }, { status: 400 });
      }

      return NextResponse.json({ data: { quote, items: items ?? [] } });
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
    const payload = (await request.json()) as QuotePayload;
    const quote = payload?.quote;
    const items = Array.isArray(payload?.items) ? payload.items : [];

    if (!quote?.quote_no?.trim()) {
      return NextResponse.json({ error: "El numero de cotizacion es obligatorio." }, { status: 400 });
    }

    if (!items.length) {
      return NextResponse.json({ error: "Agrega al menos una linea a la cotizacion." }, { status: 400 });
    }

    const sb = supabaseServer();
    const quoteInsert = {
      ...quote,
      client_name: quote.client_name?.trim() || null,
      client_id: quote.client_id?.trim() || null,
      client_phone: quote.client_phone?.trim() || null,
      client_email: quote.client_email?.trim() || null,
      client_address: quote.client_address?.trim() || null,
      terms: quote.terms?.trim() || null,
      notes: quote.notes?.trim() || null,
      pdf_url: quote.pdf_url?.trim() || null,
    };

    const { data: quoteRow, error: quoteError } = await sb.from("quotes").insert(quoteInsert).select("*").single();
    if (quoteError) {
      return NextResponse.json({ error: quoteError.message }, { status: 400 });
    }

    const itemRows = items.map((item) => ({
      quote_id: quoteRow.id,
      qty: Number(item.qty) || 0,
      description: item.description?.trim() || "",
      unit: Number(item.unit) || 0,
      incl_vat: Boolean(item.incl_vat),
    }));

    const { error: itemError } = await sb.from("quote_items").insert(itemRows);
    if (itemError) {
      await sb.from("quotes").delete().eq("id", quoteRow.id);
      return NextResponse.json({ error: itemError.message }, { status: 400 });
    }

    return NextResponse.json({ data: { quote: quoteRow } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: getMessage(error) }, { status: 500 });
  }
}
