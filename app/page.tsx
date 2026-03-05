"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import jsPDF from "jspdf";
import { supabase } from "./lib/supabase";

/** ✅ MENÚ LATERAL (hamburguesa + drawer) */
function InventoryDrawer() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Botón ☰ fijo arriba-izquierda */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={drawerFab}
        aria-label="Abrir menú"
        title="Menú"
      >
        ☰
      </button>

      {/* Fondo oscuro al abrir */}
      {open && <div style={drawerBackdrop} onClick={() => setOpen(false)} />}

      {/* Drawer */}
      <aside
        style={{
          ...drawerPanel,
          transform: open ? "translateX(0)" : "translateX(-110%)",
        }}
      >
        <div style={drawerHeader}>
          <div>
            <div style={drawerBrandTitle}>HST</div>
            <div style={drawerBrandSub}>Menú rápido</div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            style={drawerClose}
            aria-label="Cerrar"
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        <div style={drawerSection}>CONTABILIDAD</div>
<nav style={{ display: "grid", gap: 8 }}>

  <a style={drawerItem} href="/" onClick={() => setOpen(false)}>
    📊 Panel Contabilidad
  </a>

  <a style={drawerItem} href="/cotizacion" onClick={() => setOpen(false)}>
    📄 Cotizaciones
  </a>

</nav>

        <div style={drawerDivider} />

        <div style={drawerSection}>INVENTARIO</div>
        <nav style={{ display: "grid", gap: 8 }}>
          <a style={drawerItem} href="/inventario" onClick={() => setOpen(false)}>
            🏠 Inicio Inventario
          </a>
          <a style={drawerItem} href="/inventario/productos" onClick={() => setOpen(false)}>
            📦 Productos
          </a>
          <a style={drawerItem} href="/inventario/compras" onClick={() => setOpen(false)}>
            🛒 Compras
          </a>
          <a style={drawerItem} href="/inventario/calculadora" onClick={() => setOpen(false)}>
            🧮 Calculadora PVP
          </a>
          <a style={drawerItem} href="/inventario/stock" onClick={() => setOpen(false)}>
            📦 Inventario (Stock)
          </a>
          <a style={drawerItem} href="/inventario/venta" onClick={() => setOpen(false)}>
            💰 Venta (POS)
          </a>
          <a style={drawerItem} href="/inventario/reportes" onClick={() => setOpen(false)}>
            📊 Reportes
          </a>
        </nav>

        <div style={drawerFooter}>
          <div style={{ color: "#777", fontSize: 11 }}>HST Global Store</div>
        </div>
      </aside>
    </>
  );
}

const drawerFab: React.CSSProperties = {
  position: "fixed",
  left: 14,
  top: 14,
  zIndex: 9999,
  width: 44,
  height: 44,
  borderRadius: 12,
  border: "1px solid #6b5a1b",
  background: "#d4af37",
  color: "#000",
  fontWeight: 900,
  fontSize: 22,
  cursor: "pointer",
  boxShadow: "0 10px 25px rgba(0,0,0,0.55)",
};

const drawerBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  zIndex: 9998,
};

const drawerPanel: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  height: "100vh",
  width: 320,
  background: "#0b0b0b",
  borderRight: "1px solid #222",
  zIndex: 9999,
  padding: 14,
  transition: "transform 180ms ease-out",
  overflowY: "auto",
};

const drawerHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  paddingBottom: 10,
};

const drawerBrandTitle: React.CSSProperties = {
  color: "#d4af37",
  fontWeight: 900,
  fontSize: 18,
  letterSpacing: 1,
};

const drawerBrandSub: React.CSSProperties = {
  color: "#aaa",
  fontSize: 12,
  marginTop: 2,
};

const drawerClose: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  border: "1px solid #333",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 900,
};

const drawerSection: React.CSSProperties = {
  color: "#777",
  fontSize: 11,
  fontWeight: 900,
  marginTop: 8,
  marginBottom: 8,
  letterSpacing: 0.5,
};

const drawerItem: React.CSSProperties = {
  display: "block",
  padding: "10px 12px",
  borderRadius: 12,
  background: "#111",
  border: "1px solid #222",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 800,
};

const drawerDivider: React.CSSProperties = {
  height: 1,
  background: "#222",
  margin: "12px 0",
};

const drawerFooter: React.CSSProperties = {
  marginTop: 14,
  paddingTop: 10,
  borderTop: "1px solid #222",
};

type Factura = {
  id: number | string; // ✅ ahora soporta UUID de POS
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

  // opcionales (si existen en tu BD)
  iva_mode?: "AUTO" | "MANUAL";
  base_iva_0?: number;
  base_iva_15?: number;

  // ✅ nuevo: marca si la fila viene del POS
  is_pos?: boolean;
};

