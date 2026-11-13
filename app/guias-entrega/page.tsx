"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  agroSender, emptyDestination, emptyItem, emptySender, emptyVehicle, extractionPrompt,
  guideHeaders, newGuide, parseGuideItems, populatedItems, validateGuide,
  type Destination, type Guide, type GuideItem, type Sender, type Vehicle,
} from "@/lib/delivery-guide";
import { loadQuoteImage } from "@/lib/pdf/quote-images";
import { generateDeliveryGuide } from "@/lib/pdf/deliveryGuidePdf";
import { supabaseBrowser } from "@/lib/supabase-browser";

type CustomSender = { id: `custom-${string}`; sender: Sender };
type Library = {
  guides: Guide[]; vehicles: Vehicle[]; destinations: Destination[]; agro: Sender; sequence: number;
  hst?: Sender;
  customSenders?: CustomSender[];
};
const storageKey = "hst.delivery-guides.v1";
const emptyLibrary: Library = { guides: [], vehicles: [], destinations: [], agro: agroSender, sequence: 0 };
const field = "w-full rounded-lg border border-slate-600 bg-slate-950 p-2 text-slate-100";
const button = "rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-100 disabled:opacity-50";
const primary = "rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
const card = "grid gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4";
const grid = "grid gap-3 sm:grid-cols-2";
const plateKey = (plate: string) => plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
const companyKey = (company: string) => company.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function Input({ label, value, onChange, type = "text", list }: {
  label: string; value: string; onChange: (value: string) => void; type?: string; list?: string;
}) {
  return <label className="grid gap-1 text-sm">{label}
    <input className={field} type={type} list={list} value={value} onChange={(event) => onChange(event.target.value)} />
  </label>;
}

