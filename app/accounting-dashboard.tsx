"use client";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ecuadorDate, money, paymentsFor, pendingInvoices, periods, rangeFor, saleBalance, saleProfit, startDate,
  summarize, type Ledger, type Period, type Range, type Sale } from "@/lib/accounting";

import { normalizeAccountingValues } from "@/lib/decimal-input";
import styles from './accounting.module.css';
import { Overview, TreasuryPanel } from './accounting-insights';
import { treasurySummary, type Treasury } from '@/lib/treasury';
const panel = styles.panel;
const field = styles.field;
const button = styles.button;
const subtle = styles.subtle;
const grid = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";

function Input({ label, name, type = "text", required, defaultValue, max }: {
  label: string; name: string; type?: string; required?: boolean; defaultValue?: string; max?: string;
}) {
  return <label className="grid gap-1 text-sm">{label}
    <input className={field} name={name} type={type === "number" ? "text" : type} required={required} defaultValue={defaultValue} max={max}
      inputMode={type === "number" ? "decimal" : undefined} step={type === "number" ? "any" : undefined} />
  </label>;
}
function AttachmentInput() {
  return <label className="grid gap-1 text-sm">Comprobante PDF (opcional)
    <input className={field} name="attachment" type="file" accept="application/pdf,.pdf" />
  </label>;
}

function Select({ label, name, children }: { label: string; name: string; children: ReactNode }) {
  return <label className="grid gap-1 text-sm">{label}<select className={field} name={name}>{children}</select></label>;
}
function Lines({ lines, onChange }: { lines: { product: string; qty: string }[]; onChange: (lines: { product: string; qty: string }[]) => void }) {
  return <div className="grid gap-2">
    {lines.map((line, index) => <div key={index} className="flex flex-wrap gap-2">
      <input aria-label={`Producto ${index + 1}`} placeholder="Producto o servicio" required maxLength={400} className={`${field} grow`}
        value={line.product} onChange={(event) => onChange(lines.map((item, i) => i === index ? { ...item, product: event.target.value } : item))} />
      <input aria-label={`Cantidad ${index + 1}`} className={`${field} w-28`} type="text" inputMode="decimal" required
        value={line.qty} onChange={(event) => onChange(lines.map((item, i) => i === index ? { ...item, qty: event.target.value } : item))} />
      {lines.length > 1 && <button type="button" className={subtle} onClick={() => onChange(lines.filter((_, i) => i !== index))}>Quitar</button>}
    </div>)}
    <button type="button" className={`${subtle} w-fit`} disabled={lines.length >= 500} onClick={() => onChange([...lines, { product: "", qty: "1" }])}>Agregar línea</button>
  </div>;
}

