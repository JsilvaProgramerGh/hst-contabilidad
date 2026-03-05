"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Log = {
  id: string;
  created_at: string;
  kind: "product" | "variant";
  ref_id: string;
  qty: number;
  sale_price: number;
  discount_pct: number;
  final_price: number;
  note: string | null;
  canceled?: boolean;
};

type Product = { id: string; name: string; category_id: string | null };
type Variant = { id: string; product_id: string; name: string };
type Category = { id: string; name: string; parent_id: string | null };

export default function HistorialVentas() {
  const [status, setStatus] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);

  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [catFilter, setCatFilter] = useState<string>("ALL");
  const [q, setQ] = useState<string>("");

  async function load() {
    setStatus("Cargando...");

    const [
      { data: l, error: eL },
      { data: p, error: eP },
      { data: v, error: eV },
      { data: c, error: eC },
    ] = await Promise.all([
      supabase
        .from("inv_sales_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("inv_products").select("id,name,category_id"),
      supabase.from("inv_variants").select("id,product_id,name"),
      supabase.from("inv_categories").select("id,name,parent_id"),
    ]);

    if (eL) return setStatus(eL.message);
    if (eP) return setStatus(eP.message);
    if (eV) return setStatus(eV.message);
    if (eC) return setStatus(eC.message);

    setLogs(((l as Log[]) || []).filter((x) => !x.canceled)); // ✅ ocultamos anuladas
    setProducts((p as Product[]) || []);
    setVariants((v as Variant[]) || []);
    setCategories((c as Category[]) || []);
    setStatus("Listo ✅");
  }

  useEffect(() => {
    load();
  }, []);

  const catLabel = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c]));
    return (id: string | null) => {
      if (!id) return "Sin categoría";
      const c = map.get(id);
      if (!c) return "Sin categoría";
      if (!c.parent_id) return c.name;
      const p = map.get(c.parent_id);
      return p ? `${p.name} → ${c.name}` : c.name;
    };
  }, [categories]);

  const prodMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const varMap = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);

  const categoryOptions = useMemo(() => {
    const u = new Map<string, string>();
    for (const p of products) if (p.category_id) u.set(p.category_id, catLabel(p.category_id));
    return Array.from(u.entries()).sort((a, b) => a[1].localeCompare(b[1])).map(([id, label]) => ({ id, label }));
  }, [products, catLabel]);

  function titleFor(log: Log) {
    if (log.kind === "product") {
      const p = prodMap.get(log.ref_id);
      return p ? p.name : "(producto eliminado)";
    }
    const v = varMap.get(log.ref_id);
    if (!v) return "(variante eliminada)";
    const p = prodMap.get(v.product_id);
    return p ? `${p.name} — ${v.name}` : `(producto eliminado) — ${v.name}`;
  }

  function categoryIdFor(log: Log): string | null {
    if (log.kind === "product") return prodMap.get(log.ref_id)?.category_id ?? null;
    const v = varMap.get(log.ref_id);
    if (!v) return null;
    return prodMap.get(v.product_id)?.category_id ?? null;
  }

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return logs.filter((l) => {
      const cId = categoryIdFor(l);
      if (catFilter !== "ALL" && cId !== catFilter) return false;
      if (!query) return true;
      const t = titleFor(l).toLowerCase();
      const n = (l.note || "").toLowerCase();
      return `${t} ${n}`.includes(query);
    });
  }, [logs, q, catFilter, prodMap, varMap]);

  // ✅ función principal: devolver stock + marcar anulado
  async function cancelSale(log: Log) {
    const title = titleFor(log);
    if (!confirm(`¿Anular venta y devolver stock?\n\n${title}\nCantidad: ${log.qty}`)) return;

    setStatus("Anulando venta...");

    // 1) leer stock actual
    if (log.kind === "variant") {
      const { data: st, error: eSt } = await supabase
        .from("inv_variant_stock")
        .select("qty")
        .eq("variant_id", log.ref_id)
        .maybeSingle();

      if (eSt) return setStatus(eSt.message);

      const current = Number(st?.qty ?? 0);
      const newQty = current + Number(log.qty || 0);

      const { error: eUp } = await supabase.from("inv_variant_stock").upsert({
        variant_id: log.ref_id,
        qty: newQty,
        min_qty: 0,
      } as any);

      if (eUp) return setStatus(eUp.message);
    } else {
      const { data: st, error: eSt } = await supabase
        .from("inv_stock")
        .select("qty")
        .eq("product_id", log.ref_id)
        .maybeSingle();

      if (eSt) return setStatus(eSt.message);

      const current = Number(st?.qty ?? 0);
      const newQty = current + Number(log.qty || 0);

      const { error: eUp } = await supabase.from("inv_stock").upsert({
        product_id: log.ref_id,
        qty: newQty,
        min_qty: 0,
      } as any);

      if (eUp) return setStatus(eUp.message);
    }

    // 2) marcar como cancelado (o si no existe columna, borrar)
    // intentamos update primero:
    const { error: eCancel } = await supabase.from("inv_sales_log").update({ canceled: true }).eq("id", log.id);

    if (eCancel) {
      // si falla por columna no existente, entonces borramos el registro
      const { error: eDel } = await supabase.from("inv_sales_log").delete().eq("id", log.id);
      if (eDel) return setStatus(eDel.message);
    }

    await load();
    setStatus("Venta anulada ✅ (stock devuelto)");
  }

  return (
    <main style={page}>
      <header style={header}>
        <h1 style={h1}>Inventario · Historial de ventas</h1>
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
            <input style={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="producto, cliente, nota..." />
          </div>
        </div>

        <p style={statusStyle}>{status}</p>
        <p style={{ color: "#777", margin: 0, fontSize: 12 }}>Mostrando: {filtered.length} registro(s) (sin anuladas).</p>
      </div>

      <div style={card}>
        {filtered.length === 0 ? (
          <p style={{ color: "#777" }}>No hay registros.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((l) => {
              const title = titleFor(l);
              const cId = categoryIdFor(l);
              const cat = catLabel(cId);

              const date = new Date(l.created_at);
              const when = isNaN(date.getTime()) ? l.created_at : date.toLocaleString();

              return (
                <div key={l.id} style={row}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 900 }}>{title}</div>
                      <div style={{ color: "#aaa", fontSize: 12, marginTop: 4 }}>
                        {when} · Categoría: <b>{cat}</b> · Tipo: <b>{l.kind}</b>
                      </div>
                      <div style={{ color: "#aaa", fontSize: 12, marginTop: 4 }}>
                        Cantidad: <b>{l.qty}</b> · Precio: <b>${Number(l.sale_price || 0).toFixed(2)}</b> · Descuento:{" "}
                        <b>{Number(l.discount_pct || 0).toFixed(2)}%</b> · Final: <b>${Number(l.final_price || 0).toFixed(2)}</b>
                      </div>
                      {l.note ? <div style={{ color: "#777", fontSize: 12, marginTop: 6 }}>Nota: {l.note}</div> : null}
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <button style={btnDanger} onClick={() => cancelSale(l)}>Anular venta</button>
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
const btnDanger: React.CSSProperties = { padding: "10px 14px", borderRadius: 10, background: "#2a1212", border: "1px solid #5b1f1f", color: "#ffb3b3", cursor: "pointer" };