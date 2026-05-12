import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_ID = "store_01KPM8QP5K9SCK2B9PDYYDEBPZ";
const API_URL = `https://api-ecommerce.hostinger.com/store/${STORE_ID}`;

function readEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const raw = fs.readFileSync(envPath, "utf8");
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => !line.trim().startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
      }),
  );
}

function skuify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`No pude leer ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchAllProducts() {
  const data = await fetchJson(`${API_URL}/products?limit=250`);
  return data.products || [];
}

async function fetchCollections() {
  const data = await fetchJson(`${API_URL}/collections`);
  return data.collections || [];
}

async function fetchQuantities(productIds) {
  if (!productIds.length) return new Map();

  const params = new URLSearchParams();
  params.set("fields", "inventory_quantity");

  productIds.forEach((id) => {
    params.append("product_ids[]", id);
  });

  const data = await fetchJson(`${API_URL}/variants?${params.toString()}`);
  return new Map(
    (data.variants || []).map((variant) => [
      variant.id,
      Number.isFinite(Number(variant.inventory_quantity))
        ? Number(variant.inventory_quantity)
        : 0,
    ]),
  );
}

function buildProductDescription(product, collectionNames) {
  const parts = [
    product.subtitle ? `Subtitulo: ${product.subtitle}` : "",
    product.ribbon_text ? `Etiqueta web: ${product.ribbon_text}` : "",
    htmlToText(product.description),
    collectionNames.length ? `Colecciones web: ${collectionNames.join(", ")}` : "",
    product.url_handle ? `Slug web: ${product.url_handle}` : "",
  ].filter(Boolean);

  return parts.join(" | ") || null;
}

function buildProductPayload(product, collectionNames, categoryId) {
  return {
    name: product.title,
    sku: `WEB-${skuify(product.url_handle || product.slug || product.title)}`,
    unit: "unidad",
    description: buildProductDescription(product, collectionNames),
    category_id: categoryId,
    active: Boolean(product.purchasable && product.is_available),
  };
}

function buildVariantName(productTitle, variantTitle, attributes) {
  const values = Object.entries(attributes)
    .filter(([key, value]) => {
      if (!value) return false;
      return !["imagen", "slug_web", "origen_web", "producto_origen_id", "variante_origen_id", "SKU"].includes(key);
    })
    .map(([, value]) => value);
  if (values.length) return `${productTitle} - ${values.join(" / ")}`;
  if (variantTitle && variantTitle !== productTitle) return `${productTitle} - ${variantTitle}`;
  return `${productTitle} - Base`;
}

function buildVariantAttributes(product, variant, optionTitleById) {
  const attributes = {};

  (variant.options || []).forEach((option) => {
    const title = optionTitleById.get(option.option_id) || "Opcion";
    if (option.value) attributes[title] = option.value;
  });

  if (!Object.keys(attributes).length && variant.title && variant.title !== product.title) {
    attributes.Presentacion = variant.title;
  }

  if (variant.weight) {
    attributes.Peso = String(variant.weight);
  }

  if (variant.sku) {
    attributes.SKU = variant.sku;
  }

  if (variant.image_url || product.thumbnail) {
    attributes.imagen = variant.image_url || product.thumbnail;
  }

  if (product.url_handle || product.slug) {
    attributes.slug_web = product.url_handle || product.slug;
  }

  attributes.origen_web = "Hostinger";
  attributes.producto_origen_id = product.id;
  attributes.variante_origen_id = variant.id;

  return attributes;
}

async function ensureRootCategory(supabase, categoryMap, name) {
  const key = name.trim().toLowerCase();
  const existing = categoryMap.get(key);
  if (existing) return existing.id;

  const inserted = await supabase
    .from("inv_categories")
    .insert({ name: name.trim(), parent_id: null })
    .select("id,name,parent_id")
    .single();

  if (inserted.error) throw inserted.error;

  categoryMap.set(key, inserted.data);
  return inserted.data.id;
}

async function main() {
  const env = readEnv();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const [products, collections, categoryRes, existingProductsRes] = await Promise.all([
    fetchAllProducts(),
    fetchCollections(),
    supabase.from("inv_categories").select("id,name,parent_id"),
    supabase.from("inv_products").select("id,name,sku"),
  ]);

  if (categoryRes.error) throw categoryRes.error;
  if (existingProductsRes.error) throw existingProductsRes.error;

  const quantityMap = await fetchQuantities(products.map((product) => product.id));
  const collectionById = new Map(collections.map((collection) => [collection.id, collection]));
  const rootCategoryMap = new Map(
    (categoryRes.data || [])
      .filter((category) => !category.parent_id)
      .map((category) => [String(category.name || "").trim().toLowerCase(), category]),
  );
  const existingBySku = new Map(
    (existingProductsRes.data || [])
      .filter((product) => product.sku)
      .map((product) => [product.sku, product]),
  );

  let importedProducts = 0;
  let importedVariants = 0;
  let uncategorizedRootId = null;

  for (const product of products) {
    const productSku = `WEB-${skuify(product.url_handle || product.slug || product.title)}`;

    const collectionNames = (product.product_collections || [])
      .map((entry) => collectionById.get(entry.collection_id)?.title)
      .filter(Boolean);

    let categoryId = null;
    if (collectionNames.length) {
      categoryId = await ensureRootCategory(supabase, rootCategoryMap, collectionNames[0]);
    } else {
      uncategorizedRootId =
        uncategorizedRootId ||
        (await ensureRootCategory(supabase, rootCategoryMap, "Catalogo web"));
      categoryId = uncategorizedRootId;
    }

    const productPayload = buildProductPayload(product, collectionNames, categoryId);
    const existingProduct = existingBySku.get(productSku);
    let productId = existingProduct?.id;

    if (productId) {
      const updatedProduct = await supabase
        .from("inv_products")
        .update(productPayload)
        .eq("id", productId)
        .select("id")
        .single();
      if (updatedProduct.error) throw updatedProduct.error;
    } else {
      const insertedProduct = await supabase
        .from("inv_products")
        .insert(productPayload)
        .select("id,name,sku")
        .single();

      if (insertedProduct.error) throw insertedProduct.error;
      productId = insertedProduct.data.id;
      existingBySku.set(productSku, insertedProduct.data);
      importedProducts += 1;
    }

    const existingVariantsRes = await supabase
      .from("inv_variants")
      .select("id,name,attributes")
      .eq("product_id", productId);

    if (existingVariantsRes.error) throw existingVariantsRes.error;

    const existingVariantsByName = new Map(
      (existingVariantsRes.data || []).map((variant) => [variant.name, variant]),
    );
    const existingVariantsBySourceId = new Map(
      (existingVariantsRes.data || [])
        .filter((variant) => variant.attributes?.variante_origen_id)
        .map((variant) => [variant.attributes.variante_origen_id, variant]),
    );
    const matchedVariantIds = new Set();

    const optionTitleById = new Map(
      (product.options || []).map((option) => [option.id, option.title || "Opcion"]),
    );

    for (const variant of product.variants || []) {
      const attributes = buildVariantAttributes(product, variant, optionTitleById);
      const variantName = buildVariantName(product.title, variant.title, attributes);
      const salePrice =
        Number(variant.prices?.[0]?.sale_amount ?? variant.prices?.[0]?.amount ?? 0) / 100;
      const stockQty = Number(quantityMap.get(variant.id) ?? 0);

      const existingVariant =
        existingVariantsByName.get(variantName) ||
        existingVariantsBySourceId.get(variant.id);
      let variantId = existingVariant?.id;

      if (variantId) {
        const updatedVariant = await supabase
          .from("inv_variants")
          .update({
            name: variantName,
            attributes,
            active: Boolean(variant.is_available),
          })
          .eq("id", variantId)
          .select("id")
          .single();
        if (updatedVariant.error) throw updatedVariant.error;
      } else {
        const insertedVariant = await supabase
          .from("inv_variants")
          .insert({
            product_id: productId,
            name: variantName,
            attributes,
            active: Boolean(variant.is_available),
          })
          .select("id,name")
          .single();

        if (insertedVariant.error) throw insertedVariant.error;
        variantId = insertedVariant.data.id;
        existingVariantsByName.set(variantName, insertedVariant.data);
        importedVariants += 1;
      }
      matchedVariantIds.add(variantId);

      const stockRes = await supabase.from("inv_variant_stock").upsert(
        {
          variant_id: variantId,
          qty: stockQty,
          min_qty: 0,
        },
        { onConflict: "variant_id" },
      );
      if (stockRes.error) throw stockRes.error;

      const saleRes = await supabase.from("inv_variant_sales").upsert(
        {
          variant_id: variantId,
          sale_price: Number.isFinite(salePrice) ? salePrice : 0,
          allow_discount: true,
        },
        { onConflict: "variant_id" },
      );
      if (saleRes.error) throw saleRes.error;
    }

    const staleVariantIds = (existingVariantsRes.data || [])
      .filter((variant) => {
        const sourceId = variant.attributes?.variante_origen_id;
        return Boolean(sourceId && !matchedVariantIds.has(variant.id));
      })
      .map((variant) => variant.id);

    if (staleVariantIds.length) {
      const deleteStock = await supabase.from("inv_variant_stock").delete().in("variant_id", staleVariantIds);
      if (deleteStock.error) throw deleteStock.error;

      const deleteSales = await supabase.from("inv_variant_sales").delete().in("variant_id", staleVariantIds);
      if (deleteSales.error) throw deleteSales.error;

      const deleteVariants = await supabase.from("inv_variants").delete().in("id", staleVariantIds);
      if (deleteVariants.error) throw deleteVariants.error;
    }
  }

  console.log(
    JSON.stringify(
        {
          importedProducts,
          importedVariants,
          sourceProducts: products.length,
        },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