export default function AccountingDashboard() {
  const [today] = useState(ecuadorDate);
  const [tab,setTab] = useState("overview");
  const [treasury,setTreasury] = useState<Treasury>({settings:null,entries:[]});
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [custom, setCustom] = useState<Range>({ from: today, to: today });
  const [historic, setHistoric] = useState(false);
  const [lines, setLines] = useState([{ product: "", qty: "1" }]);
  const [edit, setEdit] = useState<Sale | null>(null);
  const [editLines, setEditLines] = useState(lines);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [shared, setShared] = useState("");
  const pendingWrite = useRef<{ body: string; id: string } | null>(null);
  const running = useRef(false);
  const range = rangeFor(period, today, custom);
  const historical = historic || period === "all";
  const validRange = !range.from || !range.to || range.from <= range.to;
  const summary = ledger && validRange ? summarize({ ...ledger, movements: [...ledger.movements, ...treasury.entries.filter(e=>e.kind==="petty_expense").map(e=>({ id:e.id,type:"GASTO",amount:e.amount,date:e.date,description:e.description }))] }, range, historical, today) : null;
  const pending = ledger && validRange ? pendingInvoices(ledger, range, today, historical) : [];
  const current = ledger ? treasurySummary(ledger,treasury,today) : null;
  const metrics: [string, string][] = summary ? [
    ["Ventas facturadas", money(summary.gross)], ["Cobros y entradas de caja", money(summary.cashIn)], ["Pagos y salidas de caja", money(summary.cashOut)],
    ["Saldo actual por cobrar", money(summary.outstanding)], ["Saldo actual por pagar", money(summary.payable)],
    ["IVA facturado", money(summary.output)], ["IVA de compras registrado", money(summary.purchaseVAT)],
    ["IVA de compra pagado (prorrata de caja)", money(summary.paidVAT)], ["Crédito IVA elegible registrado", money(summary.input)], ["IVA estimado · saldo (+) o crédito (−)", money(summary.vatEstimate)],
    ["Saldo actual: cuenta principal",money(current?.main??null)],["Saldo actual: caja chica",money(current?.petty??null)],
    ["Capital aportado actual",money(current?.capital??null)],["Reserva actual: capital de trabajo",money(treasury.settings?.working_reserve??null)],
    ["Excedente de caja actual estimado",money(current?.withdrawable??null)],
  ] : [];

  async function call<T>(action: string, values: object = {}, id?: string): Promise<T> {
    const response = await fetch("/api/contabilidad", { method: "POST", cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, values, id }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo completar la operación.");
    return data;
  }

  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo completar la operación."); }
    finally { running.current = false; setBusy(false); }
  }

  async function refresh() {
    const data = await call<{ledger: Ledger;treasury:Treasury}>("load");
    setLedger(data.ledger);setTreasury(data.treasury);
  }

  useEffect(() => {
    let active = true;
    void call<{ ledger: Ledger; treasury:Treasury }>("load").then((data) => {
      if (active) { setLedger(data.ledger);setTreasury(data.treasury); }
    }).catch(() => {
      if (active) setError("No se pudo cargar la contabilidad. Vuelve a intentar.");
    });
    return () => { active = false; };
  }, []);

  function submit(event: FormEvent<HTMLFormElement>, action: string, additional: object = {}, onSaved?: () => void) {
    event.preventDefault();
    const form = event.currentTarget;
    void run(async () => {
      const fields = new FormData(form);
      const attachment = fields.get("attachment");
      fields.delete("attachment");
      const values: Record<string, unknown> = normalizeAccountingValues({ ...Object.fromEntries(fields), ...additional });
      const pdf = attachment instanceof File && attachment.size ? attachment : null;
      if (pdf) {
        if (pdf.size > 20 * 1024 * 1024 || await pdf.slice(0, 5).text() !== "%PDF-") {
          throw new Error("Selecciona un PDF válido de hasta 20 MB.");
        }
        const digest = await crypto.subtle.digest("SHA-256", await pdf.arrayBuffer());
        values.file_hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      }
      const body = JSON.stringify({ action, values });
      const request = pendingWrite.current?.body === body ? pendingWrite.current : { id: crypto.randomUUID(), body };
      pendingWrite.current = request;
      if (pdf) {
        const upload = await call<{ path: string; token?: string }>("upload", { file_hash: values.file_hash }, request.id);
        if (upload.token) {
          const result = await supabaseBrowser().storage.from("invoices").uploadToSignedUrl(
            upload.path, upload.token, pdf, { contentType: "application/pdf" },
          );
          if (result.error) throw new Error("No se pudo cargar el comprobante. Vuelve a intentar.");
        }
      }
      const result = await call<{ path?: string }>(action, values, request.id);
      pendingWrite.current = null;
      if (result.path) setShared(location.origin + result.path);
      if (action !== "sale_vat" && action !== "purchase_vat") form.reset();
      onSaved?.();
      setNotice("Registro guardado.");
      try { await refresh(); } catch { setError("Registro guardado. Actualiza el panel para ver el cambio."); }
    });
  }

  return <main className={styles.root}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>HST GLOBAL STORE / FINANZAS</p><h1>Tu negocio, de un vistazo.</h1><p className={styles.caption}>Controla lo que entra, protege tu capital y decide con claridad.</p></div><span className={styles.caption}>USD · Ecuador<br/>{today.split("-").reverse().join("/")}</span>
    </header>
    <nav className={styles.tabs} aria-label="Secciones de contabilidad">
      {[["overview","Resumen"],["sales","Ventas y cobros"],["purchases","Compras y pagos"],["cash","Caja y capital"],["tax","Impuestos"]].map(([id,label])=><button key={id} type="button" className={styles.tab} aria-current={tab===id?"page":undefined} onClick={()=>setTab(id)}>{label}</button>)}
    </nav>
    {!ledger ? <section className={panel}>
      <p role="status">{error ? "La contabilidad no está disponible." : "Cargando contabilidad…"}</p>
      {error && <button className={`${button} w-fit`} disabled={busy} onClick={() => void run(() => refresh())}>Reintentar</button>}
    </section> : <>
      <section hidden={tab==="cash"} className={panel}>
        <div className={styles.toolbar}>
          <label className="grid gap-1 text-sm">Período<select className={field} value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
            {Object.entries(periods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          {period === "custom" && <>
            <label className="grid gap-1 text-sm">Desde<input className={field} type="date" value={custom.from} onChange={(event) => setCustom({ ...custom, from: event.target.value })} /></label>
            <label className="grid gap-1 text-sm">Hasta<input className={field} type="date" value={custom.to} onChange={(event) => setCustom({ ...custom, to: event.target.value })} /></label>
          </>}
          <button className={subtle} disabled={busy} onClick={() => void run(() => refresh())}>Actualizar</button>
          <button className={button} disabled={!summary || busy} onClick={() => void run(async () => {
            const { accountingPDF } = await import("@/lib/pdf/accountingPDF");
            accountingPDF(pending, range, metrics, summary?.invoiced).save("estado-de-cuenta.pdf");
          })}>Descargar estado de cuenta PDF</button>
        </div>
        {period !== "all" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={historic}
          onChange={(event) => setHistoric(event.target.checked)} /> Incluir operaciones anteriores al {startDate}</label>}
        {!historical && <p className="text-sm text-slate-300">Los informes usan el período seleccionado. Los saldos de caja y las reservas muestran el acumulado actual desde el 24/11/2026.</p>}
        {!validRange && <p role="alert" className="text-rose-300">La fecha inicial es posterior a la final.</p>}
      </section>

      <div hidden={tab!=="overview"} className={styles.content}>
        <Overview ledger={ledger} treasury={treasury} today={today} sales={summary?.invoiced??[]} go={setTab}/>
        <div className={styles.cards}>{metrics.slice(0,4).map(([label,value],i)=><article className={styles.metric} key={label}><span>{label}</span><strong className={i===1?styles.good:i===2?styles.warning:""}>{value}</strong><small>Período seleccionado</small></article>)}</div>
      </div>
      <div hidden={tab!=="cash"} className={styles.content}><TreasuryPanel treasury={treasury} ledger={ledger} today={today} submit={submit} busy={busy}/></div>
      <section hidden={tab!=="tax"} className={panel}>
        <div><span className={styles.eyebrow}>DESGLOSE DEL PERÍODO</span><h2>Impuestos e IVA</h2></div>
        <div className={styles.cards}>{metrics.slice(5,10).map(([label,value])=><article className={styles.metric} key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
        <p className={styles.caption}>El IVA se estima con los datos registrados. Los saldos a favor previos y las retenciones quedan fuera del cálculo. La reserva manual de Caja y capital permite apartar el total que aún debas pagar.</p>
        <a className={styles.subtle} href="https://www.sri.gob.ec/impuesto-al-valor-agregado-iva" target="_blank" rel="noreferrer">Consultar información del SRI ↗</a>
      </section>

      <div hidden={tab!=="sales"} className={styles.content}>
      <details className={panel}><summary className="cursor-pointer font-semibold">Registrar factura de venta</summary>
        <form className="grid gap-3" onSubmit={(event) => submit(event, "sale", { lines }, () => setLines([{ product: "", qty: "1" }]))}>
          <div className={grid}>
            <Input label="Número de factura" name="number" required /><Input label="Cliente" name="customer" required />
            <Input label="Fecha de emisión" name="issued" type="date" required defaultValue={today} /><Input label="Vencimiento" name="due" type="date" />
            <Input label="Total con IVA" name="gross" type="number" required /><Input label="IVA cobrado (0 si aplica)" name="vat" type="number" />
            <Input label="Descuento ya incluido en el total" name="discount" type="number" />
          </div>
          <AttachmentInput />
          <Lines lines={lines} onChange={setLines} />
          <p className="text-sm text-slate-300">Registro interno. El neto se calcula a partir del total final y el IVA ingresado.</p>
          <button className={`${button} w-fit`} disabled={busy}>Guardar factura</button>
        </form>
      </details>
      </div>
      <div hidden={tab!=="purchases"} className={styles.content}>
      <details className={panel}><summary className="cursor-pointer font-semibold">Registrar compra o gasto con comprobante</summary>
        <form className="grid gap-3" onSubmit={(event) => submit(event, "purchase")}>
          <div className={grid}>
            <Select name="kind" label="Tipo"><option value="producto">Producto</option><option value="gasto">Gasto asignable</option></Select>
            <Input label="Proveedor" name="supplier" required /><Input label="Factura o referencia de soporte" name="reference" required />
            <Input label="Línea del comprobante" name="line_reference" required defaultValue="1" /><Input label="Detalle" name="description" required />
            <Input label="Fecha del comprobante" name="issued" type="date" required defaultValue={today} />
            <Input label="Cantidad disponible (1 para repartir un gasto)" name="qty" type="number" required defaultValue="1" />
            <Input label="Costo total con IVA" name="gross" type="number" required /><Input label="IVA del comprobante (0 si aplica)" name="vat" type="number" />
            <Input label="% de IVA elegible para crédito (0 a 100)" name="eligible" type="number" />
          </div>
          <AttachmentInput />
          <p className="text-sm text-slate-300">Deja el IVA o su porcentaje vacío si falta información. Documenta la elegibilidad antes de usar el crédito.</p>
          <button className={`${button} w-fit`} disabled={busy}>Guardar comprobante</button>
        </form>
      </details>
      </div>
      <div hidden={tab!=="cash"||!treasury.settings} className={styles.content}>
      <details className={panel}><summary className="cursor-pointer font-semibold">Registrar otro movimiento de caja</summary>
        <form className="grid gap-3" onSubmit={(event) => submit(event, "cash")}>
          <div className={grid}>
            <Select name="type" label="Tipo"><option value="INGRESO_OTRO">Otra entrada</option><option value="GASTO">Otra salida</option></Select>
            <Input label="Monto" name="amount" type="number" required /><Input label="Fecha de caja" name="paid_on" type="date" required defaultValue={today} max={today} />
            <Input label="Detalle" name="description" required />
          </div>
          <p className="text-sm text-slate-300">Usa los cobros y pagos de cada comprobante para registrar movimientos asociados a una factura.</p>
          <button className={`${button} w-fit`} disabled={busy}>Guardar movimiento</button>
        </form>
      </details>
      </div>

      {summary && <>
        <section hidden={tab!=="sales"} className={panel}>
          <h2 className="text-xl font-semibold">Facturas del período</h2>
          {!summary.invoiced.length && <p>No hay ventas facturadas en este período.</p>}
          {summary.invoiced.concat(summary.receivableSales.filter((sale) => !summary.invoiced.includes(sale))).map((sale) => {
            const balance = saleBalance(sale, ledger.payments);
            const profit = saleProfit(sale, ledger.purchases, ledger.allocations);
            const status = sale.pos ? "POS · cobro sin confirmar aquí" : balance.outstanding === 0 ? "Pagada" : balance.paid ? "Parcial" : "Pendiente";
            return <details key={(sale.legacy ? "importada-" : "") + sale.id} className="grid gap-2 rounded-lg border border-slate-700 p-3">
              <summary className="cursor-pointer font-medium">{sale.number || "Sin número"} · {sale.customer || "Cliente sin nombre"} · {sale.issued} · {money(sale.gross)} · {status}</summary>
              <div className="mt-3 grid gap-3">
                {sale.legacy && sale.issued < startDate && !historical && <p>Saldo inicial importado.</p>}
                <p>Vencimiento {sale.due || "sin registrar"} · IVA {money(sale.vat)} · Descuento {money(sale.discount)}</p>
                {!sale.pos && <p>Pagado {money(balance.paid)} · Pendiente {money(balance.outstanding)}</p>}
                {sale.paidFlag && !paymentsFor(sale, ledger.payments).length && <p>Marcada pagada en el registro anterior. Falta fecha de cobro.</p>}
                {!sale.legacy && !sale.pos && <details className="grid gap-2">
                  <summary className="cursor-pointer text-sm">Actualizar IVA y descuento</summary>
                  <form className={grid} onSubmit={(event) => submit(event, "sale_vat", { sale_id: sale.id })}>
                    <Input label="IVA cobrado" name="vat" type="number" defaultValue={sale.vat?.toString()} />
                    <Input label="Descuento incluido" name="discount" type="number" defaultValue={sale.discount?.toString()} />
                    <button className={`${subtle} self-end`} disabled={busy}>Guardar desglose</button>
                  </form>
                </details>}
                {sale.lines.length > 0 && <ul className="list-disc pl-5">{sale.lines.map((line) => <li key={line.line}>{line.product} × {line.qty}</li>)}</ul>}
                {sale.legacy && <div className="flex flex-wrap gap-2">
                  <button className={subtle} onClick={() => { setEdit(sale); setEditLines(sale.lines.length ? sale.lines.map((line) => ({ product: line.product, qty: String(line.qty) })) : [{ product: "", qty: "1" }]); }}>Editar líneas importadas</button>
                  {sale.attachment && <button className={subtle} disabled={busy} onClick={() => void run(async () => {
                    const { url } = await call<{ url: string }>("attachment", { legacy_id: sale.id });
                    location.assign(url);
                  })}>Ver comprobante archivado</button>}
                </div>}
                {!sale.legacy && !sale.pos && sale.attachment && <button className={`${subtle} w-fit`} disabled={busy} onClick={() => void run(async () => {
                  const { url } = await call<{ url: string }>("attachment", { document_id: sale.id, kind: "sale" });
                  location.assign(url);
                })}>Ver comprobante PDF</button>}
                {edit?.id === sale.id && sale.legacy && <form className="grid gap-2" onSubmit={(event) => submit(event, "legacy_details", { legacy_id: sale.id, lines: editLines }, () => setEdit(null))}>
                  <Input label="Vencimiento" name="due" type="date" defaultValue={sale.due ?? ""} />
                  <Lines lines={editLines} onChange={setEditLines} />
                  <div className="flex gap-2"><button className={button} disabled={busy}>Guardar detalle</button><button type="button" className={subtle} onClick={() => setEdit(null)}>Cancelar</button></div>
                </form>}
                {paymentsFor(sale, ledger.payments).length > 0 && <ul className="list-disc pl-5">{paymentsFor(sale, ledger.payments).map((pay) => <li key={pay.id}>{pay.paid_on || "Fecha desconocida"} · {money(pay.amount)} {pay.note}</li>)}</ul>}
                {balance.outstanding > 0 && !sale.pos && <form className={grid} onSubmit={(event) => submit(event, "payment", sale.legacy ? { legacy_id: sale.id } : { sale_id: sale.id })}>
                  <Input label="Monto del cobro" name="amount" type="number" required /><Input label="Fecha del cobro" name="paid_on" type="date" required defaultValue={today} max={today} />
                  <Input label="Nota" name="note" /><button className={`${subtle} self-end`} disabled={busy}>Registrar cobro</button>
                </form>}
                <div className="grid gap-1 text-sm text-slate-300">
                  <p>Venta neta {money(profit.netSales)} · Costo de productos {money(profit.productCost)} · Ganancia bruta {money(profit.grossProfit)}</p>
                  <p>Gastos asignados {money(profit.expense)} · Contribución neta {money(profit.contribution)} · Margen {profit.margin === null ? "sin datos completos" : `${profit.margin.toFixed(2)}%`}</p>
                </div>
                {!sale.legacy && !sale.pos && ledger.purchases.length > 0 && <form className={grid} onSubmit={(event) => submit(event, "allocate", { sale_id: sale.id })}>
                  <Select name="purchase_id" label="Comprobante de costo"><option value="">Seleccionar</option>{ledger.purchases.map((lot) => <option key={lot.id} value={lot.id}>
                    {lot.reference} · {lot.description} · {Number((lot.qty - ledger.allocations.filter((row) => row.purchase_id === lot.id).reduce((sum, row) => sum + row.qty, 0)).toFixed(4))} disponibles
                  </option>)}</Select>
                  <Select name="line" label="Aplicar a"><option value="">Factura completa (gasto)</option>{sale.lines.map((line) => <option key={line.line} value={line.line}>{line.product}</option>)}</Select>
                  <Input label="Cantidad o fracción asignada" name="qty" type="number" required />
                  <button className={`${subtle} self-end`} disabled={busy}>Asignar costo</button>
                </form>}
              </div>
            </details>;
          })}
        </section>
        <section hidden={tab!=="purchases"} className={panel}>
          <h2 className="text-xl font-semibold">Compras y cuentas por pagar</h2>
          {!summary.purchases.length && <p>No hay compras registradas en este período.</p>}
          {summary.purchases.map((purchase) => {
            const payments = ledger.payments.filter((pay) => pay.purchase_id === purchase.id);
            const open = Math.max(0, Math.round((purchase.gross - payments.reduce((sum, row) => sum + row.amount, 0)) * 100) / 100);
            return <details key={purchase.id} className="rounded-lg border border-slate-700 p-3">
              <summary className="cursor-pointer">{purchase.supplier} · {purchase.reference} · {purchase.description} · {money(open)} pendiente</summary>
              <p>Fecha {purchase.issued} · Total {money(purchase.gross)} · IVA {money(purchase.vat)}</p>
              {purchase.attachment && <button className={subtle} disabled={busy} onClick={() => void run(async () => {
                const { url } = await call<{ url: string }>("attachment", { document_id: purchase.id, kind: "purchase" });
                location.assign(url);
              })}>Ver comprobante PDF</button>}
              <details className="my-2">
                <summary className="cursor-pointer text-sm">Actualizar elegibilidad de IVA</summary>
                <form className={grid} onSubmit={(event) => submit(event, "purchase_vat", { purchase_id: purchase.id })}>
                  <Input label="IVA del comprobante" name="vat" type="number" defaultValue={purchase.vat?.toString()} />
                  <Input label="% de IVA elegible" name="eligible" type="number" defaultValue={purchase.eligible?.toString()} />
                  <button className={`${subtle} self-end`} disabled={busy}>Guardar elegibilidad</button>
                </form>
              </details>
              {payments.map((pay) => <p key={pay.id}>{pay.paid_on} · {money(pay.amount)} {pay.note}</p>)}
              {open > 0 && <form className={`${grid} mt-3`} onSubmit={(event) => submit(event, "payment", { purchase_id: purchase.id })}>
                <Input label="Monto del pago" name="amount" type="number" required /><Input label="Fecha del pago" name="paid_on" type="date" required defaultValue={today} max={today} />
                <Input label="Nota" name="note" /><button className={`${subtle} self-end`} disabled={busy}>Registrar pago</button>
              </form>}
            </details>;
          })}
        </section>
        <details hidden={tab!=="cash"||!treasury.settings} className={panel}><summary className="cursor-pointer font-semibold">Movimientos de caja del período</summary>
          {[...summary.movements.map((row) => ({ id: row.id, date: row.date, amount: row.amount, label: row.description, outgoing: row.type === "GASTO" })),
            ...summary.payments.map((row) => ({ id: row.id, date: row.paid_on, amount: row.amount, label: row.purchase_id ? "Pago de compra" : "Cobro de factura", outgoing: Boolean(row.purchase_id) }))]
            .sort((a, b) => b.date.localeCompare(a.date)).map((row) => <p key={row.id}>{row.date} · {row.label} · {row.outgoing ? "−" : "+"}{money(row.amount)}</p>)}
        </details>
      </>}

      <details hidden={tab!=="sales"} className={panel}><summary className="cursor-pointer font-semibold">Compartir facturas pendientes</summary>
        <form className="grid gap-3" onSubmit={(event) => submit(event, "share", {}, undefined)}>
          <p className="text-sm text-slate-300">Comparte en privado. Quien tenga el enlace podrá leer las facturas pendientes del alcance seleccionado hasta el vencimiento o la revocación.</p>
          <div className={grid} key={`${range.from}:${range.to}`}>
            <Input label="Desde (vacío para todo el historial)" name="from" type="date" defaultValue={range.from} />
            <Input label="Hasta (vacío para incluir facturas nuevas)" name="to" type="date" defaultValue={range.to} />
            <Input label="Vencimiento del enlace" name="expires" type="date" required />
          </div>
          <button className={`${button} w-fit`} disabled={busy}>Crear enlace de solo lectura</button>
        </form>
        {shared && <label className="grid gap-1">Enlace privado<input className={field} readOnly value={shared} onFocus={(event) => event.target.select()} /></label>}
        {ledger.shares.filter((share) => !share.revoked).map((share) => <form key={share.id} className="flex flex-wrap items-center gap-3"
          onSubmit={(event) => submit(event, "revoke", { share_id: share.id }, () => setShared(""))}>
          <span>{share.from_date || "Inicio"} a {share.to_date || "Sin límite"} · vence {share.expires}</span>
          <button className={subtle} disabled={busy}>Revocar enlace</button>
        </form>)}
      </details>
    </>}
    {(busy || notice || error) && <div className={styles.status}>
      {busy && <p role="status">Procesando…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert" className="text-rose-300">{error}</p>}
    </div>}
  </main>;
}
