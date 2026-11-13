"use client";

import { useState, type FormEvent } from "react";
import {
  availabilityLabels, comparisonPrice, offerHeaders, parseSupplierProforma, productTerms,
  similarity, supplierHeaders, type HistoryOffer, type SupplierOffer,
} from "@/lib/supplier-proformas";

type CatalogEntry = {
  variant_id: string; product_name: string; variant_name: string; product_sku: string | null; stock: number | null;
};
type Supplier = { id: string; name: string };
type Filters = { query: string; supplier: string };
type SearchResult = { offers: HistoryOffer[]; more: boolean };

const field = "w-full rounded-lg border border-slate-600 bg-slate-950 p-2 text-slate-100";
const button = "rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-100 disabled:opacity-50";
const primary = "rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
const template = [supplierHeaders.join("\t"), "Proveedor de ejemplo\t\t4389\t2026-11-10\t\t15\tUSD\tsin IVA", offerHeaders.join("\t"), "00017\tMatraz 100 mL borosilicato\t\t2\tCaja de 10\t10\tunidad\t24,50\tdisponible"].join("\n");

function ageLabel(offer: HistoryOffer, today: string) {
  const day = (value: string) => Date.parse(value + "T00:00:00Z");
  const age = offer.issued ? Math.floor((day(today) - day(offer.issued)) / 86400000) : null;
  const validity = !offer.expires ? "Vigencia desconocida" : offer.expires < today ? `Venció el ${offer.expires}` : `Válida hasta ${offer.expires}`;
  return `${offer.issued ?? "Fecha desconocida"}${age !== null && age >= 0 ? ` · hace ${age} días` : ""} · ${validity}`;
}

