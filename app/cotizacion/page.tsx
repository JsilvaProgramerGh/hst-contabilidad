"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  DEFAULT_QUOTE_COMPANY_PROFILE,
  mapQuoteCompanyProfile,
  type QuoteCompanyProfile,
} from "@/lib/quote-company-profile";
type Item = {
  qty: string;
  description: string;
  unit: string;
  incl_vat: boolean;
  product_id?: string;
  product_name?: string;
  variant_id?: string;
  sku?: string;
  selected_attrs?: Record<string, string>;
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
  attributes: Record<string, string>;
};

type ReceiptStatus =
  | "PENDIENTE_PAGO"
  | "ABONADO"
  | "PAGADO"
  | "PENDIENTE_ENTREGA"
  | "ENTREGADO"
  | "ANULADO";

type ReceiptRecord = {
  id: string;
  invoice_no: string;
  receipt_status: ReceiptStatus;
  delivery_date: string | null;
  delivery_time: string | null;
};

const IVA_DEFAULT = 0.15;
const RECEIPT_STATUS_OPTIONS: Array<{ value: ReceiptStatus; label: string }> = [
  { value: "PENDIENTE_PAGO", label: "Pago pendiente" },
  { value: "ABONADO", label: "Abonado" },
  { value: "PAGADO", label: "Pagado" },
  { value: "PENDIENTE_ENTREGA", label: "Pendiente de entrega" },
  { value: "ENTREGADO", label: "Entregado" },
  { value: "ANULADO", label: "Anulado" },
];

const COMPANY = {
  ...DEFAULT_QUOTE_COMPANY_PROFILE,
  logoPath: DEFAULT_QUOTE_COMPANY_PROFILE.logo_url,
  sealPath: "/seal.png",
  signPath: "/firma.png",
  accentBlue: hexToRgb(DEFAULT_QUOTE_COMPANY_PROFILE.accent_blue),
};

function hexToRgb(hex: string) {
  const safe = String(hex || DEFAULT_QUOTE_COMPANY_PROFILE.accent_blue).replace("#", "").trim();
  const normalized = safe.length === 3 ? safe.split("").map((char) => char + char).join("") : safe;
  const parsed = Number.parseInt(normalized, 16);
  if (!Number.isFinite(parsed)) return [16, 95, 255] as [number, number, number];
  return [parsed >> 16 & 255, parsed >> 8 & 255, parsed & 255] as [number, number, number];
}

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

function grossToNet(value: number, ivaRate: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(ivaRate) || ivaRate <= 0) return value;
  return value / (1 + ivaRate);
}

function catalogAttributeSummary(attributes: Record<string, string> | null | undefined) {
  return Object.entries(attributes || {})
    .filter(([key, value]) => value && !["imagen", "Imagen", "image_url", "producto_origen_id", "variante_origen_id", "slug_web"].includes(key))
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
}

function cleanVariantAttributes(attributes: Record<string, string> | null | undefined) {
  return Object.fromEntries(
    Object.entries(attributes || {}).filter(
      ([key, value]) =>
        Boolean(value) &&
        !["imagen", "Imagen", "image_url", "producto_origen_id", "variante_origen_id", "slug_web", "origen_web", "SKU"].includes(key),
    ),
  );
}

function inferDocumentType(value: string) {
  const clean = value.replace(/\D/g, "");
  if (clean.length === 13) return "RUC";
  if (clean.length === 10) return "CEDULA";
  if (clean.length > 0) return "PASAPORTE";
  return null;
}

function normalizeWhatsappPhone(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("593") && digits.length >= 11) {
    return digits;
  }

  if (digits.length === 10 && digits.startsWith("0")) {
    return `593${digits.slice(1)}`;
  }

  if (digits.length === 9 && digits.startsWith("9")) {
    return `593${digits}`;
  }

  if (digits.startsWith("00") && digits.length > 4) {
    return digits.slice(2);
  }

  return digits;
}

function receiptStatusLabel(status: ReceiptStatus) {
  return RECEIPT_STATUS_OPTIONS.find((option) => option.value === status)?.label || status;
}

function inferCityFromAddress(address: string) {
  const value = String(address || "").trim();
  if (!value) return "QUITO";

  const parts = value
    .split(/,|-/)
    .map((part) => part.trim())
    .filter(Boolean);

  const last = parts[parts.length - 1] || value;
  return last.toUpperCase();
}

