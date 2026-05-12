"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "../lib/supabase";

type Category = { id: string; name: string; parent_id: string | null };
type Product = { id: string; name: string; sku: string | null; unit: string | null; description: string | null; category_id: string | null; active: boolean };
type Variant = { id: string; product_id: string; name: string; attributes: Record<string, string> | null };
type Stock = { variant_id: string; qty: number; min_qty: number };
type Sale = { variant_id: string; sale_price: number; allow_discount: boolean };
type OptionKind = "color" | "size" | "custom";
type OptionGroup = { id: string; name: string; kind: OptionKind; values: string[]; extra: string };
type Draft = { key: string; name: string; attrs: Record<string, string>; sku: string; barcode: string; price: string; cost: string; qty: string; min: string };

const colors = ["Negro", "Azul", "Azul marino", "Rosa", "Purpura", "Verde", "Blanco", "Amarillo"];
const sizes = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];
const defaultGroups: OptionGroup[] = [
  { id: "color", name: "Color", kind: "color", values: [], extra: "" },
  { id: "size", name: "Tamano", kind: "size", values: [], extra: "" },
];

const money = (v: string, fb = 0) => {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fb;
};
const slug = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase();
const csv = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
const presets = (k: OptionKind) => (k === "color" ? colors : k === "size" ? sizes : []);

function imageFromAttributes(attributes: Record<string, string> | null | undefined) {
  const value = attributes?.imagen || attributes?.Imagen || attributes?.image_url;
  return typeof value === "string" && value.trim() ? value : null;
}

function visibleAttributes(attributes: Record<string, string> | null | undefined) {
  return Object.entries(attributes || {}).filter(([key, value]) => {
    if (!value) return false;
    return !["imagen", "Imagen", "image_url", "producto_origen_id", "variante_origen_id"].includes(key);
  });
}

function combos(groups: Array<{ name: string; values: string[] }>) {
  if (!groups.length) return [{} as Record<string, string>];
  return groups.reduce<Array<Record<string, string>>>((acc, g) => acc.flatMap((b) => g.values.map((v) => ({ ...b, [g.name]: v }))), [{}]);
}

