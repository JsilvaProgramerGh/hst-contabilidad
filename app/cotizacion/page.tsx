"use client";

import React, { useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabaseBrowser } from "@/lib/supabase-browser";
type Item = { qty: number; description: string; unit: number; incl_vat: boolean };

const IVA_DEFAULT = 0.15;

const COMPANY = {
  name: "HST GLOBAL STORE",
  ruc: "0962974689001",
  address: "Dirección: Quevedo, calle guatemala y chile",
  city: "Ecuador",
  phone: "WhatsApp: 0982124443",
  email: "Email: hstglobalstoreventas@gmail.com",
  website: "",
  logoPath: "/logo.png",
  sealPath: "/seal.png",
  signPath: "/firma.png",
  accentBlue: [16, 95, 255] as [number, number, number],
};

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function genQuoteNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rnd = String(Math.floor(Math.random() * 900 + 100));
  return `PRO-${y}${m}${day}-${rnd}`;
}

async function urlToDataURL(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export default function CotizacionPRO() {
  const [tab, setTab] = useState<"nueva" | "historial">("nueva");

  const [quoteId, setQuoteId] = useState<string | null>(null);

  const [quoteNo, setQuoteNo] = useState(genQuoteNo());
  const [dateStr, setDateStr] = useState(new Date().toISOString().slice(0, 10));
  const [validDays, setValidDays] = useState(15);

  const [clientName, setClientName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAddress, setClientAddress] = useState("");

  const [ivaRate, setIvaRate] = useState(IVA_DEFAULT);
  const [discount, setDiscount] = useState(0);
  const [delivery, setDelivery] = useState(0);
  const [paid, setPaid] = useState(0);

  const [terms, setTerms] = useState(
    [
      "1.- Duración de la oferta: 15 días.",
      "2.- Anticipo del 50% antes de la producción / ejecución del servicio.",
      "3.- Entregado el producto o ejecutado el servicio no existen devoluciones.",
      "4.- Precios sujetos a disponibilidad y confirmación.",
      "5.- Cambios fuera de alcance se cotizan adicionalmente.",
    ].join("\n")
  );

  const [notes, setNotes] = useState("Gracias por preferirnos.");

  const [items, setItems] = useState<Item[]>([
    { qty: 1, description: "Producto / Servicio", unit: 0, incl_vat: true },
  ]);

  // historial
  const [list, setList] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loadingList, setLoadingList] = useState(false);

  const totals = useMemo(() => {
    const lines = items.map((it) => {
      const qty = Number(it.qty) || 0;
      const unit = Number(it.unit) || 0;
      const sub = qty * unit;
      const vat = it.incl_vat ? sub * ivaRate : 0;
      const unitWithVat = it.incl_vat ? unit * (1 + ivaRate) : unit;
      const total = sub + vat;
      return { ...it, qty, unit, sub, vat, unitWithVat, total };
    });

    const subtotal = lines.reduce((a, b) => a + b.sub, 0);
    const iva = lines.reduce((a, b) => a + b.vat, 0);

    const disc = Math.max(0, Number(discount) || 0);
    const del = Math.max(0, Number(delivery) || 0);
    const neto = Math.max(0, subtotal - disc);
    const totalFinal = Math.max(0, neto + iva + del);

    const paidVal = Math.max(0, Number(paid) || 0);
    const saldo = Math.max(0, totalFinal - paidVal);

    return { lines, subtotal, iva, disc, neto, del, totalFinal, paidVal, saldo };
  }, [items, ivaRate, discount, delivery, paid]);

  const exportingRef = useRef(false);

  const buildPDF = async () => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 12;

    const logo = await urlToDataURL(COMPANY.logoPath);
    const seal = await urlToDataURL(COMPANY.sealPath);
    const sign = await urlToDataURL(COMPANY.signPath);

    doc.setFillColor(...COMPANY.accentBlue);
    doc.rect(0, 0, pageW, 8, "F");

    let y = 18;

    if (logo) doc.addImage(logo, "PNG", margin, y - 8, 32, 32);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("COTIZACIÓN / PROFORMA", margin + (logo ? 38 : 0), y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const companyLines = [
      COMPANY.name,
      COMPANY.ruc,
      COMPANY.address,
      COMPANY.city,
      COMPANY.phone,
      COMPANY.email,
      COMPANY.website,
    ].filter(Boolean);

    companyLines.forEach((l, i) => doc.text(String(l), margin + (logo ? 38 : 0), y + 6 + i * 4));

    const boxW = 72;
    const boxX = pageW - margin - boxW;
    const boxY = 14;
    doc.setDrawColor(30);
    doc.setLineWidth(0.3);
    doc.rect(boxX, boxY, boxW, 28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("DATOS", boxX + 4, boxY + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`N°: ${quoteNo}`, boxX + 4, boxY + 12);
    doc.text(`Fecha: ${dateStr}`, boxX + 4, boxY + 17);
    doc.text(`Validez: ${validDays} días`, boxX + 4, boxY + 22);

    const clientY = 52;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("DATOS DEL CLIENTE", margin, clientY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.rect(margin, clientY + 3, pageW - margin * 2, 22);

    const leftX = margin + 3;
    doc.text(`Nombre: ${clientName || "-"}`, leftX, clientY + 9);
    doc.text(`CI/RUC: ${clientId || "-"}`, pageW / 2, clientY + 9);
    doc.text(`Teléfono: ${clientPhone || "-"}`, leftX, clientY + 14);
    doc.text(`Email: ${clientEmail || "-"}`, pageW / 2, clientY + 14);
    doc.text(`Dirección: ${clientAddress || "-"}`, leftX, clientY + 19);

    const tableY = clientY + 30;

    autoTable(doc, {
      startY: tableY,
      head: [["Cant.", "Descripción", "P. Unitario", "P.U. con IVA", "Total"]],
      body: totals.lines.map((l) => [
        String(l.qty),
        l.description || "-",
        `$ ${money(l.unit)}`,
        `$ ${money(l.unitWithVat)}`,
        `$ ${money(l.total)}`,
      ]),
      styles: { font: "helvetica", fontSize: 9, cellPadding: 2.2, lineWidth: 0.1 },
      headStyles: {
        fillColor: [245, 248, 255],
        textColor: [10, 20, 40],
        fontStyle: "bold",
        lineWidth: 0.1,
      },
      columnStyles: {
        0: { cellWidth: 14, halign: "center" },
        1: { cellWidth: 88 },
        2: { cellWidth: 26, halign: "right" },
        3: { cellWidth: 28, halign: "right" },
        4: { cellWidth: 28, halign: "right" },
      },
    });

    const afterTableY = ((doc as any).lastAutoTable?.finalY ?? tableY + 40) + 6;

    const totalsBoxW = 82;
    const totalsBoxX = pageW - margin - totalsBoxW;
    const totalsBoxY = afterTableY;

    doc.rect(totalsBoxX, totalsBoxY, totalsBoxW, 48);

    const tXLabel = totalsBoxX + 4;
    const tXVal = totalsBoxX + totalsBoxW - 4;

    const line = (label: string, value: string, yy: number, bold = false) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.text(label, tXLabel, yy);
      doc.text(value, tXVal, yy, { align: "right" });
    };

    doc.setFontSize(9);
    let ty = totalsBoxY + 6;
    line("Total parcial:", `$ ${money(totals.subtotal)}`, ty);
    ty += 5;
    line("Descuento:", `- $ ${money(totals.disc)}`, ty);
    ty += 5;
    line("Neto:", `$ ${money(totals.neto)}`, ty, true);
    ty += 5;
    line(`IVA (${Math.round(ivaRate * 100)}%):`, `$ ${money(totals.iva)}`, ty);
    ty += 5;
    line("Envío / Delivery:", `$ ${money(totals.del)}`, ty);
    ty += 5;
    line("TOTAL FINAL:", `$ ${money(totals.totalFinal)}`, ty, true);
    ty += 6;
    line("Pagado:", `$ ${money(totals.paidVal)}`, ty);
    ty += 5;
    line("Saldo:", `$ ${money(totals.saldo)}`, ty, true);

    let textY = totalsBoxY + 54;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("NOTAS", margin, textY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(notes || "-", pageW - margin * 2), margin, textY + 5);

    textY += 18;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("TÉRMINOS Y CONDICIONES", margin, textY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize((terms || "-").trim(), pageW - margin * 2), margin, textY + 5);

    const footerY = 270;
    if (sign) doc.addImage(sign, "PNG", pageW - margin - 55, footerY - 18, 50, 18);
    if (seal) doc.addImage(seal, "PNG", pageW - margin - 28, footerY - 8, 24, 24);

    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`${COMPANY.name} — Documento generado desde HST Contabilidad`, margin, 289);
    doc.setTextColor(0);

    return doc;
  };

  const downloadPDF = async () => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    try {
      const doc = await buildPDF();
      doc.save(`${quoteNo}.pdf`);
    } finally {
      exportingRef.current = false;
    }
  };

  const uploadPDFandGetUrl = async (): Promise<string | null> => {
    const sb = supabaseBrowser();
    const doc = await buildPDF();
    const blob = doc.output("blob") as unknown as Blob;
    const path = `quotes/${quoteNo}.pdf`;

    const { error } = await sb.storage.from("docs").upload(path, blob, {
      upsert: true,
      contentType: "application/pdf",
    });

    if (error) {
      alert("No se pudo subir el PDF a Storage: " + error.message);
      return null;
    }

    const { data } = sb.storage.from("docs").getPublicUrl(path);
    return data.publicUrl || null;
  };

  const saveQuote = async (alsoUploadPdf: boolean) => {
    let pdf_url: string | null = null;
    if (alsoUploadPdf) pdf_url = await uploadPDFandGetUrl();

    const payload = {
      quote: {
        quote_no: quoteNo,
        date: dateStr,
        valid_days: validDays,
        client_name: clientName,
        client_id: clientId,
        client_phone: clientPhone,
        client_email: clientEmail,
        client_address: clientAddress,
        iva_rate: ivaRate,
        discount,
        delivery,
        paid,
        terms,
        notes,
        pdf_url: pdf_url ?? undefined,
      },
      items: items.map((it) => ({
        qty: it.qty,
        description: it.description,
        unit: it.unit,
        incl_vat: it.incl_vat,
      })),
    };

    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) return alert(json.error || "Error guardando cotización");

    const id = json?.data?.quote?.id ?? null;
    setQuoteId(id);

    alert(alsoUploadPdf ? "✅ Guardado + PDF subido (link listo para compartir)." : "✅ Cotización guardada.");
  };

  const loadList = async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/quotes");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");

      const arr =
        Array.isArray(json?.data) ? json.data : Array.isArray(json?.data?.quotes) ? json.data.quotes : [];

      setList(arr);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoadingList(false);
    }
  };

  const openQuote = async (id: string) => {
    const res = await fetch(`/api/quotes/${id}`);
    const json = await res.json();
    if (!res.ok) return alert(json.error || "Error cargando");

    const q = json.data.quote;
    const its = json.data.items as any[];

    setQuoteId(q.id);
    setQuoteNo(q.quote_no);
    setDateStr(String(q.date));
    setValidDays(q.valid_days);

    setClientName(q.client_name || "");
    setClientId(q.client_id || "");
    setClientPhone(q.client_phone || "");
    setClientEmail(q.client_email || "");
    setClientAddress(q.client_address || "");

    setIvaRate(Number(q.iva_rate ?? IVA_DEFAULT));
    setDiscount(Number(q.discount ?? 0));
    setDelivery(Number(q.delivery ?? 0));
    setPaid(Number(q.paid ?? 0));

    setTerms(q.terms || "");
    setNotes(q.notes || "");

    setItems(
      (its || []).map((x) => ({
        qty: Number(x.qty ?? 1),
        description: String(x.description ?? ""),
        unit: Number(x.unit ?? 0),
        incl_vat: Boolean(x.incl_vat ?? true),
      }))
    );

    setTab("nueva");
  };

  const duplicateAsNew = () => {
    setQuoteId(null);
    setQuoteNo(genQuoteNo());
    alert("✅ Duplicado listo. Guarda como nueva cotización.");
  };

  const deleteQuote = async (id: string) => {
    if (!confirm("¿Eliminar esta cotización?")) return;
    const res = await fetch(`/api/quotes/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) return alert(json.error || "Error eliminando");
    await loadList();
  };

  const convertToInvoice = async () => {
    if (!quoteId) return alert("Primero guarda la cotización.");
    const res = await fetch(`/api/quotes/${quoteId}/convert`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) return alert(json.error || "Error convirtiendo");
    alert(`✅ Convertido a FACTURA ${json.data.invoice_no}`);
  };

  const whatsappShare = async () => {
    let link: string | null = null;

    if (quoteId) {
      const r = await fetch(`/api/quotes/${quoteId}`);
      const j = await r.json();
      if (r.ok) link = j?.data?.quote?.pdf_url || null;
    }
    if (!link) link = await uploadPDFandGetUrl();

    const msg = [
      `*${COMPANY.name}*`,
      `Cotización: *${quoteNo}*`,
      `Cliente: ${clientName || "-"}`,
      `Total: $ ${money(totals.totalFinal)}`,
      link ? `PDF: ${link}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const emailSend = async () => {
    if (!quoteId) return alert("Primero guarda la cotización.");
    if (!clientEmail?.trim()) return alert("Falta el email del cliente.");

    let link: string | null = null;

    try {
      const r = await fetch(`/api/quotes/${quoteId}`);
      const j = await r.json();
      if (r.ok) link = j?.data?.quote?.pdf_url || null;
    } catch {}

    if (!link) link = await uploadPDFandGetUrl();

    const r = await fetch(`/api/quotes/${quoteId}/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: clientEmail, pdf_url: link }),
    });

    const j = await r.json();

    if (!r.ok) return alert(j.error || "Error enviando email");

    alert("✅ Cotización enviada al correo del cliente.");
  };

  const addItem = () => setItems((p) => [...p, { qty: 1, description: "", unit: 0, incl_vat: true }]);
  const removeItem = (idx: number) => setItems((p) => p.filter((_, i) => i !== idx));
  const updateItem = (idx: number, patch: Partial<Item>) =>
    setItems((p) => p.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (x) =>
        String(x.quote_no).toLowerCase().includes(s) ||
        String(x.client_name || "").toLowerCase().includes(s)
    );
  }, [list, search]);

  return (
    <div style={{ padding: 18, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 34, margin: 0 }}>🧾 Cotización PRO</h1>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setTab("nueva")} style={tabBtn(tab === "nueva")}>
            Nueva
          </button>
          <button
            onClick={() => {
              setTab("historial");
              loadList();
            }}
            style={tabBtn(tab === "historial")}
          >
            Historial
          </button>
        </div>
      </div>

      <div style={{ color: "#9aa0a6", marginTop: 6 }}>
        Logo: <b>/public/logo.png</b> — Firma: <b>/public/firma.png</b> — Sello: <b>/public/seal.png</b> (opcionales)
      </div>

      {tab === "historial" ? (
        <div style={{ ...card(), marginTop: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 900 }}>📚 Historial de cotizaciones</div>
            <button onClick={loadList} style={btn()}>
              ↻ Actualizar
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <input
              style={input()}
              placeholder="Buscar por N° o cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead>
                <tr style={{ background: "#0b1220" }}>
                  <Th>N°</Th>
                  <Th>Fecha</Th>
                  <Th>Cliente</Th>
                  <Th>PDF</Th>
                  <Th style={{ textAlign: "right" }}></Th>
                </tr>
              </thead>

              <tbody>
                {loadingList ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 14, color: "#9aa0a6" }}>
                      Cargando...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 14, color: "#9aa0a6" }}>
                      Sin resultados.
                    </td>
                  </tr>
                ) : (
                  filtered.map((q) => (
                    <tr key={q.id} style={{ borderBottom: "1px solid #1f2a44" }}>
                      <Td>{q.quote_no}</Td>
                      <Td>{String(q.date || "")}</Td>
                      <Td>{q.client_name || "-"}</Td>
                      <Td>
                        {q.pdf_url ? (
                          <a href={q.pdf_url} target="_blank" rel="noreferrer" style={{ color: "#7aa7ff" }}>
                            Abrir
                          </a>
                        ) : (
                          "-"
                        )}
                      </Td>
                      <Td style={{ textAlign: "right" }}>
                        <button onClick={() => openQuote(q.id)} style={btn()}>
                          Abrir
                        </button>{" "}
                        <button onClick={() => deleteQuote(q.id)} style={dangerBtn()}>
                          Eliminar
                        </button>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr", gap: 10, marginTop: 14 }}>
            <div style={card()}>
              <label style={label()}>N° Cotización</label>
              <input style={input()} value={quoteNo} onChange={(e) => setQuoteNo(e.target.value)} />
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => {
                    setQuoteId(null);
                    setQuoteNo(genQuoteNo());
                  }}
                  style={btn()}
                >
                  Nuevo N°
                </button>
                <button onClick={duplicateAsNew} style={btn()}>
                  Duplicar
                </button>
              </div>
            </div>

            <div style={card()}>
              <label style={label()}>Fecha</label>
              <input style={input()} type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
            </div>

            <div style={card()}>
              <label style={label()}>Validez (días)</label>
              <input
                style={input()}
                type="number"
                min={1}
                value={validDays}
                onChange={(e) => setValidDays(Number(e.target.value))}
              />
            </div>

            <div style={card()}>
              <label style={label()}>IVA (%)</label>
              <input
                style={input()}
                type="number"
                min={0}
                step="0.01"
                value={(ivaRate * 100).toFixed(2)}
                onChange={(e) => setIvaRate(Math.max(0, Number(e.target.value) / 100))}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 10, marginTop: 12 }}>
            <div style={card()}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>👤 Datos del cliente</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={label()}>Nombre</label>
                  <input style={input()} value={clientName} onChange={(e) => setClientName(e.target.value)} />
                </div>
                <div>
                  <label style={label()}>CI / RUC</label>
                  <input style={input()} value={clientId} onChange={(e) => setClientId(e.target.value)} />
                </div>
                <div>
                  <label style={label()}>Teléfono</label>
                  <input style={input()} value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
                </div>
                <div>
                  <label style={label()}>Email</label>
                  <input style={input()} value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={label()}>Dirección</label>
                  <input style={input()} value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} />
                </div>
              </div>
            </div>

            <div style={card()}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>⚡ Acciones</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={label()}>Descuento ($)</label>
                  <input
                    style={input()}
                    type="number"
                    min={0}
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label style={label()}>Delivery ($)</label>
                  <input
                    style={input()}
                    type="number"
                    min={0}
                    step="0.01"
                    value={delivery}
                    onChange={(e) => setDelivery(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label style={label()}>Pagado ($)</label>
                  <input
                    style={input()}
                    type="number"
                    min={0}
                    step="0.01"
                    value={paid}
                    onChange={(e) => setPaid(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label style={label()}>Total final</label>
                  <div
                    style={{
                      background: "#0b1220",
                      border: "1px solid #1f2a44",
                      padding: "10px 12px",
                      borderRadius: 12,
                      fontSize: 18,
                      fontWeight: 900,
                    }}
                  >
                    $ {money(totals.totalFinal)}
                  </div>
                  <div style={{ color: "#9aa0a6", marginTop: 6 }}>
                    Saldo: <b>$ {money(totals.saldo)}</b>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                <button onClick={downloadPDF} style={btnPrimary()}>
                  ⬇️ PDF
                </button>
                <button onClick={whatsappShare} style={btnPrimary()}>
                  🟢 WhatsApp
                </button>

                <button onClick={() => saveQuote(false)} style={btn()}>
                  💾 Guardar
                </button>
                <button onClick={() => saveQuote(true)} style={btn()}>
                  ☁️ Guardar + Subir PDF
                </button>

                <button onClick={convertToInvoice} style={btn()}>
                  🧾 Convertir a Factura
                </button>

                <button onClick={emailSend} style={btnPrimary()}>
                  ✉️ Enviar Email
                </button>
              </div>
            </div>
          </div>

          <div style={{ ...card(), marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 900 }}>📦 Detalle</div>
              <button onClick={() => setItems((p) => [...p, { qty: 1, description: "", unit: 0, incl_vat: true }])} style={btn()}>
                + Agregar línea
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead>
                  <tr style={{ background: "#0b1220" }}>
                    <Th>Cant.</Th>
                    <Th>Descripción</Th>
                    <Th>P. Unitario</Th>
                    <Th style={{ textAlign: "center" }}>IVA</Th>
                    <Th style={{ textAlign: "right" }}>P.U. con IVA</Th>
                    <Th style={{ textAlign: "right" }}>Total</Th>
                    <Th style={{ textAlign: "right" }}></Th>
                  </tr>
                </thead>

                <tbody>
                  {totals.lines.map((l, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #1f2a44" }}>
                      <Td>
                        <input
                          style={input({ width: 80 })}
                          type="number"
                          min={0}
                          step="1"
                          value={items[idx].qty}
                          onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })}
                        />
                      </Td>

                      <Td>
                        <input
                          style={input()}
                          value={items[idx].description}
                          onChange={(e) => updateItem(idx, { description: e.target.value })}
                        />
                      </Td>

                      <Td>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ color: "#9aa0a6" }}>$</span>
                          <input
                            style={input({ width: 140 })}
                            type="number"
                            min={0}
                            step="0.01"
                            value={items[idx].unit}
                            onChange={(e) => updateItem(idx, { unit: Number(e.target.value) })}
                          />
                        </div>
                      </Td>

                      <Td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={items[idx].incl_vat}
                          onChange={(e) => updateItem(idx, { incl_vat: e.target.checked })}
                        />
                      </Td>

                      <Td style={{ textAlign: "right", paddingRight: 12 }}>$ {money(l.unitWithVat)}</Td>
                      <Td style={{ textAlign: "right", paddingRight: 12, fontWeight: 900 }}>$ {money(l.total)}</Td>

                      <Td style={{ textAlign: "right" }}>
                        <button onClick={() => removeItem(idx)} style={dangerBtn()}>
                          ✖
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginTop: 14 }}>
              <Mini k="Total parcial" v={`$ ${money(totals.subtotal)}`} />
              <Mini k="Descuento" v={`$ ${money(totals.disc)}`} />
              <Mini k="Neto" v={`$ ${money(totals.neto)}`} />
              <Mini k={`IVA (${Math.round(ivaRate * 100)}%)`} v={`$ ${money(totals.iva)}`} />
              <Mini k="Total final" v={`$ ${money(totals.totalFinal)}`} bold />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            <div style={card()}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>📝 Notas</div>
              <textarea style={textarea()} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div style={card()}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>📌 Términos y condiciones</div>
              <textarea style={textarea()} value={terms} onChange={(e) => setTerms(e.target.value)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ✅ UI helpers */
function card(): React.CSSProperties {
  return { border: "1px solid #1f2a44", background: "#0a0f1d", borderRadius: 16, padding: 14 };
}
function label(): React.CSSProperties {
  return { display: "block", fontSize: 12, color: "#9aa0a6", marginBottom: 6 };
}
function input(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #1f2a44",
    background: "#0b1220",
    color: "white",
    outline: "none",
    ...extra,
  };
}
function textarea(): React.CSSProperties {
  return {
    width: "100%",
    minHeight: 140,
    background: "#0b1220",
    border: "1px solid #1f2a44",
    color: "white",
    borderRadius: 14,
    padding: 12,
    outline: "none",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12.5,
  };
}
function btn(): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid #2a3557",
    background: "#111827",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  };
}
function btnPrimary(): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid #2a3557",
    background: "#0b4bff",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  };
}
function dangerBtn(): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid #3a1d1d",
    background: "#1a0b0b",
    color: "#ffb4b4",
    fontWeight: 900,
    cursor: "pointer",
  };
}
function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 14,
    border: "1px solid #2a3557",
    background: active ? "#0b4bff" : "#111827",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  };
}

/** ✅ FIX CLAVE: Th/Td aceptan props style/colSpan/etc */
type THProps = React.ThHTMLAttributes<HTMLTableCellElement>;
type TDProps = React.TdHTMLAttributes<HTMLTableCellElement>;

function Th(props: THProps) {
  const { children, style, ...rest } = props;
  return (
    <th
      {...rest}
      style={{
        textAlign: "left",
        padding: 10,
        fontSize: 12,
        color: "#cbd5e1",
        borderBottom: "1px solid #1f2a44",
        ...(style || {}),
      }}
    >
      {children}
    </th>
  );
}

function Td(props: TDProps) {
  const { children, style, ...rest } = props;
  return (
    <td {...rest} style={{ padding: 10, verticalAlign: "top", ...(style || {}) }}>
      {children}
    </td>
  );
}

function Mini({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div style={{ border: "1px solid #1f2a44", background: "#0b1220", borderRadius: 14, padding: 10 }}>
      <div style={{ fontSize: 12, color: "#9aa0a6" }}>{k}</div>
      <div style={{ fontSize: bold ? 16 : 14, fontWeight: bold ? 900 : 800, marginTop: 2 }}>{v}</div>
    </div>
  );
}