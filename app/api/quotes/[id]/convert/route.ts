import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

function nextInvoiceNo() {
  const m = String(new Date().getMonth() + 1).padStart(2, "0");
  const day = String(new Date().getDate()).padStart(2, "0");
  const rnd = Math.floor(Math.random() * 900 + 100);
  return `FAC-${m}${day}-${rnd}`;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const invoiceNo = nextInvoiceNo();

    // ✅ IMPORTANTE: crear el cliente y usarlo
    const sb = supabaseServer(); // si tu helper fuera async: const sb = await supabaseServer();

    const { data, error } = await sb
      .from("invoices")
      .insert({
        quote_id: id,
        invoice_no: invoiceNo,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({
      data: {
        invoice_id: data.id,
        invoice_no: data.invoice_no,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err }, { status: 500 });
  }
}