type PagoFactura = {
  id: number;
  factura_id: number;
  monto: number;
  fecha: string;
  nota: string | null;
};

type FundSource = "EMPRESA" | "PERSONAL";
type IvaMode = "AUTO" | "MANUAL";

function makeId() {
  const g: any = globalThis as any;

  if (g.crypto && g.crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    g.crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b: number) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  return (
    Date.now().toString(16) +
    "-" +
    Math.random().toString(16).slice(2) +
    "-" +
    Math.random().toString(16).slice(2)
  );
}

function dentroDeRango(fechaISO: string, desdeISO: string, hastaISO: string) {
  const t = new Date(fechaISO).getTime();
  const d = new Date(desdeISO + "T00:00:00").getTime();
  const h = new Date(hastaISO + "T23:59:59").getTime();
  return t >= d && t <= h;
}

function calcIvaDesdeTotal(total: number, porcentaje: 0 | 15) {
  if (porcentaje === 0) {
    return { subtotal: Number(total.toFixed(2)), iva: 0 };
  }
  const subtotal = total / 1.15;
  const iva = total - subtotal;
  return { subtotal: Number(subtotal.toFixed(2)), iva: Number(iva.toFixed(2)) };
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

function toMoney(n: number) {
  return Number(n || 0).toFixed(2);
}

function parseMoney(s: string) {
  const v = Number(String(s).replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
}

// Inserta en Supabase con "fallback" por si una columna no existe todavía
async function safeInsert(table: string, payload: any, fallbackPayload?: any) {
  const res = await supabase.from(table).insert(payload);
  if (!res.error) return res;

  const msg = String(res.error.message || "").toLowerCase();

  // si falla por columna inexistente, reintenta con fallback
  if (
    fallbackPayload &&
    (msg.includes("column") || msg.includes("does not exist") || msg.includes("unknown") || msg.includes("schema"))
  ) {
    const res2 = await supabase.from(table).insert(fallbackPayload);
    return res2;
  }

  return res;
}

export default function Home() {
  const [status, setStatus] = useState("Conectando...");

  // ---- movimientos ----
  const [monto, setMonto] = useState("");
  const [porcentajeIva, setPorcentajeIva] = useState<0 | 15>(0);
  const [tipo, setTipo] = useState<"INGRESO" | "GASTO">("INGRESO");
  const [saldo, setSaldo] = useState(0);
  const [proveedor, setProveedor] = useState("");
  const [detalle, setDetalle] = useState("");
  const [ingresos, setIngresos] = useState(0);
  const [gastos, setGastos] = useState(0);
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [fundSource, setFundSource] = useState<FundSource>("EMPRESA");

  const hoyISO = new Date().toISOString().slice(0, 10);
  const primerDiaMesISO = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [desde, setDesde] = useState(primerDiaMesISO);
  const [hasta, setHasta] = useState(hoyISO);

  const ADMIN_PASSWORD = "1234";

  // ---- facturas ----
  const [cliente, setCliente] = useState("");
  const [numeroFactura, setNumeroFactura] = useState("");

  // IVA factura: AUTO (bases) / MANUAL (ingresas IVA)
  const [ivaMode, setIvaMode] = useState<IvaMode>("AUTO");

  // AUTO
  const [base0, setBase0] = useState("");
  const [base15, setBase15] = useState("");

  // MANUAL
  const [montoFacturaManual, setMontoFacturaManual] = useState("");
  const [ivaManual, setIvaManual] = useState("");

  // compat (se mantiene para no romper lo existente; lo usamos como “indicador”)
  const [porcentajeIvaFactura, setPorcentajeIvaFactura] = useState<0 | 15>(15);

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [facturas, setFacturas] = useState<Factura[]>([]);

  // ---- pagos ----
  const [pagos, setPagos] = useState<PagoFactura[]>([]);
  const [verPagosDe, setVerPagosDe] = useState<Factura | null>(null);

  // ---- sugerencias clientes ----
  const [sugerencias, setSugerencias] = useState<string[]>([]);
  const [mostrarSug, setMostrarSug] = useState(false);

  const pagadoPorFactura = useMemo(() => {
    const m = new Map<number, number>();
    pagos.forEach((p) => {
      m.set(p.factura_id, (m.get(p.factura_id) || 0) + Number(p.monto));
    });
    return m;
  }, [pagos]);

  const porCobrar = useMemo(() => {
    return facturas.reduce((acc, f) => {
      // POS = pagado completo (para no inflar “por cobrar”)
      if (f.is_pos) return acc;

      const idNum = typeof f.id === "number" ? f.id : NaN;
      const pagado = Number.isFinite(idNum) ? pagadoPorFactura.get(idNum) || 0 : 0;
      const restante = Math.max(0, Number(f.monto) - pagado);
      if (restante > 0) acc += restante;
      return acc;
    }, 0);
  }, [facturas, pagadoPorFactura]);

  const totalsFacturaUI = useMemo(() => {
    if (ivaMode === "AUTO") {
      const b0 = parseMoney(base0 || "0");
      const b15 = parseMoney(base15 || "0");
      const ok = Number.isFinite(b0) && Number.isFinite(b15) && b0 >= 0 && b15 >= 0;
      if (!ok) return { subtotal: 0, iva: 0, total: 0, ok: false };

      const iva = Number((b15 * 0.15).toFixed(2));
      const subtotal = Number((b0 + b15).toFixed(2));
      const total = Number((subtotal + iva).toFixed(2));
      return { subtotal, iva, total, ok: true };
    }

    // MANUAL
    const total = parseMoney(montoFacturaManual || "0");
    const iva = parseMoney(ivaManual || "0");
    const ok = Number.isFinite(total) && Number.isFinite(iva) && total > 0 && iva >= 0 && iva <= total;
    const subtotal = ok ? Number((total - iva).toFixed(2)) : 0;
    return { subtotal, iva: ok ? Number(iva.toFixed(2)) : 0, total: ok ? Number(total.toFixed(2)) : 0, ok };
  }, [ivaMode, base0, base15, montoFacturaManual, ivaManual]);

  async function cargarDatos() {
    // 1) Movimientos normales (transactions)
    // 2) Facturas normales (facturas)
    // 3) Pagos (pagos_factura)
    // 4) POS views (vw_inv_pos_*)
    const [tx, f, p, posHist, posFac] = await Promise.all([
      supabase.from("transactions").select("*").order("created_at", { ascending: false }),
      supabase
        .from("facturas")
        .select("id,created_at,cliente,numero,monto,subtotal,iva,porcentaje_iva,estado,pdf_url,fecha")
        .order("created_at", { ascending: false }),
      supabase.from("pagos_factura").select("id,factura_id,monto,fecha,nota").order("fecha", { ascending: false }),

      // POS: Historial general
      supabase
        .from("vw_inv_pos_historial_general")
        .select("fecha,tipo,fuente,monto,detalle,ref_id")
        .order("fecha", { ascending: false }),

      // POS: Listado facturas
      supabase
        .from("vw_inv_pos_listado_facturas")
        .select("id,fecha,cliente,numero_factura,total,pagado,restante,estado,pdf_url")
        .order("fecha", { ascending: false }),
    ]);

    // pagos
    if (!p.error && p.data) setPagos(p.data as any);

    // Movimientos POS -> normalizar al formato de la tabla transactions
    const posMovs =
      !posHist.error && posHist.data
        ? (posHist.data as any[]).map((r) => ({
            id: `POS_${r.ref_id}`, // id sintético (no está en transactions)
            created_at: r.fecha,
            type: "VENTA_POS",
            amount: Number(r.monto || 0),
            description: r.detalle || "Venta POS",
            fund_source: "EMPRESA",
          }))
        : [];

    // Movimientos
    if (!tx.error && tx.data) {
      const merged = [...tx.data, ...posMovs].sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setMovimientos(merged);

      let total = 0;
      let ing = 0;
      let gas = 0;

      merged.forEach((t: any) => {
        if (t.type === "VENTA_DIRECTA" || t.type === "PAGO_FACTURA" || t.type === "VENTA_POS") {
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

    // Facturas POS (como "pagadas" por defecto, para no inflar por cobrar)
    const posFacturas =
      !posFac.error && posFac.data
        ? (posFac.data as any[]).map((r) => ({
            id: r.id, // uuid
            created_at: new Date(r.fecha).toISOString(),
            cliente: r.cliente || "CLIENTE (no registrado)",
            numero: r.numero_factura || "-",
            monto: Number(r.total || 0),
            subtotal: undefined,
            iva: undefined,
            porcentaje_iva: undefined,
            estado: "pagado" as const, // ✅ POS se asume pagado
            pdf_url: r.pdf_url || "",
            fecha: new Date(r.fecha).toISOString(),
            is_pos: true,
          }))
        : [];

    // Facturas normales + POS
    if (!f.error && f.data) {
      const mergedFac = [...(f.data as any[]), ...posFacturas].sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setFacturas(mergedFac as any);
    }
  }

  useEffect(() => {
    (async () => {
      const { error } = await supabase.from("share_links").select("id").limit(1);
      setStatus(error ? `Error: ${error.message}` : "🟢 EN LINEA");
      await cargarDatos();
    })();
  }, []);

  async function guardarMovimiento() {
    if (!monto) return alert("Pon un monto");

    const total = parseFloat(monto);
    if (Number.isNaN(total) || total <= 0) return alert("Monto inválido");

    const { subtotal, iva } = calcIvaDesdeTotal(total, porcentajeIva);

    const payloadConFuente = {
      amount: total,
      subtotal,
      iva,
      porcentaje_iva: porcentajeIva,
      description: `${proveedor} - ${detalle}`,
      area: "GENERAL",
      account: "BANCO",
      type: tipo === "INGRESO" ? "VENTA_DIRECTA" : "GASTO",
      proveedor,
      detalle,
      fund_source: fundSource, // NUEVO (si existe en tu BD)
    };

    const payloadFallback = {
      amount: total,
      subtotal,
      iva,
      porcentaje_iva: porcentajeIva,
      description: `${proveedor} - ${detalle}`,
      area: "GENERAL",
      account: "BANCO",
      type: tipo === "INGRESO" ? "VENTA_DIRECTA" : "GASTO",
      proveedor,
      detalle,
    };

    const res = await safeInsert("transactions", payloadConFuente, payloadFallback);

    if (res.error) alert("Error guardando: " + res.error.message);
    else {
      setMonto("");
      setProveedor("");
      setDetalle("");
      setFundSource("EMPRESA");
      await cargarDatos();
    }
  }

  const eliminarMovimiento = async (id: string) => {
    // ✅ movimientos POS no se eliminan desde aquí
    if (String(id).startsWith("POS_")) {
      return alert("Este movimiento viene del POS (Inventario). Se gestiona desde Inventario.");
    }

    const pass = prompt("Ingrese contraseña para eliminar:");
    if (pass !== ADMIN_PASSWORD) return alert("Contraseña incorrecta");

    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) alert("Error eliminando: " + error.message);
    else {
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

    const res = await supabase.from("facturas").select("cliente").ilike("cliente", `${query}%`).limit(8);

    if (res.error || !res.data) {
      setSugerencias([]);
      return;
    }

    const unique = Array.from(new Set(res.data.map((r: any) => r.cliente))).slice(0, 8);
    setSugerencias(unique);
  }

  async function crearFactura() {
    if (!cliente.trim()) return alert("Pon el nombre del cliente/empresa");
    if (!pdfFile) return alert("Sube el PDF");

    if (!totalsFacturaUI.ok) {
      return alert(
        ivaMode === "AUTO"
          ? "Revisa Base 0% y Base 15% (deben ser números válidos)."
          : "Revisa Total e IVA (IVA no puede ser mayor al total)."
      );
    }

    setSubiendo(true);
    try {
      const path = `hst/${makeId()}.pdf`;

      const upload = await supabase.storage.from("invoices").upload(path, pdfFile, {
        contentType: "application/pdf",
        upsert: false,
      });

      if (upload.error) throw new Error(upload.error.message);

      const totalFactura = totalsFacturaUI.total;
      const subtotalFactura = totalsFacturaUI.subtotal;
      const ivaFactura = totalsFacturaUI.iva;

      const pct: 0 | 15 = ivaFactura > 0 ? 15 : 0;

      const payloadConExtras = {
        cliente: cliente.trim(),
        numero: numeroFactura.trim(),
        monto: totalFactura,
        subtotal: subtotalFactura,
        iva: ivaFactura,
        porcentaje_iva: pct,
        estado: "pendiente",
        pdf_url: path,
        fecha: new Date().toISOString(),

        iva_mode: ivaMode,
        base_iva_0: ivaMode === "AUTO" ? Number(parseMoney(base0 || "0").toFixed(2)) : null,
        base_iva_15: ivaMode === "AUTO" ? Number(parseMoney(base15 || "0").toFixed(2)) : null,
      };

      const payloadFallback = {
        cliente: cliente.trim(),
        numero: numeroFactura.trim(),
        monto: totalFactura,
        subtotal: subtotalFactura,
        iva: ivaFactura,
        porcentaje_iva: pct,
        estado: "pendiente",
        pdf_url: path,
        fecha: new Date().toISOString(),
      };

      const ins = await safeInsert("facturas", payloadConExtras, payloadFallback);
      if (ins.error) throw new Error(ins.error.message);

      setCliente("");
      setNumeroFactura("");
      setPdfFile(null);
      setSugerencias([]);
      setMostrarSug(false);

      setIvaMode("AUTO");
      setBase0("");
      setBase15("");
      setMontoFacturaManual("");
      setIvaManual("");
      setPorcentajeIvaFactura(15);

      await cargarDatos();
      alert("✅ Factura creada");
    } catch (e: any) {
      alert("Error: " + (e?.message || e));
    } finally {
      setSubiendo(false);
    }
  }

  async function verPdf(path: string) {
    if (!path) return alert("Este registro no tiene PDF adjunto.");

    // Si es URL completa
    if (path.startsWith("http://") || path.startsWith("https://")) {
      window.open(path, "_blank");
      return;
    }

    // Si es ruta del bucket
    const signed = await supabase.storage.from("invoices").createSignedUrl(path, 60 * 10);
    if (signed.error) return alert("No pude abrir el PDF: " + signed.error.message);
    window.location.href = signed.data.signedUrl;
  }

  function restanteFactura(f: Factura) {
    if (f.is_pos) return 0;

    const idNum = typeof f.id === "number" ? f.id : NaN;
    const pagado = Number.isFinite(idNum) ? pagadoPorFactura.get(idNum) || 0 : 0;
    return Math.max(0, Number(f.monto) - pagado);
  }

  async function registrarPago(f: Factura) {
    if (f.is_pos) return alert("Esta venta viene del POS y se asume pagada.");

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

    const idNum = typeof f.id === "number" ? f.id : NaN;
    if (!Number.isFinite(idNum)) return alert("Factura inválida para pagos.");

    const ins = await supabase.from("pagos_factura").insert({
      factura_id: idNum,
      monto: pago,
      nota: null,
    });

    if (ins.error) return alert("Error registrando pago: " + ins.error.message);

    const txPayloadConFuente = {
      amount: pago,
      description: `Pago factura #${f.id} - ${f.cliente}`,
      area: "GENERAL",
      account: "BANCO",
      type: "PAGO_FACTURA",
      fund_source: "EMPRESA" as FundSource,
    };
    const txPayloadFallback = {
      amount: pago,
      description: `Pago factura #${f.id} - ${f.cliente}`,
      area: "GENERAL",
      account: "BANCO",
      type: "PAGO_FACTURA",
    };

    const tx = await safeInsert("transactions", txPayloadConFuente, txPayloadFallback);
    if (tx.error) return alert("Error creando movimiento: " + tx.error.message);

    await cargarDatos();

    const nuevoRestante = Math.max(0, restante - pago);
    const nuevoEstado: Factura["estado"] = nuevoRestante <= 0 ? "pagado" : "parcial";

    const up = await supabase.from("facturas").update({ estado: nuevoEstado }).eq("id", f.id);
    if (up.error) return alert("Error actualizando estado: " + up.error.message);

    await cargarDatos();
    alert(nuevoEstado === "pagado" ? "✅ Factura PAGADA" : "✅ Pago parcial registrado");
  }

  async function editarMontoFactura(f: Factura) {
    if (f.is_pos) return alert("Las ventas POS se editan desde Inventario (POS).");

    const nuevo = prompt(`Monto actual: $${f.monto}\nIngrese nuevo monto:`, f.monto.toString());
    if (!nuevo) return;

    const valor = Number(nuevo);
    if (isNaN(valor) || valor <= 0) return alert("Monto inválido");

    const { error } = await supabase.from("facturas").update({ monto: valor }).eq("id", f.id);

    if (error) alert("Error actualizando: " + error.message);
    else {
      alert("Monto actualizado");
      await cargarDatos();
    }
  }

  async function eliminarFactura(f: Factura) {
    if (f.is_pos) return alert("Las ventas POS se eliminan desde Inventario (POS).");

    const pass = prompt("Ingrese contraseña para eliminar factura:");
    if (pass !== ADMIN_PASSWORD) return alert("Contraseña incorrecta");

    const confirmacion = confirm(`¿Seguro que deseas eliminar la factura ${f.numero}?`);
    if (!confirmacion) return;

    await supabase.from("pagos_factura").delete().eq("factura_id", f.id);
    const { error } = await supabase.from("facturas").delete().eq("id", f.id);

    if (error) alert("Error eliminando: " + error.message);
    else {
      alert("Factura eliminada");
      await cargarDatos();
    }
  }

  async function generarEstadoCuentaPDF() {
    console.log("✅ Entró a generar PDF");

    try {
      const movFiltrados = movimientos.filter((m) => dentroDeRango(m.created_at, desde, hasta));
      const facFiltradas = facturas.filter((f) => dentroDeRango(f.fecha || f.created_at, desde, hasta));

      const ingresosMov = movFiltrados
        .filter((m) => m.type === "VENTA_DIRECTA" || m.type === "PAGO_FACTURA" || m.type === "VENTA_POS")
        .reduce((acc, m) => acc + Number(m.amount || 0), 0);

      const gastosMov = movFiltrados
        .filter((m) => m.type === "GASTO" || m.type === "COMPRA")
        .reduce((acc, m) => acc + Number(m.amount || 0), 0);

      const ivaPagado = movFiltrados
        .filter((m) => m.type === "GASTO" || m.type === "COMPRA")
        .reduce((acc, m) => acc + Number(m.iva || 0), 0);

      const ivaGenerado = facFiltradas.reduce((acc, f) => acc + Number(f.iva || 0), 0);

      const balance = ingresosMov - gastosMov;
      const ivaPorPagar = ivaGenerado - ivaPagado;

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
      doc.text("Estado de Cuenta", logo ? 38 : 12, 24);

      doc.text(`Periodo: ${desde} a ${hasta}`, 12, 38);
      doc.text(`Emitido: ${new Date().toLocaleString()}`, 12, 44);

      autoTable(doc, {
        startY: 52,
        head: [["Concepto", "Valor"]],
        body: [
          ["Ingresos (movimientos)", `$${ingresosMov.toFixed(2)}`],
          ["Gastos (movimientos)", `$${gastosMov.toFixed(2)}`],
          ["Balance", `$${balance.toFixed(2)}`],
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
      nextY += 4;

      const movimientosBody = movFiltrados.map((m) => {
        const fecha = new Date(m.created_at).toLocaleString();
        const tipoTxt = m.type === "VENTA_DIRECTA" || m.type === "PAGO_FACTURA" || m.type === "VENTA_POS" ? "Ingreso" : "Gasto";
        const total = Number(m.amount || 0);
        const subtotal = Number(m.subtotal || 0);
        const iva = Number(m.iva || 0);
        const pct = Number(m.porcentaje_iva || 0);
        const fuente = String(m.fund_source || "-");

        return [
          fecha,
          tipoTxt,
          fuente,
          String(m.description || ""),
          `$${toMoney(total)}`,
          `$${toMoney(subtotal)}`,
          `$${toMoney(iva)}`,
          `${pct}%`,
        ];
      });

      autoTable(doc, {
        startY: nextY + 3,
        head: [["Fecha", "Tipo", "Fuente", "Detalle", "Total", "Subtotal", "IVA", "%"]],
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
          `$${toMoney(total)}`,
          `$${toMoney(subtotal)}`,
          `$${toMoney(iva)}`,
          `${pct}%`,
          String(f.estado || ""),
        ];
      });

      autoTable(doc, {
        startY: nextY + 3,
        head: [["Fecha", "N°", "Cliente", "Total", "Subtotal", "IVA", "%", "Estado"]],
        body: facturasBody,
        styles: { fontSize: 8 },
        margin: { left: 12, right: 12 },
        tableWidth: pageWidth - 24,
      });

      doc.save(`HST_EstadoCuenta_${desde}_a_${hasta}.pdf`);
      console.log("✅ doc.save ejecutado");
    } catch (err) {
      console.error("❌ Error generando PDF:", err);
      alert("❌ Error generando PDF. Abre la consola (F12) y mira el error.");
    }
  }

  return (
    <main
      style={{
        backgroundColor: "#0b0b0b",
        color: "#d4af37",
        minHeight: "100vh",
        padding: "40px",
        fontFamily: "Arial",
      }}
    >
      <InventoryDrawer />

      <h1 style={{ fontSize: "48px" }}>HST CONTABILIDAD</h1>
      <p style={{ color: "#aaa" }}>Panel financiero Julian Silva</p>
      <p style={{ color: "#00ff88" }}>{status}</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: "20px",
          marginTop: "20px",
        }}
      >
        <Card title="💰 Saldo total" value={`$${saldo.toFixed(2)}`} />
        <Card title="📈 Ingresos" value={`$${ingresos.toFixed(2)}`} />
        <Card title="📉 Gastos" value={`$${gastos.toFixed(2)}`} />
        <Card title="🧾 Por cobrar" value={`$${porCobrar.toFixed(2)}`} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))",
          gap: "20px",
          marginTop: "30px",
          alignItems: "start",
        }}
      >
        <section style={panel}>
          <h2 style={{ marginTop: 0 }}>Nuevo movimiento</h2>

          <select value={tipo} onChange={(e) => setTipo(e.target.value as any)} style={input}>
            <option value="INGRESO">Ingreso</option>
            <option value="GASTO">Gasto</option>
          </select>

          <select value={fundSource} onChange={(e) => setFundSource(e.target.value as FundSource)} style={input}>
            <option value="EMPRESA">Dinero: Empresa</option>
            <option value="PERSONAL">Dinero: Personal</option>
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

          <button onClick={guardarMovimiento} style={btnGold}>
            GUARDAR MOVIMIENTO
          </button>
          <button onClick={cargarDatos} style={btnGhost}>
            🔄 Actualizar panel
          </button>
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
              <div
                style={{
                  position: "absolute",
                  top: 52,
                  left: 0,
                  right: 0,
                  background: "#0f0f0f",
                  border: "1px solid #2a2a2a",
                  borderRadius: 10,
                  overflow: "hidden",
                  zIndex: 10,
                }}
              >
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
                      borderTop: "1px solid #1f1f1f",
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

          <select value={ivaMode} onChange={(e) => setIvaMode(e.target.value as IvaMode)} style={input}>
            <option value="AUTO">IVA Automático (Base 0% + Base 15%)</option>
            <option value="MANUAL">IVA Manual (tú escribes el IVA)</option>
          </select>

          {ivaMode === "AUTO" ? (
            <>
              <input
                placeholder="Base 0% $ (productos sin IVA)"
                value={base0}
                onChange={(e) => setBase0(e.target.value)}
                style={input}
              />
              <input
                placeholder="Base 15% $ (productos con IVA)"
                value={base15}
                onChange={(e) => setBase15(e.target.value)}
                style={input}
              />

              <div style={hintBox}>
                <div style={hintRow}>
                  <span>Subtotal:</span>
                  <b style={{ color: "#fff" }}>${toMoney(totalsFacturaUI.subtotal)}</b>
                </div>
                <div style={hintRow}>
                  <span>IVA (15% sobre base 15%):</span>
                  <b style={{ color: "#fff" }}>${toMoney(totalsFacturaUI.iva)}</b>
                </div>
                <div style={hintRow}>
                  <span>Total:</span>
                  <b style={{ color: "#00ff88" }}>${toMoney(totalsFacturaUI.total)}</b>
                </div>
              </div>

              <select
                value={porcentajeIvaFactura}
                onChange={(e) => setPorcentajeIvaFactura(Number(e.target.value) as 0 | 15)}
                style={input}
                disabled
              >
                <option value={15}>IVA 15% (automático)</option>
                <option value={0}>IVA 0%</option>
              </select>
            </>
          ) : (
            <>
              <input
                placeholder="Total $ (valor total de la factura)"
                value={montoFacturaManual}
                onChange={(e) => setMontoFacturaManual(e.target.value)}
                style={input}
              />
              <input
                placeholder="IVA $ (valor EXACTO del IVA de esa factura)"
                value={ivaManual}
                onChange={(e) => setIvaManual(e.target.value)}
                style={input}
              />

              <div style={hintBox}>
                <div style={hintRow}>
                  <span>Subtotal (Total - IVA):</span>
                  <b style={{ color: "#fff" }}>${toMoney(totalsFacturaUI.subtotal)}</b>
                </div>
                <div style={hintRow}>
                  <span>IVA:</span>
                  <b style={{ color: "#fff" }}>${toMoney(totalsFacturaUI.iva)}</b>
                </div>
                <div style={hintRow}>
                  <span>Total:</span>
                  <b style={{ color: "#00ff88" }}>${toMoney(totalsFacturaUI.total)}</b>
                </div>
              </div>

              <select value={totalsFacturaUI.iva > 0 ? 15 : 0} onChange={() => {}} style={input} disabled>
                <option value={0}>IVA 0%</option>
                <option value={15}>IVA 15%</option>
              </select>
            </>
          )}

          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
            style={{ ...input, padding: "10px" }}
          />

          <button onClick={crearFactura} style={btnGold} disabled={subiendo}>
            {subiendo ? "SUBIENDO..." : "CREAR FACTURA"}
          </button>

          <p style={{ color: "#888", marginTop: 12, fontSize: 13 }}>
            * IVA de facturas: AUTOMÁTICO por bases 0/15 o MANUAL (tú lo escribes).
          </p>
        </section>
      </div>

      {/* HISTORIAL */}
      <section style={{ ...panel, marginTop: 30 }}>
        <h2 style={{ marginTop: 0 }}>📜 Historial General</h2>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ flex: "1 1 180px" }}>
            <div style={{ color: "#aaa", fontSize: 12, marginBottom: 4 }}>Desde</div>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={input} />
          </div>

          <div style={{ flex: "1 1 180px" }}>
            <div style={{ color: "#aaa", fontSize: 12, marginBottom: 4 }}>Hasta</div>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={input} />
          </div>

          <div style={{ flex: "1 1 260px", display: "flex", alignItems: "end" }}>
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
                  <th style={th}>Fuente</th>
                  <th style={th}>Monto</th>
                  <th style={th}>Detalle</th>
                  <th style={th}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => {
                  const esIngreso = m.type === "VENTA_DIRECTA" || m.type === "PAGO_FACTURA" || m.type === "VENTA_POS";
                  const esPOS = String(m.id).startsWith("POS_");
                  return (
                    <tr key={m.id} style={{ borderTop: "1px solid #2a2a2a" }}>
                      <td style={td}>{new Date(m.created_at).toLocaleString()}</td>

                      <td style={td}>{esIngreso ? "Ingreso" : "Gasto"}</td>

                      <td style={td}>{String(m.fund_source || "-")}</td>

                      <td style={td}>
                        <span
                          style={{
                            color: esIngreso ? "#00ff88" : "#ff4d4d",
                            fontWeight: 700,
                          }}
                        >
                          ${Number(m.amount).toFixed(2)}
                        </span>
                      </td>

                      <td style={td}>{m.description}</td>

                      <td style={td}>
                        {esPOS ? (
                          <span style={{ color: "#777", fontSize: 12 }}>POS</span>
                        ) : (
                          <button
                            onClick={() => eliminarMovimiento(m.id)}
                            style={{
                              background: "#300",
                              color: "#ff4d4d",
                              border: "1px solid #ff4d4d",
                              padding: "4px 8px",
                              borderRadius: 6,
                              cursor: "pointer",
                            }}
                          >
                            Eliminar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
                  const esPOS = Boolean((f as any).is_pos);

                  // POS: se asume pagado total
                  const pagado = esPOS
                    ? Number(f.monto || 0)
                    : (() => {
                        const idNum = typeof f.id === "number" ? f.id : NaN;
                        return Number.isFinite(idNum) ? pagadoPorFactura.get(idNum) || 0 : 0;
                      })();

                  const rest = esPOS ? 0 : Math.max(0, Number(f.monto) - pagado);

                  return (
                    <tr key={String(f.id)} style={{ borderTop: "1px solid #2a2a2a" }}>
                      <td style={td}>{new Date(f.fecha || f.created_at).toLocaleDateString()}</td>
                      <td style={td}>{f.cliente}</td>
                      <td style={td}>{f.numero}</td>
                      <td style={td}>${Number(f.monto).toFixed(2)}</td>
                      <td style={td}>${Number(pagado).toFixed(2)}</td>
                      <td style={td}>${Number(rest).toFixed(2)}</td>
                      <td style={td}>{esPOS ? "pagado" : f.estado}</td>

                      <td style={td}>
                        {f.pdf_url ? (
                          <button style={btnMini} onClick={() => verPdf(f.pdf_url)}>
                            Ver PDF
                          </button>
                        ) : (
                          <button style={{ ...btnMiniGhost, opacity: 0.7 }} onClick={() => verPdf(f.pdf_url)}>
                            Sin PDF
                          </button>
                        )}

                        {!esPOS && (
                          <>
                            {" "}
                            <button style={btnMini} onClick={() => editarMontoFactura(f)}>
                              Editar monto
                            </button>{" "}
                            {rest > 0 && (
                              <button style={btnMiniGhost} onClick={() => registrarPago(f)}>
                                Registrar pago
                              </button>
                            )}{" "}
                            <button style={btnMiniGhost} onClick={() => setVerPagosDe(f)}>
                              Ver pagos
                            </button>{" "}
                            <button
                              style={{ ...btnMiniGhost, color: "#ff4d4d", borderColor: "#ff4d4d" }}
                              onClick={() => eliminarFactura(f)}
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {verPagosDe && !verPagosDe.is_pos && (
        <section style={{ ...panel, marginTop: 20 }}>
          <h2 style={{ marginTop: 0 }}>
            Pagos de: {verPagosDe.cliente} (Factura #{verPagosDe.id})
          </h2>

          <button style={btnGhost} onClick={() => setVerPagosDe(null)}>
            Cerrar
          </button>

          <div style={{ marginTop: 10 }}>
            {pagos.filter((p) => p.factura_id === verPagosDe.id).length === 0 ? (
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

const panel: CSSProperties = {
  background: "#111",
  padding: "20px",
  borderRadius: "12px",
  border: "1px solid #333",
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

const btnGhost: CSSProperties = {
  padding: "10px 12px",
  background: "transparent",
  color: "#d4af37",
  border: "1px solid #d4af37",
  borderRadius: "10px",
  fontWeight: "bold",
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

const btnMiniGhost: CSSProperties = {
  padding: "8px 12px",
  background: "transparent",
  color: "#d4af37",
  border: "1px solid #d4af37",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  marginLeft: 8,
};

const th: CSSProperties = {
  textAlign: "left",
  padding: "10px",
  fontSize: 13,
  color: "#d4af37",
  borderBottom: "1px solid #2a2a2a",
  whiteSpace: "nowrap",
};

const td: CSSProperties = {
  padding: "10px",
  fontSize: 13,
  color: "#eee",
  verticalAlign: "top",
};

const hintBox: CSSProperties = {
  border: "1px solid #2a2a2a",
  borderRadius: 10,
  padding: 12,
  marginBottom: 10,
  background: "#0f0f0f",
  color: "#aaa",
};

const hintRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 6,
};