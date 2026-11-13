import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { populatedItems, type Guide } from "../delivery-guide";

const navy = "#152235";
const gray = "#465a6e";
const teal = "#155e63";
const pale = "#edf2f3";
const border = "#cbd8e0";
const margin = 15.5;
const right = 194.5;
const width = right - margin;
const bottom = 269;

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
  const dateTime = (date: string, time: string) => {
    const formatted = date ? new Date(`${date}T00:00:00Z`).toLocaleDateString("es-EC", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    }) : "";
    return [formatted, time].filter(Boolean).join(" · ");
  };
  function fieldRows(title: string, rows: [string, string][][], shaded = true) {
    ensure((title ? 8 : 0) + 10);
    if (title) {
      if (shaded) {
        doc.setFillColor(pale);
        doc.roundedRect(margin, y, width, 8, 2, 2, "F");
      }
      draw(title, margin + (shaded ? 5 : 0), y + 5.6, 11, true);
      y += 8;
    }
    for (const row of rows) {
      const columnWidth = width / row.length;
      style();
      const columns = row.map(([label, value]) => ({
        label,
        lines: doc.splitTextToSize(value || "________________", columnWidth - 10) as string[],
      }));
      const count = Math.max(...columns.map(({ lines }) => lines.length));
      ensure(9);
      if (shaded) {
        doc.setFillColor(pale);
        doc.rect(margin, y, width, 4.5, "F");
      }
      columns.forEach(({ label }, index) => draw(label, margin + index * columnWidth + (shaded ? 5 : 0), y + 3, 8, true, gray));
      y += 4.5;
      for (let line = 0; line < count; line++) {
        ensure(4.4);
        if (shaded) {
          doc.setFillColor(pale);
          doc.rect(margin, y, width, 4.4, "F");
        }
        columns.forEach(({ lines }, index) => draw(lines[line] ?? "", margin + index * columnWidth + (shaded ? 5 : 0), y + 3.1));
        y += 4.4;
      }
    }
    y += 4;
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
  y = Math.max(y + 4, 33);
  doc.setDrawColor(border).line(margin, y, right, y);
  y += 5.5;

  fieldRows("Despacho y transporte", [
    [["Remitente", guide.sender.name], ["Conductor / transportista", guide.vehicle.driver]],
    [["Punto de partida", guide.sender.origin], ["Identificación del conductor", guide.vehicle.driverId]],
    [["Fecha y hora de salida", dateTime(guide.dispatchDate, guide.dispatchTime)],
      ["Tipo de vehículo y placa", [guide.vehicle.vehicleType, guide.vehicle.color, guide.vehicle.plate].filter(Boolean).join(" · ")]],
  ]);
  fieldRows("Destino y entrega", [
    [["Empresa destinataria", guide.destination.company], ["RUC del destinatario", guide.destination.ruc]],
    [["Dirección de entrega", guide.destination.address], ["Fecha y hora prevista", dateTime(guide.deliveryDate, guide.deliveryTime)]],
    ...(guide.destination.receiver ? [[["Recepción prevista", guide.destination.receiver]] as [string, string][]] : []),
  ]);
  fieldRows("", [[["Factura de referencia", guide.invoice], ["Orden de compra", guide.order], ["Bultos", guide.packages]]], false);

  ensure(23);
  draw("Mercadería entregada", margin, y + 4, 12, true);
  autoTable(doc, {
    startY: y + 8,
    willDrawPage: ({ pageNumber }) => {
      if (pageNumber > 1) draw(["Guía de entrega", guide.number].filter(Boolean).join(" · "), margin, 12, 9, true);
    },
    margin: { left: margin, right: margin, top: 17, bottom: 27 },
    head: [["Código", "Producto y descripción", "Cantidad", "Presentación"]],
    body: populatedItems(guide.items).map((item) => [item.code, [item.product, item.details].filter(Boolean).join("\n"), item.quantity, item.presentation]),
    theme: "striped",
    rowPageBreak: "avoid",
    showHead: "everyPage",
    styles: { fontSize: 8.5, cellPadding: 2, textColor: navy, overflow: "linebreak", lineColor: border, lineWidth: { bottom: .15 } },
    headStyles: { fillColor: navy, textColor: "#ffffff" },
    bodyStyles: { fillColor: pale },
    alternateRowStyles: { fillColor: "#ffffff" },
    columnStyles: { 0: { cellWidth: 29 }, 1: { cellWidth: 88 }, 2: { cellWidth: 24, halign: "right" }, 3: { cellWidth: 38 } },
  });
  y = ((doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 3;

  ensure(48);
  fieldRows("Constancia de recepción", [
    [["Recibido por", guide.receivedBy], ["Fecha y hora real de recepción", dateTime(guide.receivedDate, guide.receivedTime)]],
  ], false);
  ensure(24);
  doc.setDrawColor(border).roundedRect(margin, y, width, 21, 2, 2);
  draw("Firma o sello", margin + 4, y + 5, 8, true, gray);
  if (guide.signature) image(guide.signature, margin + 45, y + 1, width - 50, 19);
  else doc.line(margin + 45, y + 16, right - 5, y + 16);
  y += 24;
  ensure(14);
  const checks = [["conforme", "Recibido conforme"], ["observaciones", "Recibido con observaciones"]];
  checks.forEach(([value, label], index) => {
    const x = margin + index * 57;
    doc.setDrawColor(gray).rect(x, y, 3, 3);
    if (guide.condition === value) draw("X", x + .4, y + 2.7, 8, true);
    draw(label, x + 5, y + 2.8, 8);
  });
  y += 7;
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
