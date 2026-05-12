"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabaseBrowser } from "@/lib/supabase-browser";
type Item = {
  qty: string;
  description: string;
  unit: string;
  incl_vat: boolean;
  variant_id?: string;
  sku?: string;
  image_url?: string;
};
type Customer = {
  id: string;
  document_type: string | null;
  document_number: string | null;
  display_name: string | null;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};
type InventoryEntry = {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  product_sku: string | null;
  category_name: string | null;
  description: string | null;
  sale_price: number;
  stock: number;
  image_url: string | null;
  attributes: Record<string, string>;
};

const IVA_DEFAULT = 0.15;

const COMPANY = {
  name: "HST GLOBAL STORE",
  ruc: "0962974689001",
  address: "Dirección: Quevedo, calle guatemala y chile",
  city: "Ecuador",
  phone: "WhatsApp: 0982124443",
  email: "Email: ventas@hstglobalstore.com",
  website: "",
  logoPath: "/logo.png",
  sealPath: "/seal.png",
  signPath: "/firma.png",
  accentBlue: [16, 95, 255] as [number, number, number],
};

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizeNumericInput(value: string) {
  return value.replace(",", ".");
}

function decimalValue(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(normalizeNumericInput(String(value ?? "").trim()));
  return Number.isFinite(parsed) ? parsed : 0;
}

