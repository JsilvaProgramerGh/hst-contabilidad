import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { normalizeText, parseSupplierProforma, productTerms, type SupplierProforma } from "@/lib/supplier-proformas";

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const digest = (value: string) => createHash("sha256").update(value).digest();

function reply(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const secret = process.env.SUPPLIER_PROFORMAS_ACCESS_KEY;
  if (!secret || secret.length < 32) return reply({ error: "El historial de proformas todavía no está configurado." }, 503);
  const authorization = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`))) {
    return reply({ error: "Clave de proformas incorrecta." }, 401);
  }

  try {
    const raw = await request.text();
    if (raw.length > 600_000) return reply({ error: "El contenido supera el tamaño admitido." }, 413);
    let input;
    try { input = JSON.parse(raw); } catch { return reply({ error: "Solicitud inválida." }, 400); }
    const sb = supabaseServer();

    if (input?.action === "suppliers") {
      const { data, error } = await sb.from("inv_suppliers").select("id,name").order("name").limit(1000);
      if (error) throw error;
      return reply({ suppliers: data });
    }

    if (input?.action === "save" && typeof input.text === "string") {
      const parsed = parseSupplierProforma(input.text);
      if (!parsed.proforma) return reply({ error: "Revisa el formato de la proforma.", errors: parsed.errors }, 400);
      const source = parsed.proforma;
      let supplierId: string | null = null;
      if (input.supplierId) {
        if (typeof input.supplierId !== "string" || !uuid.test(input.supplierId)) return reply({ error: "Proveedor inválido." }, 400);
        const { data, error } = await sb.from("inv_suppliers").select("id").eq("id", input.supplierId).maybeSingle();
        if (error) throw error;
        if (!data) return reply({ error: "El proveedor seleccionado ya no existe." }, 400);
        supplierId = data.id;
      }
      const fingerprint = digest(JSON.stringify({
        ...source, items: source.items.map(({ code, product, details, quantity, presentation, pack, unit, price, availabilityNote }) =>
          ({ code, product, details, quantity, presentation, pack, unit, price, availabilityNote })),
      })).toString("hex");
      const { data, error } = await sb.from("supplier_proformas").upsert({
        fingerprint, supplier_id: supplierId, supplier_key: normalizeText(source.supplier), source,
      }, { onConflict: "fingerprint", ignoreDuplicates: true }).select("id");
      if (error) throw error;
      const existing = data?.[0];
      if (existing) return reply({ id: existing.id, duplicate: false }, 201);
      const found = await sb.from("supplier_proformas").select("id").eq("fingerprint", fingerprint).single();
      if (found.error) throw found.error;
      return reply({ id: found.data.id, duplicate: true });
    }

    if (input?.action === "search") {
      const query = typeof input.query === "string" ? input.query.slice(0, 500) : "";
      const supplier = typeof input.supplier === "string" ? normalizeText(input.supplier.slice(0, 200)) : "";
      const offset = Number.isSafeInteger(input.offset) && input.offset >= 0 ? input.offset : 0;
      if (typeof input.proformaId === "string" && uuid.test(input.proformaId)) {
        const { data, error } = await sb.from("supplier_proformas").select("id,supplier_id,source").eq("id", input.proformaId).maybeSingle();
        if (error) throw error;
        if (!data) return reply({ error: "No se encontró la proforma." }, 404);
        const { items, ...source } = data.source as SupplierProforma;
        const offers = items.slice(offset, offset + 50).map((offer, index) => ({
          ...source, id: data.id, supplierId: data.supplier_id, offer, line: offset + index,
        }));
        return reply({ offers, more: offset + 50 < items.length });
      }
      let terms = productTerms(query);
      // Keep literal supplier references searchable alongside normalized product words.
      const queryCode = /^[a-z0-9][a-z0-9._/-]*$/i.test(query.trim()) ? normalizeText(query) : "";
      let reference = "";
      let supplierKey = "";
      let identity = "";
      let variant: string | null = null;
      let basis = {};
      const similar = typeof input.id === "string" && uuid.test(input.id) && Number.isSafeInteger(input.line) && input.line >= 0;
      if (similar) {
        const { data, error } = await sb.from("supplier_proformas").select("source,supplier_key").eq("id", input.id).maybeSingle();
        if (error) throw error;
        const base = data?.source.items[input.line];
        if (!base) return reply({ error: "No se encontró la oferta de referencia." }, 404);
        terms = base.terms;
        reference = base.code.toLowerCase();
        supplierKey = data.supplier_key;
        identity = base.identity;
        variant = base.variantId ?? null;
        basis = {
          currency: data.source.currency, tax: data.source.tax, unit: base.unit, pack: base.pack,
          today: new Date().toLocaleDateString("sv-SE", { timeZone: "America/Guayaquil" }),
        };
      }
      const { data, error } = await sb.rpc("search_supplier_offers", {
        p_terms: terms, p_supplier: supplier, p_similar: similar, p_offset: offset,
        p_identity: identity, p_variant: variant, p_reference: reference, p_supplier_key: supplierKey, p_code: queryCode, p_basis: basis,
      });
      if (error) throw error;
      return reply({ offers: data.slice(0, 50), more: data.length > 50 });
    }

    if (input?.action === "link" && typeof input.id === "string" && uuid.test(input.id) &&
        Number.isSafeInteger(input.line) && input.line >= 0 && input.line < 500 &&
        (input.variant === null || typeof input.variant === "string" && uuid.test(input.variant))) {
      if (input.variant) {
        const { data, error } = await sb.from("inv_variants").select("id").eq("id", input.variant).eq("active", true).maybeSingle();
        if (error) throw error;
        if (!data) return reply({ error: "La variante seleccionada ya no está activa." }, 400);
      }
      const { data, error } = await sb.rpc("link_supplier_offer", {
        p_id: input.id, p_line: input.line, p_variant: input.variant,
      });
      if (error) throw error;
      return data ? reply({ linked: true }) : reply({ error: "No se encontró la oferta." }, 404);
    }
    return reply({ error: "Solicitud inválida." }, 400);
  } catch {
    return reply({ error: "No se pudo acceder al historial de proformas." }, 502);
  }
}
