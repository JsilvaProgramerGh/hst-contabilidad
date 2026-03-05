"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { supabaseBrowser } from "@/lib/supabase-browser";

type QuoteItem = {
  id?: string;
  quote_id?: string;
  qty: number;
  description: string;
  unit_price: number;
  iva: boolean;
};

type Quote = {
  id?: string;
  quote_no: string;
  date: string; // yyyy-mm-dd
  valid_days: number;
  iva_percent: number;
  discount: number;
  delivery: number;
  paid: number;
  client_name: string;
  client_id: string;
  client_phone: string;
  client_email: string;
  client_address: string;
  notes: string;
  status: "BORRADOR" | "ENVIADA" | "APROBADA" | "FACTURADA" | "ANULADA";
  created_at?: string;
  pdf_url?: string | null;
};

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function nextQuoteNo(prefix = "PRO") {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rnd = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${yyyy}${mm}${dd}-${rnd}`;
}

/** ======= UI helpers ======= */
const card = () => ({
  background: "rgba(17,17,17,0.85)",
  border: "1px solid #222",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
});

const input = () => ({
  width: "100%",
  background: "#0f0f0f",
  color: "#eaeaea",
  border: "1px solid #242424",
  borderRadius: 12,
  padding: "10px 12px",
  outline: "none",
});

const label = () => ({
  fontSize: 12,
  color: "#9aa0a6",
  marginBottom: 6,
});

const btn = () => ({
  background: "linear-gradient(180deg, #1646d9, #0b2e92)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "white",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 800 as const,
  letterSpacing: 0.2,
});

const btnGhost = () => ({
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.09)",
  color: "#eaeaea",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700 as const,
});

const dangerBtn = () => ({
  background: "rgba(255,70,70,0.10)",
  border: "1px solid rgba(255,70,70,0.25)",
  color: "#ffd1d1",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 800 as const,
});

/** ✅ FIX: Th/Td ahora aceptan style/colSpan/etc y children opcional */
function Th(props: React.ThHTMLAttributes<HTMLTableCellElement>) {
  const { children, style, ...rest } = props;
  return (
    <th
      {...rest}
      style={{
        padding: 10,
        borderBottom: "1px solid #222",
        color: "#bbb",
        fontWeight: 700,
        fontSize: 13,
        textAlign: "left",
        ...(style || {}),
      }}
    >
      {children ?? null}
    </th>
  );
}

function Td(props: React.TdHTMLAttributes<HTMLTableCellElement>) {
  const { children, style, ...rest } = props;
  return (
    <td
      {...rest}
      style={{
        padding: 10,
        borderBottom: "1px solid #171717",
        color: "#ddd",
        fontSize: 13,
        verticalAlign: "top",
        ...(style || {}),
      }}
    >
      {children ?? null}
    </td>
  );
}

export default function CotizacionPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);

  /** ======= Estado principal ======= */
  const [quote, setQuote] = useState<Quote>(() => ({
    quote_no: nextQuoteNo("PRO"),
    date: todayISO(),
    valid_days: 15,
    iva_percent: 15,
    discount: 0,
    delivery: 0,
    paid: 0,
    client_name: "",
    client_id: "",
    client_phone: "",
    client_email: "",
    client_address: "",
    notes: "",
    status: "BORRADOR",
    pdf_url: null,
  }));

  const [items, setItems] = useState<QuoteItem[]>(() => [
    { qty: 1, description: "Producto / Servicio", unit_price: 0, iva: true },
  ]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  /** ======= Historial ======= */
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<Array<Quote & { items_count?: number }>>([]);
  const [historySearch, setHistorySearch] = useState("");

  /** ======= Logo / Firma / Sello ======= */
  const logoPath = "/logo.png";
  const firmaPath = "/firma.png";
  const selloPath = "/sello.png";

  /** ======= Totales ======= */
  const subtotal = useMemo(() => {
    return items.reduce((acc, it) => acc + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);
  }, [items]);

  const ivaValue = useMemo(() => {
    const ivaP = (Number(quote.iva_percent) || 0) / 100;
    return items.reduce((acc, it) => {
      if (!it.iva) return acc;
      return acc + (Number(it.qty) || 0) * (Number(it.unit_price) || 0) * ivaP;
    }, 0);
  }, [items, quote.iva_percent]);

  const total = useMemo(() => {
    return subtotal + ivaValue - (Number(quote.discount) || 0) + (Number(quote.delivery) || 0);
  }, [subtotal, ivaValue, quote.discount, quote.delivery]);

  const balance = useMemo(() => {
    return total - (Number(quote.paid) || 0);
  }, [total, quote.paid]);

  /** ======= Handlers ======= */
  function setQuoteField<K extends keyof Quote>(key: K, value: Quote[K]) {
    setQuote((q) => ({ ...q, [key]: value }));
  }

  function setItem(index: number, patch: Partial<QuoteItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function addLine() {
    setItems((prev) => [...prev, { qty: 1, description: "", unit_price: 0, iva: true }]);
  }

  function removeLine(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function resetNew() {
    setQuote({
      quote_no: nextQuoteNo("PRO"),
      date: todayISO(),
      valid_days: 15,
      iva_percent: 15,
      discount: 0,
      delivery: 0,
      paid: 0,
      client_name: "",
      client_id: "",
      client_phone: "",
      client_email: "",
      client_address: "",
      notes: "",
      status: "BORRADOR",
      pdf_url: null,
    });
    setItems([{ qty: 1, description: "Producto / Servicio", unit_price: 0, iva: true }]);
  }

  function duplicateQuote() {
    setQuote((q) => ({
      ...q,
      id: undefined,
      quote_no: nextQuoteNo("PRO"),
      status: "BORRADOR",
      pdf_url: null,
    }));
  }

  /** ======= PDF ======= */
  async function loadImageAsDataURL(path: string): Promise<string | null> {
    try {
      const res = await fetch(path);
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

  async function generatePDFBlob(): Promise<Blob> {
    const doc = new jsPDF("p", "mm", "a4");

    const logo = await loadImageAsDataURL(logoPath);
    const firma = await loadImageAsDataURL(firmaPath);
    const sello = await loadImageAsDataURL(selloPath);

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("COTIZACIÓN", 14, 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`N°: ${quote.quote_no}`, 14, 25);
    doc.text(`Fecha: ${quote.date}`, 14, 30);
    doc.text(`Validez: ${quote.valid_days} días`, 14, 35);

    if (logo) {
      try {
        doc.addImage(logo, "PNG", 150, 10, 45, 20);
      } catch {}
    }

    // Cliente
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Datos del cliente", 14, 46);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Nombre: ${quote.client_name || "-"}`, 14, 52);
    doc.text(`CI/RUC: ${quote.client_id || "-"}`, 14, 57);
    doc.text(`Teléfono: ${quote.client_phone || "-"}`, 14, 62);
    doc.text(`Email: ${quote.client_email || "-"}`, 14, 67);
    doc.text(`Dirección: ${quote.client_address || "-"}`, 14, 72);

    // Tabla items
    const rows = items.map((it) => {
      const qty = Number(it.qty) || 0;
      const unit = Number(it.unit_price) || 0;
      const ivaP = (Number(quote.iva_percent) || 0) / 100;
      const unitWithIva = it.iva ? unit * (1 + ivaP) : unit;
      const lineTotal = qty * unitWithIva;
      return [
        qty,
        it.description || "",
        `$ ${money(unit)}`,
        it.iva ? "Sí" : "No",
        `$ ${money(unitWithIva)}`,
        `$ ${money(lineTotal)}`,
      ];
    });

    autoTable(doc, {
      startY: 80,
      head: [["Cant.", "Descripción", "P. Unitario", "IVA", "P.U con IVA", "Total"]],
      body: rows,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [20, 20, 20] },
    });

    const y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : 180;

    doc.setFont("helvetica", "bold");
    doc.text(`Subtotal: $ ${money(subtotal)}`, 140, y);
    doc.text(`IVA: $ ${money(ivaValue)}`, 140, y + 6);
    doc.text(`Descuento: $ ${money(Number(quote.discount) || 0)}`, 140, y + 12);
    doc.text(`Delivery: $ ${money(Number(quote.delivery) || 0)}`, 140, y + 18);
    doc.text(`Total: $ ${money(total)}`, 140, y + 26);

    doc.setFont("helvetica", "normal");
    doc.text(`Pagado: $ ${money(Number(quote.paid) || 0)}`, 140, y + 34);
    doc.text(`Saldo: $ ${money(balance)}`, 140, y + 40);

    if (quote.notes?.trim()) {
      doc.setFont("helvetica", "bold");
      doc.text("Notas:", 14, y + 34);
      doc.setFont("helvetica", "normal");
      doc.text(quote.notes, 14, y + 40);
    }

    // Firma / Sello
    if (firma) {
      try {
        doc.addImage(firma, "PNG", 14, 255, 55, 25);
      } catch {}
    }
    if (sello) {
      try {
        doc.addImage(sello, "PNG", 75, 255, 35, 35);
      } catch {}
    }

    // Pie
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("HST CONTABILIDAD - Cotización PRO", 14, 290);

    const blob = doc.output("blob");
    return blob;
  }

  async function downloadPDF() {
    setLoading(true);
    try {
      const blob = await generatePDFBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${quote.quote_no}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("No se pudo generar el PDF: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  /** ======= Guardar en DB (quotes + quote_items) ======= */
  async function saveQuote() {
    setSaving(true);
    try {
      const payload: any = { ...quote };
      delete payload.id;
      delete payload.created_at;

      // upsert quote
      let quoteId = quote.id;

      if (!quoteId) {
        const { data, error } = await supabase.from("quotes").insert(payload).select("id").single();
        if (error) throw error;
        quoteId = data?.id;
      } else {
        const { error } = await supabase.from("quotes").update(payload).eq("id", quoteId);
        if (error) throw error;
      }

      // refresh local
      setQuote((q) => ({ ...q, id: quoteId }));

      // delete items old
      await supabase.from("quote_items").delete().eq("quote_id", quoteId);

      // insert items
      const itemsToInsert = items.map((it) => ({
        quote_id: quoteId,
        qty: Number(it.qty) || 0,
        description: it.description || "",
        unit_price: Number(it.unit_price) || 0,
        iva: !!it.iva,
      }));

      const { error: itemsErr } = await supabase.from("quote_items").insert(itemsToInsert);
      if (itemsErr) throw itemsErr;

      alert("✅ Guardado");
    } catch (e: any) {
      alert("No se pudo guardar: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  /** ======= WhatsApp ======= */
  function shareWhatsApp() {
    const phone = (quote.client_phone || "").replace(/\D/g, "");
    const msg =
      `Hola ${quote.client_name || ""}, te envío la cotización ${quote.quote_no}.\n` +
      `Total: $ ${money(total)}\n` +
      `Validez: ${quote.valid_days} días.\n` +
      `Gracias.`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }

  /** ======= Historial ======= */
  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_no, date, client_name, status, total:delivery") // NOTE: solo para traer algo, si tu tabla tiene total guárdalo real
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setHistory((data as any[])?.map((x) => x) || []);
    } catch (e: any) {
      alert("No se pudo cargar historial: " + (e?.message || e));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openQuote(id: string) {
    setShowHistory(false);
    setLoading(true);
    try {
      const { data: q, error: qErr } = await supabase.from("quotes").select("*").eq("id", id).single();
      if (qErr) throw qErr;

      const { data: its, error: iErr } = await supabase.from("quote_items").select("*").eq("quote_id", id);
      if (iErr) throw iErr;

      setQuote(q as any);
      setItems(
        (its as any[])?.map((it) => ({
          id: it.id,
          quote_id: it.quote_id,
          qty: it.qty,
          description: it.description,
          unit_price: it.unit_price,
          iva: it.iva,
        })) || []
      );
    } catch (e: any) {
      alert("No se pudo abrir: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function deleteQuote(id: string) {
    if (!confirm("¿Eliminar esta cotización?")) return;
    try {
      await supabase.from("quote_items").delete().eq("quote_id", id);
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw error;
      alert("✅ Eliminada");
      loadHistory();
    } catch (e: any) {
      alert("No se pudo eliminar: " + (e?.message || e));
    }
  }

  /** ======= UI ======= */
  const filtered = useMemo(() => {
    const s = historySearch.trim().toLowerCase();
    if (!s) return history;
    return history.filter((q) => {
      return (
        String(q.quote_no || "").toLowerCase().includes(s) ||
        String(q.client_name || "").toLowerCase().includes(s) ||
        String(q.status || "").toLowerCase().includes(s)
      );
    });
  }, [history, historySearch]);

  return (
    <div style={{ padding: 18, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 0.2 }}>📄 Cotización PRO</div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button
            onClick={() => {
              resetNew();
            }}
            style={btn()}
          >
            Nueva
          </button>
          <button
            onClick={() => {
              setShowHistory(true);
              loadHistory();
            }}
            style={btnGhost()}
          >
            Historial
          </button>
        </div>
      </div>

      <div style={{ color: "#666", marginBottom: 14 }}>
        Logo: <code>{"/public/logo.png"}</code> — Firma: <code>{"/public/firma.png"}</code> — Sello:{" "}
        <code>{"/public/sello.png"}</code>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div style={card()}>
          <div style={label()}>N° Cotización</div>
          <input style={input()} value={quote.quote_no} onChange={(e) => setQuoteField("quote_no", e.target.value)} />
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button style={btnGhost()} onClick={() => setQuoteField("quote_no", nextQuoteNo("PRO"))}>
              Nuevo N°
            </button>
            <button style={btnGhost()} onClick={duplicateQuote}>
              Duplicar
            </button>
          </div>
        </div>

        <div style={card()}>
          <div style={label()}>Fecha</div>
          <input style={input()} type="date" value={quote.date} onChange={(e) => setQuoteField("date", e.target.value)} />
        </div>

        <div style={card()}>
          <div style={label()}>Validez (días)</div>
          <input
            style={input()}
            type="number"
            value={quote.valid_days}
            onChange={(e) => setQuoteField("valid_days", Number(e.target.value))}
          />
        </div>

        <div style={card()}>
          <div style={label()}>IVA (%)</div>
          <input
            style={input()}
            type="number"
            value={quote.iva_percent}
            onChange={(e) => setQuoteField("iva_percent", Number(e.target.value))}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <div style={card()}>
          <div style={{ fontWeight: 900, marginBottom: 10, color: "#ddd" }}>👤 Datos del cliente</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={label()}>Nombre</div>
              <input style={input()} value={quote.client_name} onChange={(e) => setQuoteField("client_name", e.target.value)} />
            </div>
            <div>
              <div style={label()}>CI / RUC</div>
              <input style={input()} value={quote.client_id} onChange={(e) => setQuoteField("client_id", e.target.value)} />
            </div>
            <div>
              <div style={label()}>Teléfono</div>
              <input style={input()} value={quote.client_phone} onChange={(e) => setQuoteField("client_phone", e.target.value)} />
            </div>
            <div>
              <div style={label()}>Email</div>
              <input style={input()} value={quote.client_email} onChange={(e) => setQuoteField("client_email", e.target.value)} />
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={label()}>Dirección</div>
            <input style={input()} value={quote.client_address} onChange={(e) => setQuoteField("client_address", e.target.value)} />
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={label()}>Notas</div>
            <textarea
              style={{ ...input(), height: 90, resize: "vertical" }}
              value={quote.notes}
              onChange={(e) => setQuoteField("notes", e.target.value)}
            />
          </div>
        </div>

        <div style={card()}>
          <div style={{ fontWeight: 900, marginBottom: 10, color: "#ddd" }}>⚡ Acciones</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={label()}>Descuento ($)</div>
              <input
                style={input()}
                type="number"
                value={quote.discount}
                onChange={(e) => setQuoteField("discount", Number(e.target.value))}
              />
            </div>
            <div>
              <div style={label()}>Delivery ($)</div>
              <input
                style={input()}
                type="number"
                value={quote.delivery}
                onChange={(e) => setQuoteField("delivery", Number(e.target.value))}
              />
            </div>
            <div>
              <div style={label()}>Pagado ($)</div>
              <input style={input()} type="number" value={quote.paid} onChange={(e) => setQuoteField("paid", Number(e.target.value))} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ color: "#888", fontSize: 12 }}>Total final</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>$ {money(total)}</div>
              <div style={{ color: "#888", fontSize: 12 }}>Saldo: $ {money(balance)}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            <button style={btn()} onClick={downloadPDF} disabled={loading}>
              ⬇️ PDF
            </button>
            <button style={btn()} onClick={shareWhatsApp}>
              🟢 WhatsApp
            </button>

            <button style={btnGhost()} onClick={saveQuote} disabled={saving}>
              💾 Guardar
            </button>
            <button
              style={btnGhost()}
              onClick={() => alert('Por ahora "Guardar + Subir PDF" depende de Storage/RLS; lo dejamos para después.')}
            >
              ☁️ Guardar + Subir PDF
            </button>

            <button style={btnGhost()} onClick={() => alert("Convertir a Factura: lo activamos luego.")}>
              🧾 Convertir a Factura
            </button>
            <button
              style={btnGhost()}
              onClick={() => alert('Enviar Email: lo activamos luego (requiere endpoint + Resend + Storage OK).')}
            >
              ✉️ Enviar Email
            </button>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: "#6f6f6f" }}>
            ✅ “Guardar + Subir PDF” crea un link público para enviar al cliente.
            <br />
            ✅ “Enviar Email” requiere endpoint <code>/api/quotes/[id]/email</code> y que el cliente tenga email.
          </div>
        </div>
      </div>

      {/* Detalle */}
      <div style={{ ...card(), marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ fontWeight: 900, color: "#ddd" }}>📦 Detalle</div>
          <div style={{ marginLeft: "auto" }}>
            <button style={btnGhost()} onClick={addLine}>
              + Agregar línea
            </button>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>Cant.</Th>
                <Th>Descripción</Th>
                <Th>P. Unitario</Th>
                <Th>IVA</Th>
                <Th>P.U. con IVA</Th>
                <Th>Total</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const ivaP = (Number(quote.iva_percent) || 0) / 100;
                const unit = Number(it.unit_price) || 0;
                const unitWithIva = it.iva ? unit * (1 + ivaP) : unit;
                const lineTotal = (Number(it.qty) || 0) * unitWithIva;

                return (
                  <tr key={idx}>
                    <Td>
                      <input
                        style={input()}
                        type="number"
                        value={it.qty}
                        onChange={(e) => setItem(idx, { qty: Number(e.target.value) })}
                      />
                    </Td>
                    <Td>
                      <input
                        style={input()}
                        value={it.description}
                        onChange={(e) => setItem(idx, { description: e.target.value })}
                      />
                    </Td>
                    <Td>
                      <input
                        style={input()}
                        type="number"
                        value={it.unit_price}
                        onChange={(e) => setItem(idx, { unit_price: Number(e.target.value) })}
                      />
                    </Td>
                    <Td style={{ textAlign: "center" }}>
                      <input type="checkbox" checked={it.iva} onChange={(e) => setItem(idx, { iva: e.target.checked })} />
                    </Td>
                    <Td>$ {money(unitWithIva)}</Td>
                    <Td>$ {money(lineTotal)}</Td>
                    <Td style={{ textAlign: "right" }}>
                      <button style={dangerBtn()} onClick={() => removeLine(idx)} title="Eliminar línea">
                        ✖
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historial modal */}
      {showHistory && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
            zIndex: 999,
          }}
          onClick={() => setShowHistory(false)}
        >
          <div style={{ ...card(), width: "min(1100px, 100%)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>📚 Historial de cotizaciones</div>
              <div style={{ marginLeft: "auto" }}>
                <button style={btnGhost()} onClick={() => setShowHistory(false)}>
                  Cerrar
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <input
                style={input()}
                placeholder="Buscar por N°, cliente o estado..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
              <button style={btnGhost()} onClick={loadHistory} disabled={historyLoading}>
                {historyLoading ? "Cargando..." : "Recargar"}
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <Th>N°</Th>
                    <Th>Fecha</Th>
                    <Th>Estado</Th>
                    <Th>Cliente</Th>
                    <Th>PDF</Th>
                    <Th>Acciones</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((q: any) => (
                    <tr key={q.id}>
                      <Td>{q.quote_no}</Td>
                      <Td>{q.date}</Td>
                      <Td>{q.status}</Td>
                      <Td>{q.client_name}</Td>
                      <Td>{q.pdf_url ? "Sí" : "-"}</Td>

                      {/* ✅ FIX: div bien cerrado + acciones alineadas */}
                      <Td>
                        <div style={{ textAlign: "right" }}>
                          <button onClick={() => openQuote(q.id)} style={btn()}>
                            Abrir
                          </button>{" "}
                          <button onClick={() => deleteQuote(q.id)} style={dangerBtn()}>
                            Eliminar
                          </button>
                        </div>
                      </Td>
                    </tr>
                  ))}

                  {filtered.length === 0 && (
                    <tr>
                      <Td colSpan={6} style={{ color: "#777" }}>
                        {historyLoading ? "Cargando..." : "No hay resultados."}
                      </Td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 10, color: "#777", fontSize: 12 }}>
              Tip: abre una cotización para editarla y luego puedes Guardar / PDF / WhatsApp.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}