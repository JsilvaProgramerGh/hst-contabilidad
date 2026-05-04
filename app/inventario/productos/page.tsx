"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Category = { id: string; name: string; parent_id: string | null };
type Product = { id: string; name: string; sku: string | null; unit: string | null; description: string | null; category_id: string | null; active: boolean; };
type Variant = { id: string; product_id: string; name: string; attributes: Record<string, string> | null; };
type StockRow = { variant_id: string; qty: number; min_qty: number };
type SalesRow = { variant_id: string; sale_price: number; allow_discount: boolean };
type VariantDraft = { label: string; attributes: Record<string, string>; qty: string; min_qty: string; sale_price: string; allow_discount: boolean };

const attrs = [
  { key: "color", label: "Color", placeholder: "Azul, Negro, Violeta" },
  { key: "talla", label: "Talla", placeholder: "XS, S, M, L" },
  { key: "grosor", label: "Grosor", placeholder: "3.5g, 5g, 8 mil" },
  { key: "presentacion", label: "Presentacion", placeholder: "Caja x100, Par, Unidad" },
  { key: "marca", label: "Marca", placeholder: "Opcional" },
] as const;

const emptyDraft: VariantDraft = { label: "", attributes: {}, qty: "0", min_qty: "0", sale_price: "0", allow_discount: true };

const num = (v: string, fallback = 0) => {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};

const splitCsv = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

function combinations(groups: Array<{ key: string; values: string[] }>) {
  if (!groups.length) return [{} as Record<string, string>];
  return groups.reduce<Array<Record<string, string>>>(
    (acc, g) => acc.flatMap((base) => g.values.map((value) => ({ ...base, [g.key]: value }))),
    [{} as Record<string, string>],
  );
}

async function insertVariant(productId: string, draft: VariantDraft, packUnit: string, baseUnit: string, unitsPerPack: number) {
  const full = await supabase.from("inv_variants").insert({
    product_id: productId, name: draft.label, attributes: draft.attributes, active: true,
    pack_unit: packUnit, base_unit: baseUnit, units_per_pack: unitsPerPack,
  }).select("id").single();
  if (!full.error) return full;
  return supabase.from("inv_variants").insert({
    product_id: productId, name: draft.label, attributes: draft.attributes, active: true,
  }).select("id").single();
}

