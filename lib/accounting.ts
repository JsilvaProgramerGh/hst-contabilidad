export const startDate = "2026-11-24";
export const openingMonth = "2026-11";
export type Range = { from: string; to: string };
export const periods = {
  month: "Este mes", previous: "Mes anterior", days: "Últimos 30 días",
  year: "Este año", custom: "Fechas personalizadas", all: "Todo el historial",
};
export type Period = keyof typeof periods;
export type Line = { line: number; product: string; qty: number };
export type Sale = {
  id: string; number: string; customer: string; issued: string; due: string | null; gross: number;
  vat: number | null; discount: number | null; lines: Line[]; legacy?: boolean; paidFlag?: boolean; attachment?: boolean; pos?: boolean;
};
export type Purchase = {
  id: string; kind: "producto" | "gasto"; supplier: string; reference: string; line_reference: string;
  description: string; issued: string; qty: number; gross: number; vat: number | null; eligible: number | null; attachment?: boolean;
};
export type Payment = {
  id: string; sale_id: string | null; legacy_id: string | null; purchase_id: string | null;
  amount: number; paid_on: string; note: string | null;
};
export type Allocation = { sale_id: string; line: number | null; purchase_id: string; qty: number };
export type Movement = { id: string; type: string; amount: number; date: string; description: string };
export type Share = { id: string; from_date: string | null; to_date: string | null; expires: string; revoked: boolean };
export type Ledger = { sales: Sale[]; purchases: Purchase[]; payments: Payment[]; allocations: Allocation[]; movements: Movement[]; shares: Share[] };
export type Pending = Pick<Sale, "number" | "customer" | "issued" | "due" | "gross" | "lines"> & { paid: number; outstanding: number };

const dateFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" });
export const ecuadorDate = (date = new Date()) => dateFormatter.format(date);
export function recordDate(value: string | null) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  // The legacy dashboard wrote UTC ISO strings into timestamp-without-time-zone columns.
  const legacyUtc = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value);
  const date = new Date(legacyUtc ? value.replace(" ", "T") + "Z" : value);
  return Number.isFinite(date.valueOf()) ? ecuadorDate(date) : "";
}
const dateISO = (date: Date) => date.toISOString().slice(0, 10);

export function rangeFor(period: Period, today: string, custom: Range = { from: "", to: "" }): Range {
  const [year, month, day] = today.split("-").map(Number);
  const calendar = (m: number, d: number) => dateISO(new Date(Date.UTC(year, m, d)));
  if (period === "all") return { from: "", to: "" };
  if (period === "custom") return custom;
  if (period === "previous") return { from: calendar(month - 2, 1), to: calendar(month - 1, 0) };
  if (period === "days") return { from: calendar(month - 1, day - 29), to: today };
  if (period === "year") return { from: calendar(0, 1), to: calendar(11, 31) };
  return { from: calendar(month - 1, 1), to: calendar(month, 0) };
}
export const inRange = (date: string, { from, to }: Range) => Boolean(date && (!from || date >= from) && (!to || date <= to));
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const money = (amount: number | null) => amount === null ? "Sin datos completos" : usd.format(amount);
const round = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
const sum = (values: number[]) => round(values.reduce((total, value) => total + value, 0));
const completeSum = (values: (number | null)[]) => values.includes(null) ? null : sum(values as number[]);

export function paymentsFor(sale: Sale, payments: Payment[]) {
  return payments.filter((pay) => sale.legacy ? pay.legacy_id === sale.id : pay.sale_id === sale.id);
}

export function saleBalance(sale: Sale, payments: Payment[]) {
  const all = paymentsFor(sale, payments);
  const documented = sum(all.map((pay) => pay.amount));
  const paid = sale.paidFlag
    ? Math.max(sale.gross, documented) : documented;
  return { paid, outstanding: Math.max(0, round(sale.gross - paid)) };
}

export function partitionSales(sales: Sale[], payments: Payment[], range: Range, historical: boolean, today: string) {
  const scoped = sales.filter((sale) => inRange(sale.issued, range) && sale.issued <= today);
  const invoiced = scoped.filter((sale) => historical || sale.issued >= startDate);
  const receivableSales = scoped.filter((sale) => {
    if (sale.pos) return false;
    if (historical || sale.issued >= startDate) return true;
    return sale.legacy && sale.issued.startsWith(openingMonth) && saleBalance(sale, payments).outstanding > 0;
  });
  return { invoiced, receivableSales };
}

