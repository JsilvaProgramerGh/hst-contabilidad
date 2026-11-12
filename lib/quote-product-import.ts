export const PRODUCT_IMPORT_HEADERS = [
  "Código", "Producto", "Descripción", "Cantidad", "Unidad / presentación", "Precio unitario",
] as const;

type Header = (typeof PRODUCT_IMPORT_HEADERS)[number];

export type ImportedProduct = {
  code: string;
  description: string;
  details: string;
  qty: string;
  presentation: string;
  supplierPrice: string | null;
};

export type ProductImport = {
  products: ImportedProduct[];
  errors: string[];
};

function readCells(line: string): string[] | null {
  const cell = /(?:"((?:[^"]|"")*)"|([^"\t][^\t]*|))(\t|$)/gy;
  const values: string[] = [];
  while (true) {
    const match = cell.exec(line);
    if (!match) return null;
    values.push((match[1]?.replaceAll('""', '"') ?? match[2]).trim());
    if (!match[3]) return values;
  }
}

function normalizeNumber(value: string): string | null {
  let normalized: string;
  if (/^\d{1,3}(?:,\d{3})+\.\d+$/.test(value)) {
    normalized = value.replaceAll(",", "");
  } else if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(value)) {
    normalized = value.replaceAll(".", "").replace(",", ".");
  } else if (/^\d+(?:[.,]\d+)?$/.test(value) && !/^[1-9]\d{0,2}[.,]\d{3}$/.test(value)) {
    normalized = value.replace(",", ".");
  } else {
    return null;
  }

  // Keep the decimal as text until it reaches the quotation's existing numeric inputs.
  const significant = normalized.replace(".", "").replace(/^0+|0+$/g, "");
  const number = Number(normalized);
  if (!Number.isFinite(number) || number > Number.MAX_SAFE_INTEGER ||
      (number === 0 && significant.length > 0) || significant.length > 15) return null;
  return normalized;
}

export function parseProductImport(text: string): ProductImport {
  const products: ImportedProduct[] = [];
  const errors: string[] = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  const start = lines.findIndex((line) => line.trim());
  if (start === -1) return { products, errors: ["Pega el encabezado y al menos un producto."] };

  const headers = readCells(lines[start]);
  const positions = new Map<Header, number>();
  if (!headers) return { products, errors: ["El encabezado contiene comillas sin cerrar o celdas mal separadas."] };

  headers.forEach((cell, index) => {
    const header = PRODUCT_IMPORT_HEADERS.find((name) => name.toLowerCase() === cell.normalize("NFC").toLowerCase());
    if (!header) errors.push(`Columna ${index + 1}: encabezado desconocido. Separa las columnas con tabulaciones.`);
    else if (positions.has(header)) errors.push(`El encabezado «${header}» está repetido.`);
    else positions.set(header, index);
  });

  const missing = PRODUCT_IMPORT_HEADERS.filter((header) => !positions.has(header));
  if (missing.length) errors.push(`Faltan encabezados: ${missing.join(", ")}.`);
  if (errors.length) return { products, errors };

  for (let index = start + 1; index < lines.length; index++) {
    if (!lines[index].trim()) continue;
    const cells = readCells(lines[index]);
    const line = `Fila ${index + 1}`;
    if (!cells || cells.length !== headers.length) {
      errors.push(`${line}: se esperaban ${headers.length} celdas en una sola línea.`);
      continue;
    }

    const value = (header: Header) => cells[positions.get(header)!];
    const description = value("Producto");
    const qty = normalizeNumber(value("Cantidad"));
    const price = value("Precio unitario");
    const supplierPrice = price ? normalizeNumber(price) : null;
    const problems: string[] = [];
    if (!description) problems.push("falta el producto");
    if (qty === null || Number(qty) <= 0) problems.push("cantidad inválida (usa un número mayor que cero)");
    if (price && supplierPrice === null) problems.push("precio inválido (usa un número sin moneda y con decimales claros)");
    if (problems.length || qty === null) {
      errors.push(`${line}: ${problems.join("; ")}.`);
      continue;
    }

    products.push({
      code: value("Código"),
      description,
      details: value("Descripción"),
      qty,
      presentation: value("Unidad / presentación"),
      supplierPrice,
    });
  }

  if (!products.length && !errors.length) errors.push("Agrega al menos un producto debajo del encabezado.");
  return { products, errors };
}
