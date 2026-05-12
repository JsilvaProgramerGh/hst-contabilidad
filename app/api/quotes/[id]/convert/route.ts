import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

type ReceiptStatus =
  | "PENDIENTE_PAGO"
  | "ABONADO"
  | "PAGADO"
  | "PENDIENTE_ENTREGA"
  | "ENTREGADO"
  | "ANULADO";

const allowedStatuses: ReceiptStatus[] = [
  "PENDIENTE_PAGO",
  "ABONADO",
  "PAGADO",
  "PENDIENTE_ENTREGA",
  "ENTREGADO",
  "ANULADO",
];

function nextReceiptNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rnd = Math.floor(Math.random() * 900 + 100);
  return `REC-${y}${m}${day}-${rnd}`;
}

function getMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

function coerceReceiptStatus(value: unknown): ReceiptStatus {
  const raw = String(value || "").trim().toUpperCase() as ReceiptStatus;
  return allowedStatuses.includes(raw) ? raw : "PENDIENTE_PAGO";
}

function canSyncDelivery(quote: {
  client_name?: string | null;
  client_address?: string | null;
}, deliveryDate?: string | null) {
  return Boolean(deliveryDate?.trim() && quote.client_name?.trim() && quote.client_address?.trim());
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const sb = supabaseServer();
    const { data: receipt, error } = await sb
      .from("invoices")
      .select("*")
      .eq("quote_id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: { receipt: receipt ?? null } });
  } catch (error) {
    return NextResponse.json({ error: getMessage(error) }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      status?: ReceiptStatus;
      delivery_date?: string | null;
      delivery_time?: string | null;
    };

    const sb = supabaseServer();
    const { data: quote, error: quoteError } = await sb
      .from("quotes")
      .select("*")
      .eq("id", id)
      .single();

    if (quoteError) {
      return NextResponse.json({ error: quoteError.message }, { status: 404 });
    }

    const { data: quoteItems, error: itemsError } = await sb
      .from("quote_items")
      .select("qty,unit,incl_vat")
      .eq("quote_id", id);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 400 });
    }

    const receiptStatus = coerceReceiptStatus(body.status);
    const deliveryDate = body.delivery_date?.trim() || null;
    const deliveryTime = body.delivery_time?.trim() || null;
    const ivaRate = Number(quote.iva_rate ?? 0) || 0;
    const subtotal = (quoteItems || []).reduce(
      (sum, item) => sum + Number(item.qty || 0) * Number(item.unit || 0),
      0,
    );
    const iva = (quoteItems || []).reduce((sum, item) => {
      const line = Number(item.qty || 0) * Number(item.unit || 0);
      return sum + (item.incl_vat ? line * ivaRate : 0);
    }, 0);
    const total = Math.max(
      0,
      subtotal - Number(quote.discount || 0) + iva + Number(quote.delivery || 0),
    );

    const { data: existingReceipt, error: existingError } = await sb
      .from("invoices")
      .select("*")
      .eq("quote_id", id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 400 });
    }

    const receiptPayload = {
      quote_id: id,
      invoice_no: existingReceipt?.invoice_no || nextReceiptNo(),
      receipt_status: receiptStatus,
      delivery_date: deliveryDate,
      delivery_time: deliveryTime,
      client_name: quote.client_name?.trim() || null,
      client_phone: quote.client_phone?.trim() || null,
      client_email: quote.client_email?.trim() || null,
      client_address: quote.client_address?.trim() || null,
      total: Number(total.toFixed(2)),
      updated_at: new Date().toISOString(),
    };

    const receiptResult = existingReceipt?.id
      ? await sb.from("invoices").update(receiptPayload).eq("id", existingReceipt.id).select("*").single()
      : await sb
          .from("invoices")
          .insert({
            ...receiptPayload,
            created_at: new Date().toISOString(),
          })
          .select("*")
          .single();

    if (receiptResult.error) {
      return NextResponse.json(
        {
          error:
            "No pude guardar el recibo. Si falta la nueva estructura, corre el SQL de receipts-upgrade.sql. " +
            receiptResult.error.message,
        },
        { status: 400 },
      );
    }

    const receipt = receiptResult.data;
    let deliveryOrder = null;
    let deliveryMessage = "";

    if (canSyncDelivery(quote, deliveryDate)) {
      const deliveryPayload = {
        delivery_date: deliveryDate,
        client_name: quote.client_name?.trim() || "Cliente",
        phone: quote.client_phone?.trim() || null,
        address: quote.client_address?.trim() || "Por definir",
        reference: `Recibo ${receipt.invoice_no}`,
        notes: `Creado desde cotizacion ${quote.quote_no}`,
        amount: Number(total.toFixed(2)),
        time_window: deliveryTime,
        status: receiptStatus === "ENTREGADO" ? "ENTREGADO" : "PENDIENTE",
        source_quote_id: id,
        source_invoice_id: receipt.id,
        source_kind: "RECIBO",
      };

      const { data: existingOrder, error: existingOrderError } = await sb
        .from("delivery_orders")
        .select("id")
        .eq("source_invoice_id", receipt.id)
        .maybeSingle();

      if (existingOrderError) {
        deliveryMessage = existingOrderError.message;
      } else {
        const deliveryResult = existingOrder?.id
          ? await sb
              .from("delivery_orders")
              .update(deliveryPayload)
              .eq("id", existingOrder.id)
              .select("*")
              .single()
          : await sb.from("delivery_orders").insert(deliveryPayload).select("*").single();

        if (deliveryResult.error) {
          deliveryMessage = deliveryResult.error.message;
        } else {
          deliveryOrder = deliveryResult.data;
        }
      }
    } else if (deliveryDate) {
      deliveryMessage = "Falta direccion del cliente para crear el envio automaticamente.";
    }

    return NextResponse.json({
      data: {
        receipt,
        delivery_order: deliveryOrder,
        delivery_message: deliveryMessage || null,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: getMessage(error) }, { status: 500 });
  }
}
