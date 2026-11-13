import { parseProductImport, PRODUCT_IMPORT_HEADERS } from "./quote-product-import";

export const guideHeaders = PRODUCT_IMPORT_HEADERS.slice(0, 5);
export const extractionPrompt = `Extrae de la factura adjunta solo los productos, sin precios ni datos personales. Devuelve únicamente TSV (tabulaciones reales), una fila por producto y este encabezado exacto:
${guideHeaders.join("\t")}
Conserva ceros iniciales. Producto y cantidad son obligatorios. Si no puedes leerlos, indícalo antes de generar el TSV. Deja vacías las otras celdas si faltan, conservando sus tabulaciones. Usa descripciones de una sola línea y cantidades sin separador de miles.`;

export type GuideItem = { code: string; product: string; details: string; quantity: string; presentation: string };
export type Sender = { name: string; ruc: string; email: string; origin: string; logo: string };
export type Vehicle = { plate: string; vehicleType: string; color: string; driver: string; driverId: string };
export type Destination = { company: string; ruc: string; address: string; receiver: string };
export type SenderProfileId = "hst" | "agrosilva" | `custom-${string}`;
export type Guide = {
  id: string; number: string; brand: SenderProfileId; sender: Sender; vehicle: Vehicle; destination: Destination;
  dispatchDate: string; dispatchTime: string; deliveryDate: string; deliveryTime: string;
  invoice: string; order: string; packages: string; receivedBy: string; receivedDate: string;
  receivedTime: string; condition: "" | "conforme" | "observaciones"; observations: string; signature: string;
  items: GuideItem[];
};

export const emptySender: Sender = { name: "", ruc: "", email: "", origin: "", logo: "" };
export const agroSender: Sender = { ...emptySender, name: "Agrosilva", logo: "/agrosilva.svg" };
export const emptyVehicle: Vehicle = { plate: "", vehicleType: "", color: "", driver: "", driverId: "" };
export const emptyDestination: Destination = { company: "", ruc: "", address: "", receiver: "" };
export const emptyItem: GuideItem = { code: "", product: "", details: "", quantity: "", presentation: "" };

export function newGuide(sender: Sender): Guide {
  return {
    id: "", number: "", brand: "hst", sender, vehicle: emptyVehicle, destination: emptyDestination,
    dispatchDate: "", dispatchTime: "", deliveryDate: "", deliveryTime: "", invoice: "", order: "", packages: "",
    receivedBy: "", receivedDate: "", receivedTime: "", condition: "", observations: "", signature: "",
    items: [{ ...emptyItem }],
  };
}

export function parseGuideItems(text: string) {
  const lines = text.split(/\r\n|\n|\r/);
  const header = lines.findIndex((line) => line.replace(/^\uFEFF/, "").trim());
  for (let index = header; index >= 0 && index < lines.length; index++) {
    if (lines[index].trim()) lines[index] += index === header ? `\t${PRODUCT_IMPORT_HEADERS[5]}` : "\t";
  }
  const parsed = parseProductImport(lines.join("\n"));
  return {
    errors: parsed.errors,
    items: parsed.products.map((row) => ({
      code: row.code, product: row.description, details: row.details, quantity: row.qty, presentation: row.presentation,
    })),
  };
}

export function populatedItems(items: GuideItem[]) {
  return items.filter((item) => Object.values(item).some((value) => value.trim()));
}

export function validateGuide(guide: Guide) {
  const dates = [guide.dispatchDate, guide.deliveryDate, guide.receivedDate];
  const times = [guide.dispatchTime, guide.deliveryTime, guide.receivedTime];
  for (const date of dates.filter(Boolean)) {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.valueOf()) ||
        parsed.toISOString().slice(0, 10) !== date) return "Revisa las fechas ingresadas.";
  }
  if (times.some((time) => time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))) return "Revisa las horas ingresadas.";

  const beforeDispatch = (date: string, time: string) => Boolean(date && guide.dispatchDate &&
    (date < guide.dispatchDate || (date === guide.dispatchDate && time && guide.dispatchTime && time < guide.dispatchTime)));
  if (beforeDispatch(guide.deliveryDate, guide.deliveryTime)) return "La entrega prevista no puede ser anterior a la salida.";
  if (beforeDispatch(guide.receivedDate, guide.receivedTime)) return "La recepción no puede ser anterior a la salida.";

  if (guide.items.some(({ quantity }) => {
    const value = quantity.trim();
    const numeric = Number(value.replace(",", "."));
    return value && (!/^\d+(?:[.,]\d+)?$/.test(value) || !Number.isFinite(numeric) || numeric <= 0);
  })) return "Las cantidades ingresadas deben ser números mayores que cero.";
  return "";
}