export default function SupplierProformas({ catalog, onAdd }: {
  catalog: CatalogEntry[];
  onAdd: (offer: SupplierOffer) => void;
}) {
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const [key, setKey] = useState("");
  const [access, setAccess] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof parseSupplierProforma> | null>(null);
  const [savedProforma, setSavedProforma] = useState("");
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<"history" | "paste">("history");
  const [filters, setFilters] = useState<Filters>({ query: "", supplier: "" });
  const [applied, setApplied] = useState<Filters>(filters);
  const [base, setBase] = useState<HistoryOffer | null>(null);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [linking, setLinking] = useState<HistoryOffer | null>(null);
  const [variantQuery, setVariantQuery] = useState("");
  const [variant, setVariant] = useState("");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Guayaquil" });

  async function request<T>(input: object, token = access): Promise<T> {
    const response = await fetch("/api/supplier-proformas", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No se pudo acceder a las proformas.");
    return payload;
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo completar la operación."); }
    finally { setBusy(false); }
  }

  async function search(nextFilters: Filters, nextBase: HistoryOffer | null, nextOffset = 0) {
    const data = await request<SearchResult>({
      action: "search", ...nextFilters, offset: nextOffset, id: nextBase?.id, line: nextBase?.line,
    });
    setResults(data);
    setApplied(nextFilters);
    setBase(nextBase);
    setOffset(nextOffset);
  }

  function unlock(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const token = key.trim();
      const data = await request<{ suppliers: Supplier[] }>({ action: "suppliers" }, token);
      setSuppliers(data.suppliers);
      setAccess(token);
      setKey("");
    });
  }

  function save() {
    void run(async () => {
      const data = await request<{ id: string; duplicate: boolean }>({ action: "save", text, supplierId });
      setSaved(true);
      setMessage(data.duplicate ? "Esta proforma ya está registrada." : "Proforma registrada.");
      setMode("history");
      const nextFilters = { query: "", supplier: "" };
      setFilters(nextFilters);
      const history = await request<SearchResult>({ action: "search", proformaId: data.id });
      setBase(null);
      setApplied(nextFilters);
      setOffset(0);
      setResults(history);
      setSavedProforma(data.id);
    });
  }

  const scored = (results?.offers ?? []).map((row) => ({
    row,
    cost: base ? comparisonPrice(base, row) : null,
    score: base ? similarity(base.offer.terms, row.offer.terms) : 0,
  }));
  const isCandidate = (row: HistoryOffer) => row.offer.availability !== "no disponible" &&
    (!row.expires || row.expires >= today);
  const best = scored.reduce<number | null>((min, { row, cost }) =>
    cost !== null && isCandidate(row) && (min === null || cost < min) ? cost : min, null);
  if (base) scored.sort((a, b) => {
    const rank = (entry: typeof a) => entry.cost === null ? 2 : isCandidate(entry.row) ? 0 : 1;
    return rank(a) - rank(b) || (a.cost ?? 0) - (b.cost ?? 0) || b.score - a.score;
  });
  const variantTerms = productTerms(variantQuery);

  return (
    <section id="proformas-proveedores" aria-label="Proformas de proveedores" className="mb-4 grid gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm">
      <h2 className="text-base font-bold">Proformas de proveedores</h2>
      {!access ? (
        <form onSubmit={unlock} className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1">Clave de proformas
            <input className={field} type="password" value={key} onChange={(event) => setKey(event.target.value)} required autoComplete="off" />
          </label>
          <button className={primary} disabled={busy}>Abrir historial</button>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={mode === "history" ? primary : button} onClick={() => setMode("history")} disabled={busy}>Historial y comparación</button>
            <button type="button" className={mode === "paste" ? primary : button} onClick={() => setMode("paste")} disabled={busy}>Pegar proforma</button>
          </div>
          {mode === "paste" ? (
            <div className="grid gap-2">
              <p>Pega el TSV extraído en ChatGPT. Usa una fila de proveedor entre los dos encabezados y una fila por producto. Deja vacíos los datos desconocidos.</p>
              <details>
                <summary className="cursor-pointer">Formato TSV y unidades</summary>
                <pre className="my-2 overflow-auto rounded bg-slate-950 p-2">{template}</pre>
                <p>Fechas AAAA-MM-DD. Moneda como USD. Base IVA: sin IVA o con IVA. Contenido: unidades base por presentación, por ejemplo 10 y unidad para una caja de 10. Disponibilidad: disponible, no disponible o el texto informado.</p>
              </details>
              <label className="grid gap-1">Proforma en TSV
                <textarea rows={5} className={field} value={text} disabled={busy} onChange={(event) => {
                  setText(event.target.value); setPreview(null); setSaved(false); setSupplierId("");
                }} />
              </label>
              <div>
                <button type="button" className={button} disabled={busy} onClick={() => setPreview(parseSupplierProforma(text))}>Previsualizar</button>
              </div>
              {preview?.errors.length ? <ul role="alert" className="list-disc pl-5 text-red-300">{preview.errors.map((item) => <li key={item}>{item}</li>)}</ul> : null}
              {preview?.proforma && (
                <>
                  <p><strong>{preview.proforma.supplier}</strong> · {preview.proforma.reference || "Sin referencia"} · {preview.proforma.issued ?? "Sin fecha"} · {preview.proforma.currency ?? "Moneda desconocida"} · {preview.proforma.tax ?? "Base IVA desconocida"}</p>
                  <ul className="max-h-48 list-disc overflow-auto pl-5">
                    {preview.proforma.items.map((item, i) => (
                      <li key={i}>{[item.code, item.product, item.presentation].filter(Boolean).join(" · ")} · {item.sourcePrice ? `Costo ${item.sourcePrice}` : "Costo desconocido"} · {availabilityLabels[item.availability]}</li>
                    ))}
                  </ul>
                  <label className="grid gap-1">Vincular a un proveedor de inventario (opcional)
                    <select className={field} value={supplierId} disabled={busy || saved} onChange={(event) => setSupplierId(event.target.value)}>
                      <option value="">Conservar proveedor de la proforma</option>
                      {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                    </select>
                  </label>
                  <div><button type="button" className={primary} disabled={busy || saved} onClick={save}>Registrar {preview.proforma.items.length} ofertas</button></div>
                </>
              )}
            </div>
          ) : (
            <>
              <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
                event.preventDefault();
                setSavedProforma("");
                setLinking(null);
                void run(() => search(filters, null));
              }}>
                <label className="grid gap-1">Producto o código<input className={field} value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} /></label>
                <label className="grid gap-1">Proveedor<input className={field} value={filters.supplier} onChange={(event) => setFilters({ ...filters, supplier: event.target.value })} /></label>
                <button className={primary} disabled={busy}>Buscar</button>
              </form>
              {base && <p>Comparación con <strong>{base.offer.product}</strong> · {base.supplier}. Revisa presentación y disponibilidad antes de elegir.</p>}
              {results && !results.offers.length && <p>No se encontraron ofertas.</p>}
              {scored.map(({ row, cost }) => {
                const rowKey = `${row.id}:${row.line}`;
                const linked = catalog.find((entry) => entry.variant_id === row.offer.variantId);
                return (
                  <article key={rowKey} className="grid gap-1 rounded-lg border border-slate-700 p-3">
                    <strong>{row.offer.product}{row.offer.code ? ` · ${row.offer.code}` : ""}</strong>
                    {row.offer.details && <p>{row.offer.details}</p>}
                    <p>{row.supplier}{row.reference ? ` · Proforma ${row.reference}` : ""}{row.ruc ? ` · RUC ${row.ruc}` : ""} · {ageLabel(row, today)}</p>
                    <p>{row.offer.sourcePrice ? `Costo ${row.offer.sourcePrice} ${row.currency ?? "(moneda desconocida)"}` : "Costo desconocido"} · {row.tax ?? "Base IVA desconocida"} · {row.offer.presentation || "Presentación desconocida"}{row.offer.pack && row.offer.unit ? ` (${row.offer.pack} ${row.offer.unit})` : ""}</p>
                    <p>{availabilityLabels[row.offer.availability]}{row.offer.availability === "desconocida" && row.offer.availabilityNote ? ` · ${row.offer.availabilityNote}` : ""} · Stock propio: {linked?.stock ?? "sin dato"}</p>
                    {linked && <p>Variante vinculada: {linked.product_name} · {linked.variant_name}</p>}
                    {base && <p>{cost === null ? "Sugerencia sin precio comparable" :
                      `${cost.toLocaleString("es-EC", { maximumSignificantDigits: 12 })} ${row.currency} / ${row.offer.unit}${offset === 0 && cost === best && isCandidate(row) ? " · Menor costo comparable" : ""}`}</p>}
                    <div className="mt-1 flex flex-wrap gap-2">
                      <button type="button" className={button} disabled={busy} onClick={() => {
                        setSavedProforma(""); setLinking(null); void run(() => search({ query: "", supplier: "" }, row));
                      }}>Comparar similares</button>
                      <button type="button" className={button} disabled={busy} onClick={() => {
                        setLinking(row); setVariant(row.offer.variantId ?? ""); setVariantQuery(row.offer.product);
                      }}>Vincular variante</button>
                      <button type="button" className={button} disabled={busy || added.has(rowKey)} onClick={() => {
                        onAdd(row.offer);
                        setAdded((current) => new Set(current).add(rowKey));
                        setMessage("Producto agregado. Ingresa el precio de venta en la cotización.");
                      }}>{added.has(rowKey) ? "Agregado a cotización" : "Agregar a cotización"}</button>
                    </div>
                  </article>
                );
              })}
              {linking && (
                <div className="grid gap-2 rounded-lg border border-slate-600 p-3">
                  <strong>Vincular variante · {linking.offer.product}</strong>
                  <label>Buscar en inventario<input className={field} value={variantQuery} onChange={(event) => setVariantQuery(event.target.value)} /></label>
                  <label>Variante
                    <select className={field} value={variant} onChange={(event) => setVariant(event.target.value)}>
                      <option value="">Sin vínculo</option>
                      {catalog.filter((entry) => {
                        const terms = productTerms(`${entry.product_name} ${entry.variant_name} ${entry.product_sku ?? ""}`);
                        return variantTerms.every((term) => terms.includes(term)) || entry.variant_id === variant;
                      }).slice(0, 100).map((entry) => <option key={entry.variant_id} value={entry.variant_id}>{entry.product_name} · {entry.variant_name}{entry.product_sku ? ` · ${entry.product_sku}` : ""}</option>)}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <button type="button" className={primary} disabled={busy} onClick={() => void run(async () => {
                      await request({ action: "link", id: linking.id, line: linking.line, variant: variant || null });
                      const update = (row: HistoryOffer) => row.id === linking.id && row.line === linking.line ?
                        { ...row, offer: { ...row.offer, variantId: variant || undefined } } : row;
                      if (savedProforma) {
                        setResults(await request<SearchResult>({ action: "search", proformaId: savedProforma, offset }));
                      } else {
                        await search(applied, base && update(base));
                      }
                      setLinking(null);
                      setMessage("Vínculo guardado.");
                    })}>Confirmar vínculo</button>
                    <button type="button" className={button} disabled={busy} onClick={() => setLinking(null)}>Cancelar</button>
                  </div>
                </div>
              )}
              {results && (offset > 0 || results.more) && (
                <div className="flex gap-2">
                  {[["Anterior", offset - 50, offset === 0], ["Siguiente", offset + 50, !results.more]].map(([label, next, disabled]) => (
                    <button key={String(label)} type="button" className={button} disabled={busy || Boolean(disabled)} onClick={() => void run(async () => {
                      setLinking(null);
                      if (savedProforma) {
                        setResults(await request<SearchResult>({ action: "search", proformaId: savedProforma, offset: next }));
                        setOffset(Number(next));
                      } else await search(applied, base, Number(next));
                    })}>{label}</button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
      {busy && <p role="status">Procesando…</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" className="text-red-300">{error}</p>}
    </section>
  );
}