function integerValue(value: string | number | null | undefined, fallback = 0) {
  if (String(value ?? "").trim() === "") return fallback;
  const parsed = Number.parseInt(normalizeNumericInput(String(value ?? "").trim()), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function catalogImage(attributes: Record<string, string> | null | undefined) {
  const value = attributes?.imagen || attributes?.Imagen || attributes?.image_url;
  return typeof value === "string" && value.trim() ? value : null;
}

function catalogAttributeSummary(attributes: Record<string, string> | null | undefined) {
  return Object.entries(attributes || {})
    .filter(([key, value]) => value && !["imagen", "Imagen", "image_url", "producto_origen_id", "variante_origen_id", "slug_web"].includes(key))
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
}

function inferDocumentType(value: string) {
  const clean = value.replace(/\D/g, "");
  if (clean.length === 13) return "RUC";
  if (clean.length === 10) return "CEDULA";
  if (clean.length > 0) return "PASAPORTE";
  return null;
}

function genQuoteNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rnd = String(Math.floor(Math.random() * 900 + 100));
  return `PRO-${y}${m}${day}-${rnd}`;
}

async function urlToDataURL(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export default function CotizacionPRO() {
  const [tab, setTab] = useState<"nueva" | "historial">("nueva");

  const [quoteId, setQuoteId] = useState<string | null>(null);

  const [quoteNo, setQuoteNo] = useState(genQuoteNo());
  const [dateStr, setDateStr] = useState(new Date().toISOString().slice(0, 10));
  const [validDays, setValidDays] = useState(15);

  const [clientName, setClientName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [saveCustomerEnabled, setSaveCustomerEnabled] = useState(true);
  const [customerSyncStatus, setCustomerSyncStatus] = useState("");
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerTableReady, setCustomerTableReady] = useState(true);

  const [ivaRate, setIvaRate] = useState(IVA_DEFAULT);
  const [discount, setDiscount] = useState("");
  const [delivery, setDelivery] = useState("");
  const [paid, setPaid] = useState("");

  const [terms, setTerms] = useState(
    [
      "1.- Duración de la oferta: 15 días.",
      "2.- Anticipo del 50% antes de la producción / ejecución del servicio.",
      "3.- Entregado el producto o ejecutado el servicio no existen devoluciones.",
      "4.- Precios sujetos a disponibilidad y confirmación.",
      "5.- Cambios fuera de alcance se cotizan adicionalmente.",
    ].join("\n")
  );

  const [notes, setNotes] = useState("Gracias por preferirnos.");

  const [items, setItems] = useState<Item[]>([
    { qty: "1", description: "", unit: "", incl_vat: true },
  ]);
  const [inventoryCatalog, setInventoryCatalog] = useState<InventoryEntry[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryReady, setInventoryReady] = useState(true);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogLineIndex, setCatalogLineIndex] = useState<number | null>(null);

  // historial
  const [list, setList] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loadingList, setLoadingList] = useState(false);

  useEffect(() => {
    let active = true;
    const sb = supabaseBrowser();
    const value = customerQuery.trim();

    if (!value) {
      setCustomerResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingCustomers(true);
      const { data, error } = await sb
        .from("customers")
        .select("id,document_type,document_number,display_name,legal_name,email,phone,address")
        .or(
          `display_name.ilike.%${value}%,legal_name.ilike.%${value}%,document_number.ilike.%${value}%,email.ilike.%${value}%,phone.ilike.%${value}%`,
        )
        .limit(8);

      if (!active) return;

      if (error) {
        setCustomerTableReady(false);
        setCustomerResults([]);
      } else {
        setCustomerTableReady(true);
        setCustomerResults((data as Customer[]) || []);
      }
      setLoadingCustomers(false);
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [customerQuery]);

  useEffect(() => {
    let active = true;
    const sb = supabaseBrowser();
    const value = clientId.trim();

    if (!value || value.length < 6 || !customerTableReady) return;

    const timer = setTimeout(async () => {
      const { data, error } = await sb
        .from("customers")
        .select("id,document_type,document_number,display_name,legal_name,email,phone,address")
        .eq("document_number", value)
        .limit(1)
        .maybeSingle();

      if (!active || error || !data) return;
      const customer = data as Customer;
      if (selectedCustomer?.id === customer.id) return;

      applyCustomer(customer, {
        setClientName,
        setClientId,
        setClientPhone,
        setClientEmail,
        setClientAddress,
        setCustomerQuery,
        setCustomerResults,
        setSelectedCustomer,
      });
    }, 260);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [clientId, customerTableReady, selectedCustomer]);

  const totals = useMemo(() => {
    const lines = items.map((it) => {
      const qty = decimalValue(it.qty);
      const unit = decimalValue(it.unit);
      const sub = qty * unit;
      const vat = it.incl_vat ? sub * ivaRate : 0;
      const unitWithVat = it.incl_vat ? unit * (1 + ivaRate) : unit;
      const total = sub + vat;
      return { ...it, qty, unit, sub, vat, unitWithVat, total };
    });

    const subtotal = lines.reduce((a, b) => a + b.sub, 0);
    const iva = lines.reduce((a, b) => a + b.vat, 0);

    const disc = Math.max(0, decimalValue(discount));
    const del = Math.max(0, decimalValue(delivery));
    const neto = Math.max(0, subtotal - disc);
    const totalFinal = Math.max(0, neto + iva + del);

    const paidVal = Math.max(0, decimalValue(paid));
    const saldo = Math.max(0, totalFinal - paidVal);

    return { lines, subtotal, iva, disc, neto, del, totalFinal, paidVal, saldo };
  }, [items, ivaRate, discount, delivery, paid]);

  const filteredCatalog = useMemo(() => {
    const value = catalogQuery.trim().toLowerCase();
    if (!value) return inventoryCatalog.slice(0, 18);
    return inventoryCatalog
      .filter((entry) =>
        [
          entry.product_name,
          entry.variant_name,
          entry.product_sku,
          entry.category_name,
          entry.description,
          catalogAttributeSummary(entry.attributes),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(value),
      )
      .slice(0, 24);
  }, [catalogQuery, inventoryCatalog]);

  const loadInventoryCatalog = async () => {
    if (inventoryLoading) return;
    setInventoryLoading(true);
    try {
      const sb = supabaseBrowser();
      const [productsRes, variantsRes, salesRes, stockRes, categoriesRes] = await Promise.all([
        sb.from("inv_products").select("id,name,sku,description,category_id,active").eq("active", true).order("name"),
        sb.from("inv_variants").select("id,product_id,name,attributes,active").eq("active", true).order("name"),
        sb.from("inv_variant_sales").select("variant_id,sale_price"),
        sb.from("inv_variant_stock").select("variant_id,qty"),
        sb.from("inv_categories").select("id,name"),
      ]);

      const firstError = [productsRes.error, variantsRes.error, salesRes.error, stockRes.error, categoriesRes.error].find(Boolean);
      if (firstError) throw firstError;

      const productMap = new Map((productsRes.data || []).map((row) => [row.id, row]));
      const saleMap = new Map((salesRes.data || []).map((row) => [row.variant_id, Number(row.sale_price || 0)]));
      const stockMap = new Map((stockRes.data || []).map((row) => [row.variant_id, Number(row.qty || 0)]));
      const categoryMap = new Map((categoriesRes.data || []).map((row) => [row.id, row.name]));

      const nextCatalog: InventoryEntry[] = (variantsRes.data || [])
        .map((variant) => {
          const product = productMap.get(variant.product_id);
          if (!product) return null;
          const attributes = (variant.attributes || {}) as Record<string, string>;
          return {
            variant_id: variant.id,
            product_id: product.id,
            product_name: product.name,
            variant_name: variant.name,
            product_sku: product.sku,
            category_name: product.category_id ? (categoryMap.get(product.category_id) ?? null) : null,
            description: product.description,
            sale_price: Number(saleMap.get(variant.id) ?? 0),
            stock: Number(stockMap.get(variant.id) ?? 0),
            image_url: catalogImage(attributes),
            attributes,
          };
        })
        .filter((entry): entry is InventoryEntry => Boolean(entry));

      setInventoryCatalog(nextCatalog);
      setInventoryReady(true);
    } catch {
      setInventoryReady(false);
      setInventoryCatalog([]);
    } finally {
      setInventoryLoading(false);
    }
  };

  const openCatalogForLine = async (idx: number) => {
    setCatalogLineIndex(idx);
    if (!inventoryCatalog.length) {
      await loadInventoryCatalog();
    }
  };

  const applyCatalogToLine = (entry: InventoryEntry) => {
    if (catalogLineIndex == null) return;
    updateItem(catalogLineIndex, {
      description: entry.variant_name,
      unit: entry.sale_price ? entry.sale_price.toFixed(2) : "",
      incl_vat: true,
      variant_id: entry.variant_id,
      sku: entry.product_sku || undefined,
      image_url: entry.image_url || undefined,
    });
    setCatalogLineIndex(null);
    setCatalogQuery("");
  };

  const exportingRef = useRef(false);

  const buildPDF = async () => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 12;

    const logo = await urlToDataURL(COMPANY.logoPath);
    const seal = await urlToDataURL(COMPANY.sealPath);
    const sign = await urlToDataURL(COMPANY.signPath);

    doc.setFillColor(...COMPANY.accentBlue);
    doc.rect(0, 0, pageW, 8, "F");

    const y = 18;

    if (logo) doc.addImage(logo, "PNG", margin, y - 8, 32, 32);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("COTIZACIÓN / PROFORMA", margin + (logo ? 38 : 0), y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const companyLines = [
      COMPANY.name,
      COMPANY.ruc,
      COMPANY.address,
      COMPANY.city,
      COMPANY.phone,
      COMPANY.email,
      COMPANY.website,
    ].filter(Boolean);

    companyLines.forEach((l, i) => doc.text(String(l), margin + (logo ? 38 : 0), y + 6 + i * 4));

    const boxW = 72;
    const boxX = pageW - margin - boxW;
    const boxY = 14;
    doc.setDrawColor(30);
    doc.setLineWidth(0.3);
    doc.rect(boxX, boxY, boxW, 28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("DATOS", boxX + 4, boxY + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`N°: ${quoteNo}`, boxX + 4, boxY + 12);
    doc.text(`Fecha: ${dateStr}`, boxX + 4, boxY + 17);
    doc.text(`Validez: ${validDays} días`, boxX + 4, boxY + 22);

    const clientY = 52;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("DATOS DEL CLIENTE", margin, clientY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.rect(margin, clientY + 3, pageW - margin * 2, 22);

    const leftX = margin + 3;
    doc.text(`Nombre: ${clientName || "-"}`, leftX, clientY + 9);
    doc.text(`CI/RUC: ${clientId || "-"}`, pageW / 2, clientY + 9);
    doc.text(`Teléfono: ${clientPhone || "-"}`, leftX, clientY + 14);
    doc.text(`Email: ${clientEmail || "-"}`, pageW / 2, clientY + 14);
    doc.text(`Dirección: ${clientAddress || "-"}`, leftX, clientY + 19);

    const tableY = clientY + 30;

    autoTable(doc, {
      startY: tableY,
      head: [["Cant.", "Descripción", "P. Unitario", "P.U. con IVA", "Total"]],
      body: totals.lines.map((l) => [
        String(l.qty),
        l.description || "-",
        `$ ${money(l.unit)}`,
        `$ ${money(l.unitWithVat)}`,
        `$ ${money(l.total)}`,
      ]),
      styles: { font: "helvetica", fontSize: 9, cellPadding: 2.2, lineWidth: 0.1 },
      headStyles: {
        fillColor: [245, 248, 255],
        textColor: [10, 20, 40],
        fontStyle: "bold",
        lineWidth: 0.1,
      },
      columnStyles: {
        0: { cellWidth: 14, halign: "center" },
        1: { cellWidth: 88 },
        2: { cellWidth: 26, halign: "right" },
        3: { cellWidth: 28, halign: "right" },
        4: { cellWidth: 28, halign: "right" },
      },
    });

    const afterTableY = ((doc as any).lastAutoTable?.finalY ?? tableY + 40) + 6;

    const totalsBoxW = 82;
    const totalsBoxX = pageW - margin - totalsBoxW;
    const totalsBoxY = afterTableY;

    doc.rect(totalsBoxX, totalsBoxY, totalsBoxW, 48);

    const tXLabel = totalsBoxX + 4;
    const tXVal = totalsBoxX + totalsBoxW - 4;

    const line = (label: string, value: string, yy: number, bold = false) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.text(label, tXLabel, yy);
      doc.text(value, tXVal, yy, { align: "right" });
    };

    doc.setFontSize(9);
    let ty = totalsBoxY + 6;
    line("Total parcial:", `$ ${money(totals.subtotal)}`, ty);
    ty += 5;
    line("Descuento:", `- $ ${money(totals.disc)}`, ty);
    ty += 5;
    line("Neto:", `$ ${money(totals.neto)}`, ty, true);
    ty += 5;
    line(`IVA (${Math.round(ivaRate * 100)}%):`, `$ ${money(totals.iva)}`, ty);
    ty += 5;
    line("Envío / Delivery:", `$ ${money(totals.del)}`, ty);
    ty += 5;
    line("TOTAL FINAL:", `$ ${money(totals.totalFinal)}`, ty, true);
    ty += 6;
    line("Pagado:", `$ ${money(totals.paidVal)}`, ty);
    ty += 5;
    line("Saldo:", `$ ${money(totals.saldo)}`, ty, true);

    let textY = totalsBoxY + 54;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("NOTAS", margin, textY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(notes || "-", pageW - margin * 2), margin, textY + 5);

    textY += 18;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("TÉRMINOS Y CONDICIONES", margin, textY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize((terms || "-").trim(), pageW - margin * 2), margin, textY + 5);

    const footerY = 270;
    if (sign) doc.addImage(sign, "PNG", pageW - margin - 55, footerY - 18, 50, 18);
    if (seal) doc.addImage(seal, "PNG", pageW - margin - 28, footerY - 8, 24, 24);

    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`${COMPANY.name} — Documento generado desde HST Contabilidad`, margin, 289);
    doc.setTextColor(0);

    return doc;
  };

  const downloadPDF = async () => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    try {
      const doc = await buildPDF();
      doc.save(`${quoteNo}.pdf`);
    } finally {
      exportingRef.current = false;
    }
  };

  const uploadPDFandGetUrl = async (): Promise<string | null> => {
    const sb = supabaseBrowser();
    const doc = await buildPDF();
    const blob = doc.output("blob") as unknown as Blob;
    const path = `quotes/${quoteNo}.pdf`;

    const { error } = await sb.storage.from("docs").upload(path, blob, {
      upsert: true,
      contentType: "application/pdf",
    });

    if (error) {
      alert("No se pudo subir el PDF a Storage: " + error.message);
      return null;
    }

    const { data } = sb.storage.from("docs").getPublicUrl(path);
    return data.publicUrl || null;
  };

  const saveCustomerFromQuote = async (manual = false) => {
    const displayName = clientName.trim();
    if (!displayName) {
      if (manual) setCustomerSyncStatus("Escribe al menos el nombre del cliente.");
      return;
    }

    try {
      const sb = supabaseBrowser();
      const documentNumber = clientId.trim();
      const email = clientEmail.trim().toLowerCase();
      const phone = clientPhone.trim();
      const payload = {
        document_type: documentNumber ? inferDocumentType(documentNumber) : null,
        document_number: documentNumber || null,
        display_name: displayName,
        legal_name: displayName,
        email: email || null,
        phone: phone || null,
        address: clientAddress.trim() || null,
        active: true,
      };

      const syncSelected = async (id: string) => {
        const customer: Customer = {
          id,
          document_type: payload.document_type,
          document_number: payload.document_number,
          display_name: payload.display_name,
          legal_name: payload.legal_name,
          email: payload.email,
          phone: payload.phone,
          address: payload.address,
        };
        setSelectedCustomer(customer);
        setCustomerQuery(customer.display_name || customer.legal_name || "");
        setCustomerSyncStatus(manual ? "Cliente guardado y listo para futuras cotizaciones." : "Cliente actualizado automaticamente.");
      };

      if (selectedCustomer?.id) {
        const { error } = await sb.from("customers").update(payload).eq("id", selectedCustomer.id);
        if (!error) {
          await syncSelected(selectedCustomer.id);
          return;
        }
      }

      if (documentNumber) {
        const { data: byDocument } = await sb
          .from("customers")
          .select("id")
          .eq("document_number", documentNumber)
          .limit(1)
          .maybeSingle();

        if (byDocument?.id) {
          await sb.from("customers").update(payload).eq("id", byDocument.id);
          await syncSelected(byDocument.id);
          return;
        }
      }

      if (email) {
        const { data: byEmail } = await sb
          .from("customers")
          .select("id")
          .eq("email", email)
          .limit(1)
          .maybeSingle();

        if (byEmail?.id) {
          await sb.from("customers").update(payload).eq("id", byEmail.id);
          await syncSelected(byEmail.id);
          return;
        }
      }

      if (phone) {
        const { data: byPhone } = await sb
          .from("customers")
          .select("id")
          .eq("phone", phone)
          .limit(1)
          .maybeSingle();

        if (byPhone?.id) {
          await sb.from("customers").update(payload).eq("id", byPhone.id);
          await syncSelected(byPhone.id);
          return;
        }
      }

      const { data: byName } = await sb
        .from("customers")
        .select("id")
        .eq("display_name", displayName)
        .limit(1)
        .maybeSingle();

      if (byName?.id) {
        await sb.from("customers").update(payload).eq("id", byName.id);
        await syncSelected(byName.id);
        return;
      }

      const { data: created } = await sb.from("customers").insert(payload).select("id").single();
      if (created?.id) {
        await syncSelected(created.id);
      }
    } catch {
      // No frenamos el guardado de la cotizacion si guardar el cliente falla.
      if (manual) setCustomerSyncStatus("No pude guardar el cliente en este momento.");
    }
  };

  const saveQuote = async (alsoUploadPdf: boolean) => {
    let pdf_url: string | null = null;
    if (alsoUploadPdf) pdf_url = await uploadPDFandGetUrl();

    const payload = {
      quote: {
        quote_no: quoteNo,
        date: dateStr,
        valid_days: integerValue(validDays, 15),
        client_name: clientName,
        client_id: clientId,
        client_phone: clientPhone,
        client_email: clientEmail,
        client_address: clientAddress,
        iva_rate: ivaRate,
        discount: decimalValue(discount),
        delivery: decimalValue(delivery),
        paid: decimalValue(paid),
        terms,
        notes,
        pdf_url: pdf_url ?? undefined,
      },
      items: items.map((it) => ({
        qty: decimalValue(it.qty),
        description: it.description,
        unit: decimalValue(it.unit),
        incl_vat: it.incl_vat,
      })),
    };

    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) return alert(json.error || "Error guardando cotización");

    const id = json?.data?.quote?.id ?? null;
    setQuoteId(id);
    if (saveCustomerEnabled) {
      await saveCustomerFromQuote();
    } else {
      setCustomerSyncStatus("Cotizacion guardada sin actualizar la base de clientes.");
    }

    alert(alsoUploadPdf ? "✅ Guardado + PDF subido (link listo para compartir)." : "✅ Cotización guardada.");
  };

  const loadList = async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/quotes");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");

      const arr =
        Array.isArray(json?.data) ? json.data : Array.isArray(json?.data?.quotes) ? json.data.quotes : [];

      setList(arr);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoadingList(false);
    }
  };

  const openQuote = async (id: string) => {
    const res = await fetch(`/api/quotes/${id}`);
    const json = await res.json();
    if (!res.ok) return alert(json.error || "Error cargando");

    const q = json.data.quote;
    const its = json.data.items as any[];

    setQuoteId(q.id);
    setQuoteNo(q.quote_no);
    setDateStr(String(q.date));
    setValidDays(Number(q.valid_days ?? 15));

    setClientName(q.client_name || "");
    setClientId(q.client_id || "");
    setClientPhone(q.client_phone || "");
    setClientEmail(q.client_email || "");
    setClientAddress(q.client_address || "");
    setSelectedCustomer(null);
    setCustomerQuery(q.client_name || q.client_id || "");
    setCustomerResults([]);

    setIvaRate(Number(q.iva_rate ?? IVA_DEFAULT));
    setDiscount(q.discount ? String(q.discount) : "");
    setDelivery(q.delivery ? String(q.delivery) : "");
    setPaid(q.paid ? String(q.paid) : "");

    setTerms(q.terms || "");
    setNotes(q.notes || "");

    setItems(
      (its || []).map((x) => ({
        qty: x.qty != null ? String(x.qty) : "1",
        description: String(x.description ?? ""),
        unit: x.unit != null && Number(x.unit) !== 0 ? String(x.unit) : "",
        incl_vat: Boolean(x.incl_vat ?? true),
      }))
    );

    setTab("nueva");
  };

  const duplicateAsNew = () => {
    setQuoteId(null);
    setQuoteNo(genQuoteNo());
    alert("✅ Duplicado listo. Guarda como nueva cotización.");
  };

  const deleteQuote = async (id: string) => {
    if (!confirm("¿Eliminar esta cotización?")) return;
    const res = await fetch(`/api/quotes/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) return alert(json.error || "Error eliminando");
    await loadList();
  };

  const convertToInvoice = async () => {
    if (!quoteId) return alert("Primero guarda la cotización.");
    const res = await fetch(`/api/quotes/${quoteId}/convert`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) return alert(json.error || "Error convirtiendo");
    alert(`✅ Convertido a FACTURA ${json.data.invoice_no}`);
  };

  const whatsappShare = async () => {
    let link: string | null = null;

    if (quoteId) {
      const r = await fetch(`/api/quotes/${quoteId}`);
      const j = await r.json();
      if (r.ok) link = j?.data?.quote?.pdf_url || null;
    }
    if (!link) link = await uploadPDFandGetUrl();

    const msg = [
      `*${COMPANY.name}*`,
      `Cotización: *${quoteNo}*`,
      `Cliente: ${clientName || "-"}`,
      `Total: $ ${money(totals.totalFinal)}`,
      link ? `PDF: ${link}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const emailSend = async () => {
    if (!quoteId) return alert("Primero guarda la cotización.");
    if (!clientEmail?.trim()) return alert("Falta el email del cliente.");

    let link: string | null = null;

    try {
      const r = await fetch(`/api/quotes/${quoteId}`);
      const j = await r.json();
      if (r.ok) link = j?.data?.quote?.pdf_url || null;
    } catch {}

    if (!link) link = await uploadPDFandGetUrl();

    const r = await fetch(`/api/quotes/${quoteId}/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: clientEmail, pdf_url: link }),
    });

    const j = await r.json();

    if (!r.ok) return alert(j.error || "Error enviando email");

    alert("✅ Cotización enviada al correo del cliente.");
  };

  const removeItem = (idx: number) => setItems((p) => p.filter((_, i) => i !== idx));
  const updateItem = (idx: number, patch: Partial<Item>) =>
    setItems((p) => p.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (x) =>
        String(x.quote_no).toLowerCase().includes(s) ||
        String(x.client_name || "").toLowerCase().includes(s)
    );
  }, [list, search]);

  return (
    <div style={{ padding: 18, maxWidth: 1200, margin: "0 auto" }} className="mobile-quotes-page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }} className="mobile-quotes-hero">
        <h1 style={{ fontSize: 38, margin: 0, color: "#f8fafc" }}>Cotizaciones</h1>

        <div style={{ display: "flex", gap: 8 }} className="mobile-quotes-tabs">
          <button onClick={() => setTab("nueva")} style={tabBtn(tab === "nueva")}>
            Nueva
          </button>
          <button
            onClick={() => {
              setTab("historial");
              loadList();
            }}
            style={tabBtn(tab === "historial")}
          >
            Historial
          </button>
        </div>
      </div>

      <div style={{ color: "#9aa0a6", marginTop: 6 }}>
        Usa tu identidad visual con logo, firma y sello para entregar cotizaciones limpias y profesionales.
      </div>

      {tab === "historial" ? (
        <div style={{ ...card(), marginTop: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }} className="mobile-quotes-toolbar">
            <div style={{ fontWeight: 900 }}>Historial de cotizaciones</div>
            <button onClick={loadList} style={btn()}>
              ↻ Actualizar
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 10 }} className="mobile-quotes-searchbar">
            <input
              style={input()}
              placeholder="Buscar por N° o cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }} className="mobile-quotes-desktop-table">
              <thead>
                <tr style={{ background: "#0b1220" }}>
                  <Th>N°</Th>
                  <Th>Fecha</Th>
                  <Th>Cliente</Th>
                  <Th>PDF</Th>
                  <Th style={{ textAlign: "right" }}></Th>
                </tr>
              </thead>

              <tbody>
                {loadingList ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 14, color: "#9aa0a6" }}>
                      Cargando...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 14, color: "#9aa0a6" }}>
                      Sin resultados.
                    </td>
                  </tr>
                ) : (
                  filtered.map((q) => (
                    <tr key={q.id} style={{ borderBottom: "1px solid #1f2a44" }}>
                      <Td>{q.quote_no}</Td>
                      <Td>{String(q.date || "")}</Td>
                      <Td>{q.client_name || "-"}</Td>
                      <Td>
                        {q.pdf_url ? (
                          <a href={q.pdf_url} target="_blank" rel="noreferrer" style={{ color: "#7aa7ff" }}>
                            Abrir
                          </a>
                        ) : (
                          "-"
                        )}
                      </Td>
                      <Td style={{ textAlign: "right" }}>
                        <button onClick={() => openQuote(q.id)} style={btn()}>
                          Abrir
                        </button>{" "}
                        <button onClick={() => deleteQuote(q.id)} style={dangerBtn()}>
                          Eliminar
                        </button>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="mobile-quotes-mobile-list" style={{ display: "none", marginTop: 10 }}>
              {loadingList ? (
                <div style={{ color: "#9aa0a6" }}>Cargando...</div>
              ) : filtered.length === 0 ? (
                <div style={{ color: "#9aa0a6" }}>Sin resultados.</div>
              ) : (
                filtered.map((q) => (
                  <div key={q.id} style={mobileCard()}>
                    <div style={mobileCardTitleRow}>
                      <div style={mobileCardTitle}>{q.client_name || "-"}</div>
                      <div style={mobileCardBadge}>{q.quote_no}</div>
                    </div>
                    <div style={mobileCardMeta}>{String(q.date || "")}</div>
                    <div style={mobileCardActions}>
                      {q.pdf_url ? (
                        <a href={q.pdf_url} target="_blank" rel="noreferrer" style={mobileLinkBtn()}>
                          Abrir PDF
                        </a>
                      ) : null}
                      <button onClick={() => openQuote(q.id)} style={btn()}>
                        Abrir
                      </button>
                      <button onClick={() => deleteQuote(q.id)} style={dangerBtn()}>
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr", gap: 10, marginTop: 14 }} className="mobile-quotes-top-grid">
            <div style={card()}>
              <label style={label()}>N° Cotización</label>
              <input style={input()} value={quoteNo} onChange={(e) => setQuoteNo(e.target.value)} />
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }} className="mobile-quotes-buttons">
                <button
                  onClick={() => {
                    setQuoteId(null);
                    setQuoteNo(genQuoteNo());
                  }}
                  style={btn()}
                >
                  Nuevo N°
                </button>
                <button onClick={duplicateAsNew} style={btn()}>
                  Duplicar
                </button>
              </div>
            </div>

            <div style={card()}>
              <label style={label()}>Fecha</label>
              <input style={input()} type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
            </div>

            <div style={card()}>
              <label style={label()}>Validez (días)</label>
              <input
                style={input()}
                type="number"
                min={1}
                value={validDays}
                onChange={(e) => setValidDays(Number(e.target.value))}
              />
            </div>

            <div style={card()}>
              <label style={label()}>IVA (%)</label>
              <input
                style={input()}
                type="number"
                min={0}
                step="0.01"
                value={(ivaRate * 100).toFixed(2)}
                onChange={(e) => setIvaRate(Math.max(0, Number(e.target.value) / 100))}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 10, marginTop: 12 }} className="mobile-quotes-main-grid">
            <div style={card()}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Datos del cliente</div>
              <div style={{ marginBottom: 12 }}>
                <label style={label()}>Buscar cliente guardado</label>
                <input
                  style={input()}
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  placeholder="Nombre, cedula o RUC"
                />
                {loadingCustomers ? (
                  <div style={{ color: "#9aa0a6", marginTop: 6, fontSize: 12 }}>Buscando clientes...</div>
                ) : null}
                {!customerTableReady ? (
                  <div style={{ color: "#f0c36b", marginTop: 6, fontSize: 12 }}>
                    La tabla `customers` todavia no esta lista en Supabase.
                  </div>
                ) : null}
                {selectedCustomer ? (
                  <div
                    style={{
                      marginTop: 8,
                      padding: 12,
                      borderRadius: 14,
                      border: "1px solid rgba(96, 165, 250, 0.24)",
                      background: "rgba(59, 130, 246, 0.12)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 900, color: "#dbeafe" }}>
                        Cliente cargado automaticamente
                      </div>
                      <div style={{ color: "#bfdbfe", fontSize: 12 }}>
                        {[
                          selectedCustomer.display_name || selectedCustomer.legal_name || "Sin nombre",
                          selectedCustomer.document_number,
                          selectedCustomer.email,
                        ]
                          .filter(Boolean)
                          .join(" - ")}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomer(null);
                        setCustomerQuery("");
                        setCustomerResults([]);
                      }}
                      style={btn()}
                    >
                      Limpiar seleccion
                    </button>
                  </div>
                ) : null}
                {customerResults.length > 0 ? (
                  <div style={{ marginTop: 8, border: "1px solid #1f2a44", borderRadius: 14, overflow: "hidden" }}>
                    {customerResults.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() =>
                          fillCustomer(customer, {
                            setClientName,
                            setClientId,
                            setClientPhone,
                            setClientEmail,
                            setClientAddress,
                            setCustomerQuery,
                            setCustomerResults,
                            setSelectedCustomer,
                          })
                        }
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: 12,
                          border: "none",
                          borderTop: "1px solid #1f2a44",
                          background: "#0b1220",
                          color: "white",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontWeight: 900 }}>{customer.display_name || customer.legal_name || "-"}</div>
                        <div style={{ color: "#9aa0a6", fontSize: 12 }}>
                          {[customer.document_type, customer.document_number, customer.email].filter(Boolean).join(" · ")}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} className="mobile-quotes-form-grid">
                <div>
                  <label style={label()}>Nombre</label>
                  <input
                    style={input()}
                    value={clientName}
                    onChange={(e) => {
                      setClientName(e.target.value);
                      setCustomerQuery(e.target.value);
                    }}
                  />
                </div>
                <div>
                  <label style={label()}>CI / RUC</label>
                  <input
                    style={input()}
                    value={clientId}
                    onChange={(e) => {
                      setClientId(e.target.value);
                      if (selectedCustomer && e.target.value.trim() !== (selectedCustomer.document_number || "")) {
                        setSelectedCustomer(null);
                      }
                    }}
                  />
                </div>
                <div>
                  <label style={label()}>Teléfono</label>
                  <input style={input()} value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
                </div>
                <div>
                  <label style={label()}>Email</label>
                  <input style={input()} value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={label()}>Dirección</label>
                  <input style={input()} value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} />
                </div>
              </div>

              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid rgba(148, 163, 184, 0.14)",
                  background: "rgba(8, 14, 24, 0.78)",
                  display: "grid",
                  gap: 10,
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 10, color: "#dbeafe", fontSize: 13, fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={saveCustomerEnabled}
                    onChange={(e) => setSaveCustomerEnabled(e.target.checked)}
                  />
                  Guardar este cliente para futuras cotizaciones
                </label>

                <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.6 }}>
                  {selectedCustomer
                    ? "Si cambias telefono, correo o direccion, puedes actualizar este cliente desde aqui."
                    : "Si el cliente no existe, se creara automaticamente al guardar la cotizacion."}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" style={btn()} onClick={() => saveCustomerFromQuote(true)}>
                    {selectedCustomer ? "Actualizar cliente guardado" : "Guardar cliente ahora"}
                  </button>
                  {customerSyncStatus ? (
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        background: "rgba(59, 130, 246, 0.1)",
                        border: "1px solid rgba(96, 165, 250, 0.18)",
                        color: "#bfdbfe",
                        fontSize: 12,
                      }}
                    >
                      {customerSyncStatus}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div style={card()}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Acciones</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} className="mobile-quotes-form-grid">
                <div>
                  <label style={label()}>Descuento ($)</label>
                  <input
                    style={input()}
                    inputMode="decimal"
                    value={discount}
                    onChange={(e) => setDiscount(normalizeNumericInput(e.target.value))}
                    placeholder="Ej. 5,50"
                  />
                </div>
                <div>
                  <label style={label()}>Delivery ($)</label>
                  <input
                    style={input()}
                    inputMode="decimal"
                    value={delivery}
                    onChange={(e) => setDelivery(normalizeNumericInput(e.target.value))}
                    placeholder="Ej. 2.00"
                  />
                </div>
                <div>
                  <label style={label()}>Pagado ($)</label>
                  <input
                    style={input()}
                    inputMode="decimal"
                    value={paid}
                    onChange={(e) => setPaid(normalizeNumericInput(e.target.value))}
                    placeholder="Ej. 20"
                  />
                </div>
                <div>
                  <label style={label()}>Total final</label>
                  <div
                    style={{
                      background: "#0b1220",
                      border: "1px solid #1f2a44",
                      padding: "10px 12px",
                      borderRadius: 12,
                      fontSize: 18,
                      fontWeight: 900,
                    }}
                  >
                    $ {money(totals.totalFinal)}
                  </div>
                  <div style={{ color: "#9aa0a6", marginTop: 6 }}>
                    Saldo: <b>$ {money(totals.saldo)}</b>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }} className="mobile-quotes-action-grid">
                <button onClick={downloadPDF} style={btnPrimary()}>
                  Descargar PDF
                </button>
                <button onClick={whatsappShare} style={btnPrimary()}>
                  Compartir por WhatsApp
                </button>

                <button onClick={() => saveQuote(false)} style={btn()}>
                  Guardar
                </button>
                <button onClick={() => saveQuote(true)} style={btn()}>
                  Guardar y subir PDF
                </button>

                <button onClick={convertToInvoice} style={btn()}>
                  Convertir a factura
                </button>

                <button onClick={emailSend} style={btnPrimary()}>
                  Enviar email
                </button>
              </div>
            </div>
          </div>

          <div style={{ ...card(), marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }} className="mobile-quotes-toolbar">
              <div style={{ fontWeight: 900 }}>Detalle</div>
              <button onClick={() => setItems((p) => [...p, { qty: "1", description: "", unit: "", incl_vat: true }])} style={btn()}>
                + Agregar línea
              </button>
            </div>

            {catalogLineIndex !== null ? (
              <div style={{ ...card(), marginBottom: 14, padding: 14, background: "rgba(8, 14, 24, 0.88)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>Elegir producto del inventario</div>
                    <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
                      Llenaremos la descripcion y el precio de la linea {catalogLineIndex + 1}.
                    </div>
                  </div>
                  <button type="button" onClick={() => setCatalogLineIndex(null)} style={btn()}>
                    Cerrar
                  </button>
                </div>

                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  <input
                    style={input()}
                    value={catalogQuery}
                    onChange={(e) => setCatalogQuery(e.target.value)}
                    placeholder="Busca por nombre, variante, categoria o SKU"
                  />
                  {!inventoryReady ? (
                    <div style={{ color: "#f0c36b", fontSize: 12 }}>
                      No pude leer el inventario ahora mismo.
                    </div>
                  ) : null}
                  {inventoryLoading ? (
                    <div style={{ color: "#94a3b8", fontSize: 12 }}>Cargando catalogo...</div>
                  ) : (
                    <div style={catalogGrid}>
                      {filteredCatalog.map((entry) => (
                        <button
                          key={entry.variant_id}
                          type="button"
                          onClick={() => applyCatalogToLine(entry)}
                          style={catalogBtn}
                        >
                          {entry.image_url ? (
                            <img src={entry.image_url} alt={entry.variant_name} style={catalogThumb} />
                          ) : (
                            <div style={catalogThumbPlaceholder}>Sin imagen</div>
                          )}
                          <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                            <div style={{ fontWeight: 800, color: "#f8fafc" }}>{entry.variant_name}</div>
                            <div style={{ color: "#94a3b8", fontSize: 12 }}>
                              {[entry.category_name, entry.product_sku].filter(Boolean).join(" · ")}
                            </div>
                            <div style={{ color: "#cbd5e1", fontSize: 12 }}>
                              {catalogAttributeSummary(entry.attributes) || entry.description || "Producto del catalogo"}
                            </div>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", color: "#bfdbfe", fontSize: 12 }}>
                              <span>Stock {entry.stock}</span>
                              <span>PVP $ {money(entry.sale_price)}</span>
                            </div>
                          </div>
                        </button>
                      ))}
                      {!filteredCatalog.length ? (
                        <div style={catalogEmpty}>No encontre variantes con esa busqueda.</div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }} className="mobile-quotes-desktop-table">
                <thead>
                  <tr style={{ background: "#0b1220" }}>
                    <Th>Cant.</Th>
                    <Th>Descripción</Th>
                    <Th>P. Unitario</Th>
                    <Th style={{ textAlign: "center" }}>IVA</Th>
                    <Th style={{ textAlign: "right" }}>P.U. con IVA</Th>
                    <Th style={{ textAlign: "right" }}>Total</Th>
                    <Th style={{ textAlign: "right" }}></Th>
                  </tr>
                </thead>

                <tbody>
                  {totals.lines.map((l, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #1f2a44" }}>
                      <Td>
                        <input
                          style={input({ width: 80 })}
                          inputMode="numeric"
                          value={items[idx].qty}
                          onChange={(e) => updateItem(idx, { qty: normalizeNumericInput(e.target.value) })}
                          placeholder="1"
                        />
                      </Td>

                      <Td>
                        <div style={{ display: "grid", gap: 8 }}>
                          <input
                            style={input()}
                            value={items[idx].description}
                            onChange={(e) => updateItem(idx, { description: e.target.value })}
                            placeholder="Ej. Caja de guantes de nitrilo"
                          />
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => openCatalogForLine(idx)} style={btn()}>
                              Elegir del inventario
                            </button>
                            {items[idx].sku ? <span style={{ color: "#94a3b8", fontSize: 12 }}>SKU {items[idx].sku}</span> : null}
                          </div>
                        </div>
                      </Td>

                      <Td>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ color: "#9aa0a6" }}>$</span>
                          <input
                            style={input({ width: 140 })}
                            inputMode="decimal"
                            value={items[idx].unit}
                            onChange={(e) => updateItem(idx, { unit: normalizeNumericInput(e.target.value) })}
                            placeholder="Ej. 12,50"
                          />
                        </div>
                      </Td>

                      <Td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={items[idx].incl_vat}
                          onChange={(e) => updateItem(idx, { incl_vat: e.target.checked })}
                        />
                      </Td>

                      <Td style={{ textAlign: "right", paddingRight: 12 }}>$ {money(l.unitWithVat)}</Td>
                      <Td style={{ textAlign: "right", paddingRight: 12, fontWeight: 900 }}>$ {money(l.total)}</Td>

                      <Td style={{ textAlign: "right" }}>
                        <button onClick={() => removeItem(idx)} style={dangerBtn()}>
                          ✖
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mobile-quotes-mobile-list" style={{ display: "none", marginTop: 10 }}>
                {totals.lines.map((l, idx) => (
                  <div key={idx} style={mobileCard()}>
                    <div style={mobileCardTitleRow}>
                      <div style={mobileCardTitle}>{items[idx].description || `Linea ${idx + 1}`}</div>
                      <button onClick={() => removeItem(idx)} style={dangerBtn()}>
                        Quitar
                      </button>
                    </div>

                    <div style={mobileFormStack}>
                      <div>
                        <label style={label()}>Cantidad</label>
                        <input
                          style={input()}
                          inputMode="numeric"
                          value={items[idx].qty}
                          onChange={(e) => updateItem(idx, { qty: normalizeNumericInput(e.target.value) })}
                          placeholder="1"
                        />
                      </div>

                      <div>
                        <label style={label()}>Descripcion</label>
                        <input
                          style={input()}
                          value={items[idx].description}
                          onChange={(e) => updateItem(idx, { description: e.target.value })}
                          placeholder="Ej. Caja de guantes de nitrilo"
                        />
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                          <button type="button" onClick={() => openCatalogForLine(idx)} style={btn()}>
                            Elegir del inventario
                          </button>
                          {items[idx].sku ? <span style={{ color: "#94a3b8", fontSize: 12 }}>SKU {items[idx].sku}</span> : null}
                        </div>
                      </div>

                      <div>
                        <label style={label()}>P. unitario</label>
                        <input
                          style={input()}
                          inputMode="decimal"
                          value={items[idx].unit}
                          onChange={(e) => updateItem(idx, { unit: normalizeNumericInput(e.target.value) })}
                          placeholder="Ej. 12,50"
                        />
                      </div>

                      <label style={{ ...label(), display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={items[idx].incl_vat}
                          onChange={(e) => updateItem(idx, { incl_vat: e.target.checked })}
                        />
                        Aplicar IVA
                      </label>
                    </div>

                    <div style={mobileSummaryGrid}>
                      <Mini k="P.U. con IVA" v={`$ ${money(l.unitWithVat)}`} />
                      <Mini k="Total" v={`$ ${money(l.total)}`} bold />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginTop: 14 }} className="mobile-quotes-totals-grid">
              <Mini k="Total parcial" v={`$ ${money(totals.subtotal)}`} />
              <Mini k="Descuento" v={`$ ${money(totals.disc)}`} />
              <Mini k="Neto" v={`$ ${money(totals.neto)}`} />
              <Mini k={`IVA (${Math.round(ivaRate * 100)}%)`} v={`$ ${money(totals.iva)}`} />
              <Mini k="Total final" v={`$ ${money(totals.totalFinal)}`} bold />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }} className="mobile-quotes-notes-grid">
            <div style={card()}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Notas</div>
              <textarea style={textarea()} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div style={card()}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Terminos y condiciones</div>
              <textarea style={textarea()} value={terms} onChange={(e) => setTerms(e.target.value)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ✅ UI helpers */
function card(): React.CSSProperties {
  return {
    border: "1px solid rgba(148, 163, 184, 0.14)",
    background: "linear-gradient(180deg, rgba(17, 24, 39, 0.96) 0%, rgba(10, 15, 26, 0.96) 100%)",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 18px 36px rgba(0,0,0,0.14)",
  };
}
function label(): React.CSSProperties {
  return { display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 700 };
}
function input(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(148, 163, 184, 0.16)",
    background: "rgba(8, 14, 24, 0.95)",
    color: "#f8fafc",
    outline: "none",
    ...extra,
  };
}
function textarea(): React.CSSProperties {
  return {
    width: "100%",
    minHeight: 140,
    background: "rgba(8, 14, 24, 0.95)",
    border: "1px solid rgba(148, 163, 184, 0.16)",
    color: "#f8fafc",
    borderRadius: 16,
    padding: 12,
    outline: "none",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12.5,
  };
}
function btn(): React.CSSProperties {
  return {
    padding: "11px 14px",
    borderRadius: 14,
    border: "1px solid rgba(148, 163, 184, 0.16)",
    background: "rgba(15, 23, 37, 0.96)",
    color: "#e2e8f0",
    fontWeight: 700,
    cursor: "pointer",
  };
}
function btnPrimary(): React.CSSProperties {
  return {
    padding: "11px 14px",
    borderRadius: 14,
    border: "1px solid rgba(96, 165, 250, 0.24)",
    background: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)",
    color: "#f8fafc",
    fontWeight: 700,
    cursor: "pointer",
  };
}
function dangerBtn(): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(248, 113, 113, 0.24)",
    background: "rgba(69, 10, 10, 0.84)",
    color: "#fecaca",
    fontWeight: 700,
    cursor: "pointer",
  };
}
function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 14,
    border: "1px solid rgba(148, 163, 184, 0.16)",
    background: active
      ? "linear-gradient(135deg, rgba(96,165,250,0.28), rgba(59,130,246,0.18))"
      : "rgba(15, 23, 37, 0.96)",
    color: "#f8fafc",
    fontWeight: 700,
    cursor: "pointer",
  };
}

/** ✅ FIX CLAVE: Th/Td aceptan props style/colSpan/etc */
type THProps = React.ThHTMLAttributes<HTMLTableCellElement>;
type TDProps = React.TdHTMLAttributes<HTMLTableCellElement>;

function Th(props: THProps) {
  const { children, style, ...rest } = props;
  return (
    <th
      {...rest}
      style={{
        textAlign: "left",
        padding: 10,
        fontSize: 12,
        color: "#94a3b8",
        borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
        ...(style || {}),
      }}
    >
      {children}
    </th>
  );
}

function Td(props: TDProps) {
  const { children, style, ...rest } = props;
  return (
    <td {...rest} style={{ padding: 10, verticalAlign: "top", ...(style || {}) }}>
      {children}
    </td>
  );
}

function Mini({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div style={{ border: "1px solid rgba(148, 163, 184, 0.12)", background: "rgba(8, 14, 24, 0.95)", borderRadius: 16, padding: 12 }}>
      <div style={{ fontSize: 12, color: "#94a3b8" }}>{k}</div>
      <div style={{ fontSize: bold ? 16 : 14, fontWeight: bold ? 900 : 800, marginTop: 2 }}>{v}</div>
    </div>
  );
}

function fillCustomer(customer: Customer, setters: {
  setClientName: (v: string) => void;
  setClientId: (v: string) => void;
  setClientPhone: (v: string) => void;
  setClientEmail: (v: string) => void;
  setClientAddress: (v: string) => void;
  setCustomerQuery: (v: string) => void;
  setCustomerResults: (v: Customer[]) => void;
  setSelectedCustomer: (v: Customer | null) => void;
}) {
  setters.setClientName(customer.display_name || customer.legal_name || "");
  setters.setClientId(customer.document_number || "");
  setters.setClientPhone(customer.phone || "");
  setters.setClientEmail(customer.email || "");
  setters.setClientAddress(customer.address || "");
  setters.setCustomerQuery(customer.display_name || customer.legal_name || "");
  setters.setCustomerResults([]);
  setters.setSelectedCustomer(customer);
}

const applyCustomer = fillCustomer;

function mobileCard(): React.CSSProperties {
  return {
    border: "1px solid rgba(148, 163, 184, 0.14)",
    background: "rgba(8, 14, 24, 0.95)",
    borderRadius: 18,
    padding: 14,
    display: "grid",
    gap: 12,
  };
}

const catalogGrid: React.CSSProperties = {
  display: "grid",
  gap: 10,
  maxHeight: 360,
  overflowY: "auto",
  paddingRight: 4,
};

const catalogBtn: React.CSSProperties = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "72px minmax(0, 1fr)",
  gap: 12,
  textAlign: "left",
  alignItems: "start",
  padding: 12,
  borderRadius: 16,
  border: "1px solid rgba(148, 163, 184, 0.14)",
  background: "rgba(15, 23, 37, 0.82)",
  cursor: "pointer",
};

const catalogThumb: React.CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: 14,
  objectFit: "cover",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  background: "rgba(8, 14, 24, 0.95)",
};

const catalogThumbPlaceholder: React.CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: 14,
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  padding: 6,
  color: "#94a3b8",
  fontSize: 11,
  border: "1px dashed rgba(148, 163, 184, 0.2)",
  background: "rgba(8, 14, 24, 0.78)",
};

const catalogEmpty: React.CSSProperties = {
  padding: 14,
  borderRadius: 14,
  border: "1px dashed rgba(148, 163, 184, 0.18)",
  color: "#94a3b8",
  textAlign: "center",
};

function mobileLinkBtn(): React.CSSProperties {
  return {
    ...btn(),
    textDecoration: "none",
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
  };
}

const mobileCardTitleRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const mobileCardTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  color: "#f8fafc",
};

const mobileCardBadge: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(59, 130, 246, 0.12)",
  border: "1px solid rgba(96, 165, 250, 0.2)",
  color: "#dbeafe",
  fontSize: 12,
  fontWeight: 700,
};

const mobileCardMeta: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
};

const mobileCardActions: React.CSSProperties = {
  display: "grid",
  gap: 8,
  gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
};

const mobileFormStack: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const mobileSummaryGrid: React.CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
};