export function pendingInvoices(ledger: Pick<Ledger, "sales" | "payments">, range: Range, today: string, historical = false): Pending[] {
  const { receivableSales } = partitionSales(ledger.sales, ledger.payments, range, historical, today);
  return receivableSales.flatMap((sale) => {
    const balance = saleBalance(sale, ledger.payments);
    return balance.outstanding > 0 ? [{
      number: sale.number, customer: sale.customer, issued: sale.issued, due: sale.due,
      gross: sale.gross, lines: sale.lines.map(({ line, product, qty }) => ({ line, product, qty })), ...balance,
    }] : [];
  });
}

export function inputCredit(purchase: Purchase) {
  if (purchase.vat === 0 || purchase.eligible === 0) return 0;
  if (purchase.vat === null || purchase.eligible === null) return null;
  return round(purchase.vat * purchase.eligible / 100);
}

export function saleProfit(sale: Sale, purchases: Purchase[], allocations: Allocation[]) {
  const lots = new Map(purchases.map((lot) => [lot.id, lot]));
  const linked = allocations.filter((entry) => entry.sale_id === sale.id);
  const full = sale.lines.length > 0 && sale.lines.every((line) => Math.abs(line.qty -
    linked.filter((row) => row.line === line.line).reduce((total, row) => total + row.qty, 0)) < 0.00005);
  const allocatedCost = (entries: Allocation[]) => completeSum(entries.map((row) => {
    const lot = lots.get(row.purchase_id);
    if (!lot) return null;
    const credit = inputCredit(lot);
    return credit === null ? null : (lot.gross - credit) * row.qty / lot.qty;
  }));
  const netSales = sale.vat === null ? null : round(sale.gross - sale.vat);
  const productCost = full ? allocatedCost(linked.filter((row) => row.line !== null)) : null;
  const expense = allocatedCost(linked.filter((row) => row.line === null));
  const grossProfit = netSales === null || productCost === null ? null : round(netSales - productCost);
  const contribution = grossProfit === null || expense === null ? null : round(grossProfit - expense);
  return { netSales, productCost, grossProfit, expense, contribution, margin: contribution === null || !netSales ? null : contribution / netSales * 100 };
}

export function summarize(ledger: Ledger, range: Range, historical: boolean, today: string) {
  const { invoiced, receivableSales } = partitionSales(ledger.sales, ledger.payments, range, historical, today);
  const within = (date: string) => date <= today && inRange(date, range) && (historical || date >= startDate);
  const purchases = ledger.purchases.filter((row) => within(row.issued));
  const payments = ledger.payments.filter((row) => within(row.paid_on));
  const movements = ledger.movements.filter((row) => within(row.date) && row.type !== "PAGO_FACTURA");
  const output = completeSum(invoiced.map((row) => row.vat));
  const input = completeSum(purchases.map(inputCredit));
  const unclassifiedVAT = movements.some((row) => row.type === "VENTA_DIRECTA");
  const purchaseMap = new Map(ledger.purchases.map((purchase) => [purchase.id, purchase]));
  const paidVAT = completeSum(payments.filter((row) => row.purchase_id).map((row) => {
    const purchase = purchaseMap.get(row.purchase_id!);
    if (!purchase || purchase.vat === null || purchase.gross <= 0) return null;
    return purchase.vat * row.amount / purchase.gross;
  }));
  return {
    invoiced, receivableSales, purchases, payments, movements,
    gross: sum(invoiced.map((row) => row.gross)),
    cashIn: sum([...payments.filter((row) => !row.purchase_id).map((row) => row.amount),
      ...movements.filter((row) => ["VENTA_DIRECTA", "VENTA_POS", "INGRESO_OTRO"].includes(row.type)).map((row) => row.amount)]),
    cashOut: sum([...payments.filter((row) => row.purchase_id).map((row) => row.amount),
      ...movements.filter((row) => row.type === "GASTO").map((row) => row.amount)]),
    outstanding: sum(receivableSales.map((row) => saleBalance(row, ledger.payments).outstanding)),
    payable: sum(purchases.map((row) => Math.max(0, round(row.gross - sum(ledger.payments.filter((pay) => pay.purchase_id === row.id).map((pay) => pay.amount)))))),
    output, input, paidVAT, purchaseVAT: completeSum(purchases.map((row) => row.vat)), unclassifiedVAT,
    vatEstimate: output === null || input === null || unclassifiedVAT ? null : round(output - input),
  };
}