function formatDeliveryWindow(date: string, time: string) {
  if (!date) return "-";
  return `${date}${time ? ` ${time}` : " - cualquier hora"}`;
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
  const [companyProfile, setCompanyProfile] = useState<QuoteCompanyProfile>(DEFAULT_QUOTE_COMPANY_PROFILE);
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
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const saveQuoteRef = useRef<Promise<{ id: string | null; pdf_url: string | null } | void> | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [receiptNo, setReceiptNo] = useState("");
  const [receiptStatus, setReceiptStatus] = useState<ReceiptStatus>("PENDIENTE_PAGO");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [signatureSheetOpen, setSignatureSheetOpen] = useState(false);
  const [signatureReady, setSignatureReady] = useState(false);

  // historial
  const [list, setList] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureDrawingRef = useRef(false);
  const signaturePointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let active = true;
    const sb = supabaseBrowser();

    (async () => {
      const { data } = await sb
        .from("quote_company_profile")
        .select("id,name,ruc,address,city,phone,email,website,logo_url,accent_blue")
        .eq("id", "default")
        .maybeSingle();

      if (!active || !data) return;
      setCompanyProfile(mapQuoteCompanyProfile(data as Partial<QuoteCompanyProfile>));
    })();

    return () => {
      active = false;
    };
  }, []);

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

  useEffect(() => {
    if (!quoteId) {
      resetReceiptDraft();
      return;
    }

    loadReceiptForQuote(quoteId);
  }, [quoteId]);

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

  useEffect(() => {
    if (!signatureSheetOpen) return;

    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(canvas.getBoundingClientRect().width));
    const height = 220;

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.2;
    setSignatureReady(false);
  }, [signatureSheetOpen]);

  const productCatalog = useMemo(() => {
    const grouped = new Map<
      string,
      {
        product_id: string;
        product_name: string;
        product_sku: string | null;
        category_name: string | null;
        description: string | null;
        variants: InventoryEntry[];
      }
    >();

    inventoryCatalog.forEach((entry) => {
      const existing = grouped.get(entry.product_id);
      if (existing) {
        existing.variants.push(entry);
        return;
      }

      grouped.set(entry.product_id, {
        product_id: entry.product_id,
        product_name: entry.product_name,
        product_sku: entry.product_sku,
        category_name: entry.category_name,
        description: entry.description,
        variants: [entry],
      });
    });

    return Array.from(grouped.values());
  }, [inventoryCatalog]);

  const searchProducts = (query: string) => {
    const value = query.trim().toLowerCase();
    if (!value) return [];
    return productCatalog
      .filter((product) =>
        [
          product.product_name,
          product.product_sku,
          product.category_name,
          product.description,
          ...product.variants.map((variant) => `${variant.variant_name} ${catalogAttributeSummary(variant.attributes)}`),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(value),
      )
      .slice(0, 8);
  };

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
            attributes,
          };
        })
        .filter((entry): entry is InventoryEntry => Boolean(entry));

      setInventoryCatalog(nextCatalog);
    } catch {
      setInventoryCatalog([]);
    } finally {
      setInventoryLoading(false);
    }
  };

  const focusLine = async (idx: number) => {
    setActiveLineIndex(idx);
    if (!inventoryCatalog.length) {
      await loadInventoryCatalog();
    }
  };

  const applyProductToLine = (idx: number, product: (typeof productCatalog)[number]) => {
    updateItem(idx, {
      description: product.product_name,
      product_id: product.product_id,
      product_name: product.product_name,
      variant_id: undefined,
      sku: product.product_sku || undefined,
      unit: "",
      incl_vat: true,
      selected_attrs: {},
    });

    if (product.variants.length === 1) {
      applyVariantToLine(idx, product.variants[0]);
    }
  };

  const applyVariantToLine = (idx: number, entry: InventoryEntry) => {
    const netUnit = grossToNet(entry.sale_price, ivaRate);
    updateItem(idx, {
      description: entry.variant_name,
      product_id: entry.product_id,
      product_name: entry.product_name,
      unit: netUnit ? netUnit.toFixed(2) : "",
      incl_vat: true,
      variant_id: entry.variant_id,
      sku: entry.product_sku || undefined,
      selected_attrs: cleanVariantAttributes(entry.attributes),
    });
    setActiveLineIndex(idx);
  };

  const chooseVariantAttribute = (idx: number, attributeKey: string, value: string) => {
    const selectedProduct = selectedProductForLine(idx);
    if (!selectedProduct) return;

    const nextAttrs = {
      ...(items[idx].selected_attrs || {}),
      [attributeKey]: value,
    };

    const matches = selectedProduct.variants.filter((variant) => {
      const attrs = cleanVariantAttributes(variant.attributes);
      return Object.entries(nextAttrs).every(([key, selectedValue]) => attrs[key] === selectedValue);
    });
    const netUnit = matches.length === 1 ? grossToNet(matches[0].sale_price, ivaRate) : 0;

    updateItem(idx, {
      selected_attrs: nextAttrs,
      variant_id: matches.length === 1 ? matches[0].variant_id : undefined,
      unit: netUnit ? netUnit.toFixed(2) : "",
      sku: selectedProduct.product_sku || undefined,
      description: matches.length === 1 ? matches[0].variant_name : selectedProduct.product_name,
    });

    if (matches.length === 1) {
      applyVariantToLine(idx, matches[0]);
    }
  };

  const selectedProductForLine = (idx: number) =>
    items[idx]?.product_id
      ? productCatalog.find((product) => product.product_id === items[idx].product_id) || null
      : null;

  const productSuggestionsForLine = (idx: number) => {
    const value = items[idx]?.description || "";
    return searchProducts(value);
  };

  const renderCatalogAssist = (idx: number) => {
    const suggestions = productSuggestionsForLine(idx);
    const selectedProduct = selectedProductForLine(idx);
    const selectedAttrs = items[idx].selected_attrs || {};
    const attributeGroups = selectedProduct
      ? Array.from(
          selectedProduct.variants.reduce((map, variant) => {
            const attrs = cleanVariantAttributes(variant.attributes);
            Object.entries(attrs).forEach(([key, value]) => {
              if (!map.has(key)) map.set(key, new Set<string>());
              map.get(key)?.add(value);
            });
            return map;
          }, new Map<string, Set<string>>()),
        )
      : [];

    return (
      <div style={{ display: "grid", gap: 8 }}>
        {activeLineIndex === idx && items[idx].description.trim() && suggestions.length > 0 ? (
          <div style={suggestionBox}>
            {suggestions.map((product) => (
              <button
                key={product.product_id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyProductToLine(idx, product)}
                style={suggestionRow}
              >
                <div style={{ fontWeight: 800, color: "#f8fafc" }}>{product.product_name}</div>
                <div style={suggestionMeta}>
                  {[product.category_name, product.product_sku, `${product.variants.length} variante${product.variants.length === 1 ? "" : "s"}`]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </button>
            ))}
          </div>
        ) : null}

        {selectedProduct?.variants.length && selectedProduct.variants.length > 1 ? (
          <div style={variantPicker}>
            {attributeGroups.map(([key, values]) => (
              <div key={key} style={{ display: "grid", gap: 8 }}>
                <div style={variantGroupLabel}>{key}</div>
                <div style={variantChips}>
                  {Array.from(values).map((value) => (
                    <button
                      key={`${key}-${value}`}
                      type="button"
                      onClick={() => chooseVariantAttribute(idx, key, value)}
                      style={{
                        ...variantChip,
                        ...(selectedAttrs[key] === value ? variantChipActive : null),
                      }}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {items[idx].sku ? <span style={{ color: "#94a3b8", fontSize: 12 }}>SKU {items[idx].sku}</span> : null}
          {items[idx].product_name && !items[idx].variant_id ? (
            <span style={{ color: "#f0c36b", fontSize: 12 }}>Falta elegir variante</span>
          ) : null}
        </div>
      </div>
    );
  };

  const exportingRef = useRef(false);

  const buildQuotePayload = (pdf_url?: string | null) => ({
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
  });

  const findQuoteByNumber = async (number: string) => {
    const response = await fetch(`/api/quotes?quote_no=${encodeURIComponent(number)}`);
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error || "No pude buscar la cotizacion existente.");
    }
    return json?.data?.quote ?? null;
  };

  const resetReceiptDraft = () => {
    setReceiptId(null);
    setReceiptNo("");
    setReceiptStatus("PENDIENTE_PAGO");
    setDeliveryDate("");
    setDeliveryTime("");
  };

  const loadReceiptForQuote = async (id: string) => {
    const response = await fetch(`/api/quotes/${id}/convert`);
    const json = await response.json();
    if (!response.ok) return;

    const receipt = (json?.data?.receipt || null) as ReceiptRecord | null;
    if (!receipt) {
      resetReceiptDraft();
      return;
    }

    setReceiptId(receipt.id);
    setReceiptNo(receipt.invoice_no || "");
    setReceiptStatus(receipt.receipt_status || "PENDIENTE_PAGO");
    setDeliveryDate(receipt.delivery_date || "");
    setDeliveryTime(receipt.delivery_time || "");
  };

  const buildPDF = async () => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 12;

    const logo = await urlToDataURL(companyProfile.logo_url || COMPANY.logoPath);
    const seal = await urlToDataURL(COMPANY.sealPath);
    const sign = await urlToDataURL(COMPANY.signPath);
    const accentBlue = hexToRgb(companyProfile.accent_blue);

    doc.setFillColor(...accentBlue);
    doc.rect(0, 0, pageW, 8, "F");

    const y = 18;

    if (logo) doc.addImage(logo, "PNG", margin, y - 8, 32, 32);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("COTIZACIÓN / PROFORMA", margin + (logo ? 38 : 0), y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const companyLines = [
      companyProfile.name,
      companyProfile.ruc,
      companyProfile.address,
      companyProfile.city,
      companyProfile.phone,
      companyProfile.email,
      companyProfile.website,
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
    const contentWidth = pageW - margin * 2;
    const noteLines = doc.splitTextToSize(notes || "-", contentWidth);
    const termsLines = doc.splitTextToSize((terms || "-").trim(), contentWidth);
    const lineHeight = 4.2;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("NOTAS", margin, textY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(noteLines, margin, textY + 5);

    textY += 5 + noteLines.length * lineHeight + 6;
    const projectedTermsBottom = textY + 5 + termsLines.length * lineHeight;

    if (projectedTermsBottom > 252) {
      doc.addPage();
      textY = 24;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("TERMINOS Y CONDICIONES", margin, textY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(termsLines, margin, textY + 5);

    const footerY = 270;
    if (sign) doc.addImage(sign, "PNG", pageW - margin - 55, footerY - 18, 50, 18);
    if (seal) doc.addImage(seal, "PNG", pageW - margin - 28, footerY - 8, 24, 24);

    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`${companyProfile.name} — Documento generado desde HST Contabilidad`, margin, 289);
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

  const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handleSignatureStart = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    const point = getCanvasPoint(event);
    if (!canvas || !point) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    signatureDrawingRef.current = true;
    signaturePointRef.current = point;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    event.preventDefault();
  };

  const handleSignatureMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!signatureDrawingRef.current) return;
    const canvas = signatureCanvasRef.current;
    const point = getCanvasPoint(event);
    if (!canvas || !point) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const previous = signaturePointRef.current || point;
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    signaturePointRef.current = point;
    setSignatureReady(true);
    event.preventDefault();
  };

  const handleSignatureEnd = () => {
    signatureDrawingRef.current = false;
    signaturePointRef.current = null;
  };

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const displayWidth = canvas.width / ratio;
    const displayHeight = canvas.height / ratio;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, displayWidth, displayHeight);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.2;
    setSignatureReady(false);
  };

  const getSignatureDataUrl = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas || !signatureReady) return null;
    return canvas.toDataURL("image/png");
  };

  const buildDeliveryReceiptPDF = async (options?: { clientSignatureDataUrl?: string | null; signedByTouch?: boolean }) => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const logo = await urlToDataURL(companyProfile.logo_url || COMPANY.logoPath);
    const clientSignature = options?.clientSignatureDataUrl || null;
    const accentBlue = hexToRgb(companyProfile.accent_blue);

    doc.setFillColor(...accentBlue);
    doc.rect(0, 0, pageW, 10, "F");

    doc.setDrawColor(28, 44, 80);
    doc.setLineWidth(0.4);
    doc.roundedRect(margin, 16, pageW - margin * 2, 34, 3, 3);

    if (logo) doc.addImage(logo, "PNG", margin + 3, 20, 24, 24);

    const headerLeftX = margin + (logo ? 31 : 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("DATOS DE ENTREGA / RECIBIDO", headerLeftX, 27);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    [companyProfile.name, companyProfile.phone, companyProfile.email].filter(Boolean).forEach((line, index) => {
      doc.text(String(line), headerLeftX, 34 + index * 4.2);
    });

    const boxW = 60;
    const boxX = pageW - margin - boxW - 3;
    doc.roundedRect(boxX, 20, boxW, 25, 2, 2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("REFERENCIA", boxX + 4, 26);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Cotizacion: ${quoteNo || "-"}`, boxX + 4, 32);
    doc.text(`Recibo: ${receiptNo || "-"}`, boxX + 4, 37);
    doc.text(`Entrega: ${formatDeliveryWindow(deliveryDate, deliveryTime)}`, boxX + 4, 42, {
      maxWidth: boxW - 8,
    });

    let y = 60;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("DATOS DEL CLIENTE", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.roundedRect(margin, y + 3, pageW - margin * 2, 28, 2, 2);
    doc.text(`Nombre: ${clientName || "-"}`, margin + 4, y + 10);
    doc.text(`Documento: ${clientId || "-"}`, pageW / 2, y + 10);
    doc.text(`Telefono: ${clientPhone || "-"}`, margin + 4, y + 16);
    doc.text(doc.splitTextToSize(`Direccion: ${clientAddress || "-"}`, pageW - margin * 2 - 8), margin + 4, y + 22);

    y += 38;
    autoTable(doc, {
      startY: y,
      head: [["Cant.", "Descripcion", "P. Unitario", "Total"]],
      body: totals.lines.map((line) => [
        String(line.qty),
        line.description || "-",
        `$ ${money(line.unitWithVat)}`,
        `$ ${money(line.total)}`,
      ]),
      styles: { font: "helvetica", fontSize: 9, cellPadding: 2.4, lineWidth: 0.1 },
      headStyles: {
        fillColor: [245, 248, 255],
        textColor: [10, 20, 40],
        fontStyle: "bold",
        lineWidth: 0.1,
      },
      columnStyles: {
        0: { cellWidth: 18, halign: "center" },
        1: { cellWidth: 104 },
        2: { cellWidth: 28, halign: "right" },
        3: { cellWidth: 28, halign: "right" },
      },
    });

    const afterTableY = ((doc as any).lastAutoTable?.finalY ?? y + 30) + 8;

    doc.roundedRect(pageW - margin - 70, afterTableY, 70, 18, 2, 2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("TOTAL RECIBIDO", pageW - margin - 66, afterTableY + 7);
    doc.setFontSize(14);
    doc.text(`$ ${money(totals.totalFinal)}`, pageW - margin - 4, afterTableY + 14, { align: "right" });

    const signatureTop = Math.max(afterTableY + 34, 215);
    doc.setDrawColor(90);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Firma del cliente / recibido", pageW / 2, signatureTop + 6, { align: "center" });

    const signatureBoxX = margin + 20;
    const signatureBoxY = signatureTop + 10;
    const signatureBoxW = pageW - margin * 2 - 40;
    doc.roundedRect(signatureBoxX, signatureBoxY, signatureBoxW, 30, 2, 2);

    if (clientSignature) {
      doc.addImage(clientSignature, "PNG", signatureBoxX + 4, signatureBoxY + 3, signatureBoxW - 8, 18);
    } else {
      doc.line(signatureBoxX + 8, signatureBoxY + 22, signatureBoxX + signatureBoxW - 8, signatureBoxY + 22);
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Nombre: ${clientName || "____________________"}`, margin + 12, signatureBoxY + 37);
    doc.text(`Cedula: ${clientId || "____________________"}`, pageW / 2 + 6, signatureBoxY + 37);

    if (options?.signedByTouch) {
      doc.setFontSize(8);
      doc.setTextColor(90);
      doc.text("Firma capturada desde el telefono del cliente.", margin, signatureBoxY + 45);
      doc.setTextColor(0);
    }

    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(`${companyProfile.name} - Comprobante de entrega generado desde HST Contabilidad`, margin, 289);
    doc.setTextColor(0);

    return doc;
  };

  const downloadDeliveryReceiptPDF = async () => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    try {
      const doc = await buildDeliveryReceiptPDF();
      doc.save(`${quoteNo || "entrega"}-recibido.pdf`);
    } finally {
      exportingRef.current = false;
    }
  };

  const downloadSignedDeliveryReceiptPDF = async () => {
    const signatureDataUrl = getSignatureDataUrl();
    if (!signatureDataUrl) {
      alert("Primero pide al cliente que firme en la pantalla.");
      return;
    }

    if (exportingRef.current) return;
    exportingRef.current = true;
    try {
      const doc = await buildDeliveryReceiptPDF({
        clientSignatureDataUrl: signatureDataUrl,
        signedByTouch: true,
      });
      doc.save(`${quoteNo || "entrega"}-firmado.pdf`);
      setSignatureSheetOpen(false);
    } finally {
      exportingRef.current = false;
    }
  };

  const buildShippingLabelPDF = async () => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 12;
    const logo = await urlToDataURL(companyProfile.logo_url || COMPANY.logoPath);
    const accentBlue = hexToRgb(companyProfile.accent_blue);

    doc.setFillColor(...accentBlue);
    doc.rect(0, 0, pageW, 14, "F");

    if (logo) {
      doc.addImage(logo, "PNG", margin, 18, 26, 26);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text(`${companyProfile.name} - ${companyProfile.city || "QUITO"}`, logo ? margin + 32 : margin, 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Etiqueta de envio / despacho", logo ? margin + 32 : margin, 35);

    doc.setDrawColor(25, 40, 65);
    doc.setLineWidth(0.7);
    doc.roundedRect(margin, 50, pageW - margin * 2, pageH - 70, 5, 5);

    const city = inferCityFromAddress(clientAddress);
    const bigLeft = margin + 8;
    const bigRight = pageW - margin - 8;
    const contentWidth = pageW - margin * 2 - 24;

    const drawFittedCenteredBlock = (
      text: string,
      options: {
        label: string;
        labelY: number;
        valueTopY: number;
        maxFont: number;
        minFont: number;
        maxLines?: number;
      },
    ) => {
      const safe = (text || "-").trim().toUpperCase();
      let size = options.maxFont;
      let lines: string[] = [];

      while (size >= options.minFont) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(size);
        lines = doc.splitTextToSize(safe, contentWidth) as string[];
        if ((options.maxLines || 2) >= lines.length) break;
        size -= 2;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text(options.label, bigLeft, options.labelY);

      doc.setFontSize(Math.max(size, options.minFont));
      const lineHeight = Math.max(9, Math.round(Math.max(size, options.minFont) * 0.42));
      lines.forEach((line, index) => {
        doc.text(line, pageW / 2, options.valueTopY + index * lineHeight, {
          align: "center",
          maxWidth: contentWidth,
        });
      });

      return options.valueTopY + Math.max(lines.length - 1, 0) * lineHeight;
    };

    let y = 64;
    const cityBottomY = drawFittedCenteredBlock(city, {
      label: "CIUDAD DESTINO",
      labelY: y,
      valueTopY: y + 14,
      maxFont: 44,
      minFont: 24,
      maxLines: 2,
    });

    y = cityBottomY + 10;
    doc.setDrawColor(180);
    doc.line(bigLeft, y, bigRight, y);

    const recipientBottomY = drawFittedCenteredBlock(clientName || "SIN NOMBRE", {
      label: "DESTINATARIO",
      labelY: y + 12,
      valueTopY: y + 26,
      maxFont: 28,
      minFont: 18,
      maxLines: 3,
    });

    y = recipientBottomY + 10;
    doc.setDrawColor(180);
    doc.line(bigLeft, y, bigRight, y);

    const documentBottomY = drawFittedCenteredBlock(clientId || "NO REGISTRADO", {
      label: "CEDULA / RUC",
      labelY: y + 12,
      valueTopY: y + 26,
      maxFont: 24,
      minFont: 16,
      maxLines: 2,
    });

    y = documentBottomY + 12;
    autoTable(doc, {
      startY: y,
      margin: { left: bigLeft, right: bigLeft },
      tableWidth: pageW - margin * 2 - 16,
      head: [["Dato", "Informacion"]],
      body: [
        ["Telefono", clientPhone || "-"],
        ["Direccion", clientAddress || "-"],
        ["Entrega", deliveryDate ? `${deliveryDate}${deliveryTime ? ` ${deliveryTime}` : " - cualquier hora"}` : "-"],
        ["Cotizacion", quoteNo || "-"],
        ["Recibo", receiptNo || "-"],
        ["Total del envio", `$ ${money(totals.totalFinal)}`],
        ["Contenido", totals.lines.map((line) => `${line.qty} x ${line.description || "-"}`).join(" | ") || "-"],
      ],
      styles: {
        font: "helvetica",
        fontSize: 11,
        cellPadding: 3,
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: [239, 244, 255],
        textColor: [12, 20, 36],
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: 38, fontStyle: "bold" },
        1: { cellWidth: pageW - margin * 2 - 16 - 38 },
      },
    });

    const afterTableY = ((doc as any).lastAutoTable?.finalY ?? y + 50) + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Observaciones de envio", bigLeft, afterTableY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      doc.splitTextToSize(
        "Manipular con cuidado. Verificar documento y nombre del destinatario antes de entregar.",
        pageW - margin * 2 - 16,
      ),
      bigLeft,
      afterTableY + 6,
    );

    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(`${companyProfile.name} - Etiqueta generada desde HST Contabilidad`, margin, 289);
    doc.setTextColor(0);

    return doc;
  };

  const downloadShippingLabelPDF = async () => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    try {
      const doc = await buildShippingLabelPDF();
      doc.save(`${quoteNo || "envio"}-etiqueta.pdf`);
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
    if (saveQuoteRef.current) return saveQuoteRef.current;

    const run = async () => {
      let pdf_url: string | null = null;
      if (alsoUploadPdf) pdf_url = await uploadPDFandGetUrl();

      const payload = buildQuotePayload(pdf_url);

      const endpoint = quoteId ? `/api/quotes/${quoteId}` : "/api/quotes";
      const method = quoteId ? "PATCH" : "POST";
      let res = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      let json = await res.json();

      if (!res.ok && !quoteId && String(json?.error || "").includes("quotes_quote_no_key")) {
        const existing = await findQuoteByNumber(quoteNo);
        if (existing?.id) {
          setQuoteId(existing.id);
          res = await fetch(`/api/quotes/${existing.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          json = await res.json();
        }
      }

      if (!res.ok) {
        alert(json.error || "Error guardando cotizacion");
        return;
      }

      const id = json?.data?.quote?.id ?? quoteId ?? null;
      setQuoteId(id);
      if (json?.data?.quote?.quote_no) setQuoteNo(json.data.quote.quote_no);
      if (saveCustomerEnabled) {
        await saveCustomerFromQuote();
      } else {
        setCustomerSyncStatus("Cotizacion guardada sin actualizar la base de clientes.");
      }

      alert(alsoUploadPdf ? "Guardado + PDF subido (link listo para compartir)." : "Cotizacion guardada.");
      return { id, pdf_url };
    };

    saveQuoteRef.current = run();
    try {
      return await saveQuoteRef.current;
    } finally {
      saveQuoteRef.current = null;
    }
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
    if (!quoteId) return alert("Primero guarda la cotizacion.");

    const res = await fetch(`/api/quotes/${quoteId}/convert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: receiptStatus,
        delivery_date: deliveryDate || null,
        delivery_time: deliveryTime || null,
      }),
    });
    const json = await res.json();
    if (!res.ok) return alert(json.error || "Error convirtiendo a recibo");

    const receipt = (json?.data?.receipt || null) as ReceiptRecord | null;
    if (receipt) {
      setReceiptId(receipt.id);
      setReceiptNo(receipt.invoice_no || "");
      setReceiptStatus(receipt.receipt_status || "PENDIENTE_PAGO");
      setDeliveryDate(receipt.delivery_date || "");
      setDeliveryTime(receipt.delivery_time || "");
    }

    const deliveryMessage = json?.data?.delivery_message
      ? `\nAgenda de pedidos: ${json.data.delivery_message}`
      : json?.data?.delivery_order
        ? "\nAgenda de pedidos: agregado o actualizado automaticamente."
        : "";

    alert(
      `Recibo listo: ${receipt?.invoice_no || "sin numero"}\nEstado: ${receiptStatusLabel(
        receipt?.receipt_status || receiptStatus,
      )}${deliveryMessage}`,
    );
  };

  const whatsappShare = async () => {
    const phone = normalizeWhatsappPhone(clientPhone);
    if (!phone) return alert("Falta el telefono del cliente.");

    let link: string | null = null;
    let activeId = quoteId;

    if (!activeId) {
      const result = await saveQuote(true);
      activeId = result?.id ?? null;
      link = result?.pdf_url ?? null;
    }

    if (activeId && !link) {
      const r = await fetch(`/api/quotes/${activeId}`);
      const j = await r.json();
      if (r.ok) link = j?.data?.quote?.pdf_url || null;
    }
    if (!link) link = await uploadPDFandGetUrl();

    if (activeId && link) {
      await fetch(`/api/quotes/${activeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quote: { pdf_url: link } }),
      });
    }

    const msg = [
      `*${companyProfile.name}*`,
      `Cotización: *${quoteNo}*`,
      `Cliente: ${clientName || "-"}`,
      `Total: $ ${money(totals.totalFinal)}`,
      link ? `PDF: ${link}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;
    window.location.href = whatsappUrl;
  };

  const emailSend = async () => {
    if (!clientEmail?.trim()) return alert("Falta el email del cliente.");

    let link: string | null = null;
    let activeId = quoteId;

    if (!activeId) {
      const result = await saveQuote(true);
      activeId = result?.id ?? null;
      link = result?.pdf_url ?? null;
    }

    try {
      if (!activeId) throw new Error("No pude preparar la cotización.");
      const r = await fetch(`/api/quotes/${activeId}`);
      const j = await r.json();
      if (r.ok) link = j?.data?.quote?.pdf_url || null;
    } catch {}

    if (!link) link = await uploadPDFandGetUrl();

    if (activeId && link) {
      await fetch(`/api/quotes/${activeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quote: { pdf_url: link } }),
      });
    }

    const r = await fetch(`/api/quotes/${activeId}/email`, {
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
    setItems((p) =>
      p.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        if (Object.prototype.hasOwnProperty.call(patch, "description")) {
          const nextDescription = String(patch.description ?? "");
          const currentSelected = it.variant_id ? it.description : it.product_name || it.description;
          if (nextDescription !== currentSelected) {
            next.product_id = undefined;
            next.product_name = undefined;
            next.variant_id = undefined;
            next.sku = undefined;
          }
        }
        return next;
      }),
    );

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
        <div>
          <h1 style={{ fontSize: 38, margin: 0, color: "#f8fafc" }}>Cotizaciones</h1>
          <a href="/empresa-cotizaciones" style={{ color: "#93c5fd", fontSize: 13, textDecoration: "none", fontWeight: 700 }}>
            Editar logo y datos de la empresa
          </a>
        </div>

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
                <div style={{ gridColumn: "1 / -1", display: "grid", gap: 10, padding: 12, borderRadius: 16, border: "1px solid rgba(148, 163, 184, 0.12)", background: "rgba(8, 14, 24, 0.7)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ fontWeight: 900, color: "#f8fafc" }}>
                      {quoteId ? "Recibo de esta cotizacion" : "Configuracion del recibo"}
                    </div>
                    {receiptNo ? <div style={{ color: "#93c5fd", fontSize: 12, fontWeight: 700 }}>Recibo: {receiptNo}</div> : null}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }} className="mobile-quotes-form-grid">
                    <div>
                      <label style={label()}>Estado del recibo</label>
                      <select style={input()} value={receiptStatus} onChange={(e) => setReceiptStatus(e.target.value as ReceiptStatus)}>
                        {RECEIPT_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={label()}>Fecha de entrega</label>
                      <input style={input()} type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
                    </div>
                    <div>
                      <label style={label()}>Hora de entrega (opcional)</label>
                      <input style={input()} type="time" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.6 }}>
                    Al convertir, el recibo guarda su estado y, si pones fecha de entrega, se sincroniza automaticamente con la agenda de pedidos. La hora puede quedar vacia si puedes entregar en cualquier momento del dia.
                  </div>
                  {quoteId ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={downloadDeliveryReceiptPDF} style={btn()} type="button">
                        Descargar datos de entrega
                      </button>
                      <button onClick={() => setSignatureSheetOpen(true)} style={btnPrimary()} type="button">
                        Hoja firmable en telefono
                      </button>
                      <button onClick={downloadShippingLabelPDF} style={btn()} type="button">
                        Descargar etiqueta de envio
                      </button>
                    </div>
                  ) : null}
                </div>

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
                  {receiptId ? "Actualizar recibo" : "Convertir a recibo"}
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
                            onFocus={() => focusLine(idx)}
                            onChange={(e) => updateItem(idx, { description: e.target.value })}
                            placeholder="Ej. Caja de guantes de nitrilo"
                          />
                          {renderCatalogAssist(idx)}
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
                          onFocus={() => focusLine(idx)}
                          onChange={(e) => updateItem(idx, { description: e.target.value })}
                          placeholder="Ej. Caja de guantes de nitrilo"
                        />
                        <div style={{ marginTop: 8 }}>{renderCatalogAssist(idx)}</div>
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

      {signatureSheetOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(2, 6, 23, 0.88)",
            backdropFilter: "blur(6px)",
            padding: 12,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              maxWidth: 760,
              margin: "0 auto",
              background: "#ffffff",
              color: "#0f172a",
              borderRadius: 24,
              padding: 18,
              boxShadow: "0 30px 80px rgba(0,0,0,0.3)",
              display: "grid",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.4, color: "#2563eb", textTransform: "uppercase" }}>
                  HST GLOBAL STORE
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>Hoja de entrega firmable</div>
                <div style={{ color: "#475569", marginTop: 6, lineHeight: 1.5 }}>
                  Muestra esta hoja en el telefono para que el cliente firme con el dedo o con stylus.
                </div>
              </div>
              <button onClick={() => setSignatureSheetOpen(false)} style={btn()} type="button">
                Cerrar
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                background: "#f8fafc",
                border: "1px solid #dbe4f0",
                borderRadius: 18,
                padding: 14,
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Cliente</div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>{clientName || "Sin nombre"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Documento</div>
                <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{clientId || "-"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Direccion</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{clientAddress || "-"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Entrega</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{formatDeliveryWindow(deliveryDate, deliveryTime)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Cotizacion</div>
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{quoteNo || "-"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Total recibido</div>
                <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>$ {money(totals.totalFinal)}</div>
              </div>
            </div>

            <div style={{ border: "1px solid #dbe4f0", borderRadius: 18, overflow: "hidden" }}>
              <div style={{ padding: "12px 14px", background: "#eff6ff", borderBottom: "1px solid #dbe4f0", fontWeight: 800 }}>
                Productos entregados
              </div>
              <div style={{ display: "grid", gap: 10, padding: 14 }}>
                {totals.lines.map((line, index) => (
                  <div key={`${line.description}-${index}`} style={{ display: "grid", gridTemplateColumns: "60px 1fr auto", gap: 10, alignItems: "start" }}>
                    <div style={{ fontWeight: 800 }}>{line.qty}</div>
                    <div style={{ fontWeight: 700 }}>{line.description || "-"}</div>
                    <div style={{ fontWeight: 800 }}>$ {money(line.total)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 900 }}>Firma del cliente</div>
              <div style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6 }}>
                Pide al cliente que firme dentro del recuadro. Luego toca <b>Descargar PDF firmado</b>.
              </div>
              <canvas
                ref={signatureCanvasRef}
                onPointerDown={handleSignatureStart}
                onPointerMove={handleSignatureMove}
                onPointerUp={handleSignatureEnd}
                onPointerLeave={handleSignatureEnd}
                style={{
                  width: "100%",
                  height: 220,
                  background: "#ffffff",
                  borderRadius: 18,
                  border: "2px dashed #93c5fd",
                  touchAction: "none",
                }}
              />
            </div>

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <button onClick={clearSignature} style={btn()} type="button">
                Limpiar firma
              </button>
              <button onClick={downloadSignedDeliveryReceiptPDF} style={btnPrimary()} type="button">
                Descargar PDF firmado
              </button>
            </div>
          </div>
        </div>
      ) : null}
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

const suggestionBox: React.CSSProperties = {
  display: "grid",
  gap: 6,
  padding: 8,
  borderRadius: 14,
  border: "1px solid rgba(148, 163, 184, 0.14)",
  background: "rgba(8, 14, 24, 0.96)",
  maxHeight: 240,
  overflowY: "auto",
};

const suggestionRow: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.12)",
  background: "rgba(15, 23, 37, 0.82)",
  cursor: "pointer",
};

const suggestionMeta: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  marginTop: 4,
};

const variantPicker: React.CSSProperties = {
  display: "grid",
  gap: 14,
  padding: 12,
  borderRadius: 16,
  border: "1px solid rgba(148, 163, 184, 0.12)",
  background: "rgba(15, 23, 37, 0.55)",
};

const variantGroupLabel: React.CSSProperties = {
  color: "#e2e8f0",
  fontSize: 13,
  fontWeight: 800,
  textTransform: "capitalize",
};

const variantChips: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const variantChip: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 16,
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "#ffffff",
  color: "#0f172a",
  fontWeight: 700,
  cursor: "pointer",
};

const variantChipActive: React.CSSProperties = {
  background: "linear-gradient(135deg, #2b8cff 0%, #1d6fe8 100%)",
  border: "1px solid rgba(96, 165, 250, 0.3)",
  color: "#ffffff",
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
