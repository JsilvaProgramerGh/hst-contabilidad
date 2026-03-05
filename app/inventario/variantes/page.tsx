"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Product = { id: string; name: string };
type Variant = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  attributes: any;
  active: boolean;
};

type StockRow = { variant_id: string; qty: number; min_qty: number };
type SalesRow = { variant_id: string; sale_price: number; allow_discount: boolean };

export default function VariantesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [status, setStatus] = useState("");

  // formulario nueva variante
  const [talla, setTalla] = useState("");
  const [color, setColor] = useState("");
  const [marca, setMarca] = useState("");
  const [sku, setSku] = useState("");

  // edición rápida (stock/pvp) por variante
  const [qtyById, setQtyById] = useState<Record<string, string>>({});
  const [minById, setMinById] = useState<Record<string, string>>({});
  const [pvpById, setPvpById] = useState<Record<string, string>>({});

  async function loadProducts() {
    const { data, error } = await supabase.from("inv_products").select("id,name").eq("active", true).order("name");
    if (error) return setStatus(error.message);
    setProducts(data || []);
  }

  async function loadVariants(pid: string) {
    if (!pid) {
      setVariants([]);
      return;
    }
    setStatus("Cargando variantes...");

    const { data: v, error: e1 } = await supabase
      .from("inv_variants")
      .select("id,product_id,name,sku,attributes,active")
      .eq("product_id", pid)
      .order("created_at", { ascending: false });

    if (e1) return setStatus(e1.message);

    const ids = (v || []).map((x) => x.id);
    if (ids.length === 0) {
      setVariants([]);
      setQtyById({});
      setMinById({});
      setPvpById({});
      setStatus("Listo ✅ (sin variantes)");
      return;
    }

    const [{ data: st, error: e2 }, { data: sa, error: e3 }] = await Promise.all([
      supabase.from("inv_variant_stock").select("variant_id,qty,min_qty").in("variant_id", ids),
      supabase.from("inv_variant_sales").select("variant_id,sale_price,allow_discount").in("variant_id", ids),
    ]);

    if (e2) return setStatus(e2.message);
    if (e3) return setStatus(e3.message);

    const stockMap = new Map((st as StockRow[] || []).map((r) => [r.variant_id, r]));
    const salesMap = new Map((sa as SalesRow[] || []).map((r) => [r.variant_id, r]));

    const q: Record<string, string> = {};
    const m: Record<string, string> = {};
    const p: Record<string, string> = {};

    for (const varr of v as Variant[]) {
      const sr = stockMap.get(varr.id);
      const pr = salesMap.get(varr.id);

      q[varr.id] = sr ? String(sr.qty ?? "") : "";
      m[varr.id] = sr ? String(sr.min_qty ?? "") : "";
      p[varr.id] = pr ? String(pr.sale_price ?? "") : "";
    }

    setVariants((v as Variant[]) || []);
    setQtyById(q);
    setMinById(m);
    setPvpById(p);
    setStatus("Listo ✅");
  }

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    loadVariants(productId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  function makeVariantName() {
    const parts = [];
    if (color.trim()) parts.push(color.trim());
    if (talla.trim()) parts.push(talla.trim());
    if (marca.trim()) parts.push(marca.trim());
    return parts.join(" ").trim() || "Variante";
  }

  async function addVariant() {
    if (!productId) return alert("Selecciona un producto padre");
    if (!talla.trim() && !color.trim() && !marca.trim()) return alert("Pon al menos talla o color");

    setStatus("Creando variante...");

    const attributes = {
      talla: talla.trim() || null,
      color: color.trim() || null,
      marca: marca.trim() || null,
    };

    const { data, error } = await supabase
      .from("inv_variants")
      .insert({
        product_id: productId,
        name: makeVariantName(),
        sku: sku.trim() || null,
        attributes,
        active: true,
      })
      .select("id")
      .single();

    if (error) return setStatus(error.message);

    // inicializar stock y venta para esa variante
    await supabase.from("inv_variant_stock").upsert({ variant_id: data.id, qty: 0, min_qty: 0 });
    await supabase.from("inv_variant_sales").upsert({ variant_id: data.id, sale_price: 0, allow_discount: true });

    setTalla("");
    setColor("");
    setMarca("");
    setSku("");

    await loadVariants(productId);
  }

  async function saveVariantNumbers(variantId: string) {
    setStatus("Guardando...");

    const qty = Number(qtyById[variantId] || 0);
    const minq = Number(minById[variantId] || 0);
    const pvp = Number(pvpById[variantId] || 0);

    const { error: e1 } = await supabase
      .from("inv_variant_stock")
      .upsert({ variant_id: variantId, qty, min_qty: minq });

    if (e1) return setStatus(e1.message);

    const { error: e2 } = await supabase
      .from("inv_variant_sales")
      .upsert({ variant_id: variantId, sale_price: pvp, allow_discount: true });

    if (e2) return setStatus(e2.message);

    setStatus("Guardado ✅");
  }

  async function removeVariant(variantId: string) {
    if (!confirm("¿Eliminar variante?")) return;
    setStatus("Eliminando...");
    const { error } = await supabase.from("inv_variants").delete().eq("id", variantId);
    if (error) return setStatus(error.message);
    await loadVariants(productId);
  }

  const productName = useMemo(() => products.find((p) => p.id === productId)?.name || "", [products, productId]);

  return (
    <main style={page}>
      <header style={header}>
        <h1 style={h1}>Inventario · Variantes</h1>
        <a href="/inventario" style={link}>← Volver</a>
      </header>

      <div style={card}>
        <label style={label}>Producto padre</label>
        <select style={input} value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Seleccionar...</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <p style={statusStyle}>{status}</p>
      </div>

      <div style={card}>
        <h2 style={h2}>Crear variante {productName ? `para: ${productName}` : ""}</h2>

        <div style={grid}>
          <div>
            <label style={label}>Color</label>
            <input style={input} value={color} onChange={(e) => setColor(e.target.value)} placeholder="Ej: Negro" />
          </div>

          <div>
            <label style={label}>Talla</label>
            <input style={input} value={talla} onChange={(e) => setTalla(e.target.value)} placeholder="Ej: M" />
          </div>

          <div>
            <label style={label}>Marca (opcional)</label>
            <input style={input} value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Ej: TopGlove" />
          </div>

          <div>
            <label style={label}>SKU (opcional)</label>
            <input style={input} value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ej: GUA-NIT-NEG-M" />
          </div>
        </div>

        <button style={btn} onClick={addVariant}>Crear variante</button>
      </div>

      <div style={card}>
        <h2 style={h2}>Variantes</h2>

        {variants.length === 0 ? (
          <p style={{ color: "#777" }}>No hay variantes aún.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {variants.map((v) => {
              const a = v.attributes || {};
              return (
                <div key={v.id} style={row}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#fff", fontWeight: 900 }}>{v.name}</div>
                    <div style={{ color: "#aaa", fontSize: 12 }}>
                      {a.color ? `Color: ${a.color} · ` : ""}
                      {a.talla ? `Talla: ${a.talla} · ` : ""}
                      {a.marca ? `Marca: ${a.marca} · ` : ""}
                      {v.sku ? `SKU: ${v.sku}` : ""}
                    </div>

                    <div style={grid2}>
                      <div>
                        <label style={label}>Stock</label>
                        <input
                          style={input}
                          type="number"
                          value={qtyById[v.id] ?? ""}
                          onChange={(e) => setQtyById((prev) => ({ ...prev, [v.id]: e.target.value }))}
                        />
                      </div>

                      <div>
                        <label style={label}>Stock mínimo</label>
                        <input
                          style={input}
                          type="number"
                          value={minById[v.id] ?? ""}
                          onChange={(e) => setMinById((prev) => ({ ...prev, [v.id]: e.target.value }))}
                        />
                      </div>

                      <div>
                        <label style={label}>PVP</label>
                        <input
                          style={input}
                          type="number"
                          step="0.01"
                          value={pvpById[v.id] ?? ""}
                          onChange={(e) => setPvpById((prev) => ({ ...prev, [v.id]: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button style={btnSoft} onClick={() => saveVariantNumbers(v.id)}>Guardar</button>
                      <button style={danger} onClick={() => removeVariant(v.id)}>Eliminar</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

const page: React.CSSProperties = { minHeight: "100vh", background: "#0b0b0b", color: "#d4af37", padding: 24, fontFamily: "Arial" };
const header: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 };
const h1: React.CSSProperties = { fontSize: 28, margin: 0 };
const h2: React.CSSProperties = { fontSize: 18, margin: "0 0 12px 0", color: "#fff" };
const link: React.CSSProperties = { color: "#aaa", textDecoration: "none" };
const card: React.CSSProperties = { background: "#111", border: "1px solid #333", borderRadius: 14, padding: 16, marginBottom: 16 };
const row: React.CSSProperties = { display: "flex", gap: 12, padding: "12px 12px", border: "1px solid #222", borderRadius: 12 };
const label: React.CSSProperties = { display: "block", marginBottom: 6, color: "#aaa", fontSize: 12 };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #333", background: "#0b0b0b", color: "#fff" };
const btn: React.CSSProperties = { marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "#d4af37", border: "none", cursor: "pointer" };
const btnSoft: React.CSSProperties = { padding: "10px 14px", borderRadius: 10, background: "#102015", border: "1px solid #1f4a2b", color: "#aef3c0", cursor: "pointer" };
const danger: React.CSSProperties = { padding: "10px 14px", borderRadius: 10, background: "#2a1212", border: "1px solid #5a2b2b", color: "#ffb3b3", cursor: "pointer" };
const statusStyle: React.CSSProperties = { color: "#777", marginTop: 10, fontSize: 12 };
const grid: React.CSSProperties = { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" };
const grid2: React.CSSProperties = { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginTop: 10 };