"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  active: boolean;
};

type VariantRow = {
  id: string;
  name: string;
  product_id: string;
  attributes: any;
  units_per_pack: number;
  pack_unit: string;
  base_unit: string;
  active: boolean;
  product_name?: string;
  product_sku?: string | null;
  unit?: string | null;
};

type Purchase = {
  id: string;
  supplier_id: string | null;
  invoice_number: string | null;
  invoice_url: string | null;
  purchased_at: string;
  note: string | null;
  created_at: string;
  supplier_name?: string | null;
  total_cost?: number;
};

type PurchaseItem = {
  id: string;
  purchase_id: string;
  variant_id: string;
  qty: number;
  qty_unit: string;
  qty_units: number;
  unit_cost: number;
  total_cost: number;
  created_at: string;
  variant_name?: string;
  product_name?: string;
};

function safeNum(v: any, fallback = 0) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function fmtMoney(v: any) {
  const n = safeNum(v, 0);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function stringifyAttrs(attrs: any) {
  if (!attrs || typeof attrs !== "object") return "";
  const entries = Object.entries(attrs)
    .filter(([k, v]) => k !== "_tipo" && v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${v}`);
  return entries.join(" · ");
}

export default function ComprasPage() {
  const [status, setStatus] = useState<string>("");

  // proveedores
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<string>("");
  const supplierSelected = useMemo(
    () => suppliers.find((s) => s.id === supplierId) || null,
    [suppliers, supplierId]
  );

  // crear proveedor rápido
  const [newSupName, setNewSupName] = useState("");
  const [newSupPhone, setNewSupPhone] = useState("");
  const [newSupNotes, setNewSupNotes] = useState("");

  // buscador variantes
  const [q, setQ] = useState("");
  const [variantResults, setVariantResults] = useState<VariantRow[]>([]);
  const [variantId, setVariantId] = useState<string>("");
  const [variantSelected, setVariantSelected] = useState<VariantRow | null>(null);

  // compra (cabecera)
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceUrl, setInvoiceUrl] = useState("");
  const [purchaseNote, setPurchaseNote] = useState("");

  // item compra
  const [qty, setQty] = useState("1");
  const [qtyUnit, setQtyUnit] = useState<"unidad" | "caja">("caja");
  const [costInput, setCostInput] = useState("0"); // lo que escribe el usuario
  const [costIsPer, setCostIsPer] = useState<"unidad" | "caja">("caja"); // costo ingresado es por...
  const [previewUnits, setPreviewUnits] = useState<number>(0);
  const [previewUnitCost, setPreviewUnitCost] = useState<number>(0);
  const [previewTotal, setPreviewTotal] = useState<number>(0);

  // historial compras
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseItems, setPurchaseItems] = useState<Record<string, PurchaseItem[]>>({});
  const [openPurchaseId, setOpenPurchaseId] = useState<string>("");

  async function loadSuppliers() {
    const { data, error } = await supabase
      .from("inv_suppliers")
      .select("id,name,phone,notes,active")
      .order("name");
    if (error) throw error;
    setSuppliers((data as any) || []);
  }

  async function loadPurchases() {
    // Traer compras + nombre proveedor (join manual)
    const { data, error } = await supabase
      .from("inv_purchases")
      .select("id,supplier_id,invoice_number,invoice_url,purchased_at,note,created_at")
      .order("purchased_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    const list: Purchase[] = ((data as any) || []) as Purchase[];

    // map supplier name
    const supMap = new Map(suppliers.map((s) => [s.id, s.name]));
    list.forEach((p) => {
      p.supplier_name = p.supplier_id ? supMap.get(p.supplier_id) || null : null;
    });

    setPurchases(list);
  }

  async function loadPurchaseItems(purchaseId: string) {
    const { data, error } = await supabase
      .from("inv_purchase_items")
      .select("id,purchase_id,variant_id,qty,qty_unit,qty_units,unit_cost,total_cost,created_at")
      .eq("purchase_id", purchaseId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const items: PurchaseItem[] = ((data as any) || []) as PurchaseItem[];

    // Enriquecer con nombres de variante y producto
    const variantIds = [...new Set(items.map((i) => i.variant_id))];
    if (variantIds.length) {
      const { data: vData, error: vErr } = await supabase
        .from("inv_variants")
        .select("id,name,product_id")
        .in("id", variantIds);

      if (!vErr && vData) {
        const vMap = new Map((vData as any[]).map((v) => [v.id, v]));
        const productIds = [...new Set((vData as any[]).map((v) => v.product_id))];

        let pMap = new Map<string, any>();
        if (productIds.length) {
          const { data: pData } = await supabase
            .from("inv_products")
            .select("id,name")
            .in("id", productIds);
          (pData as any[] | null)?.forEach((p) => pMap.set(p.id, p));
        }

        items.forEach((it) => {
          const v = vMap.get(it.variant_id);
          it.variant_name = v?.name || it.variant_id;
          it.product_name = pMap.get(v?.product_id)?.name || "";
        });
      }
    }

    setPurchaseItems((prev) => ({ ...prev, [purchaseId]: items }));
  }

  async function initLoad() {
    try {
      setStatus("Cargando...");
      await loadSuppliers();
      setStatus("Listo ✅");
    } catch (e: any) {
      setStatus("❌ " + (e?.message || "Error cargando datos"));
    }
  }

  useEffect(() => {
    initLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // cada vez que cambian proveedores, recargar compras
    (async () => {
      try {
        await loadPurchases();
      } catch (e: any) {
        setStatus("❌ " + (e?.message || "Error cargando compras"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppliers.length]);

  // buscador con debounce
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const term = q.trim();
        if (!term) {
          setVariantResults([]);
          return;
        }

        // Buscar variantes + producto
        // Traemos variantes recientes y filtramos en client por term (seguro y rápido para pocos items).
        // Si tu inventario crece mucho, luego optimizamos con un RPC/FTS.
        const { data: vData, error: vErr } = await supabase
          .from("inv_variants")
          .select("id,name,product_id,attributes,units_per_pack,pack_unit,base_unit,active")
          .eq("active", true)
          .order("created_at", { ascending: false })
          .limit(200);

        if (vErr) throw vErr;

        const variants: VariantRow[] = ((vData as any) || []) as VariantRow[];

        const productIds = [...new Set(variants.map((v) => v.product_id))];
        let pMap = new Map<string, any>();
        if (productIds.length) {
          const { data: pData } = await supabase.from("inv_products").select("id,name,sku,unit").in("id", productIds);
          (pData as any[] | null)?.forEach((p) => pMap.set(p.id, p));
        }

        const needle = term.toLowerCase();
        const filtered = variants
          .map((v) => ({
            ...v,
            product_name: pMap.get(v.product_id)?.name || "",
            product_sku: pMap.get(v.product_id)?.sku || null,
            unit: pMap.get(v.product_id)?.unit || null,
          }))
          .filter((v) => {
            const a = stringifyAttrs(v.attributes).toLowerCase();
            const s = `${v.product_name} ${v.name} ${v.product_sku || ""} ${a}`.toLowerCase();
            return s.includes(needle);
          })
          .slice(0, 30);

        if (!alive) return;
        setVariantResults(filtered);
      } catch (e: any) {
        if (!alive) return;
        setStatus("❌ " + (e?.message || "Error en búsqueda"));
      }
    }, 250);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  // al seleccionar variante, recalcular previews
  useEffect(() => {
    const v = variantResults.find((x) => x.id === variantId) || null;
    setVariantSelected(v);

    // defaults: si units_per_pack==1, sugerir unidad
    if (v) {
      const upp = safeNum(v.units_per_pack, 1);
      if (upp <= 1) {
        setQtyUnit("unidad");
        setCostIsPer("unidad");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantId]);

  // preview conversion / costos
  useEffect(() => {
    const v = variantSelected;
    if (!v) {
      setPreviewUnits(0);
      setPreviewUnitCost(0);
      setPreviewTotal(0);
      return;
    }

    const upp = Math.max(1, safeNum(v.units_per_pack, 1));
    const qn = Math.max(0, safeNum(qty, 0));
    const costN = Math.max(0, safeNum(costInput, 0));

    const units = qtyUnit === "caja" ? qn * upp : qn;

    // costo por unidad base
    const unitCost = costIsPer === "caja" ? (upp > 0 ? costN / upp : costN) : costN;

    const total = units * unitCost;

    setPreviewUnits(units);
    setPreviewUnitCost(unitCost);
    setPreviewTotal(total);
  }, [variantSelected, qty, qtyUnit, costInput, costIsPer]);

  async function createSupplierQuick() {
    const name = newSupName.trim();
    if (!name) return;

    try {
      setStatus("Creando proveedor...");
      const { error } = await supabase.from("inv_suppliers").insert({
        name,
        phone: newSupPhone.trim() || null,
        notes: newSupNotes.trim() || null,
        active: true,
      });
      if (error) throw error;

      setNewSupName("");
      setNewSupPhone("");
      setNewSupNotes("");
      await loadSuppliers();
      setStatus("✅ Proveedor creado");
    } catch (e: any) {
      setStatus("❌ " + (e?.message || "Error creando proveedor"));
    }
  }

  async function savePurchase() {
    if (!variantSelected) return alert("Selecciona una variante/producto primero.");
    const qn = Math.max(0, safeNum(qty, 0));
    if (qn <= 0) return alert("Cantidad inválida.");
    const costN = Math.max(0, safeNum(costInput, 0));
    if (costN <= 0) return alert("Costo inválido.");

    try {
      setStatus("Guardando compra...");

      // 1) cabecera
      const { data: pData, error: pErr } = await supabase
        .from("inv_purchases")
        .insert({
          supplier_id: supplierId || null, // opcional
          invoice_number: invoiceNumber.trim() || null,
          invoice_url: invoiceUrl.trim() || null,
          note: purchaseNote.trim() || null,
          purchased_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (pErr) throw pErr;
      const purchase_id = (pData as any).id as string;

      // 2) item
      // unit_cost debe guardarse en UNIDAD BASE (unidad)
      const unit_cost = previewUnitCost;

      const { error: iErr } = await supabase.from("inv_purchase_items").insert({
        purchase_id,
        variant_id: variantSelected.id,
        qty: qn,
        qty_unit: qtyUnit,
        unit_cost,
      });

      if (iErr) throw iErr;

      // reset form rápido
      setInvoiceNumber("");
      setInvoiceUrl("");
      setPurchaseNote("");
      setQ("");
      setVariantResults([]);
      setVariantId("");
      setQty("1");
      setCostInput("0");
      setQtyUnit("caja");
      setCostIsPer("caja");

      // recargar historial
      await loadPurchases();
      setOpenPurchaseId(purchase_id);
      await loadPurchaseItems(purchase_id);

      setStatus("✅ Compra registrada (stock + historial de costos actualizado)");
    } catch (e: any) {
      setStatus("❌ " + (e?.message || "Error guardando compra"));
    }
  }

  async function togglePurchaseOpen(id: string) {
    if (openPurchaseId === id) {
      setOpenPurchaseId("");
      return;
    }
    setOpenPurchaseId(id);
    if (!purchaseItems[id]) {
      try {
        await loadPurchaseItems(id);
      } catch (e: any) {
        setStatus("❌ " + (e?.message || "Error cargando items"));
      }
    }
  }

  const variantLabel = useMemo(() => {
    if (!variantSelected) return "";
    const attrs = stringifyAttrs(variantSelected.attributes);
    return `${variantSelected.product_name || ""} · ${variantSelected.name}${attrs ? " · " + attrs : ""}`;
  }, [variantSelected]);

  return (
    <div style={page}>
      <header style={header}>
        <h1 style={h1}>🛒 Compras</h1>
        <div style={{ color: "#aaa" }}>
          Registra compras por <b>caja</b> o <b>unidad</b>. Se guarda stock + historial de costos automáticamente.
        </div>
      </header>

      {/* Proveedores */}
      <section style={card}>
        <h2 style={h2}>Proveedores (rápido)</h2>

        <div style={grid3}>
          <div>
            <label style={label}>Seleccionar proveedor (opcional)</label>
            <select style={input} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">(sin proveedor)</option>
              {suppliers
                .filter((s) => s.active)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
            <div style={{ color: "#777", fontSize: 12, marginTop: 6 }}>
              Seleccionar proveedor NO es obligatorio, pero ayuda para comparar precios luego.
            </div>
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <label style={label}>Crear proveedor nuevo</label>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1.2fr 0.8fr 1.2fr 140px" }}>
              <input style={input} value={newSupName} onChange={(e) => setNewSupName(e.target.value)} placeholder="Nombre proveedor" />
              <input style={input} value={newSupPhone} onChange={(e) => setNewSupPhone(e.target.value)} placeholder="Teléfono (opcional)" />
              <input style={input} value={newSupNotes} onChange={(e) => setNewSupNotes(e.target.value)} placeholder="Notas (opcional)" />
              <button style={btnSoft} onClick={createSupplierQuick}>Crear</button>
            </div>
          </div>
        </div>

        {supplierSelected ? (
          <div style={{ marginTop: 10, color: "#aaa", fontSize: 12 }}>
            Proveedor seleccionado: <b style={{ color: "#fff" }}>{supplierSelected.name}</b>
          </div>
        ) : null}
      </section>

      {/* Registrar compra */}
      <section style={card}>
        <h2 style={h2}>Registrar compra</h2>

        <div style={grid2}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={label}>Buscar producto/variante</label>
            <input
              style={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ej: guantes violeta M 3.5 / alcohol 1L / batas..."
            />

            {variantResults.length > 0 ? (
              <div style={resultsBox}>
                {variantResults.map((v) => {
                  const attrs = stringifyAttrs(v.attributes);
                  return (
                    <button
                      key={v.id}
                      style={{
                        ...resultItem,
                        borderColor: v.id === variantId ? "#5a4b2b" : "#222",
                        background: v.id === variantId ? "#14110a" : "#0f0f0f",
                      }}
                      onClick={() => setVariantId(v.id)}
                      type="button"
                    >
                      <div style={{ color: "#fff", fontWeight: 900 }}>
                        {v.product_name} <span style={{ color: "#777", fontWeight: 700 }}>·</span>{" "}
                        <span style={{ color: "#ffe2a8" }}>{v.name}</span>
                      </div>
                      <div style={{ color: "#aaa", fontSize: 12 }}>
                        {attrs ? attrs : "—"}{" "}
                        <span style={{ color: "#777" }}>
                          · Pack: {v.pack_unit || "caja"} ({safeNum(v.units_per_pack, 1)} {v.base_unit || "unidad"})
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : q.trim() ? (
              <div style={{ color: "#777", marginTop: 8, fontSize: 12 }}>Sin resultados (prueba otro texto).</div>
            ) : null}
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ color: "#aaa", fontSize: 12 }}>
              Seleccionado: <b style={{ color: "#fff" }}>{variantSelected ? variantLabel : "—"}</b>
            </div>
          </div>

          <div>
            <label style={label}>Compré en</label>
            <select style={input} value={qtyUnit} onChange={(e) => setQtyUnit(e.target.value as any)}>
              <option value="caja">caja</option>
              <option value="unidad">unidad</option>
            </select>
          </div>

          <div>
            <label style={label}>Cantidad</label>
            <input style={input} value={qty} onChange={(e) => setQty(e.target.value)} type="number" min={0} />
          </div>

          <div>
            <label style={label}>Costo ingresado es por</label>
            <select style={input} value={costIsPer} onChange={(e) => setCostIsPer(e.target.value as any)}>
              <option value="caja">caja</option>
              <option value="unidad">unidad</option>
            </select>
          </div>

          <div>
            <label style={label}>Costo</label>
            <input style={input} value={costInput} onChange={(e) => setCostInput(e.target.value)} type="number" min={0} step="0.01" />
          </div>

          <div>
            <label style={label}>N° Factura (opcional)</label>
            <input style={input} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="001-001-000000123" />
          </div>

          <div>
            <label style={label}>Link factura (opcional)</label>
            <input style={input} value={invoiceUrl} onChange={(e) => setInvoiceUrl(e.target.value)} placeholder="https://..." />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={label}>Nota (opcional)</label>
            <input style={input} value={purchaseNote} onChange={(e) => setPurchaseNote(e.target.value)} placeholder="Ej: compra urgente / descuento / lote..." />
          </div>
        </div>

        {/* Preview */}
        <div style={preview}>
          <div style={previewRow}>
            <div style={previewItem}>
              <div style={previewLabel}>Unidades que entran a stock</div>
              <div style={previewValue}>{previewUnits}</div>
            </div>
            <div style={previewItem}>
              <div style={previewLabel}>Costo por unidad (guardado)</div>
              <div style={previewValue}>{fmtMoney(previewUnitCost)}</div>
            </div>
            <div style={previewItem}>
              <div style={previewLabel}>Total compra</div>
              <div style={previewValue}>{fmtMoney(previewTotal)}</div>
            </div>
          </div>

          <button style={btn} onClick={savePurchase}>
            Registrar compra
          </button>

          <div style={{ color: "#777", fontSize: 12, marginTop: 10 }}>{status}</div>
        </div>
      </section>

      {/* Historial */}
      <section style={card}>
        <h2 style={h2}>Compras recientes</h2>

        {purchases.length === 0 ? (
          <div style={{ color: "#777" }}>No hay compras registradas.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {purchases.map((p) => (
              <div key={p.id} style={row}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#fff", fontWeight: 900 }}>
                    {p.supplier_name ? p.supplier_name : "(sin proveedor)"}{" "}
                    <span style={{ color: "#777", fontWeight: 700 }}>·</span>{" "}
                    <span style={{ color: "#aaa", fontWeight: 700 }}>{fmtDateTime(p.purchased_at)}</span>
                  </div>

                  <div style={{ color: "#aaa", fontSize: 12, marginTop: 4 }}>
                    {p.invoice_number ? <>Factura: <b>{p.invoice_number}</b> · </> : null}
                    {p.invoice_url ? (
                      <>
                        <a href={p.invoice_url} target="_blank" style={{ color: "#ffe2a8", textDecoration: "none", fontWeight: 800 }}>
                          Ver factura
                        </a>{" "}
                        ·{" "}
                      </>
                    ) : null}
                    {p.note ? p.note : "—"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button style={btnSoft} onClick={() => togglePurchaseOpen(p.id)}>
                    {openPurchaseId === p.id ? "Ocultar" : "Ver items"}
                  </button>
                </div>

                {openPurchaseId === p.id ? (
                  <div style={{ gridColumn: "1 / -1", marginTop: 10 }}>
                    <ItemsTable items={purchaseItems[p.id] || []} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ItemsTable({ items }: { items: PurchaseItem[] }) {
  const total = items.reduce((a, b) => a + safeNum(b.total_cost, 0), 0);

  return (
    <div style={{ border: "1px solid #222", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: 10, background: "#0f0f0f", color: "#aaa", fontSize: 12 }}>
        Items: <b style={{ color: "#fff" }}>{items.length}</b> · Total: <b style={{ color: "#ffe2a8" }}>{fmtMoney(total)}</b>
      </div>

      {items.length === 0 ? (
        <div style={{ padding: 12, color: "#777" }}>Sin items.</div>
      ) : (
        <div style={{ display: "grid" }}>
          {items.map((it) => (
            <div key={it.id} style={{ padding: 12, borderTop: "1px solid #222", background: "#111" }}>
              <div style={{ color: "#fff", fontWeight: 900 }}>
                {it.product_name ? it.product_name : ""}{" "}
                <span style={{ color: "#777", fontWeight: 700 }}>·</span>{" "}
                <span style={{ color: "#ffe2a8" }}>{it.variant_name || it.variant_id}</span>
              </div>
              <div style={{ color: "#aaa", fontSize: 12, marginTop: 4 }}>
                Cantidad: <b>{it.qty}</b> {it.qty_unit} · Unidades a stock: <b>{it.qty_units}</b> ·
                Costo/unidad: <b>{fmtMoney(it.unit_cost)}</b> · Total: <b>{fmtMoney(it.total_cost)}</b>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// styles (manteniendo tu look oscuro/dorado)
const page: React.CSSProperties = { padding: 6 };

const header: React.CSSProperties = { marginBottom: 12 };
const h1: React.CSSProperties = { fontSize: 34, marginBottom: 6, color: "#d4af37" };
const h2: React.CSSProperties = { margin: "0 0 10px 0", fontSize: 18, color: "#fff" };

const card: React.CSSProperties = {
  marginTop: 14,
  padding: 16,
  border: "1px solid #222",
  background: "#111",
  borderRadius: 14,
};

const label: React.CSSProperties = { display: "block", marginBottom: 6, color: "#aaa", fontSize: 12, fontWeight: 800 };
const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #333",
  background: "#0b0b0b",
  color: "#fff",
};

const grid3: React.CSSProperties = { display: "grid", gap: 12, gridTemplateColumns: "1fr 2fr", alignItems: "start" };
const grid2: React.CSSProperties = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", alignItems: "end" };

const btn: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 14px",
  borderRadius: 12,
  background: "#d4af37",
  border: "none",
  cursor: "pointer",
  fontWeight: 900,
  width: "100%",
};

const btnSoft: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "#14110a",
  border: "1px solid #5a4b2b",
  color: "#ffe2a8",
  cursor: "pointer",
  fontWeight: 900,
};

const resultsBox: React.CSSProperties = {
  marginTop: 10,
  border: "1px solid #222",
  borderRadius: 14,
  overflow: "hidden",
  background: "#0f0f0f",
};

const resultItem: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: 12,
  border: "1px solid #222",
  borderLeft: "none",
  borderRight: "none",
  borderTop: "none",
  background: "#0f0f0f",
  cursor: "pointer",
};

const preview: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  borderRadius: 14,
  border: "1px solid #222",
  background: "#0f0f0f",
};

const previewRow: React.CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  marginBottom: 10,
};

const previewItem: React.CSSProperties = { border: "1px solid #222", borderRadius: 14, padding: 12, background: "#111" };
const previewLabel: React.CSSProperties = { color: "#aaa", fontSize: 12, fontWeight: 800 };
const previewValue: React.CSSProperties = { color: "#fff", fontSize: 18, fontWeight: 900, marginTop: 6 };

const row: React.CSSProperties = {
  border: "1px solid #222",
  borderRadius: 14,
  padding: 12,
  background: "#0f0f0f",
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 10,
  alignItems: "center",
};