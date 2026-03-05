"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Product = { id: string; name: string; active: boolean };
type Variant = {
  id: string;
  product_id: string;
  name: string;
  attributes: any;
  active: boolean;
};

type StockRow = { variant_id: string; qty: number; min_qty: number };

type Row = {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  attributes: any;
  qty: number;
  min_qty: number;
};

function attrToText(attributes: any) {
  if (!attributes || typeof attributes !== "object") return "";
  const entries = Object.entries(attributes)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${v}`);
  return entries.join(" · ");
}

function safeNum(v: any, fallback = 0) {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

export default function StockPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  // edición local
  const [draft, setDraft] = useState<Map<string, { qty: string; min_qty: string }>>(new Map());
  const [savingId, setSavingId] = useState<string>("");

  // ======= Buscar con debounce =======
  useEffect(() => {
    const t = setTimeout(() => {
      cargar(q.trim());
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Carga inicial: si quieres, trae los últimos (vacío = muestra algo)
  useEffect(() => {
    cargar("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargar(query: string) {
    setLoading(true);
    setStatus("");

    try {
      // 1) Buscar productos que matcheen
      const prodReq = supabase
        .from("inv_products")
        .select("id,name,active")
        .eq("active", true)
        .order("name")
        .limit(50);

      const prodRes = query
        ? await prodReq.ilike("name", `%${query}%`)
        : await prodReq;

      if (prodRes.error) throw new Error(prodRes.error.message);
      const products = (prodRes.data as Product[]) || [];
      const productIds = products.map((p) => p.id);

      // 2) Buscar variantes que matcheen por nombre también (aunque el producto no haya match)
      const varReq = supabase
        .from("inv_variants")
        .select("id,product_id,name,attributes,active")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(120);

      const varRes = query
        ? await varReq.ilike("name", `%${query}%`)
        : await varReq;

      if (varRes.error) throw new Error(varRes.error.message);
      const variants = (varRes.data as Variant[]) || [];

      // 3) Unimos candidatos:
      // - variantes cuyo producto está en productIds (match por producto)
      // - variantes que matchearon por nombre directamente
      const candidateVariants = query
        ? variants.filter((v) => productIds.includes(v.product_id) || v.name.toLowerCase().includes(query.toLowerCase()))
        : variants;

      // Si no hay nada, salimos
      if (candidateVariants.length === 0) {
        setRows([]);
        setStatus(query ? "No hay resultados." : "No hay variantes activas.");
        setLoading(false);
        return;
      }

      // 4) Cargar nombres de productos para esos product_id (por si vinieron por match de variante)
      const neededProductIds = Array.from(new Set(candidateVariants.map((v) => v.product_id)));
      const prod2 = await supabase
        .from("inv_products")
        .select("id,name")
        .in("id", neededProductIds);

      if (prod2.error) throw new Error(prod2.error.message);
      const prodMap = new Map<string, string>(((prod2.data as any[]) || []).map((p) => [p.id, p.name]));

      // 5) Stock para esas variantes
      const variantIds = candidateVariants.map((v) => v.id);
      const st = await supabase
        .from("inv_variant_stock")
        .select("variant_id,qty,min_qty")
        .in("variant_id", variantIds);

      if (st.error) throw new Error(st.error.message);

      const stMap = new Map<string, StockRow>(((st.data as StockRow[]) || []).map((r) => [r.variant_id, r]));

      const finalRows: Row[] = candidateVariants.map((v) => {
        const s = stMap.get(v.id);
        return {
          variant_id: v.id,
          product_id: v.product_id,
          product_name: prodMap.get(v.product_id) || "(sin producto)",
          variant_name: v.name,
          attributes: v.attributes,
          qty: Number(s?.qty ?? 0),
          min_qty: Number(s?.min_qty ?? 0),
        };
      });

      // orden: producto -> variante
      finalRows.sort((a, b) => {
        const p = a.product_name.localeCompare(b.product_name);
        if (p !== 0) return p;
        return a.variant_name.localeCompare(b.variant_name);
      });

      setRows(finalRows);

      // inicializar drafts si no existen
      setDraft((prev) => {
        const next = new Map(prev);
        finalRows.forEach((r) => {
          if (!next.has(r.variant_id)) {
            next.set(r.variant_id, { qty: String(r.qty), min_qty: String(r.min_qty) });
          }
        });
        return next;
      });

      setStatus(finalRows.length ? `Resultados: ${finalRows.length}` : "No hay resultados.");
    } catch (e: any) {
      setStatus("❌ " + (e?.message || e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  const visible = useMemo(() => rows, [rows]);

  async function guardarRow(variant_id: string) {
    const d = draft.get(variant_id);
    if (!d) return;

    const qty = safeNum(d.qty, 0);
    const min_qty = safeNum(d.min_qty, 0);

    if (qty < 0 || min_qty < 0) return alert("Stock y mínimo no pueden ser negativos.");

    setSavingId(variant_id);
    try {
      const up = await supabase.from("inv_variant_stock").upsert(
        { variant_id, qty, min_qty },
        { onConflict: "variant_id" }
      );

      if (up.error) throw new Error(up.error.message);

      // actualizar UI
      setRows((prev) =>
        prev.map((r) => (r.variant_id === variant_id ? { ...r, qty, min_qty } : r))
      );
      setStatus("✅ Guardado");
    } catch (e: any) {
      alert("❌ Error guardando: " + (e?.message || e));
      setStatus("❌ " + (e?.message || e));
    } finally {
      setSavingId("");
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 34, marginBottom: 6 }}>📦 Inventario (Stock)</h1>
      <div style={{ color: "#aaa", marginBottom: 14 }}>
        Busca por producto o variante (ej: <b>batas</b>, <b>guantes</b>, <b>alcohol</b>).
      </div>

      <div style={card}>
        <label style={label}>Buscar producto / variante</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ej: batas"
          style={input}
        />
        <div style={{ marginTop: 10, color: "#777", fontSize: 12 }}>
          {loading ? "Buscando..." : status}
        </div>
      </div>

      {visible.length === 0 ? (
        <div style={{ color: "#aaa", marginTop: 18 }}>Sin resultados.</div>
      ) : (
        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          {visible.map((r) => {
            const d = draft.get(r.variant_id) || { qty: String(r.qty), min_qty: String(r.min_qty) };
            const attrs = attrToText(r.attributes);

            const low = safeNum(d.qty, r.qty) <= safeNum(d.min_qty, r.min_qty) && safeNum(d.min_qty, 0) > 0;

            return (
              <div key={r.variant_id} style={{ ...rowCard, borderColor: low ? "#6b1b1b" : "#222" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ color: "#d4af37", fontWeight: 900 }}>{r.product_name}</div>
                    <div style={{ color: "#fff", fontWeight: 800 }}>{r.variant_name}</div>
                    {attrs && <div style={{ color: "#888", fontSize: 12, marginTop: 4 }}>{attrs}</div>}
                  </div>

                  {low && (
                    <div style={badgeLow}>⚠️ Bajo stock</div>
                  )}
                </div>

                <div style={grid}>
                  <div>
                    <div style={miniLabel}>Stock actual</div>
                    <input
                      type="number"
                      style={miniInput}
                      value={d.qty}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft((prev) => {
                          const next = new Map(prev);
                          const cur = next.get(r.variant_id) || { qty: String(r.qty), min_qty: String(r.min_qty) };
                          next.set(r.variant_id, { ...cur, qty: v });
                          return next;
                        });
                      }}
                      min={0}
                    />
                  </div>

                  <div>
                    <div style={miniLabel}>Stock mínimo</div>
                    <input
                      type="number"
                      style={miniInput}
                      value={d.min_qty}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft((prev) => {
                          const next = new Map(prev);
                          const cur = next.get(r.variant_id) || { qty: String(r.qty), min_qty: String(r.min_qty) };
                          next.set(r.variant_id, { ...cur, min_qty: v });
                          return next;
                        });
                      }}
                      min={0}
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "end" }}>
                    <button
                      style={btn}
                      onClick={() => guardarRow(r.variant_id)}
                      disabled={savingId === r.variant_id}
                    >
                      {savingId === r.variant_id ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>

                <div style={{ color: "#777", fontSize: 12, marginTop: 8 }}>
                  Guardado actual: <b style={{ color: "#fff" }}>{r.qty}</b> (mín:{" "}
                  <b style={{ color: "#fff" }}>{r.min_qty}</b>)
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  marginTop: 10,
  padding: 16,
  border: "1px solid #222",
  background: "#111",
  borderRadius: 14,
};

const rowCard: React.CSSProperties = {
  padding: 14,
  border: "1px solid #222",
  background: "#0f0f0f",
  borderRadius: 14,
};

const label: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  color: "#aaa",
  fontWeight: 900,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "12px 12px",
  borderRadius: 10,
  border: "1px solid #333",
  background: "#0b0b0b",
  color: "#fff",
};

const grid: React.CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  marginTop: 12,
};

const miniLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#888",
  fontWeight: 800,
  marginBottom: 6,
};

const miniInput: React.CSSProperties = {
  width: "100%",
  padding: "10px 10px",
  borderRadius: 10,
  border: "1px solid #333",
  background: "#0b0b0b",
  color: "#fff",
};

const btn: React.CSSProperties = {
  width: "100%",
  padding: "12px 12px",
  borderRadius: 12,
  border: "none",
  background: "#d4af37",
  fontWeight: 900,
  cursor: "pointer",
};

const badgeLow: React.CSSProperties = {
  alignSelf: "start",
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #ff4d4d",
  color: "#ff4d4d",
  fontWeight: 900,
  fontSize: 12,
};