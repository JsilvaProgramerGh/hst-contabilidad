import { jsPDF } from "jspdf";
import type { QuoteCompanyProfile } from "../quote-company-profile";

type QuotePdfLine = {
  description: string;
  code?: string;
  details?: string;
  presentation?: string;
  qty: number;
  unit: number;
  sub: number;
};

export type QuotePdfData = {
  number: string;
  date: string;
  validDays?: number;
  company: QuoteCompanyProfile | null;
  customer: { name: string; id: string; email: string; phone: string; address: string };
  lines: QuotePdfLine[];
  notes: string;
  terms: string;
  ivaRate: number;
  totals: {
    subtotal: number; iva: number; disc: number; del: number;
    totalFinal: number; paidVal: number; saldo: number;
  };
  logo?: string | null;
  photos?: (string | null)[];
};

const navy = "#152235";
const teal = "#155e63";
const gray = "#465a6e";
const border = "#d7e0e5";
const pale = "#eff3f4";
const left = 16;
const right = 194;
const width = right - left;
const top = 16;
const logoWidth = 36;
const logoHeight = 32;
const bottom = 273;
const lineHeight = 4.2;
const padding = 2.2;

type TextStyle = { size?: number; bold?: boolean; color?: string; serif?: boolean };
type Line = { text: string; style: TextStyle };
type PdfImage = { source: string; width: number; height: number; format: string };

function textStyle(doc: jsPDF, { size = 9, bold, color = navy, serif }: TextStyle = {}) {
  doc.setFont(serif ? "times" : "helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(color);
}

function readImage(doc: jsPDF, source?: string | null): PdfImage | null {
  if (!source) return null;
  try {
    const { width, height, fileType } = doc.getImageProperties(source);
    if (width > 0 && height > 0 && ["PNG", "JPEG"].includes(fileType)) {
      return { source, width, height, format: fileType };
    }
  } catch {
    // A broken or unsupported image is treated as an absent photo.
  }
  return null;
}

function drawImage(doc: jsPDF, image: PdfImage, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / image.width, h / image.height);
  const drawnW = image.width * scale;
  const drawnH = image.height * scale;
  doc.addImage(image.source, image.format, x + (w - drawnW) / 2, y + (h - drawnH) / 2, drawnW, drawnH);
}

