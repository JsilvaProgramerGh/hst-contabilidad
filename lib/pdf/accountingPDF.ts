import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { money, type Pending, type Range, type Sale } from "../accounting";

export function accountingPDF(pending: Pending[], range: Range, metrics?: [string, string][], sales?: Sale[]) {
  const doc = new jsPDF({ compress: true, unit: "mm", format: "a4" });
  const title = metrics ? "Estado de cuenta" : "Facturas pendientes";
  doc.setFontSize(19).setTextColor("#152235").text(title, 14, 19);
  doc.setFontSize(9).text(`HST Contabilidad · ${range.from || "Inicio"} a ${range.to || "Hoy"}`, 14, 26);
  let y = 33;
  const base = {
    theme: "striped" as const,
    margin: { left: 14, right: 14, top: 17, bottom: 18 },
    styles: { fontSize: 8.5, cellPadding: 2, overflow: "linebreak" as const },
    headStyles: { fillColor: "#152235" },
    showHead: "everyPage" as const,
    rowPageBreak: "avoid" as const,
  };
  if (metrics) {
    autoTable(doc, { ...base, startY: y, head: [["Concepto", "Valor"]], body: metrics });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }
  if (sales?.length) {
    autoTable(doc, { ...base, startY: y, head: [["Factura", "Cliente", "Emisión", "Facturado"]],
      body: sales.map((sale) => [sale.number, sale.customer, sale.issued, money(sale.gross)]) });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }
  const total = pending.reduce((sum, row) => sum + row.outstanding, 0);
  const body = pending.flatMap((invoice) => {
    const invoiceRow = [invoice.number || "Sin número", invoice.customer || "Sin nombre",
      [invoice.issued || "Fecha sin datos", invoice.due ? `Vence ${invoice.due}` : "Sin vencimiento"].join("\n"),
      money(invoice.gross), money(invoice.paid), money(invoice.outstanding)];
    return [
      invoiceRow,
      ...(invoice.lines.length ? invoice.lines : [{ product: "Detalle de productos sin registrar", qty: null }])
        .map(({ product, qty }) => [invoice.number || "Sin número", { content: `${product}${qty === null ? "" : `  ×  ${qty}`}`, colSpan: 5 }]),
    ];
  });
  autoTable(doc, { ...base, startY: y,
    head: [["Factura", "Cliente", "Emisión / vencimiento", "Total", "Pagado", "Pendiente"]],
    body: body.length ? body : [[{ content: "Sin facturas pendientes", colSpan: 6 }]],
    foot: [[{ content: `${pending.length} facturas · Total pendiente`, colSpan: 5 }, money(total)]],
    showFoot: "lastPage", footStyles: { fillColor: "#155e63" },
    columnStyles: { 0: { cellWidth: 27 }, 1: { cellWidth: 43 }, 2: { cellWidth: 40 },
      3: { cellWidth: 24, halign: "right" }, 4: { cellWidth: 24, halign: "right" }, 5: { cellWidth: 24, halign: "right" } },
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page).setFontSize(8).setTextColor("#465a6e");
    doc.text(`Página ${page} de ${pages}`, 196, 287, { align: "right" });
  }
  return doc;
}
