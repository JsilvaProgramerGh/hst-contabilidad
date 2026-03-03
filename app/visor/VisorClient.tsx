"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import jsPDF from "jspdf";
import { supabase } from "../lib/supabase";

type Movimiento = {
  id: string;
  created_at: string;
  type: string;
  amount: number;
  subtotal?: number;
  iva?: number;
  porcentaje_iva?: number;
  description?: string;
  quien_pago?: string;
};

type Factura = {
  id: number;
  created_at: string;
  cliente: string;
  numero: string;
  monto: number;
  subtotal?: number;
  iva?: number;
  porcentaje_iva?: number;
  estado: "pendiente" | "parcial" | "pagado" | string;
  pdf_url: string;
  fecha: string;
};

type PagoFactura = {
  id: number;
  factura_id: number;
  monto: number;
  fecha: string;
  nota: string | null;
};

function isoHoy() {
  return new Date().toISOString().slice(0, 10);
}
function isoPrimerDiaMes(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function isoUltimoDiaMes(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}
function isoPrimerDiaMesAnterior() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10);
}
function isoUltimoDiaMesAnterior() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10);
}
function enRango(fechaISO: string, desdeISO: string, hastaISO: string) {
  const t = new Date(fechaISO).getTime();
  const d = new Date(desdeISO + "T00:00:00").getTime();
  const h = new Date(hastaISO + "T23:59:59").getTime();
  return t >= d && t <= h;
}
function money(n: number) {
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
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
  const [desde, setDesde] = useState(isoPrimerDiaMes());
  const [hasta, setHasta] = useState(isoHoy());

  const [status, setStatus] = useState("Cargando...");
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [pagos, setPagos] = useState<PagoFactura[]>([]);

  // Si por alguna razón el usuario pone desde > hasta, lo corregimos al instante
  useEffect(() => {
    if (!desde || !hasta) return;
    const d = new Date(desde).getTime();
    const h = new Date(hasta).getTime();
    if (d > h) setHasta(desde);
  }, [desde, hasta]);

  useEffect(() => {
    (async () => {
      try {
        setStatus("Cargando datos...");

        const tx = await supabase
          .from("transactions")
          .select("*")
          .order("created_at", { ascending: false });
        if (tx.error) throw tx.error;
        setMovimientos((tx.data || []) as any);

        const f = await supabase
          .from("facturas")
          .select("id,created_at,cliente,numero,monto,subtotal,iva,porcentaje_iva,estado,pdf_url,fecha")
          .order("created_at", { ascending: false });
        if (f.error) throw f.error;
        setFacturas((f.data || []) as any);

        const p = await supabase
          .from("pagos_factura")
          .select("id,factura_id,monto,fecha,nota")
          .order("fecha", { ascending: false });
        if (p.error) throw p.error;
        setPagos((p.data || []) as any);

        setStatus("🟢 Visor activo (solo lectura)");
      } catch (e: any) {
        console.error(e);
        setStatus("❌ Error cargando datos: " + (e?.message || e));
      }
    })();
  }, []);

  const pagosMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of pagos) {
      m.set(p.factura_id, (m.get(p.factura_id) || 0) + Number(p.monto || 0));
    }
    return m;
  }, [pagos]);

  const movFiltrados = useMemo(
    () => movimientos.filter((m) => enRango(m.created_at, desde, hasta)),
    [movimientos, desde, hasta]
  );

  const facFiltradas = useMemo(
    () => facturas.filter((f) => enRango(f.fecha || f.created_at, desde, hasta)),
    [facturas, desde, hasta]
  );

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

  const ivaPagado = useMemo(() => {
    return movFiltrados
      .filter((m) => m.type === "GASTO" || m.type === "COMPRA")
      .reduce((acc, m) => acc + Number(m.iva || 0), 0);
  }, [movFiltrados]);

  const ivaGenerado = useMemo(() => {
    return facFiltradas.reduce((acc, f) => acc + Number(f.iva || 0), 0);
  }, [facFiltradas]);

  const ivaPorPagar = useMemo(() => ivaGenerado - ivaPagado, [ivaGenerado, ivaPagado]);

  const porCobrar = useMemo(() => {
    return facturas.reduce((acc, f) => {
      const pagado = pagosMap.get(f.id) || 0;
      const restante = Math.max(0, Number(f.monto || 0) - pagado);
      return acc + restante;
    }, 0);
  }, [facturas, pagosMap]);

  function setMesActual() {
    const d = new Date();
    setDesde(isoPrimerDiaMes(d));
    setHasta(isoUltimoDiaMes(d));
  }
  function setMesPasado() {
    setDesde(isoPrimerDiaMesAnterior());
    setHasta(isoUltimoDiaMesAnterior());
  }
  function setHoy() {
    const h = isoHoy();
    setDesde(h);
    setHasta(h);
  }

  async function verPdf(path: string) {
    try {
      const signed = await supabase.storage.from("invoices").createSignedUrl(path, 60 * 10);
      if (signed.error) throw signed.error;
      window.location.href = signed.data.signedUrl;
    } catch (e: any) {
      alert("No pude abrir el PDF: " + (e?.message || e));
    }
  }

  async function generarEstadoCuentaPDF() {
    try {
      const doc = new jsPDF("p", "mm", "a4");
      const { default: autoTable } = await import("jspdf-autotable");
      const pageWidth = doc.internal.pageSize.getWidth();

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
          ["Ingresos", money(ingresos)],
          ["Gastos", money(gastos)],
          ["Balance", money(saldo)],
          ["IVA generado (facturas)", money(ivaGenerado)],
          ["IVA pagado (gastos)", money(ivaPagado)],
          ["IVA por pagar (aprox.)", money(ivaPorPagar)],
          ["Por cobrar (total)", money(porCobrar)],
        ],
        styles: { fontSize: 9 },
        margin: { left: 12, right: 12 },
        tableWidth: pageWidth - 24,
      });

      let y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 10 : 95;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Movimientos", 12, y);

      const movBody = movFiltrados.map((m) => {
        const fecha = new Date(m.created_at).toLocaleString();
        const tipoTxt = m.type === "VENTA_DIRECTA" || m.type === "PAGO_FACTURA" ? "Ingreso" : "Gasto";
        const total = Number(m.amount || 0);
        const subtotal = Number(m.subtotal || 0);
        const iva = Number(m.iva || 0);
        const pct = Number(m.porcentaje_iva || 0);
        const detalle = String(m.description || "");
        return [fecha, tipoTxt, detalle, money(total), money(subtotal), money(iva), `${pct}%`];
      });

      autoTable(doc, {
        startY: y + 4,
        head: [["Fecha", "Tipo", "Detalle", "Total", "Subtotal", "IVA", "%"]],
        body: movBody,
        styles: { fontSize: 8 },
        margin: { left: 12, right: 12 },
        tableWidth: pageWidth - 24,
      });

      y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 10 : y + 50;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Facturas", 12, y);

      const facBody = facFiltradas.map((f) => {
        const fecha = new Date(f.fecha || f.created_at).toLocaleDateString();
        const total = Number(f.monto || 0);
        const subtotal = Number(f.subtotal || 0);
        const iva = Number(f.iva || 0);
        const pct = Number(f.porcentaje_iva || 0);
        const pagado = pagosMap.get(f.id) || 0;
        const restante = Math.max(0, total - pagado);
        return [
          fecha,
          String(f.numero || ""),
          String(f.cliente || ""),
          money(total),
          money(subtotal),
          money(iva),
          `${pct}%`,
          String(f.estado || ""),
          money(restante),
        ];
      });

      autoTable(doc, {
        startY: y + 4,
        head: [["Fecha", "N°", "Cliente", "Total", "Subtotal", "IVA", "%", "Estado", "Restante"]],
        body: facBody,
        styles: { fontSize: 8 },
        margin: { left: 12, right: 12 },
        tableWidth: pageWidth - 24,
      });

      doc.save(`HST_EstadoCuenta_${desde}_a_${hasta}.pdf`);
    } catch (err) {
      console.error("❌ Error PDF visor:", err);
      alert("❌ Error generando PDF. Abre consola (F12).");
    }
  }

  return (
    <main style={page} className="hstPage">
      {/* ✅ Forzamos que en visor SIEMPRE se pueda tocar los date inputs (evita CSS global que los bloquea) */}
      <style jsx global>{`
        .hstPage input[type="date"],
        .hstPage input,
        .hstPage select,
        .hstPage button {
          pointer-events: auto !important;
          -webkit-user-select: auto !important;
          user-select: auto !important;
          touch-action: manipulation !important;
        }

        @media (max-width: 520px) {
          .hstPage {
            padding: 18px !important;
          }
          .hstTitle {
            font-size: 32px !important;
            line-height: 1.1 !important;
          }
          .hstGrid {
            grid-template-columns: 1fr !important;
            gap: 14px !important;
          }
          .hstPanel {
            padding: 14px !important;
          }
          .hstRangeRow {
            flex-direction: column !important;
            gap: 10px !important;
          }
          .hstBtn {
            width: 100% !important;
          }
          .hstItemRow {
            display: flex !important;
            flex-direction: column !important;
            gap: 8px !important;
          }
          .hstMiniBtn {
            width: 100% !important;
          }
        }
      `}</style>

      <h1 style={title} className="hstTitle">
        HST CONTABILIDAD
      </h1>
      <p style={{ color: "#00ff88", marginTop: 6 }}>Modo visor (solo lectura)</p>
      <p style={{ color: status.includes("🟢") ? "#00ff88" : status.includes("❌") ? "#ff4d4d" : "#aaa", marginTop: 6 }}>
        {status}
      </p>

      <div style={grid} className="hstGrid">
        <Card title="Saldo" value={money(saldo)} />
        <Card title="Ingresos" value={money(ingresos)} />
        <Card title="Gastos" value={money(gastos)} />
        <Card title="Por cobrar" value={money(porCobrar)} />
      </div>

      <section style={panel} className="hstPanel">
        <h2 style={h2}>Rango + PDF</h2>

        {/* Botones rápidos */}
        <div style={quickRow}>
          <button style={btnGhost} onClick={setHoy} type="button">
            Hoy
          </button>
          <button style={btnGhost} onClick={setMesActual} type="button">
            Mes actual
          </button>
          <button style={btnGhost} onClick={setMesPasado} type="button">
            Mes pasado
          </button>
        </div>

        <div style={rangeRow} className="hstRangeRow">
          <div style={{ flex: "1 1 180px" }}>
            <div style={label}>Desde</div>
            <input
              type="date"
              value={desde}
              max={hasta}
              onChange={(e) => setDesde(e.target.value)}
              style={input}
            />
          </div>

          <div style={{ flex: "1 1 180px" }}>
            <div style={label}>Hasta</div>
            <input
              type="date"
              value={hasta}
              min={desde}
              onChange={(e) => setHasta(e.target.value)}
              style={input}
            />
          </div>
        </div>

        <button className="hstBtn" style={btn} onClick={generarEstadoCuentaPDF} type="button">
          📥 Descargar PDF (Estado de Cuenta)
        </button>

        <div style={chipRow}>
          <Chip label={`IVA generado: ${money(ivaGenerado)}`} />
          <Chip label={`IVA pagado: ${money(ivaPagado)}`} />
          <Chip label={`IVA por pagar: ${money(ivaPorPagar)}`} strong />
        </div>
      </section>

      <section style={panel} className="hstPanel">
        <h2 style={h2}>Historial</h2>

        {movFiltrados.length === 0 ? (
          <p style={{ color: "#aaa" }}>No hay movimientos en este rango.</p>
        ) : (
          <div>
            {movFiltrados.map((m) => {
              const esIngreso = m.type === "VENTA_DIRECTA" || m.type === "PAGO_FACTURA";
              return (
                <div key={m.id} style={itemRow} className="hstItemRow">
                  <div style={itemTitle}>
                    {new Date(m.created_at).toLocaleString()} —{" "}
                    <span style={{ color: esIngreso ? "#00ff88" : "#ff4d4d", fontWeight: 800 }}>
                      {money(Number(m.amount || 0))}
                    </span>
                  </div>
                  <div style={itemSub}>{m.description || ""}</div>
                  {m.quien_pago ? <div style={itemSub}>Pagó: {m.quien_pago}</div> : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={panel} className="hstPanel">
        <h2 style={h2}>Facturas</h2>

        {facFiltradas.length === 0 ? (
          <p style={{ color: "#aaa" }}>No hay facturas en este rango.</p>
        ) : (
          <div>
            {facFiltradas.map((f) => {
              const pagado = pagosMap.get(f.id) || 0;
              const restante = Math.max(0, Number(f.monto || 0) - pagado);

              return (
                <div key={f.id} style={itemRow} className="hstItemRow">
                  <div style={itemTitle}>
                    {f.cliente} — <span style={{ fontWeight: 900 }}>{money(Number(f.monto || 0))}</span>
                  </div>
                  <div style={itemSub}>
                    #{String(f.numero || "")} • {new Date(f.fecha || f.created_at).toLocaleDateString()} • Estado:{" "}
                    {String(f.estado || "")}
                  </div>
                  <div style={itemSub}>Restante: {money(restante)}</div>

                  <div style={actions}>
                    <button className="hstMiniBtn" style={btnMini} onClick={() => verPdf(f.pdf_url)} type="button">
                      Ver PDF
                    </button>
                  </div>
                </div>
              );
            })}
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
      <div style={{ fontSize: 26, fontWeight: 900, color: "#d4af37" }}>{value}</div>
    </div>
  );
}

function Chip({ label, strong }: { label: string; strong?: boolean }) {
  return (
    <div
      style={{
        padding: "8px 12px",
        borderRadius: 999,
        border: "1px solid #2a2a2a",
        background: "#0f0f0f",
        color: strong ? "#d4af37" : "#eee",
        fontWeight: strong ? 900 : 700,
        fontSize: 12,
      }}
    >
      {label}
    </div>
  );
}

/* ===== Styles ===== */
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

const quickRow: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 12,
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
  fontWeight: 900,
  fontSize: 16,
  marginTop: 12,
  cursor: "pointer",
  textAlign: "center",
};

const btnGhost: CSSProperties = {
  padding: "10px 12px",
  background: "transparent",
  color: "#d4af37",
  border: "1px solid #d4af37",
  borderRadius: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const chipRow: CSSProperties = {
  marginTop: 12,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
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
  fontWeight: 900,
  fontSize: 14,
  wordBreak: "break-word",
};

const itemSub: CSSProperties = {
  color: "#bbb",
  fontSize: 12,
  marginTop: 6,
  wordBreak: "break-word",
};

const actions: CSSProperties = {
  marginTop: 10,
  display: "flex",
  gap: 10,
};

const btnMini: CSSProperties = {
  padding: "10px 12px",
  background: "#d4af37",
  color: "#000",
  border: "none",
  borderRadius: 12,
  fontWeight: 900,
  cursor: "pointer",
};