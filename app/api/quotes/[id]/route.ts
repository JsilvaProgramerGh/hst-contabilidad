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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const payload = (await request.json()) as {
      quote?: Record<string, unknown>;
      items?: Array<{
        qty: number;
        description: string;
        unit: number;
        incl_vat: boolean;
      }>;
    };

    const quote = payload?.quote ?? {};
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const sb = supabaseServer();

    const quoteUpdate = {
      ...quote,
      client_name: typeof quote.client_name === "string" ? quote.client_name.trim() || null : undefined,
      client_id: typeof quote.client_id === "string" ? quote.client_id.trim() || null : undefined,
      client_phone: typeof quote.client_phone === "string" ? quote.client_phone.trim() || null : undefined,
      client_email: typeof quote.client_email === "string" ? quote.client_email.trim() || null : undefined,
      client_address: typeof quote.client_address === "string" ? quote.client_address.trim() || null : undefined,
      terms: typeof quote.terms === "string" ? quote.terms.trim() || null : undefined,
      notes: typeof quote.notes === "string" ? quote.notes.trim() || null : undefined,
      pdf_url: typeof quote.pdf_url === "string" ? quote.pdf_url.trim() || null : quote.pdf_url === null ? null : undefined,
    };

    const cleanUpdate = Object.fromEntries(
      Object.entries(quoteUpdate).filter(([, value]) => value !== undefined),
    );

    const { data: quoteRow, error: quoteError } = await sb.from("quotes").update(cleanUpdate).eq("id", id).select("*").single();
    if (quoteError) {
      return NextResponse.json({ error: quoteError.message }, { status: 400 });
    }

    if (items.length) {
      const { error: deleteItemsError } = await sb.from("quote_items").delete().eq("quote_id", id);
      if (deleteItemsError) {
        return NextResponse.json({ error: deleteItemsError.message }, { status: 400 });
      }

      const itemRows = items.map((item) => ({
        quote_id: id,
        qty: Number(item.qty) || 0,
        description: item.description?.trim() || "",
        unit: Number(item.unit) || 0,
        incl_vat: Boolean(item.incl_vat),
      }));

      const { error: insertItemsError } = await sb.from("quote_items").insert(itemRows);
      if (insertItemsError) {
        return NextResponse.json({ error: insertItemsError.message }, { status: 400 });
      }
    }

    return NextResponse.json({ data: { quote: quoteRow } });
  } catch (error) {
    return NextResponse.json({ error: getMessage(error) }, { status: 500 });
  }
}