function amount(value: number) {
  const finite = Number.isFinite(value) ? value : 0;
  const formatted = Math.abs(finite) > Number.MAX_SAFE_INTEGER
    ? finite.toExponential(2)
    : finite.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$ ${formatted}`;
}

function configuredValue(value?: string) {
  return (value ?? "").replace(/^(ruc|whatsapp|tel[eé]fono|email|correo|direcci[oó]n|ciudad|sitio web)\s*:\s*/i, "").trim();
}

export function generateQuotePDF(data: QuotePdfData) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const { company, customer, totals } = data;
  const logo = readImage(doc, data.logo);
  const imageCache = new Map<string, PdfImage | null>();
  const photos = data.lines.map((_, i) => {
    const source = data.photos?.[i];
    if (!source) return null;
    if (!imageCache.has(source)) imageCache.set(source, readImage(doc, source));
    return imageCache.get(source) ?? null;
  });
  const showPhotos = photos.some(Boolean);
  const validDays = data.validDays ?? 15;
  let y = top;

  function write(text: string, x: number, baseline: number, style?: TextStyle, align: "left" | "right" | "center" = "left") {
    textStyle(doc, style);
    doc.text(text, x, baseline, { align });
  }

  function wrap(text: string, maxWidth: number, style: TextStyle = {}): Line[] {
    textStyle(doc, style);
    const lines: string[] = doc.splitTextToSize(text, maxWidth);
    return lines.map((part) => ({ text: part, style }));
  }

  const numberLabel = data.number ? `N.º ${data.number}` : "Borrador";
  const wideNumber = wrap(numberLabel, 61, { size: 10, bold: true }).length > 1;
  const quoteLabel = wideNumber ? "Cotización" : `Cotización · ${numberLabel}`;

  function rule(at: number) {
    doc.setDrawColor(border);
    doc.setLineWidth(0.2);
    doc.line(left, at, right, at);
  }

  function nextPage() {
    doc.addPage();
    write(quoteLabel, right, top, { bold: true }, "right");
    rule(top + 4);
    y = top + 9;
  }

  function ensureSpace(height: number) {
    if (y + height > bottom) nextPage();
  }

  function paragraph(lines: Line[], x = left) {
    for (const line of lines) {
      ensureSpace(lineHeight);
      write(line.text, x, y + 3.1, line.style);
      y += lineHeight;
    }
  }

  write("Cotización", right, top + 6, { size: 25, bold: true }, "right");
  if (!wideNumber) write(numberLabel, right, top + 14, { size: 10, bold: true, color: teal }, "right");

  const companyX = left + (logo ? logoWidth + 5 : 0);
  const companyWidth = 126 - companyX;
  if (logo) drawImage(doc, logo, left, top, logoWidth, logoHeight);
  if (company?.name) {
    const nameLines = wrap(company.name, companyWidth, { size: 15, serif: true });
    for (const line of nameLines) {
      ensureSpace(6);
      write(line.text, companyX, y + 4.5, line.style);
      y += 6;
    }
  }
  const contacts = [
    ["RUC", company?.ruc], ["WhatsApp", company?.phone], ["Correo", company?.email],
    ["Dirección", company?.address], ["Ciudad", company?.city], ["Sitio web", company?.website],
  ];
  for (const [label, value] of contacts) {
    const clean = configuredValue(value);
    if (!clean || !label) continue;
    ensureSpace(lineHeight);
    write(label, companyX, y + 3.1, { size: 8, bold: true, color: gray });
    paragraph(wrap(clean, companyWidth - 21, { size: 8 }), companyX + 21);
  }
  y = Math.max(y, top + (logo ? logoHeight + 1 : 18)) + 4;
  ensureSpace(16);
  rule(y);
  write("Fecha de emisión", left, y + 7, { size: 8, bold: true, color: gray });
  write("Validez", left + 62, y + 7, { size: 8, bold: true, color: gray });
  const issueDate = new Date(`${data.date}T00:00:00Z`);
  const formattedDate = Number.isNaN(issueDate.getTime()) ? "" : issueDate.toLocaleDateString("es-EC", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
  write(formattedDate, left, y + 13);
  write(`${validDays} días`, left + 62, y + 13);
  y += 20;
  if (wideNumber) {
    paragraph(wrap(numberLabel, width, { bold: true, color: teal }));
    y += 5;
  }

  ensureSpace(17);
  doc.setFillColor(pale);
  doc.rect(left, y, width, 8, "F");
  write("Datos del cliente", left + 5, y + 5.3, { size: 11, bold: true });
  y += 8;
  const customerFields = [
    ["Nombre o razón social", customer.name], ["CI / RUC", customer.id],
    ["Correo electrónico", customer.email], ["Teléfono", customer.phone], ["Dirección", customer.address],
  ];
  for (const [label, value] of customerFields) {
    const lines = wrap(value || "-", width - 52);
    ensureSpace(Math.min(lines.length, 2) * lineHeight + 1);
    write(label, left + 5, y + 3.1, { size: 8, bold: true, color: gray });
    paragraph(lines, left + 47);
  }
  y += 8;

  const columns = [
    { label: "Código", width: 20 },
    ...(showPhotos ? [{ label: "Imagen", width: 17, align: "center" as const }] : []),
    { label: "Producto y descripción", width: showPhotos ? 52 : 69 },
    { label: "Cantidad", width: 18, align: "right" as const },
    { label: "Unidad / presentación", width: 29 },
    { label: "P. unitario", width: 20, align: "right" as const },
    { label: "P. total", width: 22, align: "right" as const },
  ];
  const headerHeight = 9;
  const minimumRow = 9;
  function tableHeader() {
    let x = left;
    doc.setFillColor(navy);
    doc.rect(left, y, width, headerHeight, "F");
    for (const column of columns) {
      const xText = column.align === "right" ? x + column.width - padding
        : column.align === "center" ? x + column.width / 2 : x + padding;
      write(column.label, xText, y + 5.7, { size: 7.5, bold: true, color: "#ffffff" }, column.align);
      x += column.width;
    }
    y += headerHeight;
  }

  data.lines.forEach((item, index) => {
    const photo = photos[index];
    const descriptionWidth = (showPhotos ? 52 : 69) - padding * 2;
    const cells = [
      wrap(item.code || "-", columns[0].width - padding * 2, { size: 8, color: gray }),
      ...(showPhotos ? [photo ? [] : wrap("Sin imagen", 17 - padding * 2, { size: 6.4, color: gray })] : []),
      [
        ...wrap(item.description || "-", descriptionWidth, { bold: true }),
        ...(item.details ? wrap(item.details, descriptionWidth, { size: 8, color: gray }) : []),
      ],
      wrap(String(item.qty), 18 - padding * 2),
      wrap(item.presentation || "-", 29 - padding * 2),
      wrap(amount(item.unit), 20 - padding * 2),
      wrap(amount(item.sub), 22 - padding * 2),
    ];
    const count = Math.max(...cells.map((cell) => cell.length));
    const rowHeight = Math.max(photo ? 15 : minimumRow, count * lineHeight + padding * 2);
    const maxBody = bottom - (top + 9 + headerHeight);
    const startTablePage = () => {
      nextPage();
      tableHeader();
    };

    if (index === 0) {
      const firstRowHeight = rowHeight <= maxBody ? rowHeight : photo ? 15 : minimumRow;
      if (firstRowHeight > maxBody - 7) {
        ensureSpace(headerHeight + firstRowHeight);
      } else {
        ensureSpace(7 + headerHeight + firstRowHeight);
        write("Detalle de la cotización", left, y + 3.5, { size: 11, bold: true });
        y += 7;
      }
      tableHeader();
    } else if (rowHeight <= maxBody && y + rowHeight > bottom) {
      startTablePage();
    } else if (rowHeight > maxBody && y + (photo ? 15 : minimumRow) > bottom) {
      startTablePage();
    }
    let offset = 0;
    while (offset < count) {
      const minHeight = offset === 0 && photo ? 15 : minimumRow;
      if (y + minHeight > bottom) startTablePage();
      const capacity = Math.floor((bottom - y - padding * 2) / lineHeight);
      const take = Math.min(capacity, count - offset);
      const height = Math.max(minHeight, take * lineHeight + padding * 2);

      let x = left;
      columns.forEach((column, colIndex) => {
        doc.setFillColor(index % 2 ? pale : "#ffffff");
        doc.setDrawColor(border);
        doc.setLineWidth(0.2);
        doc.rect(x, y, column.width, height, "FD");
        const xText = column.align === "right" ? x + column.width - padding
          : column.align === "center" ? x + column.width / 2 : x + padding;
        cells[colIndex].slice(offset, offset + take).forEach((line, i) => {
          write(line.text, xText, y + padding + 3 + i * lineHeight, line.style, column.align);
        });
        if (showPhotos && colIndex === 1 && photo && offset === 0) {
          drawImage(doc, photo, x + 2, y + 2, column.width - 4, 11);
        }
        x += column.width;
      });
      y += height;
      offset += take;
    }
  });

  y += 9;
  ensureSpace(60);
  const summaryX = 113;
  const summaryWidth = right - summaryX;
  const summaryTop = y;
  const summary = [
    ["Subtotal", amount(totals.subtotal)], [`IVA (${Math.round(data.ivaRate * 100)}%)`, amount(totals.iva)],
    ["Descuento", `- ${amount(totals.disc)}`], ["Envío", amount(totals.del)],
    ["Total", amount(totals.totalFinal)], ["Pagado", amount(totals.paidVal)],
    ["Saldo pendiente", amount(totals.saldo)],
  ];
  for (const [label, value] of summary) {
    const total = label === "Total";
    const height = total ? 13 : 6;
    if (total) {
      doc.setFillColor(teal);
      doc.roundedRect(summaryX, y, summaryWidth, height, 2, 2, "F");
    }
    write(label, summaryX + 4, y + (total ? 8 : 4), {
      bold: total || label === "Saldo pendiente", color: total ? "#ffffff" : gray,
    });
    write(value, right - 4, y + (total ? 8 : 4), {
      size: total ? 15 : 9, bold: total || label === "Saldo pendiente", color: total ? "#ffffff" : navy,
    }, "right");
    y += height;
  }

  // The closing sections share a page when possible. Long notes flow across
  // additional pages in their own column, keeping the summary clear.
  y = summaryTop;
  write("Condiciones comerciales", left, y + 4, { size: 11, bold: true });
  y += 7;
  const conditions = [
    `Cotización válida durante ${validDays} días desde su emisión.`,
    "No se aceptan cambios ni devoluciones.",
    "Se requiere el pago del 100 % antes de iniciar la producción o realizar cualquier envío.",
  ];
  for (const condition of conditions) {
    ensureSpace(lineHeight);
    write("•", left, y + 3.1, { color: teal });
    paragraph(wrap(condition, 87, { color: gray }), left + 4);
    y += 2;
  }
  if (data.terms.trim()) {
    ensureSpace(11);
    write("Condiciones adicionales", left, y + 4, { bold: true });
    y += 6;
    paragraph(wrap(data.terms, 91, { color: gray }));
    y += 3;
  }
  if (data.notes.trim()) {
    ensureSpace(11);
    write("Notas", left, y + 4, { bold: true });
    y += 6;
    paragraph(wrap(data.notes, 91, { color: gray }));
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    rule(281);
    const footerName = company?.name ? wrap(company.name.replace(/\s+/g, " "), 120, { size: 8, bold: true })[0] : null;
    if (footerName) write(footerName.text, left, 288, { ...footerName.style, color: gray });
    write(`Página ${page} de ${pages}`, right, 288, { size: 8, color: gray }, "right");
  }
  return doc;
}
