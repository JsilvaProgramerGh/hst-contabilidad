"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Product = { id: string; name: string };
type Supplier = { id: string; name: string };

export default function EmpresaPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("");

  // ✅ strings para permitir vacío (sin 0 obligatorio)
  const [cost, setCost] = useState<string>("");
  const [stock, setStock] = useState<string>("");
  const [minStock, setMinStock] = useState<string>("");

  const [status, setStatus] = useState("");

  async function loadLists() {
    setStatus("Cargando...");
    const [{ data: p, error: e1 }, { data: s, error: e2 }] = await Promise.all([
      supabase.from("inv_products").select("id,name").eq("active", true).order("name"),
      supabase.from("inv_suppliers").select("id,name").order("name"),
    ]);

    if (e1) return setStatus(e1.message);
    if (e2) return setStatus(e2.message);

    setProducts(p || []);
    setSuppliers(s || []);
    setStatus("Listo ✅");
  }

  useEffect(() => {
    loadLists();
  }, []);

  // ✅ Cargar stock cuando cambia el producto
  useEffect(() => {
    async function loadStock() {
      if (!selectedProduct) {
        setStock("");
        setMinStock("");
        return;
      }

      const { data, error } = await supabase
        .from("inv_stock")
        .select("qty,min_qty")
        .eq("product_id", selectedProduct)
        .maybeSingle();

      if (error) {
        setStatus(error.message);
        return;
      }

      const qty = data?.qty ?? null;
      const minQty = data?.min_qty ?? null;

      setStock(qty === null ? "" : String(qty));
      setMinStock(minQty === null ? "" : String(minQty));
    }

    loadStock();
  }, [selectedProduct]);

  // ✅ Cargar costo cuando cambia producto o proveedor
  useEffect(() => {
    async function loadCost() {
      if (!selectedProduct || !selectedSupplier) {
        setCost("");
        return;
      }

      const { data, error } = await supabase
        .from("inv_supplier_prices")
        .select("cost")
        .eq("product_id", selectedProduct)
        .eq("supplier_id", selectedSupplier)
        .maybeSingle();

      if (error) {
        setStatus(error.message);
        return;
      }

      const c = data?.cost ?? null;
      setCost(c === null ? "" : String(c));
    }

    loadCost();
  }, [selectedProduct, selectedSupplier]);

  async function save() {
    if (!selectedProduct) return alert("Selecciona un producto");

    setStatus("Guardando...");

    // Guardar costo por proveedor (si seleccionó proveedor)
    if (selectedSupplier) {
      const { error } = await supabase.from("inv_supplier_prices").upsert({
        product_id: selectedProduct,
        supplier_id: selectedSupplier,
        cost: Number(cost || 0),
      });
      if (error) return setStatus(error.message);
    }

    // Guardar stock
    {
      const { error } = await supabase.from("inv_stock").upsert({
        product_id: selectedProduct,
        qty: Number(stock || 0),
        min_qty: Number(minStock || 0),
      });
      if (error) return setStatus(error.message);
    }

    setStatus("Guardado correctamente ✅");
  }

  return (
    <main style={page}>
      <header style={header}>
        <h1 style={h1}>Inventario · Empresa</h1>
        <a href="/inventario" style={link}>
          ← Volver
        </a>
      </header>

      <div style={card}>
        <div style={grid}>
          <div>
            <label style={label}>Producto</label>
            <select style={input} value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}>
              <option value="">Seleccionar...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label}>Proveedor</label>
            <select style={input} value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)}>
              <option value="">(Opcional) Seleccionar...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div style={{ color: "#777", fontSize: 11, marginTop: 6 }}>
              Si no seleccionas proveedor, igual puedes guardar stock.
            </div>
          </div>

          <div>
            <label style={label}>Costo (a cuánto me lo dejan)</label>
            <input
              type="number"
              step="0.01"
              style={input}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder=""
            />
            <div style={{ color: "#777", fontSize: 11, marginTop: 6 }}>
              Para guardar costo necesitas escoger proveedor.
            </div>
          </div>

          <div>
            <label style={label}>Stock actual</label>
            <input
              type="number"
              style={input}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder=""
            />
          </div>

          <div>
            <label style={label}>Stock mínimo</label>
            <input
              type="number"
              style={input}
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
              placeholder=""
            />
          </div>
        </div>

        <button style={btn} onClick={save}>
          Guardar
        </button>

        <p style={{ color: "#888", marginTop: 12 }}>{status}</p>

        <div style={{ marginTop: 12 }}>
          <a href="/inventario/proveedores" style={{ color: "#aaa", textDecoration: "none" }}>
            + Crear / Ver proveedores
          </a>
        </div>
      </div>
    </main>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0b0b0b",
  color: "#d4af37",
  padding: 24,
  fontFamily: "Arial",
};

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 20,
};

const h1: React.CSSProperties = { fontSize: 28, margin: 0 };

const link: React.CSSProperties = { color: "#aaa", textDecoration: "none" };

const card: React.CSSProperties = {
  background: "#111",
  border: "1px solid #333",
  borderRadius: 14,
  padding: 20,
};

const grid: React.CSSProperties = {
  display: "grid",
  gap: 15,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const label: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  color: "#aaa",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #333",
  background: "#0b0b0b",
  color: "#fff",
};

const btn: React.CSSProperties = {
  marginTop: 18,
  padding: "10px 14px",
  borderRadius: 10,
  background: "#d4af37",
  border: "none",
  cursor: "pointer",
};