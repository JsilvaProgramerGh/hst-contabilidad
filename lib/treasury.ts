import { startDate, summarize, saleBalance, saleProfit, type Ledger } from './accounting';

export type TreasurySettings = {
  opening_main: number; opening_petty: number; opening_capital: number;
  working_reserve: number; other_reserve: number; tax_reserve: number | null;
};
export type TreasuryEntry = {
  id: string; kind: 'contribution' | 'capital_return' | 'owner_draw' | 'to_petty' | 'to_main' | 'petty_expense';
  amount: number; date: string; description: string;
};
export type Treasury = { settings: TreasurySettings | null; entries: TreasuryEntry[] };
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function treasurySummary(ledger: Ledger, treasury: Treasury, today: string) {
  const all = summarize(ledger, { from: startDate, to: today }, false, today);
  const entries = treasury.entries.filter(e => e.date >= startDate && e.date <= today);
  const total = (kind: TreasuryEntry['kind']) => entries.filter(e => e.kind === kind).reduce((a, e) => a + e.amount, 0);
  const s = treasury.settings;
  const main = s ? round(s.opening_main + all.cashIn - all.cashOut + total('contribution') - total('capital_return') - total('owner_draw') - total('to_petty') + total('to_main')) : null;
  const petty = s ? round(s.opening_petty + total('to_petty') - total('to_main') - total('petty_expense')) : null;
  const liquid = main === null || petty === null ? null : round(main + petty);
  const capital = s ? round(s.opening_capital + total('contribution') - total('capital_return')) : null;
  // A period filter never resets cash or hides an existing purchase obligation.
  const payable = round(ledger.purchases.filter(p => p.issued <= today).reduce((a,p) => a + Math.max(0,p.gross - ledger.payments.filter(e => e.purchase_id === p.id && e.paid_on <= today).reduce((n,e) => n + e.amount,0)),0));
  const receivable = round(ledger.sales.filter(s => !s.pos && s.issued <= today && (s.issued >= startDate || (s.legacy && s.issued.startsWith('2026-11')))).reduce((a,s) => a + saleBalance(s, ledger.payments.filter(p => p.paid_on <= today)).outstanding,0));
  const tax = s?.tax_reserve ?? (all.vatEstimate === null ? null : Math.max(0, all.vatEstimate));
  const reserved = s && tax !== null ? round(s.working_reserve + s.other_reserve + tax + payable) : null;
  const surplus = liquid === null || reserved === null || main === null || petty === null || main < 0 || petty < 0 ? null : round(liquid - reserved);
  const withdrawable = surplus === null ? null : Math.max(0,surplus);
  return { main, petty, liquid, capital, payable, receivable, tax, reserved, surplus, withdrawable,
    draws: round(total('owner_draw')), contributions: round(total('contribution')) };
}

export function periodContribution(ledger: Ledger, sales: Ledger['sales']) {
  if (!sales.length) return null;
  const profits = sales.map(s => saleProfit(s, ledger.purchases, ledger.allocations).contribution);
  return profits.some(p => p === null) ? null : round((profits as number[]).reduce((a,b) => a+b,0));
}
