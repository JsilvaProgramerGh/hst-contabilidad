"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Category = { id: string; name: string; parent_id: string | null };
type Product = { id: string; name: string; category_id: string | null; active: boolean };
type Variant = { id: string; product_id: string; name: string; sku: string | null; active: boolean };

type StockP = { product_id: string; qty: number; min_qty: number };
type StockV = { variant_id: string; qty: number; min_qty: number };

type AlertRow = {
  kind: "product" | "variant";
  id: string; // product_id o variant_id
  title: string;
  category_id: string | null;
  category_label: string;
  qty: number;
  min_qty: number;
};

export default function AlertasStock() {
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<AlertRow[]>([]);

  const [catFilter, setCatFilter] = useState<string>("ALL");
  const [q, setQ] = useState<string>("");

  async function load() {
    setStatus("Cargando...");

    const [
      { data: cats, error: eC },
      { data: prods, error: eP },
      { data: vars, error: eV },
      { data: stP, error: eStP },
      { data: stV, error: eStV },
    ] = await Promise.all([
      supabase.from("inv_categories").select("id,name,parent_id").order("name"),
      supabase.from("inv_products").select("id,name,category_id,active").eq("active", true).order("name"),
      supabase.from("inv_variants").select("id,product_id,name,sku,active").eq("active", true),
      supabase.from("inv_stock").select("product_id,qty,min_qty"),
      supabase.from("inv_variant_stock").select("variant_id,qty,min_qty"),
    ]);

    if (eC) return setStatus(eC.message);
    if (eP) return setStatus(eP.message);
    if (eV) return setStatus(eV.message);
    if (eStP) return setStatus(eStP.message);
    if (eStV) return setStatus(eStV.message);

    const categories = (cats as Category[]) || [];
    const products = (prods as Product[]) || [];
    const variants = (vars as Variant[]) || [];

    const productMap = new Map(products.map((p) => [p.id, p]));
    const variantMap = new Map(variants.map((v) => [v.id, v]));

    const catMap = new Map(categories.map((c) => [c.id, c]));
    const catLabel = (id: string | null) => {
      if (!id) return "Sin categoría";
      const c = catMap.get(id);
      if (!c) return "Sin categoría";
      if (!c.parent_id) return c.name;
      const p = catMap.get(c.parent_id);
      return p ? `${p.name} → ${c.name}` : c.name;
    };

    const alerts: AlertRow[] = [];

    // PRODUCTOS
    for (const s of ((stP as StockP[]) || [])) {
      const p = productMap.get(s.product_id);
      if (!p) continue;
      const qty = Number(s.qty ?? 0);
      const minq = Number(s.min_qty ?? 0);
      if (qty <= minq) {
        alerts.push({
          kind: "product",
          id: p.id,
          title: p.name,
          category_id: p.category_id,
          category_label: catLabel(p.category_id),
          qty,
          min_qty: minq,
        });
      }
    }

    // VARIANTES
    for (const s of ((stV as StockV[]) || [])) {
      const v = variantMap.get(s.variant_id);
      if (!v) continue;
      const p = productMap.get(v.product_id);
      if (!p) continue;

      const qty = Number(s.qty ?? 0);
      const minq = Number(s.min_qty ?? 0);
      if (qty <= minq) {
        alerts.push({
          kind: "variant",
          id: v.id,
          title: `${p.name} — ${v.name}${v.sku ? ` · SKU: ${v.sku}` : ""}`,
          category_id: p.category_id,
          category_label: catLabel(p.category_id),
          qty,
          min_qty: minq,
        });
      }
    }

    alerts.sort((a, b) => (a.qty - a.min_qty) - (b.qty - b.min_qty)); // más urgente primero
    setRows(alerts);
    setStatus("Listo ✅");
  }

  useEffect(() => {
    load();
  }, []);

  const categoryOptions = useMemo(() => {
    const u = new Map<string, string>();
    for (const r of rows) if (r.category_id) u.set(r.category_id, r.category_label);
    return Array.from(u.entries()).sort((a, b) => a[1].localeCompare(b[1])).map(([id, label]) => ({ id, label }));
  }, [rows]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (catFilter !== "ALL" && r.category_id !== catFilter) return false;
      if (!query) return true;
      return `${r.title} ${r.category_label}`.toLowerCase().includes(query);
    });
  }, [rows, catFilter, q]);

  return (
    <main style={page}>
      <header style={header}>
        <h1 style={h1}>Inventario · Alertas de stock bajo</h1>
        <a href="/inventario" style={link}>← Volver</a>
      </header>

      <div style={card}>
        <div style={filters}>
          <div>
            <label style={label}>Categoría</label>
            <select style={input} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="ALL">Todas</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={label}>Buscar</label>
            <input style={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="guantes, alcohol, etc..." />
          </div>
        </div>

        <p style={statusStyle}>{status}</p>
        <p style={{ color: "#777", margin: 0, fontSize: 12 }}>
          Se muestra cuando <b>qty ≤ min_qty</b>. Total: {filtered.length}
        </p>
      </div>

      <div style={card}>
        {filtered.length === 0 ? (
          <p style={{ color: "#777" }}>No tienes alertas ✅</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((r) => {
              const urgent = r.qty === 0;
              return (
                <div key={`${r.kind}-${r.id}`} style={row}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 900 }}>
                        {urgent ? "🚨 " : "⚠️ "}{r.title}
                        <span style={{ color: "#777", fontWeight: 600, marginLeft: 8, fontSize: 12 }}>
                          {r.kind === "variant" ? "VARIANTE" : "PRODUCTO"}
                        </span>
                      </div>
                      <div style={{ color: "#aaa", fontSize: 12, marginTop: 4 }}>
                        Categoría: <b>{r.category_label}</b>
                      </div>
                      <div style={{ color: urgent ? "#ffb3b3" : "#ffd9a8", fontSize: 12, marginTop: 4 }}>
                        Stock: <b>{r.qty}</b> · Mínimo: <b>{r.min_qty}</b>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <a href="/inventario/venta" style={btnSoft}>Ir a Venta</a>
                      <a href="/inventario/costos-variantes" style={btnSoft2}>Ver Costos</a>
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
const link: React.CSSProperties = { color: "#aaa", textDecoration: "none" };
const card: React.CSSProperties = { background: "#111", border: "1px solid #333", borderRadius: 14, padding: 16, marginBottom: 16 };
const row: React.CSSProperties = { border: "1px solid #222", borderRadius: 12, padding: 12 };
const label: React.CSSProperties = { display: "block", marginBottom: 6, color: "#aaa", fontSize: 12 };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #333", background: "#0b0b0b", color: "#fff" };
const statusStyle: React.CSSProperties = { color: "#777", margin: 0, fontSize: 12, marginTop: 10 };
const filters: React.CSSProperties = { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" };

const btnSoft: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "#102015",
  border: "1px solid #1f4a2b",
  color: "#aef3c0",
  textDecoration: "none",
};

const btnSoft2: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "#151017",
  border: "1px solid #3a2b45",
  color: "#e5c7ff",
  textDecoration: "none",
};