"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import jsPDF from "jspdf";
import { supabase } from "../lib/supabase";

type Factura = {
  id: number;
  created_at: string;
  cliente: string;
  numero: string;
  monto: number;
  estado: string;
  pdf_url: string;
  fecha: string;
};

function dentroDeRango(fechaISO: string, desdeISO: string, hastaISO: string) {
  const t = new Date(fechaISO).getTime();
  const d = new Date(desdeISO + "T00:00:00").getTime();
  const h = new Date(hastaISO + "T23:59:59").getTime();
  return t >= d && t <= h;
}

async function cargarLogoDataUrl(path = "/logo.png"): Promise<string | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return dataUrl;
  } catch {
    return null;
  }
}

export default function VisorClient() {
  const hoyISO = new Date().toISOString().slice(0, 10);
  const primerDiaMesISO = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [desde, setDesde] = useState(primerDiaMesISO);
  const [hasta, setHasta] = useState(hoyISO);

  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [status, setStatus] = useState("Cargando...");

  useEffect(() => {
    (async () => {
      await cargarDatos();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarDatos() {
    setStatus("Cargando datos...");
    const tx = await supabase.from("transactions").select("*").order("created_at", { ascending: false });
    if (!tx.error && tx.data) setMovimientos(tx.data);

    const f = await supabase.from("facturas").select("*").order("created_at", { ascending: false });
    if (!f.error && f.data) setFacturas(f.data as any);

    setStatus("🟢 Visor activo (solo lectura)");
  }

  const movFiltrados = useMemo(() => {
    return movimientos.filter((m) => dentroDeRango(m.created_at, desde, hasta));
  }, [movimientos, desde, hasta]);

  const facFiltradas = useMemo(() => {
    return facturas.filter((f) => dentroDeRango(f.fecha || f.created_at, desde, hasta));
  }, [facturas, desde, hasta]);

  const ingresos = useMemo(() => {
    return movFiltrados
      .filter((m) => m.type === "VENTA_DIRECTA" || m.type === "PAGO_FACTURA")
      .reduce((acc, m) => acc + Number(m.amount || 0), 0);
  }, [movFiltrados]);

  const gastos = useMemo(() => {
    return movFiltrados
      .filter((m) => m.type === "GASTO" || m.type === "COMPRA")
      .reduce((acc, m) => acc + Number(m.amount || 0), 0);
  }, [movFiltrados]);

  const saldo = useMemo(() => ingresos - gastos, [ingresos, gastos]);

  async function verPdf(path: string) {
    const signed = await supabase.storage.from("invoices").createSignedUrl(path, 60 * 10);
    if (signed.error) return alert("No pude abrir el PDF: " + signed.error.message);

    // iPhone: mejor abrir en la misma pestaña para evitar bloqueos
    window.location.href = signed.data.signedUrl;
  }

  async function generarEstadoCuentaPDF() {
    try {
      const doc = new jsPDF("p", "mm", "a4");
      const { default: autoTable } = await import("jspdf-autotable");

      const logo = await cargarLogoDataUrl("/logo.png");
      if (logo) {
        try {
          doc.addImage(logo, "PNG", 12, 10, 22, 22);
        } catch {}
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("HST CONTABILIDAD", logo ? 38 : 12, 18);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("Visor (solo lectura) — Estado de Cuenta", logo ? 38 : 12, 24);
      doc.text(`Periodo: ${desde} a ${hasta}`, 12, 38);
      doc.text(`Emitido: ${new Date().toLocaleString()}`, 12, 44);

      autoTable(doc, {
        startY: 52,
        head: [["Concepto", "Valor"]],
        body: [
          ["Ingresos", `$${ingresos.toFixed(2)}`],
          ["Gastos", `$${gastos.toFixed(2)}`],
          ["Balance", `$${saldo.toFixed(2)}`],
        ],
        styles: { fontSize: 10 },
      });

      doc.save(`HST_EstadoCuenta_${desde}_a_${hasta}.pdf`);
    } catch (err) {
      console.error("❌ Error PDF visor:", err);
      alert("❌ Error generando PDF. Abre consola (F12).");
    }
  }

  return (
    <main style={page} className="hst-page">
      <h1 className="hst-title" style={title}>
        HST CONTABILIDAD
      </h1>

      <p style={{ color: "#00ff88", marginTop: 6 }}>Modo visor (solo lectura)</p>
      <p style={{ color: status.includes("🟢") ? "#00ff88" : "#aaa", marginTop: 6 }}>{status}</p>

      {/* CARDS */}
      <div style={grid} className="hst-grid3">
        <Card title="Saldo" value={`$${saldo.toFixed(2)}`} />
        <Card title="Ingresos" value={`$${ingresos.toFixed(2)}`} />
        <Card title="Gastos" value={`$${gastos.toFixed(2)}`} />
      </div>

      {/* RANGO + PDF */}
      <section style={panel} className="hst-panel">
        <h2 style={h2}>Rango</h2>

        <div style={rangeRow} className="hst-rangeRow">
          <div style={{ flex: "1 1 180px" }}>
            <div style={label}>Desde</div>
            <input
              className="hst-input"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              style={input}
            />
          </div>

          <div style={{ flex: "1 1 180px" }}>
            <div style={label}>Hasta</div>
            <input
              className="hst-input"
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              style={input}
            />
          </div>
        </div>

        <button className="hst-btn" style={btn} onClick={generarEstadoCuentaPDF}>
          📥 Descargar Estado PDF
        </button>
      </section>

      {/* HISTORIAL */}
      <section style={panel} className="hst-panel">
        <h2 style={h2}>Historial</h2>

        {movFiltrados.length === 0 ? (
          <p style={{ color: "#aaa" }}>No hay movimientos en este rango.</p>
        ) : (
          <div>
            {movFiltrados.map((m) => (
              <div key={m.id} className="hst-itemRow" style={itemRow}>
                <div className="hst-itemTitle" style={itemTitle}>
                  {new Date(m.created_at).toLocaleString()} —{" "}
                  <span
                    style={{
                      color:
                        m.type === "VENTA_DIRECTA" || m.type === "PAGO_FACTURA" ? "#00ff88" : "#ff4d4d",
                      fontWeight: 800,
                    }}
                  >
                    ${Number(m.amount || 0).toFixed(2)}
                  </span>
                </div>
                <div className="hst-itemSub" style={itemSub}>
                  {m.description || ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* FACTURAS */}
      <section style={panel} className="hst-panel">
        <h2 style={h2}>Facturas</h2>

        {facFiltradas.length === 0 ? (
          <p style={{ color: "#aaa" }}>No hay facturas en este rango.</p>
        ) : (
          <div>
            {facFiltradas.map((f) => (
              <div key={f.id} className="hst-itemRow" style={itemRow}>
                <div className="hst-itemTitle" style={itemTitle}>
                  {f.cliente} —{" "}
                  <span style={{ fontWeight: 800, color: "#d4af37" }}>${Number(f.monto || 0).toFixed(2)}</span>
                </div>

                <div className="hst-itemSub" style={itemSub}>
                  Factura: {String(f.numero || "")} • {new Date(f.fecha || f.created_at).toLocaleDateString()} •{" "}
                  {String(f.estado || "")}
                </div>

                <div className="hst-itemActions" style={itemActions}>
                  <button className="hst-miniBtn" style={btnMini} onClick={() => verPdf(f.pdf_url)}>
                    Ver PDF
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div style={card}>
      <div style={{ color: "#aaa", marginBottom: 8 }}>{title}</div>
      <div className="hst-cardValue" style={{ fontSize: 26, fontWeight: 800, color: "#d4af37" }}>
        {value}
      </div>
    </div>
  );
}

/* ===== Styles (PC igual, mobile se arregla con globals.css) ===== */

const page: CSSProperties = {
  background: "#0b0b0b",
  color: "#d4af37",
  minHeight: "100vh",
  padding: 40,
  fontFamily: "Arial",
};

const title: CSSProperties = {
  margin: 0,
  fontSize: 48,
  letterSpacing: 1,
};

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 20,
  marginTop: 16,
};

const card: CSSProperties = {
  background: "#111",
  border: "1px solid #333",
  padding: 20,
  borderRadius: 14,
};

const panel: CSSProperties = {
  background: "#111",
  border: "1px solid #333",
  padding: 20,
  borderRadius: 14,
  marginTop: 20,
};

const h2: CSSProperties = {
  marginTop: 0,
  marginBottom: 12,
  color: "#d4af37",
};

const label: CSSProperties = {
  color: "#aaa",
  fontSize: 12,
  marginBottom: 6,
};

const rangeRow: CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};

const input: CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 12,
  border: "1px solid #2a2a2a",
  background: "#0f0f0f",
  color: "#fff",
  outline: "none",
};

const btn: CSSProperties = {
  width: "100%",
  padding: 14,
  background: "#d4af37",
  color: "#000",
  border: "none",
  borderRadius: 12,
  fontWeight: "bold",
  fontSize: 16,
  marginTop: 12,
  cursor: "pointer",
  textAlign: "center",
};

const itemRow: CSSProperties = {
  padding: 12,
  borderRadius: 14,
  border: "1px solid #2a2a2a",
  background: "#0f0f0f",
  marginBottom: 10,
};

const itemTitle: CSSProperties = {
  color: "#d4af37",
  fontWeight: 800,
  fontSize: 14,
  wordBreak: "break-word",
};

const itemSub: CSSProperties = {
  color: "#bbb",
  fontSize: 12,
  marginTop: 6,
  wordBreak: "break-word",
};

const itemActions: CSSProperties = {
  marginTop: 10,
  display: "flex",
  gap: 10,
};

const btnMini: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "#d4af37",
  color: "#000",
  border: "none",
  borderRadius: 12,
  fontWeight: "bold",
  cursor: "pointer",
};