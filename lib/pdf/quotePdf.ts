// lib/pdf/quotePdf.ts
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Quote = {
  quote_no: string;
  created_at?: string;
  validity_days?: number;
  client_name?: string;
  client_id?: string;
  client_phone?: string;
  client_email?: string;
  client_address?: string;
  notes?: string;
  subtotal?: number;
  iva?: number;
  discount?: number;
  delivery?: number;
  paid?: number;
  total?: number;
};

type QuoteItem = {
  qty: number;
  description: string;
  unit_price: number;
  iva?: boolean; // true/false
};

async function fetchAsDataURL(src: string) {
  const res = await fetch(src);
  const blob = await res.blob();
  return await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

function money(n: number) {
  const x = Number(n || 0);
  return `$ ${x.toFixed(2)}`;
}

export async function generateQuotePDF(quote: Quote, items: QuoteItem[]) {
  const doc = new jsPDF("p", "mm", "a4");

  // Márgenes
  const LEFT = 14;
  const RIGHT = 196; // aprox
  let y = 14;

  // Logo (si existe)
  try {
    const logoDataUrl = await fetchAsDataURL("/logo-hst.png");
    // (x, y, w, h)
    doc.addImage(logoDataUrl, "PNG", LEFT, y, 22, 22);
  } catch {
    // si no encuentra logo, no rompe el PDF
  }

  // Encabezado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("COTIZACIÓN", 80, y + 8);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("HST GLOBAL STORE", LEFT + 26, y + 8);
  doc.text("WhatsApp: 0982124443", LEFT + 26, y + 13);

  // Caja derecha (No / Fecha / Validez)
  const boxX = 130;
  const boxY = y;
  doc.setDrawColor(30);
  doc.roundedRect(boxX, boxY, 66, 24, 2, 2);
  doc.setFont("helvetica", "bold");
  doc.text("N°:", boxX + 4, boxY + 7);
  doc.text("Fecha:", boxX + 4, boxY + 13);
  doc.text("Validez:", boxX + 4, boxY + 19);

  doc.setFont("helvetica", "normal");
  const fecha = quote.created_at ? new Date(quote.created_at) : new Date();
  doc.text(String(quote.quote_no || "-"), boxX + 20, boxY + 7);
  doc.text(fecha.toISOString().slice(0, 10), boxX + 20, boxY + 13);
  doc.text(`${quote.validity_days ?? 15} días`, boxX + 20, boxY + 19);

  y += 32;

  // Datos del cliente
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Datos del cliente", LEFT, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  y += 6;
  doc.text(`Nombre: ${quote.client_name || "-"}`, LEFT, y);
  y += 5;
  doc.text(`CI/RUC: ${quote.client_id || "-"}`, LEFT, y);
  y += 5;
  doc.text(`Teléfono: ${quote.client_phone || "-"}`, LEFT, y);
  y += 5;
  doc.text(`Email: ${quote.client_email || "-"}`, LEFT, y);
  y += 5;
  doc.text(`Dirección: ${quote.client_address || "-"}`, LEFT, y);

  y += 8;

  // Tabla items
  const body = (items || []).map((it) => {
    const qty = Number(it.qty || 0);
    const unit = Number(it.unit_price || 0);
    const total = qty * unit;
    return [
      String(qty),
      it.description || "Producto / Servicio",
      money(unit),
      it.iva ? "Sí" : "No",
      money(total),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["Cant.", "Descripción", "P. Unitario", "IVA", "Total"]],
    body,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [20, 20, 20], textColor: 255 },
    columnStyles: {
      0: { halign: "center", cellWidth: 16 },
      1: { cellWidth: 90 },
      2: { halign: "right", cellWidth: 28 },
      3: { halign: "center", cellWidth: 16 },
      4: { halign: "right", cellWidth: 28 },
    },
  });

  // Totales
  const finalY = (doc as any).lastAutoTable.finalY + 8;

  const subtotal = Number(quote.subtotal ?? 0);
  const iva = Number(quote.iva ?? 0);
  const discount = Number(quote.discount ?? 0);
  const delivery = Number(quote.delivery ?? 0);
  const total = Number(quote.total ?? subtotal + iva - discount + delivery);
  const paid = Number(quote.paid ?? 0);
  const balance = total - paid;

  const totalsX = 120;
  let ty = finalY;

  doc.setFont("helvetica", "bold");
  doc.text("Subtotal:", totalsX, ty);
  doc.text(money(subtotal), RIGHT, ty, { align: "right" });

  ty += 6;
  doc.text("IVA:", totalsX, ty);
  doc.text(money(iva), RIGHT, ty, { align: "right" });

  ty += 6;
  doc.text("Descuento:", totalsX, ty);
  doc.text(money(discount), RIGHT, ty, { align: "right" });

  ty += 6;
  doc.text("Delivery:", totalsX, ty);
  doc.text(money(delivery), RIGHT, ty, { align: "right" });

  ty += 7;
  doc.setFontSize(12);
  doc.text("Total:", totalsX, ty);
  doc.text(money(total), RIGHT, ty, { align: "right" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  ty += 10;
  doc.text(`Pagado: ${money(paid)}`, totalsX, ty);
  ty += 6;
  doc.text(`Saldo: ${money(balance)}`, totalsX, ty);

  // Notas
  const notesY = Math.max(ty + 10, finalY);
  doc.setFont("helvetica", "bold");
  doc.text("Notas:", LEFT, notesY);
  doc.setFont("helvetica", "normal");
  doc.text(String(quote.notes || "-"), LEFT, notesY + 6);

  // Descargar
  const name = quote.quote_no ? `${quote.quote_no}.pdf` : `COTIZACION.pdf`;
  doc.save(name);
}