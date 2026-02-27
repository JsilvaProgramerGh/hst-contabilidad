"use client";

import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "./lib/supabase";

type Txn = { id: string; type: string; amount: number };

type Factura = {
  id: number;
  created_at: string;
  cliente: string;
  numero: string;
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
  nota: string | null;
};

function makeId() {
  // Compatible con iPhone/Safari: usa crypto.getRandomValues si existe, si no, Math.random
  const g: any = globalThis as any;

  if (g.crypto && g.crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    g.crypto.getRandomValues(bytes);
    // convierte a hex
    return Array.from(bytes)
      .map((b: number) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // fallback súper compatible
  return (
    Date.now().toString(16) +
    "-" +
    Math.random().toString(16).slice(2) +
    "-" +
    Math.random().toString(16).slice(2)
  );
}

export default function Home() {
  const [status, setStatus] = useState("Conectando...");

  // ---- movimientos ----
  const [monto, setMonto] = useState("");
const [porcentajeIva, setPorcentajeIva] = useState<0 | 15>(0);
  const [tipo, setTipo] = useState<"INGRESO" | "GASTO">("INGRESO");
  const [saldo, setSaldo] = useState(0);
  const [proveedor, setProveedor] = useState("")
const [detalle, setDetalle] = useState("")
  const [ingresos, setIngresos] = useState(0);
  const [gastos, setGastos] = useState(0);
const [movimientos, setMovimientos] = useState<any[]>([]);
const hoyISO = new Date().toISOString().slice(0, 10);
const primerDiaMesISO = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  .toISOString()
  .slice(0, 10);

const [desde, setDesde] = useState(primerDiaMesISO);
const [hasta, setHasta] = useState(hoyISO);
const ADMIN_PASSWORD = "1234";
const ingresosList = movimientos.filter(
  (m) => m.type === "VENTA_DIRECTA" || m.type === "PAGO_FACTURA"
);

const gastosList = movimientos.filter(
  (m) => m.type === "GASTO" || m.type === "COMPRA"
);

  // ---- facturas ----
  const [cliente, setCliente] = useState("");
  const [numeroFactura, setNumeroFactura] = useState("");
  const [montoFactura, setMontoFactura] = useState("");
  const [porcentajeIvaFactura, setPorcentajeIvaFactura] = useState<0 | 15>(0);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [facturas, setFacturas] = useState<Factura[]>([]);

  // ---- pagos ----
  const [pagos, setPagos] = useState<PagoFactura[]>([]);
  const [verPagosDe, setVerPagosDe] = useState<Factura | null>(null);

  // ---- sugerencias clientes ----
  const [sugerencias, setSugerencias] = useState<string[]>([]);
  const [mostrarSug, setMostrarSug] = useState(false);

  // Mapa: factura_id -> total pagado
  const pagadoPorFactura = useMemo(() => {
    const m = new Map<number, number>();
    pagos.forEach((p) => {
      m.set(p.factura_id, (m.get(p.factura_id) || 0) + Number(p.monto));
    });
    return m;
  }, [pagos]);

  // Por cobrar = suma (monto - pagado) de facturas no pagadas
  const porCobrar = useMemo(() => {
    return facturas.reduce((acc, f) => {
      const pagado = pagadoPorFactura.get(f.id) || 0;
      const restante = Math.max(0, Number(f.monto) - pagado);
      if (restante > 0) acc += restante;
      return acc;
    }, 0);
  }, [facturas, pagadoPorFactura]);

  async function cargarDatos() {
    // movimientos
const tx = await supabase
  .from("transactions")
  .select("*")
  .order("created_at", { ascending: false });

if (!tx.error && tx.data) {

  // 🔹 Guardamos los movimientos para el historial
  setMovimientos(tx.data);

  let total = 0;
  let ing = 0;
  let gas = 0;

  tx.data.forEach((t: any) => {
    if (t.type === "VENTA_DIRECTA" || t.type === "PAGO_FACTURA") {
      total += Number(t.amount);
      ing += Number(t.amount);
    } else {
      total -= Number(t.amount);
      gas += Number(t.amount);
    }
  });

  setSaldo(total);
  setIngresos(ing);
  setGastos(gas);
}

    // facturas
    const f = await supabase
      .from("facturas")
      .select("id,created_at,cliente,numero,monto,subtotal,iva,porcentaje_iva,estado,pdf_url,fecha")
      .order("created_at", { ascending: false });

    if (!f.error && f.data) setFacturas(f.data as any);

    // pagos
    const p = await supabase
      .from("pagos_factura")
      .select("id,factura_id,monto,fecha,nota")
      .order("fecha", { ascending: false });

    if (!p.error && p.data) setPagos(p.data as any);
  }

  useEffect(() => {
    (async () => {
      const { error } = await supabase.from("share_links").select("id").limit(1);
      setStatus(error ? `Error: ${error.message}` : "🟢 EN LINEA");
      await cargarDatos();
    })();
  }, []);

  function calcIvaDesdeTotal(total: number, porcentaje: 0 | 15) {
  if (porcentaje === 0) {
    return { subtotal: Number(total.toFixed(2)), iva: 0 };
  }
  // IVA 15%
  const subtotal = total / 1.15;
  const iva = total - subtotal;
  return { subtotal: Number(subtotal.toFixed(2)), iva: Number(iva.toFixed(2)) };
}

  async function guardarMovimiento() {
    if (!monto) return alert("Pon un monto");

    const total = parseFloat(monto);
if (Number.isNaN(total) || total <= 0) return alert("Monto inválido");

const { subtotal, iva } = calcIvaDesdeTotal(total, porcentajeIva);

const { error } = await supabase.from("transactions").insert({
  amount: total, // total final pagado/cobrado
  subtotal,
  iva,
  porcentaje_iva: porcentajeIva,

  description: `${proveedor} - ${detalle}`,
  area: "GENERAL",
  account: "BANCO",
  type: tipo === "INGRESO" ? "VENTA_DIRECTA" : "GASTO",
  proveedor,
  detalle,
});

    if (error) alert("Error guardando: " + error.message);
    else {
      setMonto("");
      await cargarDatos();
    }
  }
  

const eliminarMovimiento = async (id: string) => {
  const pass = prompt("Ingrese contraseña para eliminar:");

  if (pass !== ADMIN_PASSWORD) {
    alert("Contraseña incorrecta");
    return;
  }

  const { data, error } = await supabase
  .from("transactions")
  .delete()
  .eq("id", id)
  .select();

console.log("DELETE RESULT:", data);

  if (error) {
    alert("Error eliminando: " + error.message);
  } else {
    alert("Movimiento eliminado");
    await cargarDatos();
  }
};

  async function buscarClientes(q: string) {
    const query = q.trim();
    if (!query) {
      setSugerencias([]);
      return;
    }

    const res = await supabase
      .from("facturas")
      .select("cliente")
      .ilike("cliente", `${query}%`)
      .limit(8);

    if (res.error || !res.data) {
      setSugerencias([]);
      return;
    }

    const unique = Array.from(new Set(res.data.map((r: any) => r.cliente))).slice(0, 8);
    setSugerencias(unique);
  }

  async function crearFactura() {
    if (!cliente.trim()) return alert("Pon el nombre del cliente/empresa");
    if (!montoFactura) return alert("Pon el monto total");
    if (!pdfFile) return alert("Sube el PDF");

    setSubiendo(true);
    try {
      const path = `hst/${makeId()}.pdf`;

      const upload = await supabase.storage
        .from("invoices")
        .upload(path, pdfFile, { contentType: "application/pdf", upsert: false });

      if (upload.error) throw new Error(upload.error.message);
const totalFactura = parseFloat(montoFactura);
if (Number.isNaN(totalFactura) || totalFactura <= 0) return alert("Monto inválido");

const { subtotal: subtotalFactura, iva: ivaFactura } = calcIvaDesdeTotal(
  totalFactura,
  porcentajeIvaFactura
);

      const ins = await supabase.from("facturas").insert({
    cliente: cliente.trim(),
  numero: numeroFactura.trim(),
  monto: totalFactura,

  subtotal: subtotalFactura,
  iva: ivaFactura,
  porcentaje_iva: porcentajeIvaFactura,

  estado: "pendiente",
  pdf_url: path,
  fecha: new Date().toISOString(),
});

      if (ins.error) throw new Error(ins.error.message);

      setCliente("");
      setNumeroFactura("");
      setMontoFactura("");
      setPorcentajeIvaFactura(0);
      setPdfFile(null);
      setSugerencias([]);
      setMostrarSug(false);

      await cargarDatos();
      alert("✅ Factura creada");
    } catch (e: any) {
      alert("Error: " + (e?.message || e));
    } finally {
      setSubiendo(false);
    }
  }

  async function verPdf(path: string) {
  const signed = await supabase.storage
    .from("invoices")
    .createSignedUrl(path, 60 * 10);

  if (signed.error) return alert("No pude abrir el PDF: " + signed.error.message);

  // ✅ funciona en celular (sin popups)
  window.location.href = signed.data.signedUrl;
}

  function restanteFactura(f: Factura) {
    const pagado = pagadoPorFactura.get(f.id) || 0;
    return Math.max(0, Number(f.monto) - pagado);
  }

  async function registrarPago(f: Factura) {
    async function eliminarFactura(f: Factura) {
      async function editarMontoFactura(f: Factura) {
  const nuevo = prompt(
    `Monto actual: $${f.monto}\nIngrese nuevo monto:`,
    f.monto.toString()
  );

  if (!nuevo) return;

  const valor = Number(nuevo);
  if (isNaN(valor) || valor <= 0) {
    alert("Monto inválido");
    return;
  }

  const { error } = await supabase
    .from("facturas")
    .update({ monto: valor })
    .eq("id", f.id);

  if (error) {
    alert("Error actualizando: " + error.message);
  } else {
    alert("Monto actualizado");
    await cargarDatos();
  }
}
  const pass = prompt("Ingrese contraseña para eliminar factura:");

  if (pass !== ADMIN_PASSWORD) {
    alert("Contraseña incorrecta");
    return;
  }

  const confirmacion = confirm(
    `¿Seguro que deseas eliminar la factura ${f.numero}?`
  );

  if (!confirmacion) return;

  // eliminar pagos relacionados
  await supabase
    .from("pagos_factura")
    .delete()
    .eq("factura_id", f.id);

  // eliminar factura
  const { error } = await supabase
    .from("facturas")
    .delete()
    .eq("id", f.id);

  if (error) {
    alert("Error eliminando: " + error.message);
  } else {
    alert("Factura eliminada");
    await cargarDatos();
  }
}
    const restante = restanteFactura(f);
    if (restante <= 0) return alert("Esa factura ya está pagada.");

    const valor = prompt(
      `Registrar pago parcial\nCliente: ${f.cliente}\nRestante: $${restante.toFixed(2)}\n\n¿Cuánto pagó hoy?`,
      restante.toFixed(2)
    );

    if (!valor) return;

    const pago = Number(valor);
    if (Number.isNaN(pago) || pago <= 0) return alert("Monto inválido");
    if (pago > restante) return alert("Ese pago es mayor que el restante");

    // 1) insertar pago en pagos_factura
    const ins = await supabase.from("pagos_factura").insert({
      factura_id: f.id,
      monto: pago,
      nota: null,
    });

    if (ins.error) return alert("Error registrando pago: " + ins.error.message);

    // 2) registrar ingreso en transactions
    const tx = await supabase.from("transactions").insert({
      amount: pago,
      description: `Pago factura #${f.id} - ${f.cliente}`,
      area: "GENERAL",
      account: "BANCO",
      type: "PAGO_FACTURA",
    });

    if (tx.error) return alert("Error creando movimiento: " + tx.error.message);

    // 3) recalcular estado y actualizar factura
    await cargarDatos(); // trae pagos actualizados

    // calculamos nuevo restante con datos ya refrescados
    const nuevoRestante = Math.max(0, restante - pago);

    const nuevoEstado: Factura["estado"] =
      nuevoRestante <= 0 ? "pagado" : "parcial";

    const up = await supabase
      .from("facturas")
      .update({ estado: nuevoEstado })
      .eq("id", f.id);

    if (up.error) return alert("Error actualizando estado: " + up.error.message);

    await cargarDatos();
    alert(nuevoEstado === "pagado" ? "✅ Factura PAGADA" : "✅ Pago parcial registrado");
  }

  async function editarMontoFactura(f: Factura) {
  const nuevo = prompt(
    `Monto actual: $${f.monto}\nIngrese nuevo monto:`,
    f.monto.toString()
  );

  if (!nuevo) return;

  const valor = Number(nuevo);
  if (isNaN(valor) || valor <= 0) {
    alert("Monto inválido");
    return;
  }

  const { error } = await supabase
    .from("facturas")
    .update({ monto: valor })
    .eq("id", f.id);

  if (error) {
    alert("Error actualizando: " + error.message);
  } else {
    alert("Monto actualizado");
    await cargarDatos();
  }
}

async function eliminarFactura(f: Factura) {
  const pass = prompt("Ingrese contraseña para eliminar factura:");

  if (pass !== ADMIN_PASSWORD) {
    alert("Contraseña incorrecta");
    return;
  }

  const confirmacion = confirm(
    `¿Seguro que deseas eliminar la factura ${f.numero}?`
  );

  if (!confirmacion) return;

  await supabase
    .from("pagos_factura")
    .delete()
    .eq("factura_id", f.id);

  const { error } = await supabase
    .from("facturas")
    .delete()
    .eq("id", f.id);

  if (error) {
    alert("Error eliminando: " + error.message);
  } else {
    alert("Factura eliminada");
    await cargarDatos();
  }
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

function dentroDeRango(fechaISO: string, desdeISO: string, hastaISO: string) {
  const t = new Date(fechaISO).getTime();
  const d = new Date(desdeISO + "T00:00:00").getTime();
  const h = new Date(hastaISO + "T23:59:59").getTime();
  return t >= d && t <= h;
}

async function generarEstadoCuentaPDF() {
  console.log("✅ Entró a generar PDF");
  try {
    const doc = new jsPDF("p", "mm", "a4");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("HST CONTABILIDAD - PRUEBA PDF", 12, 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    // Si 'desde' o 'hasta' no existen, esto también puede romper.
    doc.text(`Periodo: ${String(desde)} a ${String(hasta)}`, 12, 28);
    doc.text(`Emitido: ${new Date().toLocaleString()}`, 12, 34);

    console.log("✅ Antes de doc.save");
    doc.save(`PRUEBA_${String(desde)}_a_${String(hasta)}.pdf`);
    console.log("✅ doc.save ejecutado");
  } catch (err) {
    console.error("❌ Error generando PDF:", err);
    alert("❌ Error generando PDF. Abre la consola (F12) y mira el error.");
  }
}
  return (
    <main style={{ backgroundColor: "#0b0b0b", color: "#d4af37", minHeight: "100vh", padding: "40px", fontFamily: "Arial" }}>
      <h1 style={{ fontSize: "48px" }}>HST CONTABILIDAD</h1>
      <p style={{ color: "#aaa" }}>Panel financiero Julian Silva</p>
      <p style={{ color: "#00ff88" }}>{status}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "20px", marginTop: "20px" }}>
        <Card title="💰 Saldo total" value={`$${saldo.toFixed(2)}`} />
        <Card title="📈 Ingresos" value={`$${ingresos.toFixed(2)}`} />
        <Card title="📉 Gastos" value={`$${gastos.toFixed(2)}`} />
        <Card title="🧾 Por cobrar" value={`$${porCobrar.toFixed(2)}`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: "20px", marginTop: "30px", alignItems: "start" }}>
        <section style={panel}>
          <h2 style={{ marginTop: 0 }}>Nuevo movimiento</h2>

          <select value={tipo} onChange={(e) => setTipo(e.target.value as any)} style={input}>
            <option value="INGRESO">Ingreso</option>
            <option value="GASTO">Gasto</option>
          </select>

          <input placeholder="Monto $" value={monto} onChange={(e) => setMonto(e.target.value)} style={input} />
          <select
  value={porcentajeIva}
  onChange={(e) => setPorcentajeIva(Number(e.target.value) as 0 | 15)}
  style={input}
>
  <option value={0}>IVA 0%</option>
  <option value={15}>IVA 15%</option>
</select>
          <input
  placeholder={tipo === "INGRESO" ? "¿Quién pagó?" : "¿A quién se pagó?"}
  value={proveedor}
  onChange={(e) => setProveedor(e.target.value)}
  style={input}
/>

<input
  placeholder="Concepto / Descripción"
  value={detalle}
  onChange={(e) => setDetalle(e.target.value)}
  style={input}
/>

          <button onClick={guardarMovimiento} style={btnGold}>GUARDAR MOVIMIENTO</button>
          <button onClick={cargarDatos} style={btnGhost}>🔄 Actualizar panel</button>
        </section>

        <section style={panel}>
          <h2 style={{ marginTop: 0 }}>Facturas (PDF)</h2>

          <div style={{ position: "relative" }}>
            <input
              placeholder="Cliente / Empresa"
              value={cliente}
              onChange={(e) => {
                const v = e.target.value;
                setCliente(v);
                setMostrarSug(true);
                buscarClientes(v);
              }}
              onFocus={() => setMostrarSug(true)}
              onBlur={() => setTimeout(() => setMostrarSug(false), 150)}
              style={input}
            />

            {mostrarSug && sugerencias.length > 0 && (
              <div style={{
                position: "absolute",
                top: 52,
                left: 0,
                right: 0,
                background: "#0f0f0f",
                border: "1px solid #2a2a2a",
                borderRadius: 10,
                overflow: "hidden",
                zIndex: 10
              }}>
                {sugerencias.map((s) => (
                  <div
                    key={s}
                    onMouseDown={() => {
                      setCliente(s);
                      setMostrarSug(false);
                      setSugerencias([]);
                    }}
                    style={{
                      padding: "10px 12px",
                      cursor: "pointer",
                      color: "#fff",
                      borderTop: "1px solid #1f1f1f"
                    }}
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>

          <input
  placeholder="Número de factura"
  value={numeroFactura}
  onChange={(e) => setNumeroFactura(e.target.value)}
  style={input}
/>

          <input placeholder="Total $" value={montoFactura} onChange={(e) => setMontoFactura(e.target.value)} style={input} />
          <select
  value={porcentajeIvaFactura}
  onChange={(e) => setPorcentajeIvaFactura(Number(e.target.value) as 0 | 15)}
  style={input}
>
  <option value={0}>IVA 0%</option>
  <option value={15}>IVA 15%</option>
</select>

          <input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] || null)} style={{ ...input, padding: "10px" }} />

          <button onClick={crearFactura} style={btnGold} disabled={subiendo}>
            {subiendo ? "SUBIENDO..." : "CREAR FACTURA"}
          </button>

          <p style={{ color: "#888", marginTop: 12, fontSize: 13 }}>
            * Ahora puedes registrar pagos parciales y el sistema calcula lo restante.
          </p>
        </section>
      </div>
      <section style={{ ...panel, marginTop: 30 }}>
  <h2 style={{ marginTop: 0 }}>📜 Historial General</h2>
  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
  <div style={{ flex: "1 1 180px" }}>
    <div style={{ color: "#aaa", fontSize: 12, marginBottom: 4 }}>Desde</div>
    <input
      type="date"
      value={desde}
      onChange={(e) => setDesde(e.target.value)}
      style={input}
    />
  </div>

  <div style={{ flex: "1 1 180px" }}>
    <div style={{ color: "#aaa", fontSize: 12, marginBottom: 4 }}>Hasta</div>
    <input
      type="date"
      value={hasta}
      onChange={(e) => setHasta(e.target.value)}
      style={input}
    />
  </div>

  <div style={{ flex: "1 1 220px", display: "flex", alignItems: "end" }}>
    <button style={btnGold} onClick={generarEstadoCuentaPDF}>
      🧾 Descargar PDF (Estado de Cuenta)
    </button>
  </div>
</div>

  {movimientos.length === 0 ? (
    <p style={{ color: "#aaa" }}>No hay movimientos registrados.</p>
  ) : (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", color: "#eee" }}>
        <thead>
          <tr>
            <th style={th}>Fecha</th>
            <th style={th}>Tipo</th>
            <th style={th}>Monto</th>
            <th style={th}>Detalle</th>
            <th style={th}>Acción</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((m) => (
            <tr key={m.id} style={{ borderTop: "1px solid #2a2a2a" }}>
              <td style={td}>
                {new Date(m.created_at).toLocaleString()}
              </td>
              <td style={td}>
                {m.type === "VENTA_DIRECTA" || m.type === "PAGO_FACTURA"
                  ? "Ingreso"
                  : "Gasto"}
              </td>
              
              
              <td style={td}>
  <span
    style={{
      color:
        m.type === "VENTA_DIRECTA" || m.type === "PAGO_FACTURA"
          ? "#00ff88"
          : "#ff4d4d",
      fontWeight: 700
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
        <h2 style={{ marginTop: 0 }}>Listado de facturas</h2>

        {facturas.length === 0 ? (
          <p style={{ color: "#aaa" }}>Aún no hay facturas.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", color: "#eee" }}>
              <thead>
                <tr>
                  <th style={th}>Fecha</th>
                  <th style={th}>Cliente</th>
                  <th style={th}>N° Factura</th>
                  <th style={th}>Total</th>
                  <th style={th}>Pagado</th>
                  <th style={th}>Restante</th>
                  <th style={th}>Estado</th>
                  <th style={th}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map((f) => {
                  const pagado = pagadoPorFactura.get(f.id) || 0;
                  const rest = Math.max(0, Number(f.monto) - pagado);
                  return (
                    <tr key={f.id} style={{ borderTop: "1px solid #2a2a2a" }}>
                      <td style={td}>{new Date(f.fecha).toLocaleDateString()}</td>
                      <td style={td}>{f.cliente}</td>
                      <td style={td}>{f.numero}</td>
                      <td style={td}>${Number(f.monto).toFixed(2)}</td>
                      <td style={td}>${pagado.toFixed(2)}</td>
                      <td style={td}>${rest.toFixed(2)}</td>
                      <td style={td}>{f.estado}</td>
                      <td style={td}>
  <button
    style={btnMini}
    onClick={() => verPdf(f.pdf_url)}
  >
    Ver PDF
  </button>{" "}

  <button
    style={btnMini}
    onClick={() => editarMontoFactura(f)}
  >
    Editar monto
  </button>{" "}

  {rest > 0 && (
    <button
      style={btnMiniGhost}
      onClick={() => registrarPago(f)}
    >
      Registrar pago
    </button>
  )}{" "}

  <button
    style={btnMiniGhost}
    onClick={() => setVerPagosDe(f)}
  >
    Ver pagos
  </button>{" "}

  <button
    style={{ ...btnMiniGhost, color: "#ff4d4d", borderColor: "#ff4d4d" }}
    onClick={() => eliminarFactura(f)}
  >
    Eliminar
  </button>
</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {verPagosDe && (
        <section style={{ ...panel, marginTop: 20 }}>
          <h2 style={{ marginTop: 0 }}>
            Pagos de: {verPagosDe.cliente} (Factura #{verPagosDe.id})
          </h2>
          <button style={btnGhost} onClick={() => setVerPagosDe(null)}>Cerrar</button>

          <div style={{ marginTop: 10 }}>
            {pagos.filter(p => p.factura_id === verPagosDe.id).length === 0 ? (
              <p style={{ color: "#aaa" }}>Aún no hay pagos.</p>
            ) : (
              <ul style={{ color: "#eee" }}>
                {pagos
                  .filter((p) => p.factura_id === verPagosDe.id)
                  .map((p) => (
                    <li key={p.id} style={{ marginBottom: 8 }}>
                      ${Number(p.monto).toFixed(2)} — {new Date(p.fecha).toLocaleString()}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </section>
      )}
      <section style={{ ...panel, marginTop: 20 }}>
  <h2 style={{ marginTop: 0 }}>Historial General</h2>
<div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
  <div style={{ flex: "1 1 180px" }}>
    <div style={{ color: "#aaa", fontSize: 12, marginBottom: 4 }}>Desde</div>
    <input
      type="date"
      value={desde}
      onChange={(e) => setDesde(e.target.value)}
      style={input}
    />
  </div>

  <div style={{ flex: "1 1 180px" }}>
    <div style={{ color: "#aaa", fontSize: 12, marginBottom: 4 }}>Hasta</div>
    <input
      type="date"
      value={hasta}
      onChange={(e) => setHasta(e.target.value)}
      style={input}
    />
  </div>

  <div style={{ flex: "1 1 260px", display: "flex", alignItems: "end" }}>
    <button style={btnGold} onClick={generarEstadoCuentaPDF}>
      🧾 Descargar PDF (Estado de Cuenta)
    </button>
  </div>
</div>
  {movimientos.length === 0 ? (
    <p style={{ color: "#aaa" }}>No hay movimientos.</p>
  ) : (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", color: "#eee" }}>
        <thead>
          <tr>
            <th style={th}>Fecha</th>
            <th style={th}>Tipo</th>
            <th style={th}>Monto</th>
            <th style={th}>Acción</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((m) => (
            <tr key={m.id} style={{ borderTop: "1px solid #2a2a2a" }}>
              <td style={td}>
                {new Date(m.created_at).toLocaleString()}
              </td>

              <td style={td}>
                {m.type === "VENTA_DIRECTA" || m.type === "PAGO_FACTURA"
                  ? "Ingreso"
                  : "Gasto"}
              </td>

              <td style={td}>
                <span
                  style={{
                    color:
                      m.type === "VENTA_DIRECTA" || m.type === "PAGO_FACTURA"
                        ? "#00ff88"
                        : "#ff4d4d",
                    fontWeight: 700
                  }}
                >
                  ${Number(m.amount).toFixed(2)}
                </span>
              </td>

              <td style={td}>
                <button
                  onClick={() => eliminarMovimiento(m.id)}
                  style={{
                    background: "#300",
                    color: "#ff4d4d",
                    border: "1px solid #ff4d4d",
                    padding: "4px 8px",
                    borderRadius: 6,
                    cursor: "pointer"
                  }}
                >
                  Eliminar
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
    <div style={{ background: "#111", padding: "18px", borderRadius: "12px", border: "1px solid #333" }}>
      <div style={{ color: "#aaa", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 28, color: "#d4af37", fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const panel: React.CSSProperties = { background: "#111", padding: "20px", borderRadius: "12px", border: "1px solid #333" };
const input: React.CSSProperties = { width: "100%", padding: "12px", marginBottom: "10px", borderRadius: "10px", border: "1px solid #2a2a2a", background: "#0f0f0f", color: "#fff", outline: "none" };
const btnGold: React.CSSProperties = { width: "100%", padding: "14px", background: "#d4af37", color: "#000", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "16px", cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "10px 12px", background: "transparent", color: "#d4af37", border: "1px solid #d4af37", borderRadius: "10px", fontWeight: "bold", cursor: "pointer" };
const btnMini: React.CSSProperties = { padding: "8px 12px", background: "#d4af37", color: "#000", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: "pointer" };
const btnMiniGhost: React.CSSProperties = { padding: "8px 12px", background: "transparent", color: "#d4af37", border: "1px solid #d4af37", borderRadius: "10px", fontWeight: "bold", cursor: "pointer", marginLeft: 8 };
const th: React.CSSProperties = { textAlign: "left", padding: "10px", color: "#d4af37", fontWeight: 700, borderBottom: "1px solid #2a2a2a" };
const td: React.CSSProperties = { padding: "10px", color: "#eee" };