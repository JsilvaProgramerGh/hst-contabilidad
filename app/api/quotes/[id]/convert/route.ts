import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const sb = supabaseServer();

function nextInvoiceNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rnd = Math.floor(Math.random() * 900 + 100);
  return `FAC-${y}${m}${day}-${rnd}`;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const invoiceNo = nextInvoiceNo();

  const { data, error } = await supabaseServer
    .from("invoices")
    .insert({
      quote_id: id,
      invoice_no: invoiceNo,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error });
  }

  return NextResponse.json({
    data: {
      invoice_id: data.id,
      invoice_no: data.invoice_no,
    },
  });
}