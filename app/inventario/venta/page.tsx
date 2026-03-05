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
type SalesRow = { variant_id: string; sale_price: number; allow_discount: boolean };

function uniqSorted(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

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

export default function VentaPOSPage() {
  // 1) Buscar producto base
  const [qProd, setQProd] = useState("");
  const [prodResults, setProdResults] = useState<Product[]>([]);
  const [product, setProduct] = useState<Product | null>(null);

  // 2) Variantes del producto + stock/precio
  const [variants, setVariants] = useState<Variant[]>([]);
  const [stockMap, setStockMap] = useState<Map<string, StockRow>>(new Map());
  const [salesMap, setSalesMap] = useState<Map<string, SalesRow>>(new Map());
  const [status, setStatus] = useState("");

  // 3) Filtros dinámicos por atributos
  const [filters, setFilters] = useState<Record<string, string>>({});

  // 4) Variante seleccionada
  const [variantId, setVariantId] = useState<string>("");
  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === variantId) || null,
    [variants, variantId]
  );

  // 5) Datos de venta
  const [qty, setQty] = useState<string>("1");
  const [discount, setDiscount] = useState<string>(""); // monto descuento (no %)
  const [note, setNote] = useState<string>("");

  // 6) Opcionales (cliente / factura / pdf)
  const [customerName, setCustomerName] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);

  // ======= Buscar productos base =======
  useEffect(() => {
    const t = setTimeout(async () => {
      const text = qProd.trim();
      if (!text) {
        setProdResults([]);
        return;
      }
      const { data } = await supabase
        .from("inv_products")
        .select("id,name,active")
        .eq("active", true)
        .ilike("name", `%${text}%`)
        .order("name")
        .limit(10);

      setProdResults((data as Product[]) || []);
    }, 250);

    return () => clearTimeout(t);
  }, [qProd]);

  // ======= Cargar variantes + stock + precio cuando elijo producto =======
  async function pickProduct(p: Product) {
    setProduct(p);
    setQProd(p.name);
    setProdResults([]);
    setVariantId("");
    setFilters({});
    setQty("1");
    setDiscount("");
    setNote("");

    setStatus("Cargando variantes...");

    const { data: v, error: e1 } = await supabase
      .from("inv_variants")
      .select("id,product_id,name,attributes,active")
      .eq("product_id", p.id)
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (e1) {
      setStatus(e1.message);
      setVariants([]);
      return;
    }

    const vv = (v as Variant[]) || [];
    setVariants(vv);

    const ids = vv.map((x) => x.id);
    if (ids.length === 0) {
      setStockMap(new Map());
      setSalesMap(new Map());
      setStatus("Listo ✅ (sin variantes)");
      return;
    }

    const [{ data: st, error: e2 }, { data: sa, error: e3 }] = await Promise.all([
      supabase.from("inv_variant_stock").select("variant_id,qty,min_qty").in("variant_id", ids),
      supabase.from("inv_variant_sales").select("variant_id,sale_price,allow_discount").in("variant_id", ids),
    ]);

    if (e2) return setStatus(e2.message);
    if (e3) return setStatus(e3.message);

    setStockMap(new Map(((st as StockRow[]) || []).map((r) => [r.variant_id, r])));
    setSalesMap(new Map(((sa as SalesRow[]) || []).map((r) => [r.variant_id, r])));

    setStatus("Listo ✅");
  }

  // ======= Detectar “campos” dinámicos desde attributes =======
  const attributeKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const v of variants) {
      const a = v.attributes || {};
      Object.keys(a).forEach((k) => {
        const val = a[k];
        if (val !== null && val !== undefined && String(val).trim() !== "") keys.add(k);
      });
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [variants]);

  const attributeOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const k of attributeKeys) {
      const values: string[] = [];
      for (const v of variants) {
        const a = v.attributes || {};
        const val = a?.[k];
        if (val !== null && val !== undefined && String(val).trim() !== "") values.push(String(val));
      }
      out[k] = uniqSorted(values);
    }
    return out;
  }, [attributeKeys, variants]);

  // ======= Filtrar variantes por atributos elegidos =======
  const filteredVariants = useMemo(() => {
    const activeFilters = Object.entries(filters).filter(([, val]) => (val || "").trim() !== "");
    if (activeFilters.length === 0) return variants;

    return variants.filter((v) => {
      const a = v.attributes || {};
      return activeFilters.every(([k, val]) => String(a?.[k] ?? "") === val);
    });
  }, [variants, filters]);

  // Cuando cambia el filtro, si la variante ya no está, la deselecciono
  useEffect(() => {
    if (!variantId) return;
    const stillExists = filteredVariants.some((v) => v.id === variantId);
    if (!stillExists) setVariantId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // ======= Cálculos =======
  const price = useMemo(() => {
    if (!selectedVariant) return 0;
    return Number(salesMap.get(selectedVariant.id)?.sale_price ?? 0);
  }, [selectedVariant, salesMap]);

  const allowDiscount = useMemo(() => {
    if (!selectedVariant) return true;
    return Boolean(salesMap.get(selectedVariant.id)?.allow_discount ?? true);
  }, [selectedVariant, salesMap]);

  const stock = useMemo(() => {
    if (!selectedVariant) return null;
    const s = stockMap.get(selectedVariant.id);
    return s ? Number(s.qty ?? 0) : null;
  }, [selectedVariant, stockMap]);

  const qtyNum = Math.max(0, Number(qty || 0));
  const discNum = allowDiscount ? Math.max(0, Number(discount || 0)) : 0;
  const subtotal = price * qtyNum;
  const total = Math.max(0, subtotal - discNum);

  // ======= Registrar venta (POS) =======
  async function registrarVenta() {
    if (!selectedVariant) return alert("Selecciona una variante.");
    if (!qtyNum || qtyNum <= 0) return alert("Cantidad inválida.");
    if (!price || price <= 0) return alert("Esta variante no tiene PVP (sale_price).");

    setSaving(true);
    setStatus("Registrando venta...");

    let uploadedPath: string | null = null;

    try {
      // 1) Subir PDF opcional al bucket invoices (mismo de facturas)
      if (pdfFile) {
        uploadedPath = `hst/pos_${makeId()}.pdf`;

        const up = await supabase.storage.from("invoices").upload(uploadedPath, pdfFile, {
          contentType: "application/pdf",
          upsert: false,
        });

        if (up.error) throw new Error("Error subiendo PDF: " + up.error.message);
      }

      // 2) Crear cabecera inv_pos_sales
      const insSale = await supabase
        .from("inv_pos_sales")
        .insert({
          customer_name: customerName.trim() || null,
          invoice_number: invoiceNumber.trim() || null,
          invoice_url: uploadedPath, // guardamos ruta del bucket
          note: note.trim() || null,
          discount: discNum,
        })
        .select("id")
        .single();

      if (insSale.error) throw new Error(insSale.error.message);

      const saleId = insSale.data.id as string;

      // 3) Insertar item (esto descuenta stock por trigger)
      const insItem = await supabase.from("inv_pos_sale_items").insert({
        sale_id: saleId,
        variant_id: selectedVariant.id,
        qty: qtyNum,
        unit_price: price,
      });

      if (insItem.error) {
        // limpiar venta cabecera si el item falla
        await supabase.from("inv_pos_sales").delete().eq("id", saleId);
        throw new Error(insItem.error.message);
      }

      // 4) Refrescar stock local (para que se vea el nuevo stock)
      // Re-leemos stock de esa variante
      const st = await supabase
        .from("inv_variant_stock")
        .select("variant_id,qty,min_qty")
        .eq("variant_id", selectedVariant.id)
        .maybeSingle();

      if (!st.error && st.data) {
        setStockMap((prev) => {
          const next = new Map(prev);
          next.set(selectedVariant.id, st.data as any);
          return next;
        });
      }

      setStatus("✅ Venta registrada");
      alert("✅ Venta registrada y stock actualizado.");

      // Limpieza parcial (dejamos producto elegido por si vende otro)
      setQty("1");
      setDiscount("");
      setNote("");
      setCustomerName("");
      setInvoiceNumber("");
      setPdfFile(null);
    } catch (e: any) {
      const msg = String(e?.message || e);

      // Si ya subimos PDF pero falló algo, intentamos borrar archivo
      if (uploadedPath) {
        try {
          await supabase.storage.from("invoices").remove([uploadedPath]);
        } catch {}
      }

      // Mensaje más amigable para stock insuficiente
      if (msg.toLowerCase().includes("stock insuficiente")) {
        alert("❌ Stock insuficiente para esa variante.");
      } else {
        alert("❌ Error registrando venta: " + msg);
      }
      setStatus("❌ " + msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 34, marginBottom: 8 }}>💰 Venta (POS)</h1>
      <p style={{ color: "#aaa", marginTop: 0 }}>
        Buscar → elegir presentación (atributos) → registrar venta.
      </p>

      {/* Buscar producto base */}
      <div style={card}>
        <label style={label}>Buscar producto</label>
        <input
          style={input}
          value={qProd}
          onChange={(e) => {
            setQProd(e.target.value);
            setProduct(null);
            setVariants([]);
            setVariantId("");
            setFilters({});
          }}
          placeholder="Ej: guantes, alcohol, batas..."
        />

        {prodResults.length > 0 && (
          <div style={resultsBox}>
            {prodResults.map((p) => (
              <div key={p.id} style={resultItem} onClick={() => pickProduct(p)}>
                {p.name}
              </div>
            ))}
          </div>
        )}

        <div style={{ color: "#777", fontSize: 12, marginTop: 10 }}>{status}</div>
      </div>

      {/* Producto seleccionado */}
      {product && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ color: "#777", fontSize: 12 }}>Producto</div>
              <div style={{ color: "#fff", fontWeight: 900, fontSize: 18 }}>{product.name}</div>
            </div>
            <div style={{ color: "#777", fontSize: 12, alignSelf: "center" }}>
              Variantes: <b style={{ color: "#d4af37" }}>{variants.length}</b>
            </div>
          </div>

          {/* Filtros dinámicos */}
          {attributeKeys.length > 0 && (
            <div style={grid}>
              {attributeKeys.map((k) => (
                <div key={k}>
                  <label style={label}>{k.toUpperCase()}</label>
                  <select
                    style={input}
                    value={filters[k] ?? ""}
                    onChange={(e) => setFilters((prev) => ({ ...prev, [k]: e.target.value }))}
                  >
                    <option value="">(cualquiera)</option>
                    {attributeOptions[k]?.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {/* Selección de variante */}
          <div style={{ marginTop: 14 }}>
            <label style={label}>Presentación / Variante</label>
            <select style={input} value={variantId} onChange={(e) => setVariantId(e.target.value)}>
              <option value="">Seleccionar...</option>
              {filteredVariants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <div style={{ color: "#777", fontSize: 12, marginTop: 6 }}>
              Resultados filtrados: <b>{filteredVariants.length}</b>
            </div>
          </div>

          {/* Panel de venta */}
          {selectedVariant && (
            <div style={{ marginTop: 14, borderTop: "1px solid #222", paddingTop: 14 }}>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <div style={pill}>
                  <div style={pillLabel}>PVP</div>
                  <div style={pillValue}>${price.toFixed(2)}</div>
                </div>

                <div style={pill}>
                  <div style={pillLabel}>Stock</div>
                  <div style={pillValue}>{stock === null ? "-" : stock}</div>
                </div>

                <div style={pill}>
                  <div style={pillLabel}>Subtotal</div>
                  <div style={pillValue}>${subtotal.toFixed(2)}</div>
                </div>

                <div style={{ ...pill, borderColor: "#6b5a1b" }}>
                  <div style={pillLabel}>Total</div>
                  <div style={{ ...pillValue, color: "#d4af37" }}>${total.toFixed(2)}</div>
                </div>
              </div>

              {/* Opcionales */}
              <div style={grid2}>
                <div>
                  <label style={label}>Cliente / Nombre (opcional)</label>
                  <input
                    style={input}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Ej: Juan / Mundo Sano y Verde"
                  />
                </div>

                <div>
                  <label style={label}>N° Factura (opcional)</label>
                  <input
                    style={input}
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="Ej: 001-001-000123"
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={label}>Subir factura PDF (opcional)</label>
                  <input
                    type="file"
                    accept="application/pdf"
                    style={{ ...input, padding: "10px" }}
                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  />
                  <div style={{ color: "#777", fontSize: 12, marginTop: 6 }}>
                    Se guardará en el bucket <b>invoices</b>.
                  </div>
                </div>

                <div>
                  <label style={label}>Cantidad</label>
                  <input
                    type="number"
                    style={input}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    min={0}
                  />
                </div>

                <div>
                  <label style={label}>Descuento (monto)</label>
                  <input
                    type="number"
                    style={input}
                    value={allowDiscount ? discount : ""}
                    onChange={(e) => setDiscount(e.target.value)}
                    disabled={!allowDiscount}
                    placeholder={allowDiscount ? "Ej: 1.00" : "Bloqueado"}
                    min={0}
                    step="0.01"
                  />
                  {!allowDiscount && (
                    <div style={{ color: "#777", fontSize: 12, marginTop: 6 }}>
                      Esta variante no permite descuento.
                    </div>
                  )}
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={label}>Nota (opcional)</label>
                  <input
                    style={input}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ej: promoción / observación / etc."
                  />
                </div>
              </div>

              <button style={btn} onClick={registrarVenta} disabled={saving}>
                {saving ? "Registrando..." : "Registrar venta"}
              </button>

              <div style={{ color: "#777", fontSize: 12, marginTop: 10 }}>
                * Al registrar: se guarda la venta y se descuenta el stock automáticamente.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  marginTop: 18,
  padding: 16,
  border: "1px solid #222",
  background: "#111",
  borderRadius: 14,
  position: "relative",
};

const label: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  color: "#aaa",
  fontWeight: 800,
  letterSpacing: 0.2,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #333",
  background: "#0b0b0b",
  color: "#fff",
};

const resultsBox: React.CSSProperties = {
  position: "absolute",
  top: 78,
  left: 16,
  right: 16,
  background: "#111",
  border: "1px solid #333",
  borderRadius: 10,
  zIndex: 10,
  overflow: "hidden",
};

const resultItem: React.CSSProperties = {
  padding: 10,
  cursor: "pointer",
  borderBottom: "1px solid #222",
  color: "#fff",
  fontWeight: 800,
};

const grid: React.CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  marginTop: 14,
};

const grid2: React.CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  marginTop: 14,
};

const btn: React.CSSProperties = {
  marginTop: 16,
  padding: "12px 14px",
  borderRadius: 12,
  background: "#d4af37",
  border: "none",
  cursor: "pointer",
  fontWeight: 900,
};

const pill: React.CSSProperties = {
  border: "1px solid #222",
  background: "#0b0b0b",
  borderRadius: 14,
  padding: "10px 12px",
  minWidth: 140,
};

const pillLabel: React.CSSProperties = {
  color: "#777",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.3,
};

const pillValue: React.CSSProperties = {
  color: "#fff",
  fontSize: 18,
  fontWeight: 900,
  marginTop: 2,
};