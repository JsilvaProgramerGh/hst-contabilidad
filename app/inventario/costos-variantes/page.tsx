"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

type Supplier = { id: string; name: string };
type Product = { id: string; name: string; category_id: string | null };
type Category = { id: string; name: string; parent_id: string | null };
type Variant = { id: string; product_id: string; name: string; sku: string | null; attributes: any; active: boolean };

export default function CostosVariantesPage() {
  const [status, setStatus] = useState("");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // filtros
  const [categoryId, setCategoryId] = useState<string>("ALL");
  const [productSearch, setProductSearch] = useState<string>("");
  const [variantSearch, setVariantSearch] = useState<string>("");

  // selección
  const [productId, setProductId] = useState<string>("");
  const [variantId, setVariantId] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");

  const [cost, setCost] = useState<string>("");

  // UI: dropdowns
  const [showProductResults, setShowProductResults] = useState(false);
  const [showVariantResults, setShowVariantResults] = useState(false);
  const productBoxRef = useRef<HTMLDivElement | null>(null);
  const variantBoxRef = useRef<HTMLDivElement | null>(null);

  async function loadBase() {
    setStatus("Cargando...");

    const [{ data: s, error: e1 }, { data: p, error: e2 }, { data: c, error: e3 }] = await Promise.all([
      supabase.from("inv_suppliers").select("id,name").order("name"),
      supabase.from("inv_products").select("id,name,category_id").eq("active", true).order("name"),
      supabase.from("inv_categories").select("id,name,parent_id").order("name"),
    ]);

    if (e1) return setStatus(e1.message);
    if (e2) return setStatus(e2.message);
    if (e3) return setStatus(e3.message);

    setSuppliers((s as Supplier[]) || []);
    setProducts((p as Product[]) || []);
    setCategories((c as Category[]) || []);
    setStatus("Listo ✅");
  }

  useEffect(() => {
    loadBase();
  }, []);

  // cerrar dropdowns con click fuera
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (productBoxRef.current && !productBoxRef.current.contains(target)) setShowProductResults(false);
      if (variantBoxRef.current && !variantBoxRef.current.contains(target)) setShowVariantResults(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // categoría bonita padre → hijo
  const catLabel = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c]));
    return (id: string | null) => {
      if (!id) return "Sin categoría";
      const c = map.get(id);
      if (!c) return "Sin categoría";
      if (!c.parent_id) return c.name;
      const parent = map.get(c.parent_id);
      return parent ? `${parent.name} → ${c.name}` : c.name;
    };
  }, [categories]);

  const categoryOptions = useMemo(() => {
    return categories.map((c) => ({ id: c.id, label: catLabel(c.id) })).sort((a, b) => a.label.localeCompare(b.label));
  }, [categories, catLabel]);

  // productos filtrados por categoría + búsqueda
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryId !== "ALL" && p.category_id !== categoryId) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [products, categoryId, productSearch]);

  // cuando cambias categoría, limpiamos todo
  useEffect(() => {
    setProductId("");
    setVariantId("");
    setVariants([]);
    setProductSearch("");
    setVariantSearch("");
    setCost("");
    setShowProductResults(false);
    setShowVariantResults(false);
  }, [categoryId]);

  // cargar variantes cuando cambia producto
  useEffect(() => {
    async function loadVars() {
      if (!productId) {
        setVariants([]);
        setVariantId("");
        return;
      }
      setStatus("Cargando variantes...");
      const { data, error } = await supabase
        .from("inv_variants")
        .select("id,product_id,name,sku,attributes,active")
        .eq("active", true)
        .eq("product_id", productId)
        .order("created_at", { ascending: false });

      if (error) return setStatus(error.message);

      setVariants((data as Variant[]) || []);
      setVariantId("");
      setVariantSearch("");
      setShowVariantResults(false);
      setStatus("Listo ✅");
    }
    loadVars();
  }, [productId]);

  const variantLabel = (v: Variant) => {
    const a = v.attributes || {};
    const parts = [];
    if (a.color) parts.push(a.color);
    if (a.talla) parts.push(a.talla);
    if (a.marca) parts.push(a.marca);
    const extra = parts.length ? ` (${parts.join(" · ")})` : "";
    return `${v.name}${extra}${v.sku ? ` · SKU: ${v.sku}` : ""}`;
  };

  // variantes filtradas por búsqueda
  const filteredVariants = useMemo(() => {
    const q = variantSearch.trim().toLowerCase();
    if (!q) return variants;

    return variants.filter((v) => {
      const a = v.attributes || {};
      const text = `${v.name} ${v.sku || ""} ${a.color || ""} ${a.talla || ""} ${a.marca || ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [variants, variantSearch]);

  const selectedProduct = products.find((p) => p.id === productId);
  const selectedVariant = variants.find((v) => v.id === variantId);

  // cargar costo existente cuando cambia variante o proveedor
  useEffect(() => {
    async function loadCost() {
      if (!variantId || !supplierId) {
        setCost("");
        return;
      }

      setStatus("Cargando costo...");
      const { data, error } = await supabase
        .from("inv_variant_supplier_prices")
        .select("cost")
        .eq("variant_id", variantId)
        .eq("supplier_id", supplierId)
        .maybeSingle();

      if (error) return setStatus(error.message);

      const c = data?.cost ?? null;
      setCost(c === null ? "" : String(c));
      setStatus("Listo ✅");
    }
    loadCost();
  }, [variantId, supplierId]);

  async function save() {
    if (!variantId) return alert("Selecciona una variante");
    if (!supplierId) return alert("Selecciona un proveedor");

    setStatus("Guardando...");

    const { error } = await supabase.from("inv_variant_supplier_prices").upsert({
      variant_id: variantId,
      supplier_id: supplierId,
      cost: Number(cost || 0),
    });

    if (error) return setStatus(error.message);

    setStatus("Costo guardado ✅");
  }

  function selectProduct(p: Product) {
    setProductId(p.id);
    setProductSearch(p.name);
    setShowProductResults(false);
  }

  function selectVariant(v: Variant) {
    setVariantId(v.id);
    setVariantSearch(variantLabel(v));
    setShowVariantResults(false);
  }

  return (
    <main style={page}>
      <header style={header}>
        <h1 style={h1}>Inventario · Costos por Variante</h1>
        <a href="/inventario" style={link}>← Volver</a>
      </header>

      <div style={card}>
        <div style={grid}>
          <div>
            <label style={label}>Categoría</label>
            <select style={input} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="ALL">Todas</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* ✅ autocomplete producto */}
          <div ref={productBoxRef} style={{ position: "relative" }}>
            <label style={label}>Buscar y seleccionar producto</label>
            <input
              style={input}
              value={productSearch}
              onChange={(e) => {
                setProductSearch(e.target.value);
                setShowProductResults(true);
              }}
              onFocus={() => setShowProductResults(true)}
              placeholder="Escribe: guantes, alcohol..."
            />

            {showProductResults && (
              <div style={dropdown}>
                {filteredProducts.length === 0 ? (
                  <div style={dropItemMuted}>No hay productos con ese filtro.</div>
                ) : (
                  filteredProducts.slice(0, 12).map((p) => (
                    <button key={p.id} type="button" style={dropBtn} onClick={() => selectProduct(p)}>
                      <div style={{ fontWeight: 800, color: "#fff" }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "#aaa" }}>
                        {p.category_id ? catLabel(p.category_id) : "Sin categoría"}
                      </div>
                    </button>
                  ))
                )}
                {filteredProducts.length > 12 && (
                  <div style={dropItemMuted}>Mostrando 12 de {filteredProducts.length}… sigue escribiendo.</div>
                )}
              </div>
            )}

            <div style={hint}>Escribe y selecciona desde la lista. ({filteredProducts.length} resultado(s))</div>
          </div>

          <div>
            <label style={label}>Producto seleccionado</label>
            <div style={selectedBox}>
              {selectedProduct ? (
                <>
                  <div style={{ color: "#fff", fontWeight: 900 }}>{selectedProduct.name}</div>
                  <div style={{ color: "#aaa", fontSize: 12 }}>
                    {selectedProduct.category_id ? catLabel(selectedProduct.category_id) : "Sin categoría"}
                  </div>
                </>
              ) : (
                <div style={{ color: "#777" }}>Aún no seleccionas producto.</div>
              )}
            </div>
          </div>

          {/* ✅ autocomplete variante */}
          <div ref={variantBoxRef} style={{ position: "relative" }}>
            <label style={label}>Buscar y seleccionar variante</label>
            <input
              style={input}
              value={variantSearch}
              onChange={(e) => {
                setVariantSearch(e.target.value);
                setShowVariantResults(true);
              }}
              onFocus={() => setShowVariantResults(true)}
              placeholder={!productId ? "Primero selecciona un producto" : "Ej: negro M, gris S, marca..."}
              disabled={!productId}
            />

            {productId && showVariantResults && (
              <div style={dropdown}>
                {filteredVariants.length === 0 ? (
                  <div style={dropItemMuted}>No hay variantes con esa búsqueda.</div>
                ) : (
                  filteredVariants.slice(0, 12).map((v) => (
                    <button key={v.id} type="button" style={dropBtn} onClick={() => selectVariant(v)}>
                      <div style={{ fontWeight: 800, color: "#fff" }}>{variantLabel(v)}</div>
                    </button>
                  ))
                )}
                {filteredVariants.length > 12 && (
                  <div style={dropItemMuted}>Mostrando 12 de {filteredVariants.length}… sigue escribiendo.</div>
                )}
              </div>
            )}

            {productId ? (
              <div style={hint}>Escribe y selecciona desde la lista. ({filteredVariants.length} resultado(s))</div>
            ) : (
              <div style={hint}>Primero selecciona un producto.</div>
            )}
          </div>

          <div>
            <label style={label}>Variante seleccionada</label>
            <div style={selectedBox}>
              {selectedVariant ? (
                <div style={{ color: "#fff", fontWeight: 900 }}>{variantLabel(selectedVariant)}</div>
              ) : (
                <div style={{ color: "#777" }}>Aún no seleccionas variante.</div>
              )}
            </div>
          </div>

          <div>
            <label style={label}>Proveedor</label>
            <select style={input} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Seleccionar...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {suppliers.length === 0 && <div style={hint}>No tienes proveedores. Crea en: /inventario/proveedores</div>}
          </div>

          <div>
            <label style={label}>Costo (a cuánto te lo dejan)</label>
            <input
              style={input}
              type="number"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              disabled={!variantId || !supplierId}
            />
            <div style={hint}>Selecciona variante + proveedor para editar.</div>
          </div>
        </div>

        <button style={btn} onClick={save}>Guardar costo</button>

        <p style={statusStyle}>{status}</p>

        <div style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <a href="/inventario/variantes" style={link2}>+ Administrar variantes</a>
          <a href="/inventario/proveedores" style={link2}>+ Administrar proveedores</a>
          <a href="/inventario/venta" style={link2}>→ Ir a Venta</a>
        </div>
      </div>
    </main>
  );
}

const page: React.CSSProperties = { minHeight: "100vh", background: "#0b0b0b", color: "#d4af37", padding: 24, fontFamily: "Arial" };
const header: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 };
const h1: React.CSSProperties = { fontSize: 28, margin: 0 };
const link: React.CSSProperties = { color: "#aaa", textDecoration: "none" };

const card: React.CSSProperties = { background: "#111", border: "1px solid #333", borderRadius: 14, padding: 16, marginBottom: 16 };
const label: React.CSSProperties = { display: "block", marginBottom: 6, color: "#aaa", fontSize: 12 };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #333", background: "#0b0b0b", color: "#fff" };
const btn: React.CSSProperties = { marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "#d4af37", border: "none", cursor: "pointer" };
const statusStyle: React.CSSProperties = { color: "#777", marginTop: 10, fontSize: 12 };
const hint: React.CSSProperties = { color: "#777", fontSize: 11, marginTop: 6 };
const grid: React.CSSProperties = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" };
const link2: React.CSSProperties = { color: "#aaa", textDecoration: "none", borderBottom: "1px dashed #333" };

const dropdown: React.CSSProperties = {
  position: "absolute",
  zIndex: 50,
  top: "calc(100% + 6px)",
  left: 0,
  right: 0,
  background: "#0b0b0b",
  border: "1px solid #333",
  borderRadius: 12,
  overflow: "hidden",
  maxHeight: 340,
  overflowY: "auto",
};

const dropBtn: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "10px 12px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  borderBottom: "1px solid #1e1e1e",
};

const dropItemMuted: React.CSSProperties = {
  padding: "10px 12px",
  color: "#777",
  fontSize: 12,
  borderBottom: "1px solid #1e1e1e",
};

const selectedBox: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 12,
  padding: "10px 12px",
  background: "#0b0b0b",
};