export default function ProductosPage() {
  const [status, setStatus] = useState("Cargando catalogo...");
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stockMap, setStockMap] = useState<Map<string, StockRow>>(new Map());
  const [salesMap, setSalesMap] = useState<Map<string, SalesRow>>(new Map());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("caja");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");
  const [childId, setChildId] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newSubCategory, setNewSubCategory] = useState("");
  const [packUnit, setPackUnit] = useState("caja");
  const [baseUnit, setBaseUnit] = useState("unidad");
  const [unitsPerPack, setUnitsPerPack] = useState("100");
  const [attrInputs, setAttrInputs] = useState<Record<string, string>>({ color: "", talla: "", grosor: "", presentacion: "", marca: "" });
  const [drafts, setDrafts] = useState<VariantDraft[]>([]);

  const roots = useMemo(() => categories.filter((x) => !x.parent_id), [categories]);
  const children = useMemo(() => categories.filter((x) => x.parent_id === parentId), [categories, parentId]);
  const categoryMap = useMemo(() => new Map(categories.map((x) => [x.id, x.name])), [categories]);

  async function load() {
    setStatus("Cargando catalogo...");
    const [c, p, v] = await Promise.all([
      supabase.from("inv_categories").select("id,name,parent_id").order("name"),
      supabase.from("inv_products").select("id,name,sku,unit,description,category_id,active").order("created_at", { ascending: false }),
      supabase.from("inv_variants").select("id,product_id,name,attributes").order("created_at", { ascending: false }),
    ]);
    if (c.error) return setStatus(c.error.message);
    if (p.error) return setStatus(p.error.message);
    if (v.error) return setStatus(v.error.message);
    const nextVariants = (v.data as Variant[]) || [];
    const ids = nextVariants.map((x) => x.id);
    const [stock, sales] = ids.length ? await Promise.all([
      supabase.from("inv_variant_stock").select("variant_id,qty,min_qty").in("variant_id", ids),
      supabase.from("inv_variant_sales").select("variant_id,sale_price,allow_discount").in("variant_id", ids),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (stock.error) return setStatus(stock.error.message);
    if (sales.error) return setStatus(sales.error.message);
    setCategories((c.data as Category[]) || []);
    setProducts((p.data as Product[]) || []);
    setVariants(nextVariants);
    setStockMap(new Map(((stock.data as StockRow[]) || []).map((x) => [x.variant_id, x])));
    setSalesMap(new Map(((sales.data as SalesRow[]) || []).map((x) => [x.variant_id, x])));
    setStatus("Catalogo listo");
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => [p.name, p.sku, p.description, ...variants.filter((v) => v.product_id === p.id).map((v) => v.name)].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [products, variants, search]);

  const reset = () => {
    setName(""); setSku(""); setUnit("caja"); setDescription(""); setParentId(""); setChildId("");
    setPackUnit("caja"); setBaseUnit("unidad"); setUnitsPerPack("100");
    setAttrInputs({ color: "", talla: "", grosor: "", presentacion: "", marca: "" }); setDrafts([]);
  };

  const buildDrafts = () => {
    if (!name.trim()) return alert("Primero escribe el nombre del producto.");
    const groups = attrs.map((a) => ({ key: a.key, values: splitCsv(attrInputs[a.key]) })).filter((g) => g.values.length);
    const next = combinations(groups).map((attributes) => ({
      ...emptyDraft,
      label: Object.keys(attributes).length ? `${name.trim()} - ${Object.values(attributes).join(" / ")}` : `${name.trim()} - Base`,
      attributes,
    }));
    setDrafts(next.length ? next : [{ ...emptyDraft, label: `${name.trim()} - Base` }]);
    setStatus(`Variantes preparadas: ${next.length || 1}`);
  };

  const updateDraft = (i: number, patch: Partial<VariantDraft>) => setDrafts((current) => current.map((d, idx) => idx === i ? { ...d, ...patch } : d));
  const removeDraft = (i: number) => setDrafts((current) => current.filter((_, idx) => idx !== i));

  async function createCategory(parent_id: string | null, raw: string) {
    const name = raw.trim();
    if (!name) return;
    const { error } = await supabase.from("inv_categories").insert({ name, parent_id });
    if (error) return setStatus(`No pude crear categoria: ${error.message}`);
    await load();
  }

  async function save() {
    if (!name.trim()) return alert("Escribe el nombre del producto.");
    if (!drafts.length) return alert("Genera al menos una variante.");
    setSaving(true); setStatus("Guardando producto...");
    const category_id = childId || parentId || null;
    const product = await supabase.from("inv_products").insert({
      name: name.trim(), sku: sku.trim() || null, unit: unit.trim() || null, category_id, description: description.trim() || null, active: true,
    }).select("id").single();
    if (product.error) { setSaving(false); return setStatus(`No pude crear producto: ${product.error.message}`); }
    for (const draft of drafts) {
      const variant = await insertVariant(product.data.id as string, draft, packUnit.trim() || "caja", baseUnit.trim() || "unidad", Math.max(1, num(unitsPerPack, 1)));
      if (variant.error) { setSaving(false); return setStatus(`No pude crear variante: ${variant.error.message}`); }
      const variantId = variant.data.id as string;
      const stock = await supabase.from("inv_variant_stock").upsert({ variant_id: variantId, qty: Math.max(0, num(draft.qty)), min_qty: Math.max(0, num(draft.min_qty)) }, { onConflict: "variant_id" });
      if (stock.error) { setSaving(false); return setStatus(`No pude guardar stock: ${stock.error.message}`); }
      const sales = await supabase.from("inv_variant_sales").upsert({ variant_id: variantId, sale_price: Math.max(0, num(draft.sale_price)), allow_discount: draft.allow_discount }, { onConflict: "variant_id" });
      if (sales.error) { setSaving(false); return setStatus(`No pude guardar precio: ${sales.error.message}`); }
    }
    reset(); await load(); setSaving(false); setStatus("Producto guardado con sus variantes");
  }

  return (
    <main style={page}>
      <section style={hero}>
        <div>
          <div style={eyebrow}>Catalogo profesional</div>
          <h1 style={h1}>Productos y variantes</h1>
          <p style={sub}>Registra un producto base y luego sus variantes reales por color, talla, grosor, presentacion y marca opcional.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/inventario/stock" style={ghost}>Ver stock</Link>
          <Link href="/inventario/venta" style={ghost}>Ir al POS</Link>
        </div>
      </section>

      <section style={layout}>
        <article style={panel}>
          <div style={topRow}><h2 style={h2}>Nuevo producto</h2><span style={chip}>{status}</span></div>
          <div style={grid}>
            <Field label="Producto base"><input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Guantes de nitrilo" /></Field>
            <Field label="SKU base"><input style={input} value={sku} onChange={(e) => setSku(e.target.value)} placeholder="HST-GUA-NIT" /></Field>
            <Field label="Unidad comercial"><input style={input} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="caja" /></Field>
            <Field label="Presentacion principal"><input style={input} value={packUnit} onChange={(e) => setPackUnit(e.target.value)} placeholder="caja" /></Field>
            <Field label="Unidad interna"><input style={input} value={baseUnit} onChange={(e) => setBaseUnit(e.target.value)} placeholder="unidad" /></Field>
            <Field label="Unidades por presentacion"><input style={input} value={unitsPerPack} onChange={(e) => setUnitsPerPack(e.target.value)} placeholder="100" /></Field>
            <Field label="Categoria"><select style={input} value={parentId} onChange={(e) => { setParentId(e.target.value); setChildId(""); }}><option value="">Sin categoria</option>{roots.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Subcategoria"><select style={input} value={childId} onChange={(e) => setChildId(e.target.value)} disabled={!parentId}><option value="">{parentId ? "Sin subcategoria" : "Elige categoria primero"}</option>{children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Descripcion" full><textarea style={textarea} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notas tecnicas y comerciales" /></Field>
          </div>

          <div style={{ ...grid, marginTop: 14 }}>
            <Field label="Crear categoria"><div style={inline}><input style={input} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Guantes" /><button style={btnSoft} onClick={async () => { await createCategory(null, newCategory); setNewCategory(""); }}>Crear</button></div></Field>
            <Field label="Crear subcategoria"><div style={inline}><input style={input} value={newSubCategory} onChange={(e) => setNewSubCategory(e.target.value)} placeholder="Nitrilo" /><button style={btnSoft} onClick={async () => { if (!parentId) return alert("Selecciona una categoria principal."); await createCategory(parentId, newSubCategory); setNewSubCategory(""); }}>Crear</button></div></Field>
          </div>

          <div style={box}>
            <div style={topRow}><div><h3 style={h3}>Atributos de variantes</h3><p style={muted}>Separa las opciones con coma. Ejemplo: Azul, Negro, Violeta.</p></div><button style={btn} onClick={buildDrafts}>Generar variantes</button></div>
            <div style={grid}>{attrs.map((a) => <Field key={a.key} label={a.label}><input style={input} value={attrInputs[a.key]} onChange={(e) => setAttrInputs((current) => ({ ...current, [a.key]: e.target.value }))} placeholder={a.placeholder} /></Field>)}</div>
          </div>

          <div style={box}>
            <div style={topRow}><div><h3 style={h3}>Variantes preparadas</h3><p style={muted}>Ajusta stock minimo y precio por cada una.</p></div><button style={btnSoft} onClick={() => setDrafts((current) => [...current, { ...emptyDraft, label: `${name.trim() || "Producto"} - Variante ${current.length + 1}` }])}>Agregar manual</button></div>
            {drafts.length === 0 ? <div style={empty}>Todavia no has preparado variantes.</div> : <div style={{ display: "grid", gap: 12 }}>{drafts.map((d, i) => <div key={`${d.label}-${i}`} style={card}><div style={topRow}><div><div style={titleMini}>{d.label || `Variante ${i + 1}`}</div><div style={mutedSmall}>{Object.entries(d.attributes).map(([k, v]) => `${k}: ${v}`).join(" · ") || "Sin atributos"}</div></div><button style={danger} onClick={() => removeDraft(i)}>Quitar</button></div><div style={grid}><Field label="Nombre visible"><input style={input} value={d.label} onChange={(e) => updateDraft(i, { label: e.target.value })} /></Field><Field label="Stock inicial"><input style={input} value={d.qty} onChange={(e) => updateDraft(i, { qty: e.target.value })} /></Field><Field label="Stock minimo"><input style={input} value={d.min_qty} onChange={(e) => updateDraft(i, { min_qty: e.target.value })} /></Field><Field label="Precio de venta"><input style={input} value={d.sale_price} onChange={(e) => updateDraft(i, { sale_price: e.target.value })} /></Field><Field label="Permite descuento"><select style={input} value={d.allow_discount ? "si" : "no"} onChange={(e) => updateDraft(i, { allow_discount: e.target.value === "si" })}><option value="si">Si</option><option value="no">No</option></select></Field></div></div>)}</div>}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}><button style={btn} onClick={save} disabled={saving}>{saving ? "Guardando..." : "Guardar producto completo"}</button><button style={ghost} onClick={reset}>Limpiar formulario</button></div>
          </div>
        </article>

        <article style={panel}>
          <div style={topRow}><h2 style={h2}>Catalogo actual</h2><button style={btnSoft} onClick={load}>Actualizar</button></div>
          <input style={{ ...input, marginBottom: 14 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por producto o variante" />
          <div style={list}>{filtered.length === 0 ? <div style={empty}>Todavia no hay productos cargados.</div> : filtered.map((p) => {
            const rows = variants.filter((v) => v.product_id === p.id);
            return <div key={p.id} style={card}><div style={topRow}><div><div style={titleMini}>{p.name}</div><div style={mutedSmall}>{[p.sku ? `SKU: ${p.sku}` : null, p.unit ? `Unidad: ${p.unit}` : null, p.category_id ? `Categoria: ${categoryMap.get(p.category_id) || "Sin categoria"}` : "Sin categoria"].filter(Boolean).join(" · ")}</div></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={btnSoft} onClick={async () => { const res = await supabase.from("inv_products").update({ active: !p.active }).eq("id", p.id); if (res.error) return setStatus(res.error.message); await load(); }}>{p.active ? "Activo" : "Inactivo"}</button><button style={danger} onClick={async () => { if (!confirm("Se eliminara el producto y sus variantes. Continuar?")) return; const res = await supabase.from("inv_products").delete().eq("id", p.id); if (res.error) return setStatus(res.error.message); await load(); }}>Eliminar</button></div></div>{p.description ? <p style={{ ...muted, marginTop: 8 }}>{p.description}</p> : null}<div style={{ display: "grid", gap: 10 }}>{rows.length === 0 ? <div style={mutedSmall}>Sin variantes.</div> : rows.map((v) => <div key={v.id} style={summary}><div><div style={{ fontWeight: 700 }}>{v.name}</div><div style={mutedSmall}>{Object.entries(v.attributes || {}).map(([k, value]) => `${k}: ${value}`).join(" · ") || "Sin atributos"}</div></div><div style={stats}><span>Stock {stockMap.get(v.id)?.qty ?? 0}</span><span>Min {stockMap.get(v.id)?.min_qty ?? 0}</span><span>PVP ${Number(salesMap.get(v.id)?.sale_price ?? 0).toFixed(2)}</span></div></div>)}</div></div>;
          })}</div>
        </article>
      </section>
    </main>
  );
}

function Field({ children, label, full }: { children: React.ReactNode; label: string; full?: boolean }) {
  return <label style={{ display: "grid", gap: 6, gridColumn: full ? "1 / -1" : undefined }}><span style={fieldLabel}>{label}</span>{children}</label>;
}

const page: React.CSSProperties = { display: "grid", gap: 20, maxWidth: 1440, margin: "0 auto" };
const hero: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 18, flexWrap: "wrap" };
const layout: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(360px, 0.85fr)", gap: 18, alignItems: "start" };
const panel: React.CSSProperties = { borderRadius: 26, border: "1px solid rgba(140,166,194,0.16)", background: "rgba(7,16,28,0.9)", padding: 20 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 };
const box: React.CSSProperties = { marginTop: 18, padding: 18, borderRadius: 22, border: "1px solid rgba(140,166,194,0.14)", background: "rgba(5,12,22,0.8)" };
const topRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 };
const inline: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10 };
const list: React.CSSProperties = { display: "grid", gap: 14, maxHeight: "80vh", overflowY: "auto", paddingRight: 4 };
const card: React.CSSProperties = { padding: 16, borderRadius: 20, border: "1px solid rgba(140,166,194,0.12)", background: "rgba(8,18,31,0.92)" };
const summary: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "center", padding: 12, borderRadius: 14, background: "rgba(5,12,22,0.84)", border: "1px solid rgba(140,166,194,0.12)" };
const stats: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "#d9e4f0" };
const input: React.CSSProperties = { width: "100%", minHeight: 46, borderRadius: 14, border: "1px solid rgba(140,166,194,0.16)", background: "rgba(5,12,22,0.95)", color: "#eef4fb", padding: "12px 14px", outline: "none" };
const textarea: React.CSSProperties = { ...input, minHeight: 104, resize: "vertical" };
const btn: React.CSSProperties = { padding: "12px 16px", borderRadius: 14, border: "1px solid rgba(211,176,86,0.2)", background: "linear-gradient(135deg, #d3b056 0%, #f0d58f 100%)", color: "#201703", fontWeight: 800, cursor: "pointer" };
const btnSoft: React.CSSProperties = { padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(140,166,194,0.18)", background: "rgba(12,24,39,0.94)", color: "#eef4fb", fontWeight: 700, cursor: "pointer" };
const ghost: React.CSSProperties = { padding: "12px 16px", borderRadius: 14, border: "1px solid rgba(140,166,194,0.18)", background: "rgba(12,24,39,0.88)", color: "#eef4fb", fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center" };
const danger: React.CSSProperties = { padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(200,99,99,0.24)", background: "rgba(48,12,12,0.9)", color: "#ffbcbc", fontWeight: 700, cursor: "pointer" };
const chip: React.CSSProperties = { padding: "6px 10px", borderRadius: 999, background: "rgba(17,39,64,0.92)", color: "#c6d7ec", fontSize: 12 };
const empty: React.CSSProperties = { padding: 18, borderRadius: 18, border: "1px dashed rgba(140,166,194,0.2)", color: "#8da2ba", textAlign: "center" };
const eyebrow: React.CSSProperties = { color: "#d3b056", textTransform: "uppercase", letterSpacing: 1.5, fontSize: 12, fontWeight: 700 };
const h1: React.CSSProperties = { margin: "8px 0", fontSize: 40, lineHeight: 1 };
const h2: React.CSSProperties = { margin: 0, fontSize: 24 };
const h3: React.CSSProperties = { margin: 0, fontSize: 20 };
const sub: React.CSSProperties = { margin: 0, maxWidth: 760, color: "#9eb1c8", lineHeight: 1.6 };
const muted: React.CSSProperties = { margin: 0, color: "#95a8c0", lineHeight: 1.5 };
const mutedSmall: React.CSSProperties = { marginTop: 4, fontSize: 12, color: "#8ea3bb" };
const titleMini: React.CSSProperties = { fontSize: 16, fontWeight: 800 };
const fieldLabel: React.CSSProperties = { color: "#9eb1c8", fontSize: 12, fontWeight: 700 };
