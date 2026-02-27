"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import jsPDF from "jspdf";
import { supabase } from "../lib/supabase";

type Factura = {
  id: number;
  created_at: string;
  cliente: string;
  numero: string;
  monto: number;
  subtotal?: number;
  iva?: number;
  porcentaje_iva?: number;
  estado: "pendiente" | "parcial" | "pagado";
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
  const params = useSearchParams();
  const token = params.get("token") || ""; // token opcional (se valida si existe)

  const hoyISO = new Date().toISOString().slice(0, 10);
  const primerDiaMesISO = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [desde, setDesde] = useState(primerDiaMesISO);
  const [hasta, setHasta] = useState(hoyISO);

  const [status, setStatus] = useState("Cargando...");
  const [autorizado, setAutorizado] = useState(true); // por defecto abierto; si hay token, se valida

  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [pagos, setPagos] = useState<PagoFactura[]>([]);

  // 1) Validar token (si viene)
  useEffect(() => {
    (async () => {
      try {
        if (!token) {
          setAutorizado(true);
          setStatus("🟢 Visor activo (solo lectura)");
          return;
        }

        const res = await supabase
          .from("share_links")
          .select("token,is_active,expires_at")
          .eq("token", token)
          .limit(1);

        if (res.error) {
          setAutorizado(false);
          setStatus("❌ Error verificando token: " + res.error.message);
          return;
        }

        if (!res.data || res.data.length === 0) {
          setAutorizado(false);
          setStatus("❌ Token inválido");
          return;
        }

        const row: any = res.data[0];

        if (row.is_active === false) {
          setAutorizado(false);
          setStatus("❌ Token desactivado");
          return;
        }

        if (row.expires_at) {
          const exp = new Date(row.expires_at).getTime();
          if (Date.now() > exp) {
            setAutorizado(false);
            setStatus("❌ Token expirado");
            return;
          }
        }

        setAutorizado(true);
        setStatus("🟢 Acceso aprobado (solo lectura)");
      } catch (e: any) {
        setAutorizado(false);
        setStatus("❌ Error inesperado: " + (e?.message || e));
      }
    })();
  }, [token]);

  // 2) Cargar datos (solo si autorizado)
  useEffect(() => {
    if (!autorizado) return;

    (async () => {
      setStatus((s) => (s.includes("🟢") ? s : "Cargando datos..."));

      const tx = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false });

      if (!tx.error && tx.data) setMovimientos(tx.data);

      const f = await supabase
        .from("facturas")
        .select("id,created_at,cliente,numero,monto,subtotal,iva,porcentaje_iva,estado,pdf_url,fecha")
        .order("created_at", { ascending: false });

      if (!f.error && f.data) setFacturas(f.data as any);

      const p = await supabase
        .from("pagos_factura")
        .select("id,factura_id,monto,fecha,nota")
        .order("fecha", { ascending: false });

      if (!p.error && p.data) setPagos(p.data as any);

      setStatus("🟢 Visor activo (solo lectura)");
    })();
  }, [autorizado]);

  const pagosMap = useMemo(() => {
    const m = new Map<number, number>();
    pagos.forEach((p) => m.set(p.factura_id, (m.get(p.factura_id) || 0) + Number(p.monto)));
    return m;
  }, [pagos]);

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

  const porCobrar = useMemo(() => {
    return facturas.reduce((acc, f) => {
      const pagado = pagosMap.get(f.id) || 0;
      const restante = Math.max(0, Number(f.monto) - pagado);
      return acc + restante;
    }, 0);
  }, [facturas, pagosMap]);

  const ivaPagado = useMemo(() => {
    return movFiltrados
      .filter((m) => m.type === "GASTO" || m.type === "COMPRA")
      .reduce((acc, m) => acc + Number(m.iva || 0), 0);
  }, [movFiltrados]);

  const ivaGenerado = useMemo(() => {
    return facFiltradas.reduce((acc, f) => acc + Number(f.iva || 0), 0);
  }, [facFiltradas]);

  const ivaPorPagar = useMemo(() => ivaGenerado - ivaPagado, [ivaGenerado, ivaPagado]);

  async function verPdf(path: string) {
    const signed = await supabase.storage.from("invoices").createSignedUrl(path, 60 * 10);
    if (signed.error) return alert("No pude abrir el PDF: " + signed.error.message);
    window.location.href = signed.data.signedUrl;
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
          ["Ingresos (movimientos)", `$${ingresos.toFixed(2)}`],
          ["Gastos (movimientos)", `$${gastos.toFixed(2)}`],
          ["Balance", `$${saldo.toFixed(2)}`],
          ["IVA generado (facturas)", `$${ivaGenerado.toFixed(2)}`],
          ["IVA pagado (gastos)", `$${ivaPagado.toFixed(2)}`],
          ["IVA por pagar (aprox.)", `$${ivaPorPagar.toFixed(2)}`],
        ],
        styles: { fontSize: 9 },
        margin: { left: 12, right: 12 },
        tableWidth: pageWidth - 24,
      });

      let nextY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 10 : 90;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Movimientos", 12, nextY);

      const movimientosBody = movFiltrados.map((m) => {
        const fecha = new Date(m.created_at).toLocaleString();
        const tipoTxt = m.type === "VENTA_DIRECTA" || m.type === "PAGO_FACTURA" ? "Ingreso" : "Gasto";
        const total = Number(m.amount || 0);
        const subtotal = Number(m.subtotal || 0);
        const iva = Number(m.iva || 0);
        const pct = Number(m.porcentaje_iva || 0);
        return [
          fecha,
          tipoTxt,
          String(m.description || ""),
          `$${total.toFixed(2)}`,
          `$${subtotal.toFixed(2)}`,
          `$${iva.toFixed(2)}`,
          `${pct}%`,
        ];
      });

      autoTable(doc, {
        startY: nextY + 4,
        head: [["Fecha", "Tipo", "Detalle", "Total", "Subtotal", "IVA", "%"]],
        body: movimientosBody,
        styles: { fontSize: 8 },
        margin: { left: 12, right: 12 },
        tableWidth: pageWidth - 24,
      });

      nextY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 10 : nextY + 40;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Facturas", 12, nextY);

      const facturasBody = facFiltradas.map((f) => {
        const fecha = new Date(f.fecha || f.created_at).toLocaleDateString();
        const total = Number(f.monto || 0);
        const subtotal = Number(f.subtotal || 0);
        const iva = Number(f.iva || 0);
        const pct = Number(f.porcentaje_iva || 0);

        return [
          fecha,
          String(f.numero || ""),
          String(f.cliente || ""),
          `$${total.toFixed(2)}`,
          `$${subtotal.toFixed(2)}`,
          `$${iva.toFixed(2)}`,
          `${pct}%`,
          String(f.estado || ""),
        ];
      });

      autoTable(doc, {
        startY: nextY + 4,
        head: [["Fecha", "N°", "Cliente", "Total", "Subtotal", "IVA", "%", "Estado"]],
        body: facturasBody,
        styles: { fontSize: 8 },
        margin: { left: 12, right: 12 },
        tableWidth: pageWidth - 24,
      });

      doc.save(`HST_Visor_EstadoCuenta_${desde}_a_${hasta}.pdf`);
    } catch (err) {
      console.error("❌ Error generando PDF visor:", err);
      alert("❌ Error generando PDF. Abre consola (F12).");
    }
  }

  if (!autorizado) {
    return (
      <main style={page}>
        <h1 style={{ fontSize: 44, margin: 0 }}>HST CONTABILIDAD</h1>
        <p style={{ color: "#aaa", marginTop: 6 }}>Visor (solo lectura)</p>
        <p style={{ color: "#ff4d4d" }}>{status}</p>

        <section style={panel}>
          <h2 style={{ marginTop: 0 }}>Acceso requerido</h2>
          <p style={{ color: "#ddd" }}>
            Abre el link con token así:
          </p>
          <code style={codeBox}>/visor?token=TU_TOKEN</code>
        </section>
      </main>
    );
  }

  return (
    <main style={page}>
      <h1 style={{ fontSize: 44, margin: 0 }}>HST CONTABILIDAD</h1>
      <p style={{ color: "#aaa", marginTop: 6 }}>Visor (solo lectura)</p>
      <p style={{ color: "#00ff88" }}>{status}</p>

      <div style={grid4}>
        <Card title="💰 Saldo" value={`$${saldo.toFixed(2)}`} />
        <Card title="📈 Ingresos" value={`$${ingresos.toFixed(2)}`} />
        <Card title="📉 Gastos" value={`$${gastos.toFixed(2)}`} />
        <Card title="🧾 Por cobrar" value={`$${porCobrar.toFixed(2)}`} />
      </div>

      <section style={{ ...panel, marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>📅 Rango + PDF</h2>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 180px" }}>
            <div style={label}>Desde</div>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={input} />
          </div>

          <div style={{ flex: "1 1 180px" }}>
            <div style={label}>Hasta</div>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={input} />
          </div>

          <div style={{ flex: "1 1 260px", display: "flex", alignItems: "end" }}>
            <button style={btnGold} onClick={generarEstadoCuentaPDF}>
              🧾 Descargar PDF (Estado de Cuenta)
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Chip label={`IVA generado: $${ivaGenerado.toFixed(2)}`} />
          <Chip label={`IVA pagado: $${ivaPagado.toFixed(2)}`} />
          <Chip label={`IVA por pagar: $${ivaPorPagar.toFixed(2)}`} strong />
        </div>
      </section>

      <section style={{ ...panel, marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>📜 Historial (solo lectura)</h2>

        {movFiltrados.length === 0 ? (
          <p style={{ color: "#aaa" }}>No hay movimientos en este rango.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Fecha</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Monto</th>
                  <th style={th}>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {movFiltrados.map((m) => (
                  <tr key={m.id} style={{ borderTop: "1px solid #2a2a2a" }}>
                    <td style={td}>{new Date(m.created_at).toLocaleString()}</td>
                    <td style={td}>
                      {m.type === "VENTA_DIRECTA" || m.type === "PAGO_FACTURA" ? "Ingreso" : "Gasto"}
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          color:
                            m.type === "VENTA_DIRECTA" || m.type === "PAGO_FACTURA"
                              ? "#00ff88"
                              : "#ff4d4d",
                          fontWeight: 700,
                        }}
                      >
                        ${Number(m.amount).toFixed(2)}
                      </span>
                    </td>
                    <td style={td}>{m.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ ...panel, marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>🧾 Facturas (solo lectura)</h2>

        {facFiltradas.length === 0 ? (
          <p style={{ color: "#aaa" }}>No hay facturas en este rango.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Fecha</th>
                  <th style={th}>Cliente</th>
                  <th style={th}>N°</th>
                  <th style={th}>Total</th>
                  <th style={th}>Estado</th>
                  <th style={th}>PDF</th>
                </tr>
              </thead>
              <tbody>
                {facFiltradas.map((f) => (
                  <tr key={f.id} style={{ borderTop: "1px solid #2a2a2a" }}>
                    <td style={td}>{new Date(f.fecha || f.created_at).toLocaleDateString()}</td>
                    <td style={td}>{f.cliente}</td>
                    <td style={td}>{f.numero}</td>
                    <td style={td}>${Number(f.monto).toFixed(2)}</td>
                    <td style={td}>{f.estado}</td>
                    <td style={td}>
                      <button style={btnMini} onClick={() => verPdf(f.pdf_url)}>
                        Ver PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
      <div style={{ fontSize: 28, color: "#d4af37", fontWeight: 700 }}>{value}</div>
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
        fontWeight: strong ? 800 : 600,
      }}
    >
      {label}
    </div>
  );
}

const page: CSSProperties = {
  backgroundColor: "#0b0b0b",
  color: "#d4af37",
  minHeight: "100vh",
  padding: "40px",
  fontFamily: "Arial",
};

const panel: CSSProperties = {
  background: "#111",
  padding: "20px",
  borderRadius: "12px",
  border: "1px solid #333",
};

const grid4: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
  gap: "20px",
  marginTop: "20px",
};

const card: CSSProperties = {
  background: "#111",
  padding: "18px",
  borderRadius: "12px",
  border: "1px solid #333",
};

const label: CSSProperties = {
  color: "#aaa",
  fontSize: 12,
  marginBottom: 4,
};

const input: CSSProperties = {
  width: "100%",
  padding: "12px",
  marginBottom: "10px",
  borderRadius: "10px",
  border: "1px solid #2a2a2a",
  background: "#0f0f0f",
  color: "#fff",
  outline: "none",
};

const btnGold: CSSProperties = {
  width: "100%",
  padding: "14px",
  background: "#d4af37",
  color: "#000",
  border: "none",
  borderRadius: "10px",
  fontWeight: "bold",
  fontSize: "16px",
  cursor: "pointer",
};

const btnMini: CSSProperties = {
  padding: "8px 12px",
  background: "#d4af37",
  color: "#000",
  border: "none",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const table: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  color: "#eee",
};

const th: CSSProperties = {
  textAlign: "left",
  padding: "10px",
  color: "#d4af37",
  fontWeight: 700,
  borderBottom: "1px solid #2a2a2a",
};

const td: CSSProperties = {
  padding: "10px",
  color: "#eee",
};

const codeBox: CSSProperties = {
  display: "block",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #2a2a2a",
  background: "#0f0f0f",
  color: "#fff",
};