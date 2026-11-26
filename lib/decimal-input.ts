/** Accept either decimal separator; never silently guess a thousands separator. */
export function decimalInput(value: unknown, scale = 2): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const text = raw.replace(',', '.');
  if (!/^\d*\.?\d*$/.test(text) || !/\d/.test(text) || (text.split('.')[1]?.length ?? 0) > scale) {
    throw new Error(`Usa un número como 125,50 o 125.50, sin separadores de miles y con máximo ${scale} decimales.`);
  }
  const [integer, fraction] = text.split('.');
  return (integer || '0').replace(/^0+(?=\d)/, '') + (fraction ? '.' + fraction : '');
}

export function normalizeAccountingValues(values: Record<string, unknown>) {
  const result = { ...values };
  for (const name of ['gross','vat','discount','amount','opening_main','opening_petty','opening_capital','working_reserve','other_reserve','tax_reserve','qty','eligible']) {
    if (Object.hasOwn(result,name)) result[name] = decimalInput(result[name], ['qty','eligible'].includes(name) ? 4 : 2);
  }
  if (Array.isArray(result.lines)) result.lines = result.lines.map(line => ({ ...line, qty: decimalInput(line.qty,4) }));
  return result;
}
