import { createHash } from "node:crypto";
import { supabaseServer } from "@/lib/supabase-server";
import { ecuadorDate, pendingInvoices, recordDate, type Allocation, type Ledger, type Movement, type Line, type Payment, type Purchase, type Sale, type Share } from "@/lib/accounting";

type Row = Record<string, unknown>;
const string = (value: unknown) => String(value ?? "");
const number = (value: unknown) => Number(value);
const moneyOrNull = (value: unknown) => value === null || value === undefined ? null : number(value);
type Client = ReturnType<typeof supabaseServer>;
export const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");
export const tokenFormat = /^[a-f0-9]{64}$/;

async function rows<T>(db: Client, table: string, columns: string, order: string, secondary?: string) {
  const all: T[] = [];
  for (let index = 0; ; index += 500) {
    let query = db.from(table).select(columns).order(order);
    if (secondary) query = query.order(secondary);
    const { data, error } = await query.range(index, index + 499);
    if (error) throw error;
    all.push(...(data as unknown as T[]));
    if (data.length < 500) return all;
  }
}

async function invoiceLedger(db: Client) {
  const [sales, old, lines, payments, oldPayments, details] = await Promise.all([
    rows<Omit<Sale, "lines"> & { pdf_path: string | null }>(db, "account_sales", "*", "id"),
    rows<Row>(db, "facturas", "id,numero,cliente,monto,iva,fecha,created_at,estado,pdf_url", "id"),
    rows<Line & { sale_id: string }>(db, "account_sale_lines", "*", "sale_id", "line"),
    rows<Payment>(db, "account_payments", "*", "id"),
    rows<Row>(db, "pagos_factura", "id,factura_id,monto,fecha,nota", "id"),
    rows<{ legacy_id: string; due: string | null; lines: Omit<Line, "line">[] }>(db, "account_legacy_details", "*", "legacy_id"),
  ]);
  const oldDetails = new Map(details.map((item) => [string(item.legacy_id), item]));
  const products = new Map<string, Line[]>();
  for (const { sale_id, ...line } of lines) {
    const list = products.get(sale_id) ?? [];
    list.push({ ...line, qty: number(line.qty) });
    products.set(sale_id, list);
  }
  const normalized: Sale[] = sales.map(({ pdf_path, ...sale }) => ({ ...sale, attachment: Boolean(pdf_path), gross: number(sale.gross), vat: moneyOrNull(sale.vat),
    discount: moneyOrNull(sale.discount), lines: products.get(sale.id) ?? [] }));
  for (const row of old) {
    const id = string(row.id);
    const detail = oldDetails.get(id);
    normalized.push({ id, number: string(row.numero), customer: string(row.cliente),
      issued: recordDate(string(row.fecha || row.created_at)), due: detail?.due ?? null, gross: number(row.monto),
      vat: moneyOrNull(row.iva), discount: null, legacy: true, paidFlag: /^pagad[oa]$/i.test(string(row.estado)),
      attachment: Boolean(row.pdf_url), lines: detail?.lines.map((line, index) => ({ ...line, line: index + 1, qty: number(line.qty) })) ?? [] });
  }
  return {
    sales: normalized.sort((a, b) => b.issued.localeCompare(a.issued) || a.number.localeCompare(b.number)),
    payments: [...payments.map((row) => ({ ...row, legacy_id: row.legacy_id === null ? null : string(row.legacy_id), amount: number(row.amount) })), ...oldPayments.map((row): Payment => ({
      id: "legacy-" + row.id, sale_id: null, legacy_id: string(row.factura_id), purchase_id: null,
      amount: number(row.monto), paid_on: recordDate(string(row.fecha)), note: string(row.nota) || null,
    }))].sort((a, b) => b.paid_on.localeCompare(a.paid_on)),
  };
}

export async function accountingLedger(db: Client): Promise<Ledger> {
  const [invoices, purchases, allocations, transactions, shares, pos, cash] = await Promise.all([
    invoiceLedger(db), rows<Purchase & { pdf_path: string | null }>(db, "account_purchases", "*", "id"),
    rows<Allocation>(db, "account_allocations", "*", "sale_id", "purchase_id"),
    rows<Row>(db, "transactions", "id,type,amount,txn_date,created_at,description", "id"),
    rows<Share>(db, "account_shares", "id,from_date,to_date,expires,revoked", "id"),
    rows<Row>(db, "vw_inv_pos_listado_facturas", "id,fecha,cliente,numero_factura,total", "id"),
    rows<Movement>(db, "account_cash_entries", "*", "id"),
  ]);
  const posSales: Sale[] = pos.filter((row) => row.numero_factura).map((row) => ({
    id: "pos-" + row.id, number: string(row.numero_factura), customer: string(row.cliente),
    issued: recordDate(string(row.fecha)), due: null, gross: number(row.total), vat: null, discount: null, lines: [], pos: true,
  }));
  invoices.sales = [...invoices.sales, ...posSales].sort((a, b) => b.issued.localeCompare(a.issued));
  return {
    ...invoices, shares,
    purchases: purchases.map(({ pdf_path, ...row }) => ({ ...row, attachment: Boolean(pdf_path), qty: number(row.qty), gross: number(row.gross), vat: moneyOrNull(row.vat), eligible: moneyOrNull(row.eligible) })),
    allocations: allocations.map((row) => ({ ...row, qty: number(row.qty) })),
    movements: [...cash.map((row) => ({ ...row, amount: number(row.amount) })), ...transactions.map((row) => ({ id: string(row.id), type: string(row.type), amount: number(row.amount),
      date: recordDate(string(row.txn_date || row.created_at)), description: string(row.description) }))],
  };
}

export async function sharedPending(token: string, db?: Client, today = ecuadorDate()) {
  if (!tokenFormat.test(token)) return null;
  const client = db ?? supabaseServer();
  const { data, error } = await client.from("account_shares").select("from_date,to_date")
    .eq("digest", tokenDigest(token)).eq("revoked", false).gte("expires", today).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // The public report receives only the receivable projection.
  const range = { from: data.from_date ?? "", to: data.to_date ?? "" };
  return { range, pending: pendingInvoices(await invoiceLedger(client), range, today, true) };
}