export default function InventarioPage() {
  const [status, setStatus] = useState("Cargando inventario...");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [stockMap, setStockMap] = useState<Map<string, Stock>>(new Map());
  const [saleMap, setSaleMap] = useState<Map<string, Sale>>(new Map());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [productType, setProductType] = useState("");
  const [supplier, setSupplier] = useState("");
  const [tags, setTags] = useState("");
  const [skuBase, setSkuBase] = useState("");
  const [barcode, setBarcode] = useState("");
  const [price, setPrice] = useState("0");
  const [cost, setCost] = useState("0");
  const [qty, setQty] = useState("0");
  const [minQty, setMinQty] = useState("0");
  const [unit, setUnit] = useState("unidad");
  const [boxUnit, setBoxUnit] = useState("caja");
  const [unitsPerBox, setUnitsPerBox] = useState("100");
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState("g");
  const [parentId, setParentId] = useState("");
  const [childId, setChildId] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newSubCategory, setNewSubCategory] = useState("");
  const [groups, setGroups] = useState<OptionGroup[]>(defaultGroups);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const roots = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  const children = useMemo(() => categories.filter((c) => c.parent_id === parentId), [categories, parentId]);
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  async function load() {
    setStatus("Cargando inventario...");
    const [c, p, v] = await Promise.all([
      supabase.from("inv_categories").select("id,name,parent_id").order("name"),
      supabase.from("inv_products").select("id,name,sku,unit,description,category_id,active").order("created_at", { ascending: false }),
      supabase.from("inv_variants").select("id,product_id,name,attributes").order("created_at", { ascending: false }),
    ]);
    if (c.error) return setStatus(c.error.message);
    if (p.error) return setStatus(p.error.message);
    if (v.error) return setStatus(v.error.message);
    const nextVars = (v.data as Variant[]) || [];
    const ids = nextVars.map((x) => x.id);
    const [st, sa] = ids.length ? await Promise.all([
      supabase.from("inv_variant_stock").select("variant_id,qty,min_qty").in("variant_id", ids),
      supabase.from("inv_variant_sales").select("variant_id,sale_price,allow_discount").in("variant_id", ids),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (st.error) return setStatus(st.error.message);
    if (sa.error) return setStatus(sa.error.message);
    setCategories((c.data as Category[]) || []);
    setProducts((p.data as Product[]) || []);
    setVariants(nextVars);
    setStockMap(new Map(((st.data as Stock[]) || []).map((x) => [x.variant_id, x])));
    setSaleMap(new Map(((sa.data as Sale[]) || []).map((x) => [x.variant_id, x])));
    setStatus("Inventario listo");
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => [p.name, p.sku, p.description, ...variants.filter((v) => v.product_id === p.id).map((v) => v.name)].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [products, variants, search]);

  const patchGroup = (id: string, patch: Partial<OptionGroup>) => setGroups((cur) => cur.map((g) => g.id === id ? { ...g, ...patch } : g));
  const toggleValue = (id: string, value: string) => setGroups((cur) => cur.map((g) => g.id !== id ? g : { ...g, values: g.values.includes(value) ? g.values.filter((x) => x !== value) : [...g.values, value] }));

  function buildDrafts() {
    if (!title.trim()) return alert("Primero escribe el titulo del producto.");
    const normalized = groups.map((g) => ({ name: g.name || "Opcion", values: Array.from(new Set([...g.values, ...csv(g.extra)])) })).filter((g) => g.values.length);
    const base = slug(skuBase || title);
    const rows = combos(normalized).map((attrs, i) => ({
      key: `${base}-${i + 1}`,
      name: Object.keys(attrs).length ? `${title.trim()} - ${Object.values(attrs).join(" / ")}` : `${title.trim()} - Base`,
      attrs,
      sku: `${base}-${Object.values(attrs).map(slug).filter(Boolean).join("-") || `BASE-${i + 1}`}`,
      barcode,
      price,
      cost,
      qty,
      min: minQty,
    }));
    setDrafts(rows.length ? rows : [{ key: `${base}-BASE`, name: `${title.trim()} - Base`, attrs: {}, sku: `${base}-BASE`, barcode, price, cost, qty, min: minQty }]);
    setStatus(`Variantes preparadas: ${rows.length || 1}`);
  }

  async function save() {
    if (!title.trim()) return alert("Escribe el titulo del producto.");
    if (!drafts.length) return alert("Prepara las variantes antes de guardar.");
    setSaving(true); setStatus("Guardando producto...");
    const product = await supabase.from("inv_products").insert({
      name: title.trim(),
      sku: skuBase.trim() || null,
      unit: unit.trim() || null,
      description: [description.trim(), productType ? `Tipo: ${productType}` : "", supplier ? `Proveedor: ${supplier}` : "", tags ? `Etiquetas: ${tags}` : ""].filter(Boolean).join(" | "),
      category_id: childId || parentId || null,
      active,
    }).select("id").single();
    if (product.error) { setSaving(false); return setStatus(product.error.message); }
    for (const draft of drafts) {
      const attrs = { ...draft.attrs, codigo_barras: draft.barcode, costo: draft.cost, peso: weight ? `${weight} ${weightUnit}` : "", unidad: unit, unidades_por_caja: unitsPerBox, caja: boxUnit };
      const variant = await supabase.from("inv_variants").insert({ product_id: product.data.id, name: draft.name, attributes: attrs, active: true }).select("id").single();
      if (variant.error) { setSaving(false); return setStatus(variant.error.message); }
      const st = await supabase.from("inv_variant_stock").upsert({ variant_id: variant.data.id, qty: Math.max(0, money(draft.qty)), min_qty: Math.max(0, money(draft.min)) }, { onConflict: "variant_id" });
      if (st.error) { setSaving(false); return setStatus(st.error.message); }
      const sa = await supabase.from("inv_variant_sales").upsert({ variant_id: variant.data.id, sale_price: Math.max(0, money(draft.price)), allow_discount: true }, { onConflict: "variant_id" });
      if (sa.error) { setSaving(false); return setStatus(sa.error.message); }
    }
    setSaving(false); setStatus("Producto guardado"); resetForm(); await load();
  }

  async function addCategory(parent_id: string | null, raw: string) {
    const name = raw.trim(); if (!name) return;
    const res = await supabase.from("inv_categories").insert({ name, parent_id });
    if (res.error) return setStatus(res.error.message);
    await load();
  }

  function resetForm() {
    setTitle(""); setDescription(""); setActive(true); setProductType(""); setSupplier(""); setTags("");
    setSkuBase(""); setBarcode(""); setPrice("0"); setCost("0"); setQty("0"); setMinQty("0");
    setUnit("unidad"); setBoxUnit("caja"); setUnitsPerBox("100"); setWeight(""); setWeightUnit("g");
    setParentId(""); setChildId(""); setGroups(defaultGroups); setDrafts([]);
  }

  return (
    <main style={page}>
      <div style={header}><div><div style={eyebrow}>Inventario</div><h1 style={h1}>Agregar producto</h1></div><div style={pill}>{status}</div></div>
      <section style={layout}>
        <div style={{ display: "grid", gap: 18 }}>
          <Card title="Informacion general">
            <Field label="Titulo"><input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Guantes de nitrilo" /></Field>
            <Field label="Descripcion"><textarea style={editor} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe el producto como si fuera una tienda online." /></Field>
            <Field label="Multimedia"><div style={drop}>Aqui luego pondremos imagenes y archivos del producto.</div></Field>
            <div style={two}><Field label="Categoria"><select style={input} value={parentId} onChange={(e) => { setParentId(e.target.value); setChildId(""); }}><option value="">Elige una categoria</option>{roots.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Subcategoria"><select style={input} value={childId} onChange={(e) => setChildId(e.target.value)} disabled={!parentId}><option value="">{parentId ? "Selecciona una subcategoria" : "Elige categoria primero"}</option>{children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field></div>
            <div style={two}><Field label="Crear categoria"><div style={inline}><input style={input} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Guantes" /><button style={btnGhost} onClick={async () => { await addCategory(null, newCategory); setNewCategory(""); }}>Crear</button></div></Field><Field label="Crear subcategoria"><div style={inline}><input style={input} value={newSubCategory} onChange={(e) => setNewSubCategory(e.target.value)} placeholder="Nitrilo" /><button style={btnGhost} onClick={async () => { if (!parentId) return alert("Selecciona una categoria principal."); await addCategory(parentId, newSubCategory); setNewSubCategory(""); }}>Crear</button></div></Field></div>
          </Card>

          <Card title="Precio e inventario">
            <div style={three}><Field label="Precio"><input style={input} value={price} onChange={(e) => setPrice(e.target.value)} /></Field><Field label="Costo por articulo"><input style={input} value={cost} onChange={(e) => setCost(e.target.value)} /></Field><Field label="Estado"><select style={input} value={active ? "activo" : "inactivo"} onChange={(e) => setActive(e.target.value === "activo")}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></Field><Field label="Cantidad"><input style={input} value={qty} onChange={(e) => setQty(e.target.value)} /></Field><Field label="Stock minimo"><input style={input} value={minQty} onChange={(e) => setMinQty(e.target.value)} /></Field><Field label="SKU base"><input style={input} value={skuBase} onChange={(e) => setSkuBase(e.target.value)} /></Field><Field label="Codigo de barras"><input style={input} value={barcode} onChange={(e) => setBarcode(e.target.value)} /></Field><Field label="Tipo de unidad"><input style={input} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unidad" /></Field><Field label="Tipo de caja"><input style={input} value={boxUnit} onChange={(e) => setBoxUnit(e.target.value)} placeholder="caja" /></Field><Field label="Unidades por caja"><input style={input} value={unitsPerBox} onChange={(e) => setUnitsPerBox(e.target.value)} /></Field><Field label="Peso"><div style={inline}><input style={input} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="3.5" /><select style={{ ...input, width: 100 }} value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)}><option value="g">g</option><option value="kg">kg</option><option value="lb">lb</option><option value="ml">ml</option></select></div></Field></div>
          </Card>

          <Card title="Variantes">
            <div style={sectionTop}><div><div style={sectionTitle}>Opciones del producto</div><div style={muted}>Configura color, tamano o cualquier otra opcion como peso, tipo de unidad o presentacion.</div></div><button style={btnGhost} onClick={() => setGroups((cur) => [...cur, { id: `custom-${Date.now()}`, name: "Nueva opcion", kind: "custom", values: [], extra: "" }])}>Agregar opcion</button></div>
            <div style={{ display: "grid", gap: 14 }}>{groups.map((g) => <div key={g.id} style={box}><div style={sectionTop}><div style={{ fontWeight: 700 }}>Nombre de la opcion</div><button style={btnDanger} onClick={() => setGroups((cur) => cur.filter((x) => x.id !== g.id))}>Eliminar</button></div><div style={two}><Field label="Nombre visible"><input style={input} value={g.name} onChange={(e) => patchGroup(g.id, { name: e.target.value })} placeholder="Color, Tamano, Peso..." /></Field><Field label="Tipo"><select style={input} value={g.kind} onChange={(e) => patchGroup(g.id, { kind: e.target.value as OptionKind, values: [] })}><option value="color">Color</option><option value="size">Tamano</option><option value="custom">Personalizada</option></select></Field></div>{presets(g.kind).length ? <div><div style={fieldLabel}>Entradas predefinidas</div><div style={chips}>{presets(g.kind).map((value) => <button key={value} type="button" onClick={() => toggleValue(g.id, value)} style={{ ...chip, ...(g.values.includes(value) ? chipOn : null) }}>{value}</button>)}</div></div> : null}<Field label="Agregar nuevas entradas"><input style={input} value={g.extra} onChange={(e) => patchGroup(g.id, { extra: e.target.value })} placeholder="Separa con coma: 500 ml, 1 L, 5 L" /></Field></div>)}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}><button style={btnPrimary} onClick={buildDrafts}>Preparar variantes</button><button style={btnGhost} onClick={() => setDrafts((cur) => [...cur, { key: `manual-${Date.now()}`, name: `${title.trim() || "Producto"} - Variante ${cur.length + 1}`, attrs: {}, sku: slug(`${skuBase || title}-${cur.length + 1}`), barcode, price, cost, qty, min: minQty }])}>Agregar variante manual</button></div>
          </Card>

          <Card title="Lista de variantes">
            {drafts.length === 0 ? (
              <div style={empty}>Cuando prepares variantes apareceran aqui para revisar precio, stock y SKU.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {drafts.map((d, i) => (
                  <div key={d.key} style={box}>
                    <div style={sectionTop}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{d.name}</div>
                        <div style={muted}>{Object.entries(d.attrs).map(([k, v]) => `${k}: ${v}`).join(" - ") || "Sin atributos"}</div>
                      </div>
                      <button style={btnDanger} onClick={() => setDrafts((cur) => cur.filter((_, idx) => idx !== i))}>Quitar</button>
                    </div>
                    <div style={three}>
                      <Field label="SKU"><input style={input} value={d.sku} onChange={(e) => setDrafts((cur) => cur.map((x, idx) => idx === i ? { ...x, sku: e.target.value } : x))} /></Field>
                      <Field label="Codigo de barras"><input style={input} value={d.barcode} onChange={(e) => setDrafts((cur) => cur.map((x, idx) => idx === i ? { ...x, barcode: e.target.value } : x))} /></Field>
                      <Field label="Precio"><input style={input} value={d.price} onChange={(e) => setDrafts((cur) => cur.map((x, idx) => idx === i ? { ...x, price: e.target.value } : x))} /></Field>
                      <Field label="Costo"><input style={input} value={d.cost} onChange={(e) => setDrafts((cur) => cur.map((x, idx) => idx === i ? { ...x, cost: e.target.value } : x))} /></Field>
                      <Field label="Cantidad"><input style={input} value={d.qty} onChange={(e) => setDrafts((cur) => cur.map((x, idx) => idx === i ? { ...x, qty: e.target.value } : x))} /></Field>
                      <Field label="Stock minimo"><input style={input} value={d.min} onChange={(e) => setDrafts((cur) => cur.map((x, idx) => idx === i ? { ...x, min: e.target.value } : x))} /></Field>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
              <button style={btnPrimary} onClick={save} disabled={saving}>{saving ? "Guardando..." : "Guardar producto"}</button>
              <button style={btnGhost} onClick={resetForm}>Limpiar formulario</button>
            </div>
          </Card>
        </div>

        <aside style={{ display: "grid", gap: 18 }}>
          <Card title="Organizacion del producto">
            <Field label="Tipo"><input style={input} value={productType} onChange={(e) => setProductType(e.target.value)} placeholder="Guantes, Limpieza, Accesorio..." /></Field>
            <Field label="Proveedor"><input style={input} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Nombre del proveedor" /></Field>
            <Field label="Etiquetas"><input style={input} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="hospital, nitrilo, sin polvo" /></Field>
          </Card>

          <Card title="Catalogo actual">
            <input style={{ ...input, marginBottom: 12 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto o variante" />
            <div style={catalog}>
              {filtered.length === 0 ? (
                <div style={empty}>No hay coincidencias.</div>
              ) : filtered.map((p) => {
                const rows = variants.filter((v) => v.product_id === p.id);
                const categoryName = p.category_id ? (catMap.get(p.category_id) ?? "Sin categoria") : "Sin categoria";
                return (
                  <div key={p.id} style={box}>
                    <div style={{ fontWeight: 800 }}>{p.name}</div>
                    <div style={muted}>{[p.sku ? `SKU: ${p.sku}` : null, p.unit ? `Unidad: ${p.unit}` : null, `Categoria: ${categoryName}`].filter(Boolean).join(" - ")}</div>
                    {p.description ? <div style={{ ...muted, marginTop: 6 }}>{p.description}</div> : null}
                    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                      {rows.length === 0 ? (
                        <div style={muted}>Sin variantes.</div>
                      ) : rows.map((v) => {
                        const stockQty = Number(stockMap.get(v.id)?.qty ?? 0);
                        const salePrice = Number(saleMap.get(v.id)?.sale_price ?? 0);
                        const img = imageFromAttributes(v.attributes);
                        const attrs = visibleAttributes(v.attributes);
                        return (
                          <div key={v.id} style={variantBox}>
                            <div style={variantTop}>
                              {img ? <img src={img} alt={v.name} style={thumb} /> : <div style={thumbPlaceholder}>Sin imagen</div>}
                              <div style={{ display: "grid", gap: 6 }}>
                                <div style={{ fontWeight: 700 }}>{v.name}</div>
                                <div style={muted}>{attrs.map(([k, value]) => `${k}: ${value}`).join(" - ") || "Sin atributos"}</div>
                              </div>
                            </div>
                            <div style={smallStats}><span>Stock {stockQty}</span><span>PVP ${salePrice.toFixed(2)}</span></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </aside>
      </section>
    </main>
  );
}

function Card({ children, title }: { children: React.ReactNode; title: string }) { return <section style={card}><h2 style={cardTitle}>{title}</h2>{children}</section>; }
function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label style={field}><span style={fieldLabel}>{label}</span>{children}</label>; }

const page: CSSProperties = { display: "grid", gap: 20, maxWidth: 1480, margin: "0 auto" };
const header: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" };
const eyebrow: CSSProperties = { color: "#93c5fd", fontSize: 12, fontWeight: 800, letterSpacing: "0.24em", textTransform: "uppercase" };
const layout: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.72fr)", gap: 18, alignItems: "start" };
const card: CSSProperties = { borderRadius: 24, border: "1px solid rgba(148,163,184,0.14)", background: "rgba(248,250,252,0.03)", padding: 20, boxShadow: "0 16px 34px rgba(0,0,0,0.12)" };
const cardTitle: CSSProperties = { margin: "0 0 16px", fontSize: 24, color: "#f8fafc" };
const h1: CSSProperties = { margin: "8px 0 0", fontSize: 38, lineHeight: 1.02, color: "#f8fafc" };
const pill: CSSProperties = { padding: "10px 14px", borderRadius: 999, background: "rgba(59,130,246,0.12)", border: "1px solid rgba(96,165,250,0.2)", color: "#dbeafe", fontWeight: 700 };
const field: CSSProperties = { display: "grid", gap: 6 };
const fieldLabel: CSSProperties = { color: "#cbd5e1", fontSize: 13, fontWeight: 700 };
const input: CSSProperties = { width: "100%", minHeight: 46, borderRadius: 14, border: "1px solid rgba(148,163,184,0.16)", background: "rgba(15,23,42,0.72)", color: "#f8fafc", padding: "12px 14px", outline: "none" };
const editor: CSSProperties = { ...input, minHeight: 170, resize: "vertical" };
const drop: CSSProperties = { minHeight: 100, borderRadius: 18, border: "1px dashed rgba(148,163,184,0.22)", background: "rgba(15,23,42,0.42)", padding: 18, display: "grid", alignContent: "center", justifyItems: "center", color: "#cbd5e1" };
const two: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 };
const three: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 };
const inline: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10 };
const sectionTop: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 };
const sectionTitle: CSSProperties = { fontSize: 17, fontWeight: 800, color: "#f8fafc" };
const box: CSSProperties = { padding: 16, borderRadius: 20, border: "1px solid rgba(148,163,184,0.12)", background: "rgba(15,23,42,0.42)" };
const chips: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 };
const chip: CSSProperties = { padding: "10px 12px", borderRadius: 999, border: "1px solid rgba(148,163,184,0.16)", background: "rgba(15,23,42,0.86)", color: "#eef2ff", cursor: "pointer", fontWeight: 600 };
const chipOn: CSSProperties = { background: "rgba(59,130,246,0.16)", border: "1px solid rgba(96,165,250,0.28)" };
const btnPrimary: CSSProperties = { padding: "12px 16px", borderRadius: 14, border: "1px solid rgba(96,165,250,0.24)", background: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)", color: "#f8fafc", fontWeight: 700, cursor: "pointer" };
const btnGhost: CSSProperties = { padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(148,163,184,0.16)", background: "rgba(15,23,42,0.82)", color: "#e2e8f0", fontWeight: 700, cursor: "pointer" };
const btnDanger: CSSProperties = { padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(248,113,113,0.24)", background: "rgba(69,10,10,0.74)", color: "#fecaca", fontWeight: 700, cursor: "pointer" };
const empty: CSSProperties = { padding: 18, borderRadius: 18, border: "1px dashed rgba(148,163,184,0.22)", color: "#94a3b8", textAlign: "center" };
const catalog: CSSProperties = { display: "grid", gap: 12, maxHeight: "80vh", overflowY: "auto", paddingRight: 4 };
const variantBox: CSSProperties = { display: "grid", gap: 6, padding: 10, borderRadius: 14, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(148,163,184,0.1)" };
const variantTop: CSSProperties = { display: "grid", gridTemplateColumns: "72px minmax(0, 1fr)", gap: 12, alignItems: "start" };
const thumb: CSSProperties = { width: 72, height: 72, borderRadius: 14, objectFit: "cover", border: "1px solid rgba(148,163,184,0.12)", background: "rgba(15,23,42,0.9)" };
const thumbPlaceholder: CSSProperties = { width: 72, height: 72, borderRadius: 14, border: "1px dashed rgba(148,163,184,0.22)", display: "grid", placeItems: "center", fontSize: 11, color: "#94a3b8", background: "rgba(15,23,42,0.36)", textAlign: "center", padding: 6 };
const smallStats: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "#dbeafe" };
const muted: CSSProperties = { color: "#94a3b8", fontSize: 12, lineHeight: 1.5 };