export default function DeliveryGuidesPage() {
  const [library, setLibrary] = useState<Library>(emptyLibrary);
  const [hst, setHst] = useState<Sender>(emptySender);
  const [guide, setGuide] = useState(() => newGuide(emptySender));
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof parseGuideItems> | null>(null);
  const [working, setWorking] = useState(false);
  const dirty = useRef(false);
  const signing = useRef(false);
  const [signatureDraft, setSignatureDraft] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const saved: Library = JSON.parse(raw);
          setLibrary(saved);
          if (saved.hst && !dirty.current) setGuide(newGuide(saved.hst));
        }
      } catch { setError("No se pudo abrir el historial de este navegador."); }
      setReady(true);
      try {
        const { data, error } = await supabaseBrowser().from("quote_company_profile")
          .select("name,ruc,email,address,city,logo_url").eq("id", "default").maybeSingle();
        if (!active || error || !data) return;
        const profile = {
          name: data.name ?? "", ruc: data.ruc ?? "",
          email: (data.email ?? "").replace(/^correo\s*:\s*|^email\s*:\s*/i, ""),
          origin: [data.address, data.city].filter(Boolean).join(", "), logo: data.logo_url ?? "",
        };
        setHst(profile);
        if (!dirty.current) setGuide((current) => current.brand === "hst" && !current.sender.name ? { ...current, sender: profile } : current);
      } catch { /* Manual entry remains available. */ }
    }
    void initialize();
    return () => { active = false; };
  }, []);

  function patch(fields: Partial<Guide>) {
    dirty.current = true;
    setGuide((current) => ({ ...current, ...fields }));
  }

  function store(update: (current: Library) => Library) {
    setError("");
    try {
      const raw = localStorage.getItem(storageKey);
      const next = update(raw ? JSON.parse(raw) as Library : emptyLibrary);
      localStorage.setItem(storageKey, JSON.stringify(next));
      setLibrary(next);
      return next;
    } catch {
      setError("No se pudo guardar en este navegador. Descarga el PDF antes de cerrar.");
      return null;
    }
  }

  function selectSender(value: string) {
    if (value === "add") {
      patch({ brand: `custom-${crypto.randomUUID()}`, sender: { ...emptySender } });
      return;
    }
    const custom = library.customSenders?.find(({ id }) => id === value);
    if (custom) patch({ brand: custom.id, sender: { ...custom.sender } });
    else if (value === "hst") patch({ brand: "hst", sender: { ...(library.hst ?? hst) } });
    else if (value === "agrosilva") patch({ brand: "agrosilva", sender: { ...library.agro } });
  }

  function saveSenderProfile() {
    const { brand, sender } = guide;
    if (!sender.name.trim()) return;
    const profile = { ...sender, name: sender.name.trim() };
    if (store((current) => {
      if (brand === "hst") return { ...current, hst: profile };
      if (brand === "agrosilva") return { ...current, agro: profile };
      const customSenders = current.customSenders ?? [];
      const existing = customSenders.some(({ id }) => id === brand);
      return {
        ...current, customSenders: existing
          ? customSenders.map((entry) => entry.id === brand ? { id: brand, sender: profile } : entry)
          : [...customSenders, { id: brand, sender: profile }],
      };
    })) setMessage("Perfil del remitente guardado.");
  }

  function saveGuide() {
    const problem = validateGuide(guide);
    if (problem) { setError(problem); return; }
    const next = store((current) => {
      const sequence = guide.id ? current.sequence : current.sequence + 1;
      const saved = {
        ...guide, items: populatedItems(guide.items), id: guide.id || crypto.randomUUID(),
        number: guide.number || `GE-${String(sequence).padStart(6, "0")}`,
      };
      return { ...current, sequence, guides: [saved, ...current.guides.filter((row) => row.id !== saved.id)] };
    });
    if (next) {
      setGuide(next.guides[0]);
      dirty.current = false;
      setMessage("Guía guardada en este navegador.");
    }
  }

  function open(next: Guide) {
    if (dirty.current && !window.confirm("¿Descartar los cambios sin guardar?")) return;
    setGuide(next);
    dirty.current = Boolean(next.id);
    setSignatureDraft(false);
    canvas.current?.getContext("2d")?.clearRect(0, 0, 640, 180);
    setPasteOpen(false);
    setPaste("");
    setPreview(null);
    setMessage("");
    setError("");
  }

  async function download() {
    const problem = validateGuide(guide);
    if (problem) { setError(problem); return; }
    setWorking(true);
    setError("");
    try {
      const logo = guide.sender.logo ? await loadQuoteImage(guide.sender.logo) : null;
      generateDeliveryGuide(guide, logo).save(`${guide.number || "guia-borrador"}.pdf`);
    } catch {
      setError("No se pudo generar el PDF.");
    } finally { setWorking(false); }
  }

  function stroke(event: PointerEvent<HTMLCanvasElement>, start = false) {
    if (!start && !signing.current) return;
    const element = event.currentTarget;
    const context = element.getContext("2d");
    if (!context) return;
    const bounds = element.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * element.width / bounds.width;
    const y = (event.clientY - bounds.top) * element.height / bounds.height;
    if (start) {
      signing.current = true;
      element.setPointerCapture(event.pointerId);
      context.lineWidth = 3;
      context.lineCap = "round";
      context.strokeStyle = "#152235";
      context.beginPath();
      context.moveTo(x, y);
    }
    context.lineTo(x, y);
    context.stroke();
  }

  function finishSignature() {
    if (!signing.current || !canvas.current) return;
    signing.current = false;
    dirty.current = true;
    setSignatureDraft(true);
  }

  function setItem(index: number, key: keyof GuideItem, value: string) {
    patch({ items: guide.items.map((item, i) => i === index ? { ...item, [key]: value } : item) });
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-4 p-4 text-slate-100 sm:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><Link href="/" className="text-sm text-sky-300">Volver a contabilidad</Link>
          <h1 className="text-3xl font-bold">Guías de entrega</h1>
          <p className="text-sm text-slate-300">Constancia de entrega de mercadería. Sin autorización fiscal del SRI.</p>
        </div>
        <button type="button" className={button} onClick={() => open(newGuide(library.hst ?? hst))}>Nueva guía</button>
      </header>
      <details className={card}>
        <summary className="cursor-pointer font-semibold">Historial de este navegador ({library.guides.length})</summary>
        {library.guides.map((row) => <button key={row.id} type="button" className={button} onClick={() => open(row)}>
          {row.number} · {row.destination.company} · {row.deliveryDate}
        </button>)}
      </details>

      <section className={card}>
        <h2 className="text-lg font-semibold">Despacho y transporte {guide.number && `· ${guide.number}`}</h2>
        <div className={grid}>
          <label className="grid gap-1 text-sm">Perfil del remitente
            <select className={field} value={guide.brand} onChange={(event) => selectSender(event.target.value)}>
              <option value="hst">HST Global Store</option>
              <option value="agrosilva">Agrosilva</option>
              {library.customSenders?.map(({ id, sender }) => <option key={id} value={id}>{sender.name}</option>)}
              {guide.brand.startsWith("custom-") && !library.customSenders?.some(({ id }) => id === guide.brand) &&
                <option value={guide.brand}>{guide.sender.name || "Nuevo remitente"}</option>}
              <option value="add">Agregar otro remitente</option>
            </select>
          </label>
          {([["name", "Remitente"], ["ruc", "RUC del remitente"], ["email", "Correo del remitente"],
            ["origin", "Punto de partida"], ["logo", "URL del logo"]] as const).map(([key, label]) =>
            <Input key={key} label={label} value={guide.sender[key]} onChange={(value) => patch({ sender: { ...guide.sender, [key]: value } })} />)}
          <Input label="Fecha de salida" type="date" value={guide.dispatchDate} onChange={(dispatchDate) => patch({ dispatchDate })} />
          <Input label="Hora de salida" type="time" value={guide.dispatchTime} onChange={(dispatchTime) => patch({ dispatchTime })} />
          <Input label="Placa" list="guide-plates" value={guide.vehicle.plate} onChange={(plate) => {
            const match = library.vehicles.find((row) => plateKey(row.plate) === plateKey(plate));
            patch({ vehicle: match ? { ...match } : { ...(library.vehicles.some((row) => plateKey(row.plate) === plateKey(guide.vehicle.plate)) ? emptyVehicle : guide.vehicle), plate } });
          }} />
          <datalist id="guide-plates">{library.vehicles.map((row) => <option key={plateKey(row.plate)} value={row.plate} />)}</datalist>
          {([["vehicleType", "Tipo de vehículo"], ["color", "Color"], ["driver", "Conductor / transportista"],
            ["driverId", "Identificación del conductor"]] as const).map(([key, label]) =>
            <Input key={key} label={label} value={guide.vehicle[key]} onChange={(value) => patch({ vehicle: { ...guide.vehicle, [key]: value } })} />)}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={!ready || !guide.sender.name.trim()} onClick={saveSenderProfile}>
            Guardar perfil del remitente
          </button>
          <button type="button" className={button} onClick={() => patch({
            vehicle: { ...emptyVehicle, plate: guide.vehicle.plate, vehicleType: "Sedán", color: "Azul" },
          })}>Usar sedán azul</button>
          <button type="button" className={button} disabled={!ready || !plateKey(guide.vehicle.plate)} onClick={() => {
            const vehicle = { ...guide.vehicle, plate: guide.vehicle.plate.trim().toUpperCase() };
            if (store((current) => ({ ...current, vehicles: [vehicle, ...current.vehicles.filter((row) => plateKey(row.plate) !== plateKey(vehicle.plate))] }))) {
              patch({ vehicle }); setMessage("Vehículo registrado.");
            }
          }}>Registrar vehículo</button>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">Destino y entrega</h2>
        <div className={grid}>
          <Input label="Empresa destinataria" list="guide-destinations" value={guide.destination.company} onChange={(company) => {
            const match = library.destinations.find((row) => companyKey(row.company) === companyKey(company));
            patch({ destination: match ? { ...match } : { ...(library.destinations.some((row) => companyKey(row.company) === companyKey(guide.destination.company)) ? emptyDestination : guide.destination), company } });
          }} />
          <datalist id="guide-destinations">{library.destinations.map((row) => <option key={companyKey(row.company)} value={row.company} />)}</datalist>
          {([["ruc", "RUC del destinatario"], ["address", "Dirección de entrega"], ["receiver", "Recepción prevista (opcional)"]] as const)
            .map(([key, label]) => <Input key={key} label={label} value={guide.destination[key]} onChange={(value) => patch({ destination: { ...guide.destination, [key]: value } })} />)}
          <Input label="Fecha prevista" type="date" value={guide.deliveryDate} onChange={(deliveryDate) => patch({ deliveryDate })} />
          <Input label="Hora prevista" type="time" value={guide.deliveryTime} onChange={(deliveryTime) => patch({ deliveryTime })} />
          <Input label="Factura de referencia" value={guide.invoice} onChange={(invoice) => patch({ invoice })} />
          <Input label="Orden de compra (opcional)" value={guide.order} onChange={(order) => patch({ order })} />
          <Input label="Bultos (opcional)" value={guide.packages} onChange={(packages) => patch({ packages })} />
        </div>
        <div><button type="button" className={button} disabled={!ready || !guide.destination.company.trim() || !guide.destination.address.trim()} onClick={() => {
          const destination = { ...guide.destination, company: guide.destination.company.trim() };
          if (store((current) => ({ ...current, destinations: [destination, ...current.destinations.filter((row) => companyKey(row.company) !== companyKey(destination.company))] }))) setMessage("Destino guardado.");
        }}>Guardar destino</button></div>
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">Mercadería entregada</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} onClick={() => patch({ items: [...guide.items, { ...emptyItem }] })}>Agregar línea</button>
          <button type="button" className={button} aria-expanded={pasteOpen} onClick={() => setPasteOpen(!pasteOpen)}>Pegar productos</button>
        </div>
        {pasteOpen && <div className="grid gap-2 rounded-lg border border-slate-700 p-3">
          <p className="text-sm">Sube la factura a ChatGPT con este prompt y pega aquí el resultado TSV.</p>
          <details><summary className="cursor-pointer">Ver prompt</summary><textarea className={field} readOnly rows={5} value={extractionPrompt} /></details>
          <div><button type="button" className={button} onClick={async () => {
            try { await navigator.clipboard.writeText(extractionPrompt); setMessage("Prompt copiado."); }
            catch { setError("Abre «Ver prompt» y cópialo manualmente."); }
          }}>Copiar prompt</button></div>
          <label className="grid gap-1 text-sm">Productos en TSV<textarea className={field} rows={4} value={paste} onChange={(event) => { setPaste(event.target.value); setPreview(null); }} /></label>
          <div><button type="button" className={button} onClick={() => setPreview(parseGuideItems(paste))}>Previsualizar</button></div>
          {preview?.errors.length ? <ul role="alert" className="list-disc pl-5 text-red-300">{preview.errors.map((entry, index) => <li key={index}>{entry}</li>)}</ul> : null}
          {preview && preview.items.length > 0 && <>
            <ol className="max-h-48 list-decimal overflow-auto pl-6">{preview.items.map((item, index) => <li key={index}>
              {[item.code, item.product, item.details, item.quantity, item.presentation].filter(Boolean).join(" · ")}
            </li>)}</ol>
            <div><button type="button" className={primary} disabled={preview.errors.length > 0} onClick={() => {
              patch({ items: [...populatedItems(guide.items), ...preview.items] });
              setPreview(null); setPaste(""); setPasteOpen(false);
            }}>Agregar {preview.items.length} productos</button></div>
          </>}
        </div>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead><tr>{guideHeaders.map((header) => <th className="px-1" key={header}>{header}</th>)}<th /></tr></thead>
            <tbody>{guide.items.map((item, index) => <tr key={index}>
              {(["code", "product", "details", "quantity", "presentation"] as const).map((key, col) => <td className="p-1" key={key}>
                <input aria-label={`${guideHeaders[col]}, línea ${index + 1}`} className={field} value={item[key]} onChange={(event) => setItem(index, key, event.target.value)} />
              </td>)}
              <td><button type="button" className={button} aria-label={`Quitar línea ${index + 1}`} onClick={() => patch({ items: guide.items.filter((_, i) => i !== index) })}>Quitar</button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">Constancia de recepción</h2>
        <div className={grid}>
          <Input label="Recibido por" value={guide.receivedBy} onChange={(receivedBy) => patch({ receivedBy })} />
          <Input label="Fecha real de recepción" type="date" value={guide.receivedDate} onChange={(receivedDate) => patch({ receivedDate })} />
          <Input label="Hora real de recepción" type="time" value={guide.receivedTime} onChange={(receivedTime) => patch({ receivedTime })} />
          <label className="grid gap-1 text-sm">Estado de recepción<select className={field} value={guide.condition} onChange={(event) => patch({ condition: event.target.value as Guide["condition"] })}>
            <option value="">Pendiente de indicar</option><option value="conforme">Recibido conforme</option><option value="observaciones">Recibido con observaciones</option>
          </select></label>
        </div>
        <label className="grid gap-1 text-sm">Observaciones<textarea className={field} rows={3} value={guide.observations} onChange={(event) => patch({ observations: event.target.value })} /></label>
        <div className="grid gap-2">
          <span className="text-sm">Firma o sello</span>
          {guide.signature ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="h-28 w-full max-w-lg rounded-lg bg-white object-contain" src={guide.signature} alt="Firma de recepción" />
          ) : <canvas ref={canvas} width={640} height={180} aria-label="Área para firmar" className="h-28 w-full max-w-lg touch-none rounded-lg bg-white"
            onPointerDown={(event) => stroke(event, true)} onPointerMove={(event) => stroke(event)} onPointerUp={finishSignature} onPointerCancel={finishSignature} />}
          {signatureDraft && !guide.signature && <div className="flex flex-wrap gap-2">
            <button type="button" className={button} onClick={() => {
              if (canvas.current) patch({ signature: canvas.current.toDataURL("image/png") });
              setSignatureDraft(false);
            }}>Usar firma</button>
            <button type="button" className={button} onClick={() => {
              canvas.current?.getContext("2d")?.clearRect(0, 0, 640, 180);
              setSignatureDraft(false);
            }}>Limpiar trazos</button>
          </div>}
          {guide.signature && <div><button type="button" className={button} onClick={() => patch({ signature: "" })}>Borrar firma</button></div>}
        </div>
      </section>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={!ready || working || signatureDraft} onClick={saveGuide}>Guardar guía</button>
        <button type="button" className={button} disabled={working || signatureDraft} onClick={download}>Descargar PDF</button>
      </div>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" className="text-red-300">{error}</p>}
    </main>
  );
}
