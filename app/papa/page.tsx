"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Factura = {
  id: number;
  cliente: string;
  monto: number;
  estado: "pendiente" | "parcial" | "pagado";
  pdf_url: string;
  fecha: string;
};

type PagoFactura = {
  id: number;
  factura_id: number;
  monto: number;
  fecha: string;
};

type Txn = {
  id: string;
  created_at?: string;
  txn_date?: string;
  type: string;
  amount: number;
  description: string;
  account?: string;
  area?: string;
};

export default function PapaView() {
  const [status, setStatus] = useState("Conectando...");
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [pagos, setPagos] = useState<PagoFactura[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);

  const [saldo, setSaldo] = useState(0);
  const [ingresos, setIngresos] = useState(0);
  const [gastos, setGastos] = useState(0);

  const pagadoPorFactura = useMemo(() => {
    const m = new Map<number, number>();
    pagos.forEach((p) => m.set(p.factura_id, (m.get(p.factura_id) || 0) + Number(p.monto)));
    return m;
  }, [pagos]);

  const porCobrar = useMemo(() => {
    return facturas.reduce((acc, f) => {
      const pagado = pagadoPorFactura.get(f.id) || 0;
      const restante = Math.max(0, Number(f.monto) - pagado);
      if (restante > 0) acc += restante;
      return acc;
    }, 0);
  }, [facturas, pagadoPorFactura]);

  const facturasPendientes = useMemo(() => {
    return facturas
      .map((f) => {
        const pagado = pagadoPorFactura.get(f.id) || 0;
        const restante = Math.max(0, Number(f.monto) - pagado);
        return { ...f, pagado, restante };
      })
      .filter((f: any) => f.restante > 0)
      .sort((a: any, b: any) => b.restante - a.restante);
  }, [facturas, pagadoPorFactura]);

  async function cargar() {
    // 1) Transacciones (para historial + tarjetas)
    const tx = await supabase
      .from("transactions")
      .select("id,created_at,txn_date,type,amount,description,account,area")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!tx.error && tx.data) {
      setTxns(tx.data as any);

      let total = 0;
      let ing = 0;
      let gas = 0;

      (tx.data as any[]).forEach((t) => {
        if (t.type === "VENTA_DIRECTA" || t.type === "PAGO_FACTURA") {
          total += Number(t.amount);
          ing += Number(t.amount);
        } else if (t.type === "GASTO" || t.type === "COMPRA") {
          total -= Number(t.amount);
          gas += Number(t.amount);
        }
      });

      // OJO: estas tarjetas salen de los últimos movimientos cargados.
      // Luego si quieres que sea 100% total histórico, lo cambiamos a una consulta agregada.
      setSaldo(total);
      setIngresos(ing);
      setGastos(gas);
    }

    // 2) Facturas
    const f = await supabase
      .from("facturas")
      .select("id,cliente,monto,estado,pdf_url,fecha")
      .order("fecha", { ascending: false });

    if (!f.error && f.data) setFacturas(f.data as any);

    // 3) Pagos
    const p = await supabase
      .from("pagos_factura")
      .select("id,factura_id,monto,fecha")
      .order("fecha", { ascending: false });

    if (!p.error && p.data) setPagos(p.data as any);
  }

  useEffect(() => {
    (async () => {
      const { error } = await supabase.from("share_links").select("id").limit(1);
      setStatus(error ? `Error: ${error.message}` : "🟢VICTOR SILVA - EN LINEA ");
      await cargar();
    })();
  }, []);

  async function verPdf(path: string) {
  const signed = await supabase.storage
    .from("invoices")
    .createSignedUrl(path, 60 * 10);

  if (signed.error) {
    alert("No pude abrir el PDF: " + signed.error.message);
    return;
  }

  // ✅ Sin popups: abre en la MISMA pestaña (funciona en celular)
  window.location.href = signed.data.signedUrl;
}

  return (
    <main style={{ background: "#070707", color: "#d4af37", minHeight: "100vh", padding: 16, fontFamily: "Arial" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 1 }}>HST CONTABILIDAD</div>
          <div style={{ color: "#7cffb4", marginTop: 6, fontSize: 16 }}>{status}</div>
        </div>

        <button
          onClick={cargar}
          style={{
            padding: "14px 16px",
            borderRadius: 14,
            border: "1px solid #d4af37",
            background: "transparent",
            color: "#d4af37",
            fontWeight: 900,
            fontSize: 16,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          🔄 Actualizar
        </button>
      </div>

      {/* TARJETAS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 14 }}>
        <BigCard title="SALDO (calculado)" value={`$${saldo.toFixed(2)}`} accent />
        <BigCard title="INGRESOS (últimos 50)" value={`$${ingresos.toFixed(2)}`} />
        <BigCard title="GASTOS (últimos 50)" value={`$${gastos.toFixed(2)}`} />
        <BigCard title="POR COBRAR" value={`$${porCobrar.toFixed(2)}`} danger />
      </div>

      {/* FACTURAS PENDIENTES */}
      <Section title="Facturas por cobrar (pendientes/parciales)">
        {facturasPendientes.length === 0 ? (
          <div style={{ color: "#aaa", fontSize: 18 }}>✅ No hay facturas por cobrar.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {facturasPendientes.slice(0, 40).map((f: any) => (
              <Card key={f.id}>
                <Row>
                  <div style={{ minWidth: 220 }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "#fff" }}>{f.cliente}</div>
                    <div style={{ color: "#aaa", marginTop: 6, fontSize: 14 }}>
                      Factura #{f.id} • {new Date(f.fecha).toLocaleDateString()}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, color: "#aaa" }}>Restante</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: "#ffcc66" }}>${Number(f.restante).toFixed(2)}</div>
                  </div>
                </Row>

                <Grid3>
                  <MiniStat label="Total" value={`$${Number(f.monto).toFixed(2)}`} />
                  <MiniStat label="Pagado" value={`$${Number(f.pagado).toFixed(2)}`} />
                  <MiniStat label="Estado" value={String(f.estado).toUpperCase()} />
                </Grid3>

                <button onClick={() => verPdf(f.pdf_url)} style={btnGold}>
                  VER PDF
                </button>
              </Card>
            ))}
          </div>
        )}
      </Section>

      {/* TODAS LAS FACTURAS */}
      <Section title="Todas las facturas (incluye pagadas)">
        {facturas.length === 0 ? (
          <div style={{ color: "#aaa" }}>Aún no hay facturas.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {facturas.slice(0, 60).map((f) => {
              const pagado = pagadoPorFactura.get(f.id) || 0;
              const restante = Math.max(0, Number(f.monto) - pagado);
              return (
                <Card key={f.id}>
                  <Row>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>{f.cliente}</div>
                      <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
                        Factura #{f.id} • {new Date(f.fecha).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "#aaa", fontSize: 12 }}>Restante</div>
                      <div style={{ color: restante > 0 ? "#ffcc66" : "#7cffb4", fontSize: 20, fontWeight: 900 }}>
                        ${restante.toFixed(2)}
                      </div>
                    </div>
                  </Row>

                  <Grid3>
                    <MiniStat label="Total" value={`$${Number(f.monto).toFixed(2)}`} />
                    <MiniStat label="Pagado" value={`$${Number(pagado).toFixed(2)}`} />
                    <MiniStat label="Estado" value={String(f.estado).toUpperCase()} />
                  </Grid3>

                  <button onClick={() => verPdf(f.pdf_url)} style={btnGold}>
                    VER PDF
                  </button>
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      {/* HISTORIAL DE MOVIMIENTOS */}
      <Section title="Historial (Ingresos / Gastos / Pagos)">
        {txns.length === 0 ? (
          <div style={{ color: "#aaa" }}>Aún no hay movimientos.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {txns.map((t) => (
              <Card key={t.id}>
                <Row>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>
                      {t.type === "GASTO" || t.type === "COMPRA" ? "🔻" : "🔺"} {t.type}
                    </div>
                    <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>{t.description}</div>
                    <div style={{ color: "#666", fontSize: 12, marginTop: 4 }}>
                      {t.created_at ? new Date(t.created_at).toLocaleString() : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#aaa", fontSize: 12 }}>Monto</div>
                    <div
                      style={{
                        color: t.type === "GASTO" || t.type === "COMPRA" ? "#ff8a8a" : "#7cffb4",
                        fontSize: 22,
                        fontWeight: 900,
                      }}
                    >
                      ${Number(t.amount).toFixed(2)}
                    </div>
                  </div>
                </Row>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <div style={{ marginTop: 16, color: "#666", fontSize: 13 }}>
        * Esta pantalla es <b>solo lectura</b>.
      </div>
    </main>
  );
}

function BigCard({ title, value, accent, danger }: { title: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div style={{ background: "#0f0f0f", border: "1px solid #222", borderRadius: 18, padding: 16 }}>
      <div style={{ color: "#aaa", fontSize: 14, letterSpacing: 1, fontWeight: 800 }}>{title}</div>
      <div style={{ marginTop: 10, fontSize: 34, fontWeight: 1000, color: danger ? "#ff8a8a" : accent ? "#7cffb4" : "#d4af37" }}>
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <section style={{ marginTop: 16, background: "#0f0f0f", border: "1px solid #222", borderRadius: 18, padding: 14 }}>
      <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 10, color: "#fff" }}>{title}</div>
      {children}
    </section>
  );
}

function Card({ children }: { children: any }) {
  return <div style={{ background: "#0b0b0b", border: "1px solid #262626", borderRadius: 16, padding: 14 }}>{children}</div>;
}

function Row({ children }: { children: any }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>{children}</div>;
}

function Grid3({ children }: { children: any }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 12 }}>{children}</div>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#0f0f0f", border: "1px solid #222", borderRadius: 14, padding: 12 }}>
      <div style={{ color: "#aaa", fontSize: 12, fontWeight: 900 }}>{label}</div>
      <div style={{ color: "#fff", fontSize: 16, fontWeight: 900, marginTop: 6 }}>{value}</div>
    </div>
  );
}

const btnGold: React.CSSProperties = {
  marginTop: 12,
  width: "100%",
  padding: "14px",
  borderRadius: 14,
  border: "none",
  background: "#d4af37",
  color: "#000",
  fontWeight: 900,
  fontSize: 18,
  cursor: "pointer",
};