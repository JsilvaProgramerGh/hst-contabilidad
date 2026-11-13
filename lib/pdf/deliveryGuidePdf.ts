import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { emptyItem, type Guide } from "../delivery-guide";

const navy = "#152235";
const gray = "#465a6e";
const teal = "#155e63";
const pale = "#edf2f3";
const border = "#cbd8e0";
const margin = 15.5;
const right = 194.5;
const width = right - margin;
const bottom = 273;
const sectionHeight = 7;
const labelHeight = 4;
const fieldGap = 3;
const valueLineHeight = 4.4;
const writingHeight = 6.2;

export function generateDeliveryGuide(guide: Guide, logo?: string | null) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  let y = 10;

  function style(size = 9, bold = false, color = navy, font = "helvetica") {
    doc.setFont(font, bold ? "bold" : "normal").setFontSize(size).setTextColor(color);
  }
  function draw(value: string, x: number, baseline: number, size = 9, bold = false, color = navy) {
    style(size, bold, color);
    doc.text(value, x, baseline);
  }
  function nextPage() {
    doc.addPage();
    draw("Guía de entrega", margin, 14, 12, true);
    y = 21;
  }
  function ensure(height: number) {
    if (y + height > bottom) nextPage();
  }
  function image(data: string, x: number, top: number, w: number, h: number) {
    try {
      const info = doc.getImageProperties(data);
      const scale = Math.min(w / info.width, h / info.height);
      const iw = info.width * scale, ih = info.height * scale;
      doc.addImage(data, info.fileType, x + (w - iw) / 2, top + (h - ih) / 2, iw, ih);
    } catch {
      // A missing or invalid logo must not prevent dispatch.
    }
  }
  function paragraph(value: string, x: number, max: number, size = 9, bold = false, color = navy, font = "helvetica") {
    style(size, bold, color, font);
    const lines: string[] = doc.splitTextToSize(value, max);
    for (const line of lines) {
      ensure(4.5);
      style(size, bold, color, font);
      doc.text(line, x, y + 3);
      y += 4.5;
    }
  }
  const formatDate = (date: string) => {
    const formatted = date ? new Date(`${date}T00:00:00Z`).toLocaleDateString("es-EC", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    }) : "";
    return formatted;
  };
  function prepareRows(rows: [string, string][][]) {
    return rows.map((row) => {
      const columnWidth = width / row.length;
      style();
      const columns = row.map(([label, value]) => ({
        label,
        blank: !value.trim(),
        lines: doc.splitTextToSize(value.trim(), columnWidth - 10) as string[],
      }));
      const count = Math.max(1, ...columns.map(({ lines }) => lines.length));
      const firstHeight = columns.some(({ blank }) => blank) ? writingHeight : valueLineHeight;
      return { columnWidth, columns, count, firstHeight, height: labelHeight + firstHeight + (count - 1) * valueLineHeight };
    });
  }

  function fieldRows(title: string, rows: [string, string][][], shaded = true) {
    const prepared = prepareRows(rows);
    ensure((title ? sectionHeight : 0) + labelHeight + prepared[0].firstHeight);
    if (title) {
      if (shaded) {
        doc.setFillColor(pale);
        doc.roundedRect(margin, y, width, sectionHeight, 2, 2, "F");
      }
      draw(title, margin + (shaded ? 5 : 0), y + 5, 11, true);
      y += sectionHeight;
    }
    for (const { columnWidth, columns, count, firstHeight } of prepared) {
      ensure(labelHeight + firstHeight);
      if (shaded) doc.setFillColor(pale).rect(margin, y, width, labelHeight, "F");
      columns.forEach(({ label }, index) => draw(label, margin + index * columnWidth + (shaded ? 5 : 0), y + 3, 8, true, gray));
      y += labelHeight;
      for (let line = 0; line < count; line++) {
        const height = line === 0 ? firstHeight : valueLineHeight;
        ensure(height);
        if (shaded) doc.setFillColor(pale).rect(margin, y, width, height, "F");
        columns.forEach(({ lines, blank }, index) => {
          const x = margin + index * columnWidth + (shaded ? 5 : 0);
          if (blank && line === 0) doc.setDrawColor(gray).setLineWidth(.15).line(x, y + 5, x + columnWidth - 10, y + 5);
          else if (lines[line]) draw(lines[line], x, y + 3.1);
        });
        y += height;
      }
    }
    y += fieldGap;
  }

  style(24, true);
  doc.text("Guía de entrega", right, 15, { align: "right" });
  style(11, true, teal);
  doc.text(guide.number ? `N.º ${guide.number}` : "Borrador", right, 22, { align: "right" });
  if (logo) image(logo, margin, 9, 26, 16);
  const brandX = margin + (logo ? 31 : 0);
  paragraph(guide.sender.name, brandX, 111 - brandX, 14, false, navy, "times");
  if (guide.sender.ruc) paragraph(`RUC ${guide.sender.ruc}`, brandX, 111 - brandX, 8, false, gray);
  if (guide.brand !== "agrosilva" && guide.sender.email) paragraph(guide.sender.email, brandX, 111 - brandX, 8, false, gray);
  y = Math.max(y + 4, 29);
  doc.setDrawColor(border).line(margin, y, right, y);
  y += 4;

  fieldRows("Despacho y transporte", [
    [["Remitente", guide.sender.name], ["Conductor / transportista", guide.vehicle.driver]],
    [["Punto de partida", guide.sender.origin], ["Identificación del conductor", guide.vehicle.driverId]],
    [["Fecha de salida", formatDate(guide.dispatchDate)], ["Hora de salida", guide.dispatchTime], ["Placa", guide.vehicle.plate]],
    [["Tipo y color del vehículo", [guide.vehicle.vehicleType, guide.vehicle.color].filter(Boolean).join(" · ")]],
  ]);
  fieldRows("Destino y entrega", [
    [["Empresa destinataria", guide.destination.company], ["RUC del destinatario", guide.destination.ruc]],
    [["Dirección de entrega", guide.destination.address], ["Recepción prevista", guide.destination.receiver]],
    [["Fecha prevista de entrega", formatDate(guide.deliveryDate)], ["Hora prevista de entrega", guide.deliveryTime]],
  ]);
  fieldRows("", [[["Factura de referencia", guide.invoice], ["Orden de compra", guide.order], ["Bultos", guide.packages]]], false);

  const items = guide.items.some((item) => Object.values(item).some((value) => value.trim()))
    ? guide.items : Array.from({ length: Math.max(3, guide.items.length) }, () => emptyItem);
  ensure(27);
  draw("Mercadería entregada", margin, y + 4, 12, true);
  autoTable(doc, {
    startY: y + 8,
    willDrawPage: ({ pageNumber }) => {
      if (pageNumber > 1) draw(["Guía de entrega", guide.number].filter(Boolean).join(" · "), margin, 12, 9, true);
    },
    margin: { left: margin, right: margin, top: 17, bottom: doc.internal.pageSize.getHeight() - bottom },
    head: [["Código", "Producto y descripción", "Cantidad", "Presentación"]],
    body: items.map((item) => [item.code, [item.product, item.details].filter(Boolean).join("\n"), item.quantity, item.presentation]),
    didParseCell: ({ section, cell }) => {
      if (section === "body" && !cell.text.join("").trim()) {
        cell.styles.minCellHeight = 9;
        cell.styles.lineWidth = .15;
      }
    },
    theme: "striped",
    rowPageBreak: "avoid",
    showHead: "everyPage",
    styles: { fontSize: 8.5, cellPadding: { top: 1.35, right: 2, bottom: 1.35, left: 2 }, textColor: navy, overflow: "linebreak", lineColor: border, lineWidth: { bottom: .15 } },
    headStyles: { fillColor: navy, textColor: "#ffffff" },
    bodyStyles: { fillColor: pale },
    alternateRowStyles: { fillColor: "#ffffff" },
    columnStyles: { 0: { cellWidth: 29 }, 1: { cellWidth: 88 }, 2: { cellWidth: 24, halign: "right" }, 3: { cellWidth: 38 } },
  });
  y = ((doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 3;

  const receiptRows: [string, string][][] = [[
    ["Recibido por", guide.receivedBy],
    ["Fecha real de recepción", formatDate(guide.receivedDate)],
    ["Hora real de recepción", guide.receivedTime],
  ]];
  const signatureHeight = 19;
  const afterSignature = 3;
  const observationsStart = 11;
  const blankObservationHeight = 10;
  const observationSpace = guide.observations.trim() ? valueLineHeight : blankObservationHeight;
  const receiptHeight = sectionHeight + prepareRows(receiptRows).reduce((sum, row) => sum + row.height, 0) +
    fieldGap + signatureHeight + afterSignature + observationsStart + observationSpace;
  if (receiptHeight <= bottom - 21) ensure(receiptHeight);
  fieldRows("Constancia de recepción", receiptRows, false);
  ensure(signatureHeight + afterSignature);
  doc.setDrawColor(border).roundedRect(margin, y, width, signatureHeight, 2, 2);
  draw("Firma o sello", margin + 4, y + 5, 8, true, gray);
  if (guide.signature) image(guide.signature, margin + 45, y + 1, width - 50, signatureHeight - 2);
  else doc.line(margin + 45, y + 15, right - 5, y + 15);
  y += signatureHeight + afterSignature;
  ensure(observationsStart + observationSpace);
  const checks = [["conforme", "Recibido conforme"], ["observaciones", "Recibido con observaciones"]];
  checks.forEach(([value, label], index) => {
    const x = margin + index * 57;
    doc.setDrawColor(gray).rect(x, y, 3, 3);
    if (guide.condition === value) draw("X", x + .4, y + 2.7, 8, true);
    draw(label, x + 5, y + 2.8, 8);
  });
  y += 6;
  draw("Observaciones (faltantes, daños o entrega parcial)", margin, y + 3, 8, true, gray);
  y += 5;
  if (guide.observations.trim()) paragraph(guide.observations, margin, width);
  else {
    doc.setDrawColor(border).line(margin, y + 2, right, y + 2);
    doc.line(margin, y + 8, right, y + 8);
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(border).line(margin, 276, right, 276);
    draw("Constancia de entrega · Sin autorización fiscal del SRI", margin, 282, 7, false, gray);
    style(8, false, gray);
    doc.text(`Página ${page} de ${pages}`, right, 282, { align: "right" });
  }
  return doc;
}
