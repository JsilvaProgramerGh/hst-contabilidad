import { normalizeNumber, readCells } from "./quote-product-import";

export const supplierHeaders = ["Proveedor", "RUC", "Referencia", "Fecha", "Válida hasta", "Validez (días)", "Moneda", "Base IVA"];
export const offerHeaders = ["Código", "Producto", "Descripción", "Cantidad", "Presentación", "Contenido", "Unidad base", "Precio unitario", "Disponibilidad"];
export const availabilityLabels = {
  disponible: "Disponible según proforma",
  "no disponible": "No disponible según proforma",
  desconocida: "Disponibilidad no indicada",
};

type Availability = keyof typeof availabilityLabels;
type TaxBasis = "sin IVA" | "con IVA";
export type SupplierOffer = {
  code: string; product: string; details: string; quantity: string | null; presentation: string;
  pack: string | null; unit: string; price: string | null; sourcePrice: string;
  availability: Availability; availabilityNote: string; terms: string[]; identity: string;
  variantId?: string;
};
export type SupplierProforma = {
  supplier: string; ruc: string; reference: string; issued: string | null;
  expires: string | null; validityDays: string | null; currency: string | null; tax: TaxBasis | null;
  items: SupplierOffer[];
};
export type HistoryOffer = Omit<SupplierProforma, "items"> & {
  id: string; line: number; offer: SupplierOffer; supplierId: string | null;
};

const aliases: Record<string, string> = {
  matraces: "matraz", vasos: "vaso", probetas: "probeta", pipetas: "pipeta",
  buretas: "bureta", tubos: "tubo", frascos: "frasco", embudos: "embudo",
  cajas: "caja", unidades: "unidad", piezas: "unidad", pieza: "unidad", und: "unidad",
  mililitros: "ml", mililitro: "ml", litros: "l", litro: "l",
  microlitros: "ul", microlitro: "ul", gramos: "g", gramo: "g",
  kilogramos: "kg", kilogramo: "kg", miligramos: "mg", miligramo: "mg",
  metros: "m", metro: "m", centimetros: "cm", centimetro: "cm", milimetros: "mm", milimetro: "mm",
};
const measures: Record<string, [string, number]> = {
  ml: ["ml", 1], l: ["ml", 1000], ul: ["ml", .001],
  g: ["g", 1], kg: ["g", 1000], mg: ["g", .001],
  mm: ["mm", 1], cm: ["mm", 10], m: ["mm", 1000],
};

