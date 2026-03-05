"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Category = { id: string; name: string; parent_id: string | null };
type InvType = { id: string; name: string };
type TypeField = {
  id: string;
  type_id: string;
  key: string;
  label: string;
  input_type: "text" | "number" | "select";
  required: boolean;
  options: string[] | null;
  sort: number;
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  description: string | null;
  category_id: string | null;
  active: boolean;
  created_at: string;
};

function safeNum(v: any, fallback = 0) {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function buildVariantName(base: string, attrs: Record<string, any>) {
  const parts = Object.entries(attrs)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${v}`);
  return parts.length ? `${base} — ${parts.join(" · ")}` : `${base} — Única`;
}

export default function InvProductosPage() {
  const [status, setStatus] = useState("");

  // categorías jerárquicas
  const [catsAll, setCatsAll] = useState<Category[]>([]);
  const catsRoot = useMemo(() => catsAll.filter((c) => !c.parent_id), [catsAll]);
  const [parentCatId, setParentCatId] = useState<string>("");
  const subCats = useMemo(() => catsAll.filter((c) => c.parent_id === parentCatId), [catsAll, parentCatId]);
  const [subCatId, setSubCatId] = useState<string>("");

  // crear categorías inline
  const [newCat, setNewCat] = useState("");
  const [newSub, setNewSub] = useState("");

  // tipos dinámicos
  const [types, setTypes] = useState<InvType[]>([]);
  const [typeId, setTypeId] = useState<string>("");
  const [typeFields, setTypeFields] = useState<TypeField[]>([]);

  // valores de campos dinámicos (attributes)
  const [attrs, setAttrs] = useState<Record<string, string>>({});

  // productos listados
  const [items, setItems] = useState<Product[]>([]);

  // form producto base
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("unidad");
  const [description, setDescription] = useState("");

  // stock + pvp fijos (para todos)
  const [stockActual, setStockActual] = useState("0");
  const [stockMin, setStockMin] = useState("0");
  const [pvp, setPvp] = useState("0");
  const [allowDiscount, setAllowDiscount] = useState(true);

  const catMap = useMemo(() => new Map(catsAll.map((c) => [c.id, c.name])), [catsAll]);

  async function loadAll() {
    setStatus("Cargando...");

    const [{ data: c1, error: e1 }, { data: t1, error: e2 }, { data: p1, error: e3 }] = await Promise.all([
      supabase.from("inv_categories").select("id,name,parent_id").order("name"),
      supabase.from("inv_types").select("id,name").order("name"),
      supabase.from("inv_products").select("*").order("created_at", { ascending: false }),
    ]);

    if (e1) return setStatus(e1.message);
    if (e2) return setStatus(e2.message);
    if (e3) return setStatus(e3.message);

    setCatsAll((c1 as any) || []);
    setTypes((t1 as any) || []);
    setItems((p1 as any) || []);
    setStatus("Listo ✅");

    // setear tipo por defecto si no hay
    const first = (t1 as any)?.[0]?.id;
    if (!typeId && first) setTypeId(first);
  }

  async function loadFieldsForType(tid: string) {
    if (!tid) {
      setTypeFields([]);
      setAttrs({});
      return;
    }
    const { data, error } = await supabase
      .from("inv_type_fields")
      .select("id,type_id,key,label,input_type,required,options,sort")
      .eq("type_id", tid)
      .order("sort", { ascending: true });

    if (error) {
      setStatus(error.message);
      setTypeFields([]);
      return;
    }

    const fields = (data as any as TypeField[]) || [];
    setTypeFields(fields);

    // inicializar attrs sin borrar lo que ya escribió si sigue existiendo
    setAttrs((prev) => {
      const next: Record<string, string> = { ...prev };
      // eliminar keys que ya no existen
      const allowed = new Set(fields.map((f) => f.key));
      Object.keys(next).forEach((k) => {
        if (!allowed.has(k)) delete next[k];
      });
      // asegurar keys
      fields.forEach((f) => {
        if (next[f.key] === undefined) next[f.key] = "";
      });
      return next;
    });
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeId) loadFieldsForType(typeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeId]);

  async function addCategory() {
    const v = newCat.trim();
    if (!v) return;
    setStatus("Creando categoría...");
    const { error } = await supabase.from("inv_categories").insert({ name: v, parent_id: null });
    if (error) return setStatus(error.message);
    setNewCat("");
    await loadAll();
  }

  async function addSubCategory() {
    const v = newSub.trim();
    if (!v) return;
    if (!parentCatId) return alert("Primero selecciona una categoría.");
    setStatus("Creando subcategoría...");
    const { error } = await supabase.from("inv_categories").insert({ name: v, parent_id: parentCatId });
    if (error) return setStatus(error.message);
    setNewSub("");
    await loadAll();
  }

  function resetForm() {
    setName("");
    setSku("");
    setUnit("unidad");
    setDescription("");
    setStockActual("0");
    setStockMin("0");
    setPvp("0");
    setAllowDiscount(true);
    // reset attrs pero manteniendo estructura del tipo
    setAttrs((prev) => {
      const next: Record<string, string> = {};
      typeFields.forEach((f) => (next[f.key] = ""));
      return next;
    });
  }

  async function addAll() {
    if (!name.trim()) return alert("Falta el nombre.");
    if (!typeId) return alert("Selecciona un tipo.");

    // validar requeridos del tipo
    const missing = typeFields
      .filter((f) => f.required)
      .filter((f) => !(attrs[f.key] || "").trim())
      .map((f) => f.label);

    if (missing.length) return alert("Faltan campos requeridos: " + missing.join(", "));

    const finalCategoryId = subCatId || parentCatId || null;

    setStatus("Guardando...");

    // 1) producto base
    const insP = await supabase
      .from("inv_products")
      .insert({
        name: name.trim(),
        sku: sku.trim() || null,
        unit: unit.trim() || "unidad",
        category_id: finalCategoryId,
        description: description.trim() || null,
        active: true,
      })
      .select("id")
      .single();

    if (insP.error) return setStatus(insP.error.message);
    const productId = insP.data.id as string;

    // 2) variante/presentación automática con attributes dinámicos
    const cleanAttrs: Record<string, any> = {};
    typeFields.forEach((f) => {
      const v = (attrs[f.key] || "").trim();
      if (v) cleanAttrs[f.key] = v;
    });
    // guardo el tipo también dentro de attributes (útil para filtros/búsqueda)
    const typeName = types.find((t) => t.id === typeId)?.name || "Tipo";
    cleanAttrs["_tipo"] = typeName;

    const variantName = buildVariantName(name.trim(), cleanAttrs);

    const insV = await supabase
      .from("inv_variants")
      .insert({
        product_id: productId,
        name: variantName,
        attributes: cleanAttrs,
        active: true,
      })
      .select("id")
      .single();

    if (insV.error) return setStatus(insV.error.message);
    const variantId = insV.data.id as string;

    // 3) stock
    const qty = Math.max(0, safeNum(stockActual, 0));
    const min_qty = Math.max(0, safeNum(stockMin, 0));
    const upSt = await supabase
      .from("inv_variant_stock")
      .upsert({ variant_id: variantId, qty, min_qty }, { onConflict: "variant_id" });

    if (upSt.error) return setStatus(upSt.error.message);

    // 4) pvp
    const sale_price = Math.max(0, safeNum(pvp, 0));
    const upSa = await supabase
      .from("inv_variant_sales")
      .upsert({ variant_id: variantId, sale_price, allow_discount: allowDiscount }, { onConflict: "variant_id" });

    if (upSa.error) return setStatus(upSa.error.message);

    setStatus("✅ Guardado completo (producto + presentación + stock + PVP)");
    resetForm();
    await loadAll();
  }

  async function toggleActive(p: Product) {
    setStatus("Actualizando...");
    const { error } = await supabase.from("inv_products").update({ active: !p.active }).eq("id", p.id);
    if (error) return setStatus(error.message);
    await loadAll();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar producto? (Se eliminarán también presentaciones/stock/precios vinculados).")) return;
    setStatus("Eliminando...");
    const { error } = await supabase.from("inv_products").delete().eq("id", id);
    if (error) return setStatus(error.message);
    await loadAll();
  }

  return (
    <main style={page}>
      <header style={header}>
        <h1 style={h1}>Inventario · Productos</h1>
        <a href="/inventario" style={link}>
          ← Volver
        </a>
      </header>

      {/* Categorías / subcategorías inline */}
      <div style={card}>
        <h2 style={h2}>Categorías y subcategorías (directo aquí)</h2>

        <div style={grid}>
          <div>
            <label style={label}>Crear categoría</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={input} value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Ej: Guantes" />
              <button style={btnSmall} onClick={addCategory}>Crear</button>
            </div>
          </div>

          <div>
            <label style={label}>Selecciona categoría</label>
            <select
              style={input}
              value={parentCatId}
              onChange={(e) => {
                setParentCatId(e.target.value);
                setSubCatId("");
              }}
            >
              <option value="">(sin categoría)</option>
              {catsRoot.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label}>Crear subcategoría</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={input} value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Ej: Nitrilo / Látex" />
              <button style={btnSmall} onClick={addSubCategory}>Crear</button>
            </div>
          </div>

          <div>
            <label style={label}>Subcategoría</label>
            <select style={input} value={subCatId} onChange={(e) => setSubCatId(e.target.value)} disabled={!parentCatId}>
              <option value="">{parentCatId ? "(sin subcategoría)" : "Selecciona categoría primero"}</option>
              {subCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p style={statusStyle}>{status}</p>
      </div>

      {/* Crear producto dinámico */}
      <div style={card}>
        <h2 style={h2}>Crear producto (PRO · campos dinámicos por tipo)</h2>

        <div style={grid}>
          <div>
            <label style={label}>Nombre</label>
            <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Guantes nitrilo Dhisve" />
          </div>

          <div>
            <label style={label}>SKU / Código (opcional)</label>
            <input style={input} value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ej: HST-GUA-001" />
          </div>

          <div>
            <label style={label}>Unidad</label>
            <input style={input} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unidad / caja / galón / botella" />
          </div>

          <div>
            <label style={label}>Tipo</label>
            <select style={input} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">Seleccionar...</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={label}>Descripción</label>
            <input style={input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Características, presentación, etc." />
          </div>

          {/* Categoría/Subcategoría para el producto */}
          <div>
            <label style={label}>Categoría</label>
            <select
              style={input}
              value={parentCatId}
              onChange={(e) => {
                setParentCatId(e.target.value);
                setSubCatId("");
              }}
            >
              <option value="">(sin categoría)</option>
              {catsRoot.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label}>Subcategoría</label>
            <select style={input} value={subCatId} onChange={(e) => setSubCatId(e.target.value)} disabled={!parentCatId}>
              <option value="">{parentCatId ? "(sin subcategoría)" : "Selecciona categoría primero"}</option>
              {subCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Campos dinámicos */}
        <div style={{ marginTop: 12 }}>
          <h3 style={{ margin: 0, color: "#fff", fontSize: 14 }}>Campos del tipo</h3>
          {typeFields.length === 0 ? (
            <p style={{ color: "#777", marginTop: 8 }}>Este tipo no tiene campos (se guardará como “Única”).</p>
          ) : (
            <div style={{ ...grid, marginTop: 10 }}>
              {typeFields.map((f) => (
                <div key={f.id}>
                  <label style={label}>
                    {f.label} {f.required ? <span style={{ color: "#ff7777" }}>*</span> : null}
                  </label>

                  {f.input_type === "select" ? (
                    <select
                      style={input}
                      value={attrs[f.key] ?? ""}
                      onChange={(e) => setAttrs((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    >
                      <option value="">Seleccionar...</option>
                      {(f.options || []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      style={input}
                      value={attrs[f.key] ?? ""}
                      onChange={(e) => setAttrs((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.input_type === "number" ? "0" : ""}
                      type={f.input_type === "number" ? "number" : "text"}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stock + PVP (fijos) */}
        <div style={{ marginTop: 14 }}>
          <h3 style={{ margin: 0, color: "#fff", fontSize: 14 }}>Stock y PVP</h3>

          <div style={{ ...grid, marginTop: 10 }}>
            <div>
              <label style={label}>Stock actual</label>
              <input style={input} value={stockActual} onChange={(e) => setStockActual(e.target.value)} type="number" min={0} />
            </div>

            <div>
              <label style={label}>Stock mínimo</label>
              <input style={input} value={stockMin} onChange={(e) => setStockMin(e.target.value)} type="number" min={0} />
            </div>

            <div>
              <label style={label}>PVP</label>
              <input style={input} value={pvp} onChange={(e) => setPvp(e.target.value)} type="number" min={0} step="0.01" />
            </div>

            <div>
              <label style={label}>Permitir descuento</label>
              <select style={input} value={allowDiscount ? "si" : "no"} onChange={(e) => setAllowDiscount(e.target.value === "si")}>
                <option value="si">Sí</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>
        </div>

        <button style={btn} onClick={addAll}>
          Guardar producto (presentación + stock + PVP)
        </button>

        <p style={statusStyle}>{status}</p>
      </div>

      {/* Listado */}
      <div style={card}>
        <h2 style={h2}>Listado (producto base)</h2>

        {items.length === 0 ? (
          <p style={{ color: "#777" }}>No hay productos.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {items.map((p) => (
              <div key={p.id} style={row}>
                <div>
                  <div style={{ color: "#fff", fontWeight: 800 }}>{p.name}</div>
                  <div style={{ color: "#aaa", fontSize: 12 }}>
                    {p.sku ? `SKU: ${p.sku} · ` : ""}
                    {p.unit ? `Unidad: ${p.unit} · ` : ""}
                    {p.category_id ? `Categoría: ${catMap.get(p.category_id)}` : "Sin categoría"}
                    {p.description ? ` · ${p.description}` : ""}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button style={p.active ? soft : warn} onClick={() => toggleActive(p)}>
                    {p.active ? "Activo" : "Inactivo"}
                  </button>
                  <button style={danger} onClick={() => remove(p.id)}>
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
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
const label: React.CSSProperties = { display: "block", marginBottom: 6, color: "#aaa", fontSize: 12 };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #333", background: "#0b0b0b", color: "#fff" };
const btn: React.CSSProperties = { marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "#d4af37", border: "none", cursor: "pointer", fontWeight: 900 };
const btnSmall: React.CSSProperties = { padding: "10px 14px", borderRadius: 10, background: "#2a2412", border: "1px solid #5a4b2b", color: "#ffe2a8", cursor: "pointer", fontWeight: 900, whiteSpace: "nowrap" };
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 12px", border: "1px solid #222", borderRadius: 12 };
const danger: React.CSSProperties = { padding: "8px 10px", borderRadius: 10, background: "#2a1212", border: "1px solid #5a2b2b", color: "#ffb3b3", cursor: "pointer" };
const soft: React.CSSProperties = { padding: "8px 10px", borderRadius: 10, background: "#102015", border: "1px solid #1f4a2b", color: "#aef3c0", cursor: "pointer" };
const warn: React.CSSProperties = { padding: "8px 10px", borderRadius: 10, background: "#2a2412", border: "1px solid #5a4b2b", color: "#ffe2a8", cursor: "pointer" };
const statusStyle: React.CSSProperties = { color: "#777", marginTop: 10, fontSize: 12 };
const grid: React.CSSProperties = { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" };