export function normalizeText(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

function canonicalTerm(term: string) {
  return Object.hasOwn(aliases, term) ? aliases[term] : term;
}

export function productTerms(value: string) {
  const normalized = normalizeText(value).replace(/[µμ]/g, "u");
  const grouped = normalized.replace(/(?<![\p{L}\p{N}-])(\d+(?:[.,]\d+)?)\s*(ml|ul|kg|mg|mm|cm|[lgm]|mililitros?|microlitros?|litros?|kilogramos?|miligramos?|gramos?|milimetros?|centimetros?|metros?)(?![\p{L}\p{N}])/gu,
    (_, amount: string, unit: string) => {
      const [base, factor] = measures[canonicalTerm(unit)];
      return ` ${Number((Number(amount.replace(",", ".")) * factor).toPrecision(14))}${base} `;
    });
  const qualified = grouped.replace(/\b(clase|modelo|tipo|grado)\s+([a-z\d]+(?:[.,/-][a-z\d]+)*)/g, "$1-$2");
  return (qualified.match(/[a-z\d]+(?:[.,/-][a-z\d]+)*/g) ?? []).map(canonicalTerm).sort();
}

function isoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function parseSupplierProforma(text: string): { proforma?: SupplierProforma; errors: string[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/).map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.trim());
  const errors: string[] = [];
  const header = (index: number, expected: string[]) => {
    const cells = readCells(lines[index]?.line ?? "") ?? [];
    return cells.length === expected.length && cells.every((cell, i) => normalizeText(cell) === normalizeText(expected[i]));
  };
  if (!header(0, supplierHeaders) || !header(2, offerHeaders)) {
    return { errors: ["Usa los dos encabezados del formato, una fila de proveedor y una fila por producto."] };
  }
  const info = readCells(lines[1].line);
  if (!info || info.length !== supplierHeaders.length) return { errors: ["La fila del proveedor debe tener ocho celdas."] };
  const [supplier, ruc, reference, issued, statedExpiry, validityDays, rawCurrency, rawTax] = info;
  const currency = rawCurrency.toUpperCase() || null;
  const taxKey = normalizeText(rawTax);
  const tax = taxKey === "sin iva" ? "sin IVA" : taxKey === "con iva" ? "con IVA" : null;
  if (!supplier) errors.push("Indica el nombre del proveedor.");
  if (ruc && !/^\d{13}$/.test(ruc)) errors.push("El RUC debe tener 13 dígitos o quedar vacío.");
  if ((issued && !isoDate(issued)) || (statedExpiry && !isoDate(statedExpiry))) errors.push("Usa fechas AAAA-MM-DD válidas.");
  if (validityDays && (!/^\d{1,4}$/.test(validityDays) || Number(validityDays) < 1)) errors.push("La validez debe ser un número entero de días mayor que cero.");
  if (currency && !/^[A-Z]{3}$/.test(currency)) errors.push("Usa un código de moneda de tres letras, como USD.");
  if (rawTax && !tax && taxKey !== "desconocida") errors.push("Base IVA: usa sin IVA, con IVA o deja vacío.");
  let expires = statedExpiry || null;
  if (issued && isoDate(issued) && validityDays && /^\d{1,4}$/.test(validityDays)) {
    const date = new Date(`${issued}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + Number(validityDays));
    const calculated = date.toISOString().slice(0, 10);
    if (!isoDate(calculated)) errors.push("La fecha de vencimiento queda fuera del rango admitido.");
    else if (expires && expires !== calculated) errors.push("La fecha de vencimiento y los días de validez no coinciden. Conserva el dato explícito de la fuente.");
    else expires = calculated;
  }
  if (issued && expires && expires < issued) errors.push("El vencimiento es anterior a la fecha de emisión.");
  if (lines.length < 4 || lines.length > 503) errors.push("Pega entre 1 y 500 productos por proforma.");
  const items: SupplierOffer[] = [];
  for (const { line, number } of lines.slice(3, 503)) {
    const cells = readCells(line);
    if (!cells || cells.length !== offerHeaders.length) {
      errors.push(`Fila ${number}: se esperaban nueve celdas en una sola línea.`);
      continue;
    }
    const [code, product, details, rawQty, presentation, rawPack, rawUnit, sourcePrice, availabilityNote] = cells;
    const quantity = rawQty ? normalizeNumber(rawQty) : null;
    const pack = rawPack ? normalizeNumber(rawPack) : null;
    const price = sourcePrice ? normalizeNumber(sourcePrice) : null;
    const unitKey = normalizeText(rawUnit);
    const unit = canonicalTerm(unitKey);
    const availabilityKey = normalizeText(availabilityNote);
    const availability: Availability = availabilityKey === "disponible" || availabilityKey === "no disponible" ? availabilityKey : "desconocida";
    const terms = productTerms(`${product} ${details}`);
    if (!product || !terms.length || (rawQty && (!quantity || Number(quantity) <= 0)) ||
        (rawPack && (!pack || Number(pack) <= 0)) || (sourcePrice && price === null)) {
      errors.push(`Fila ${number}: revisa el producto, la cantidad, el contenido y el precio.`);
      continue;
    }
    items.push({ code, product, details, quantity, presentation, pack, unit, price, sourcePrice, availability, availabilityNote,
      terms: [...new Set(terms)], identity: terms.join(" ") });
  }
  if (errors.length) return { errors };
  return { errors, proforma: { supplier, ruc, reference, issued: issued || null, expires, validityDays: validityDays || null, currency, tax, items } };
}

export function similarity(reference: string[], candidate: string[]) {
  const first = new Set(reference);
  const second = new Set(candidate);
  const shared = [...first].filter((term) => second.has(term)).length;
  return shared / (first.size + second.size - shared || 1);
}

export function comparisonPrice(base: HistoryOffer, candidate: HistoryOffer): number | null {
  const a = base.offer;
  const b = candidate.offer;
  const confirmed = a.variantId && a.variantId === b.variantId;
  const conflict = a.variantId && b.variantId && a.variantId !== b.variantId;
  if (conflict || (!confirmed && a.identity !== b.identity) ||
      !base.currency || base.currency !== candidate.currency || !base.tax || base.tax !== candidate.tax ||
      !a.unit || a.unit !== b.unit || !a.pack || !b.pack || b.price === null) return null;
  const price = Number(b.price) / Number(b.pack);
  return Number.isFinite(price) ? price : null;
}

export function quoteLineFromOffer(offer: SupplierOffer) {
  return { description: offer.product, details: offer.details, code: offer.code, qty: offer.quantity ?? "1",
    presentation: offer.presentation, unit: "", incl_vat: true };
}
