"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { supabase } from "../lib/supabase";

type OrderStatus = "PENDIENTE" | "EN_RUTA" | "ENTREGADO" | "REPROGRAMADO" | "CANCELADO";
type Priority = "ALTA" | "MEDIA" | "BAJA";

type DeliveryOrder = {
  id: string;
  delivery_date: string;
  client_name: string;
  phone: string | null;
  address: string;
  reference: string | null;
  notes: string | null;
  amount: number | null;
  time_window: string | null;
  priority: Priority;
  status: OrderStatus;
  latitude: number | null;
  longitude: number | null;
  route_position: number | null;
  created_at?: string | null;
};

const today = new Date().toISOString().slice(0, 10);

const emptyForm = {
  delivery_date: today,
  client_name: "",
  phone: "",
  address: "",
  reference: "",
  notes: "",
  amount: "",
  time_window: "",
  priority: "MEDIA" as Priority,
  status: "PENDIENTE" as OrderStatus,
  latitude: "",
  longitude: "",
  maps_coords: "",
};

function toNumber(value: string) {
  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("es-EC", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function geocodeAddress(address: string, reference?: string | null) {
  const query = [address, reference, "Ecuador"].filter(Boolean).join(", ");
  const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "No pude ubicar la direccion.");
  return json.data as { latitude: number; longitude: number; label: string } | null;
}

async function reverseGeocode(latitude: string, longitude: string) {
  const response = await fetch(`/api/geocode?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "No pude interpretar las coordenadas.");
  return json.data as { label: string; address: Record<string, string> };
}

function parseCombinedCoordinates(value: string) {
  const raw = value.trim();
  if (!raw) return null;

  const normalized = raw.startsWith("http") ? raw : raw.startsWith("www.") ? `https://${raw}` : raw;

  try {
    if (/google\.[^/]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(normalized)) {
      const url = new URL(normalized);
      const queryCandidates = [
        url.searchParams.get("q"),
        url.searchParams.get("query"),
        url.searchParams.get("ll"),
        url.searchParams.get("destination"),
        url.searchParams.get("origin"),
      ].filter(Boolean) as string[];

      for (const candidate of queryCandidates) {
        const direct = candidate.match(/(-?\d+(?:[.,]\d+)?)\s*,\s*(-?\d+(?:[.,]\d+)?)/);
        if (direct) {
          return {
            latitude: direct[1].replace(",", "."),
            longitude: direct[2].replace(",", "."),
          };
        }
      }

      const pathPatterns = [
        /@(-?\d+(?:[.,]\d+)?),\s*(-?\d+(?:[.,]\d+)?)/,
        /!3d(-?\d+(?:[.,]\d+)?)!4d(-?\d+(?:[.,]\d+)?)/,
        /\/dir\/(-?\d+(?:[.,]\d+)?),\s*(-?\d+(?:[.,]\d+)?)/,
      ];

      for (const pattern of pathPatterns) {
        const match = normalized.match(pattern);
        if (match) {
          return {
            latitude: match[1].replace(",", "."),
            longitude: match[2].replace(",", "."),
          };
        }
      }

      return null;
    }
  } catch {
    // Si no era una URL valida, seguimos con los formatos de texto normales.
  }

  const patterns = [
    /@(-?\d+(?:[.,]\d+)?),\s*(-?\d+(?:[.,]\d+)?)/,
    /!3d(-?\d+(?:[.,]\d+)?)!4d(-?\d+(?:[.,]\d+)?)/,
    /[?&](?:q|query)=(-?\d+(?:[.,]\d+)?),\s*(-?\d+(?:[.,]\d+)?)/,
    /^(-?\d+(?:[.,]\d+)?)\s*,\s*(-?\d+(?:[.,]\d+)?)$/,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) {
      return {
        latitude: match[1].replace(",", "."),
        longitude: match[2].replace(",", "."),
      };
    }
  }

  const matches = raw.match(/-?\d+(?:[.,]\d+)?/g);
  if (!matches || matches.length < 2) return null;

  const latitude = matches[0].replace(",", ".");
  const longitude = matches[1].replace(",", ".");
  return { latitude, longitude };
}

function parseCoordsFromValues(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const parsed = parseCombinedCoordinates(String(value || ""));
    if (parsed) {
      const lat = Number(parsed.latitude);
      const lng = Number(parsed.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }
  }
  return null;
}

function stripMapsLinks(value: string | null | undefined) {
  return String(value || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/www\.\S+/gi, " ")
    .replace(/google\.com\/maps\S*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function parseTimeToMinutes(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return Number.POSITIVE_INFINITY;
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return Number.POSITIVE_INFINITY;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.POSITIVE_INFINITY;
  return hours * 60 + minutes;
}

function compareOrdersByDateAndTime(a: DeliveryOrder, b: DeliveryOrder) {
  const byDate = String(a.delivery_date || "").localeCompare(String(b.delivery_date || ""));
  if (byDate !== 0) return byDate;

  const byTime = parseTimeToMinutes(a.time_window) - parseTimeToMinutes(b.time_window);
  if (byTime !== 0) return byTime;

  const byPosition = (a.route_position ?? 9999) - (b.route_position ?? 9999);
  if (byPosition !== 0) return byPosition;

  return String(a.client_name || "").localeCompare(String(b.client_name || ""));
}

function getOrderCoords(row: DeliveryOrder) {
  if (row.latitude != null && row.longitude != null) {
    return { lat: Number(row.latitude), lng: Number(row.longitude) };
  }

  return parseCoordsFromValues(row.address, row.reference, row.notes, row.client_name);
}

function orderRouteByLocation(orders: DeliveryOrder[], location: { lat: number; lng: number } | null) {
  const active = orders.filter((row) => row.status !== "ENTREGADO" && row.status !== "CANCELADO");
  if (!location) {
    return [...active].sort(compareOrdersByDateAndTime);
  }

  const withCoords = active.filter((row) => Boolean(getOrderCoords(row)));
  const withoutCoords = active.filter((row) => !getOrderCoords(row));
  const ordered: DeliveryOrder[] = [];
  let current = { lat: location.lat, lng: location.lng };
  const pool = [...withCoords];

  while (pool.length) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    pool.forEach((row, index) => {
      const coords = getOrderCoords(row);
      if (!coords) return;
      const distance = haversineKm(current.lat, current.lng, coords.lat, coords.lng);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    const [next] = pool.splice(bestIndex, 1);
    ordered.push(next);
    current = getOrderCoords(next) || current;
  }

  return [...ordered, ...withoutCoords].sort((a, b) => {
    const byTime = parseTimeToMinutes(a.time_window) - parseTimeToMinutes(b.time_window);
    if (byTime !== 0) return byTime;
    return String(a.client_name || "").localeCompare(String(b.client_name || ""));
  });
}

function getMapsStopValue(row: DeliveryOrder) {
  const coords = getOrderCoords(row);
  if (coords) {
    return `${coords.lat},${coords.lng}`;
  }
  const cleanedAddress = stripMapsLinks(row.address);
  if (cleanedAddress) {
    return cleanedAddress;
  }
  return "";
}

export default function AgendaPedidosPage() {
  const [rows, setRows] = useState<DeliveryOrder[]>([]);
  const [status, setStatus] = useState("Cargando pedidos...");
  const [tableReady, setTableReady] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [routeDate, setRouteDate] = useState(today);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [manualRouteIds, setManualRouteIds] = useState<string[]>([]);

  async function loadOrders() {
    setLoading(true);
    const { data, error } = await supabase
      .from("delivery_orders")
      .select("*")
      .order("delivery_date", { ascending: true })
      .order("route_position", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(400);

    if (error) {
      setRows([]);
      setTableReady(false);
      setStatus(`No pude leer delivery_orders: ${error.message}`);
      setLoading(false);
      return;
    }

    const sortedRows = [...((data as DeliveryOrder[]) || [])].sort(compareOrdersByDateAndTime);
    setRows(sortedRows);
    setTableReady(true);
    setStatus(`Pedidos cargados: ${(data || []).length}`);
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.client_name, row.phone, row.address, row.reference, row.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [rows, query]);

  const dailyOrders = useMemo(() => {
    return filtered.filter((row) => row.delivery_date === routeDate);
  }, [filtered, routeDate]);

  const routeOrders = useMemo(() => {
    return orderRouteByLocation(dailyOrders, geo);
  }, [dailyOrders, geo]);

  useEffect(() => {
    setManualRouteIds((prev) => {
      const ids = routeOrders.map((row) => row.id);
      const kept = prev.filter((id) => ids.includes(id));
      const missing = ids.filter((id) => !kept.includes(id));
      return [...kept, ...missing];
    });
  }, [routeOrders]);

  const orderedForDisplay = useMemo(() => {
    if (!manualRouteIds.length) return routeOrders;
    const map = new Map(routeOrders.map((row) => [row.id, row]));
    const arranged = manualRouteIds.map((id) => map.get(id)).filter((row): row is DeliveryOrder => Boolean(row));
    const missing = routeOrders.filter((row) => !manualRouteIds.includes(row.id));
    return [...arranged, ...missing];
  }, [routeOrders, manualRouteIds]);

  const productsSummary = useMemo(() => {
    const counts = new Map<string, number>();

    dailyOrders.forEach((row) => {
      const raw = stripMapsLinks(row.notes) || stripMapsLinks(row.reference);
      if (!raw) return;

      raw
        .split(/\n|,|;|•|·/g)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((item) => {
          const key = item.toLowerCase();
          counts.set(key, (counts.get(key) || 0) + 1);
        });
    });

    return Array.from(counts.entries())
      .map(([key, qty]) => ({ label: key, qty }))
      .sort((a, b) => b.qty - a.qty || a.label.localeCompare(b.label));
  }, [dailyOrders]);

  const deliveredToday = dailyOrders.filter((row) => row.status === "ENTREGADO").length;
  const pendingToday = dailyOrders.filter((row) => row.status === "PENDIENTE" || row.status === "EN_RUTA").length;
  const missingCoordsToday = dailyOrders.filter((row) => !getOrderCoords(row)).length;

  function resetForm() {
    setSelectedId(null);
    setForm({ ...emptyForm, delivery_date: routeDate });
  }

  function editOrder(row: DeliveryOrder) {
    setSelectedId(row.id);
    setForm({
      delivery_date: row.delivery_date,
      client_name: row.client_name,
      phone: row.phone || "",
      address: row.address,
      reference: row.reference || "",
      notes: row.notes || "",
      amount: row.amount != null ? String(row.amount) : "",
      time_window: row.time_window || "",
      priority: row.priority,
      status: row.status,
      latitude: row.latitude != null ? String(row.latitude) : "",
      longitude: row.longitude != null ? String(row.longitude) : "",
      maps_coords: row.latitude != null && row.longitude != null ? `${row.latitude}, ${row.longitude}` : "",
    });
  }

  async function saveOrder() {
    if (!form.delivery_date) {
      return alert("Primero elige la fecha del pedido.");
    }

    if (!form.client_name.trim() || !form.address.trim()) {
      return alert("Pon al menos fecha, cliente y direccion.");
    }

    setLoading(true);
    setStatus(selectedId ? "Actualizando pedido..." : "Guardando pedido...");

    const extractedCoords =
      parseCoordsFromValues(form.maps_coords, form.address, form.reference, form.notes, form.client_name) ||
      (form.latitude && form.longitude
        ? { lat: Number(form.latitude), lng: Number(form.longitude) }
        : null);

    const payload = {
      delivery_date: form.delivery_date,
      client_name: form.client_name.trim(),
      phone: form.phone.trim() || null,
      address: form.address.trim(),
      reference: form.reference.trim() || null,
      notes: form.notes.trim() || null,
      amount: toNumber(form.amount) ?? 0,
      time_window: form.time_window.trim() || null,
      priority: form.priority,
      status: form.status,
      latitude: extractedCoords?.lat ?? toNumber(form.latitude),
      longitude: extractedCoords?.lng ?? toNumber(form.longitude),
    };

    const query = selectedId
      ? supabase.from("delivery_orders").update(payload).eq("id", selectedId)
      : supabase.from("delivery_orders").insert(payload);

    const { error } = await query;
    if (error) {
      setStatus(`No pude guardar el pedido: ${error.message}`);
      setLoading(false);
      return;
    }

    resetForm();
    await loadOrders();
  }

  async function applyAddressLookup() {
    const extracted = parseCoordsFromValues(form.maps_coords, form.address, form.reference, form.notes, form.client_name);
    if (extracted) {
      setForm((prev) => ({
        ...prev,
        latitude: String(extracted.lat),
        longitude: String(extracted.lng),
        maps_coords: `${extracted.lat}, ${extracted.lng}`,
      }));
      setStatus("Encontre coordenadas directamente desde el link o texto pegado.");
      return;
    }

    if (!stripMapsLinks(form.address).trim()) {
      setStatus("Primero escribe una direccion.");
      return;
    }

    setStatus("Buscando coordenadas desde la direccion...");

    try {
      const located = await geocodeAddress(stripMapsLinks(form.address), stripMapsLinks(form.reference));
      if (!located) {
        setStatus("No pude ubicar esa direccion. Intenta ponerla mas completa.");
        return;
      }

      setForm((prev) => ({
        ...prev,
        latitude: String(located.latitude),
        longitude: String(located.longitude),
        maps_coords: `${located.latitude}, ${located.longitude}`,
      }));

      setStatus("Direccion ubicada de forma aproximada. Verifica antes de guardar.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No pude ubicar esa direccion.");
    }
  }

  async function applyMapsCoordinates(raw: string) {
    const parsed = parseCombinedCoordinates(raw);
    if (!parsed) {
      setStatus("No pude leer esas coordenadas. Pegalas como latitud,longitud.");
      return;
    }

    setForm((prev) => ({
      ...prev,
      maps_coords: raw,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
    }));

    try {
      const data = await reverseGeocode(parsed.latitude, parsed.longitude);
      const pieces = [
        data.address?.road,
        data.address?.house_number,
        data.address?.suburb,
        data.address?.city || data.address?.town || data.address?.village,
      ].filter(Boolean);

      setForm((prev) => ({
        ...prev,
        maps_coords: raw,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        address: prev.address.trim() ? prev.address : (pieces.join(", ") || data.label || prev.address),
        reference:
          prev.reference.trim() ||
          [data.address?.neighbourhood, data.address?.state_district, data.address?.state]
            .filter(Boolean)
            .join(", "),
      }));

      setStatus("Coordenadas pegadas y direccion completada.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Coordenadas guardadas, pero no pude completar la direccion.");
    }
  }

  async function fillMissingCoordinates() {
    const pending = dailyOrders.filter((row) => !getOrderCoords(row) || row.latitude == null || row.longitude == null);
    if (!pending.length) {
      setStatus("Todos los pedidos del dia ya tienen coordenadas.");
      return;
    }

    setLoading(true);
    setStatus("Buscando coordenadas para los pedidos del dia...");

    let updated = 0;
    for (const row of pending) {
      try {
        const extracted = parseCoordsFromValues(row.address, row.reference, row.notes, row.client_name);
        const located =
          extracted ||
          (await geocodeAddress(stripMapsLinks(row.address), stripMapsLinks(row.reference)));
        if (!located) continue;
        const { error } = await supabase
          .from("delivery_orders")
          .update({
            latitude: "latitude" in located ? located.latitude : located.lat,
            longitude: "longitude" in located ? located.longitude : located.lng,
          })
          .eq("id", row.id);
        if (!error) updated += 1;
      } catch {
        // dejamos pasar los que no pudo ubicar
      }
    }

    await loadOrders();
    setLoading(false);
    setStatus(
      updated
        ? `Listo. Coordenadas completadas: ${updated}`
        : "No pude completar coordenadas automaticamente con las direcciones actuales."
    );
  }

  function openCurrentPinInMaps() {
    const parsed =
      parseCombinedCoordinates(form.maps_coords) ||
      parseCombinedCoordinates(form.address) ||
      parseCombinedCoordinates(form.reference) ||
      (form.latitude && form.longitude ? { latitude: form.latitude, longitude: form.longitude } : null);
    if (parsed) {
      window.open(`https://www.google.com/maps?q=${parsed.latitude},${parsed.longitude}`, "_blank");
      return;
    }

    const lookupAddress = [stripMapsLinks(form.address), stripMapsLinks(form.reference)].filter(Boolean).join(", ");
    if (lookupAddress) {
      window.open(`https://www.google.com/maps/search/${encodeURIComponent(lookupAddress)}`, "_blank");
      return;
    }

    alert("Primero pega coordenadas o escribe una direccion.");
  }

  async function updateStatus(id: string, nextStatus: OrderStatus) {
    const { error } = await supabase.from("delivery_orders").update({ status: nextStatus }).eq("id", id);
    if (error) return setStatus(`No pude actualizar el pedido: ${error.message}`);
    await loadOrders();
  }

  async function deleteOrder(id: string) {
    if (!confirm("¿Eliminar este pedido?")) return;
    const { error } = await supabase.from("delivery_orders").delete().eq("id", id);
    if (error) return setStatus(`No pude eliminar el pedido: ${error.message}`);
    await loadOrders();
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) return alert("Tu navegador no permite geolocalizacion.");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeo({ lat: position.coords.latitude, lng: position.coords.longitude });
        setStatus("Ubicacion lista para ordenar la ruta.");
      },
      () => alert("No pude leer tu ubicacion actual.")
    );
  }

  async function saveRouteOrder() {
    if (!orderedForDisplay.length) return;
    for (let index = 0; index < orderedForDisplay.length; index += 1) {
      await supabase
        .from("delivery_orders")
        .update({ route_position: index + 1 })
        .eq("id", orderedForDisplay[index].id);
    }
    await loadOrders();
    setStatus("Ruta guardada para el dia.");
  }

  function moveStop(id: string, direction: "up" | "down") {
    setManualRouteIds((prev) => {
      const next = prev.length ? [...prev] : routeOrders.map((row) => row.id);
      const index = next.indexOf(id);
      if (index === -1) return next;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return next;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setStatus("Orden manual listo. Guarda el orden cuando termines.");
  }

  function resetAutomaticOrder() {
    setManualRouteIds(routeOrders.map((row) => row.id));
    setStatus("Orden automatico restaurado para este dia.");
  }

function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function launchGoogleMapsRoute(orderedStops: DeliveryOrder[], targetWindow?: Window | null) {
  const usable = orderedStops.filter((row) => Boolean(getMapsStopValue(row)));
  if (usable.length === 0) {
    alert("No hay direcciones listas para armar la ruta.");
    if (targetWindow && !targetWindow.closed) targetWindow.close();
    return;
  }

  const stopValues = usable
    .map(getMapsStopValue)
    .filter(Boolean)
    .slice(0, 9);

  const routePath = stopValues.map((value) => encodeURIComponent(value)).join("/");
  const url = `https://www.google.com/maps/dir/${routePath}`;

    if (targetWindow && !targetWindow.closed) {
      targetWindow.location.href = url;
      return;
    }

    if (isMobileDevice()) {
      window.location.href = url;
      return;
    }

    window.open(url, "_blank");
  }

  function openGoogleMapsRoute() {
    const routeWindow = isMobileDevice() ? null : window.open("", "_blank");

    const startRoute = (location: { lat: number; lng: number } | null) => {
      const orderedStops = orderedForDisplay.length ? orderedForDisplay : orderRouteByLocation(dailyOrders, location);
      const startStop: DeliveryOrder[] = location
        ? [
            {
              id: "__origin__",
              delivery_date: routeDate,
              client_name: "Tu ubicacion",
              phone: null,
              address: `${location.lat},${location.lng}`,
              reference: null,
              notes: null,
              amount: 0,
              time_window: null,
              priority: "MEDIA",
              status: "PENDIENTE",
              latitude: location.lat,
              longitude: location.lng,
              route_position: 0,
            },
          ]
        : [];
      const routeWithOrigin = location ? [...startStop, ...orderedStops] : orderedStops;
      if (location) {
        setGeo(location);
        setStatus("Ruta abierta usando coordenadas y ordenada desde tu ubicacion actual.");
      } else {
        setStatus("Ruta abierta con coordenadas disponibles. Puedes elegir el modo de viaje en Maps.");
      }
      launchGoogleMapsRoute(routeWithOrigin, routeWindow);
    };

    if (!navigator.geolocation) {
      startRoute(geo);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        startRoute({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        startRoute(geo);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  return (
    <main style={page} className="mobile-agenda-page">
      <section style={hero} className="mobile-agenda-hero">
        <div>
          <div style={eyebrow}>Operacion diaria</div>
          <h1 style={title}>Agenda de pedidos</h1>
          <p style={subtitle}>
            Guarda entregas pendientes, organiza envios del dia y arma una ruta util desde tu ubicacion.
          </p>
        </div>

        <div style={heroActions}>
          <Link href="/" style={ghostLink}>Volver al panel</Link>
          <button type="button" style={primaryButton} onClick={useCurrentLocation}>Usar mi ubicacion</button>
        </div>
      </section>

      {!tableReady && (
        <section style={warningCard}>
          <h2 style={warningTitle}>Falta preparar la tabla `delivery_orders`</h2>
          <p style={warningText}>
            Corre el SQL de `C:\Users\julia\hst-contabilidad\docs\agenda-tables.sql` en Supabase para activar esta agenda.
          </p>
          <p style={statusText}>{status}</p>
        </section>
      )}

      <section style={statsGrid} className="mobile-agenda-stats">
        <StatCard label="Pedidos del dia" value={String(dailyOrders.length)} />
        <StatCard label="Pendientes hoy" value={String(pendingToday)} />
        <StatCard label="Entregados hoy" value={String(deliveredToday)} />
        <StatCard label="Valor del dia" value={`$ ${formatMoney(dailyOrders.reduce((sum, row) => sum + Number(row.amount || 0), 0))}`} />
      </section>

      <section style={grid} className="mobile-agenda-layout">
        <article style={panel}>
          <div style={panelHeader}>
            <h2 style={panelTitle}>{selectedId ? "Editar pedido" : "Nuevo pedido"}</h2>
            <span style={statusChip}>{status}</span>
          </div>

          <div style={formGrid} className="mobile-agenda-form-grid">
            <Field label="Fecha de entrega">
              <input type="date" style={input} value={form.delivery_date} onChange={(e) => setForm((prev) => ({ ...prev, delivery_date: e.target.value }))} />
            </Field>
            <Field label="Cliente">
              <input style={input} value={form.client_name} onChange={(e) => setForm((prev) => ({ ...prev, client_name: e.target.value }))} placeholder="Jose, Clinica, Farmacia..." />
            </Field>
            <Field label="Telefono">
              <input style={input} value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="098..." />
            </Field>
            <Field label="Hora de entrega (opcional)">
              <input
                type="time"
                  style={input}
                value={form.time_window}
                onChange={(e) => setForm((prev) => ({ ...prev, time_window: e.target.value }))}
              />
            </Field>
            <Field label="Direccion" full>
              <div style={pasteRow} className="mobile-agenda-inline">
                <input
                  style={input}
                  value={form.address}
                  onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                  placeholder="Direccion exacta de entrega"
                />
                <button
                  type="button"
                  style={secondaryButton}
                  onClick={applyAddressLookup}
                >
                  Ubicar direccion
                </button>
              </div>
            </Field>
            <Field label="Coordenadas desde Google Maps" full>
              <div style={pasteRow} className="mobile-agenda-inline">
                <input
                  style={input}
                  value={form.maps_coords}
                  onChange={(e) => setForm((prev) => ({ ...prev, maps_coords: e.target.value }))}
                  placeholder="Ej. -0.200687, -78.500932 o pega el link de Google Maps"
                />
                <button
                  type="button"
                  style={secondaryButton}
                  onClick={() => applyMapsCoordinates(form.maps_coords)}
                >
                  Pegar y completar
                </button>
              </div>
            </Field>
            <Field label="Verificacion rapida" full>
              <div style={helperInline} className="mobile-agenda-inline">
                <div style={helperText}>
                  Lo mas confiable es pegar las coordenadas o el link del pin de Google Maps. La busqueda por calles puede ser aproximada.
                </div>
                <button type="button" style={secondaryButton} onClick={openCurrentPinInMaps}>
                  Ver en Maps
                </button>
              </div>
            </Field>
            <Field label="Referencia" full>
              <input style={input} value={form.reference} onChange={(e) => setForm((prev) => ({ ...prev, reference: e.target.value }))} placeholder="Casa azul, junto al parque, local 3..." />
            </Field>
            <Field label="Prioridad">
              <select style={input} value={form.priority} onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as Priority }))}>
                <option value="ALTA">Alta</option>
                <option value="MEDIA">Media</option>
                <option value="BAJA">Baja</option>
              </select>
            </Field>
            <Field label="Estado">
              <select style={input} value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as OrderStatus }))}>
                <option value="PENDIENTE">Pendiente</option>
                <option value="EN_RUTA">En ruta</option>
                <option value="ENTREGADO">Entregado</option>
                <option value="REPROGRAMADO">Reprogramado</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
            </Field>
            <Field label="Valor del pedido">
              <input style={input} value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value.replace(",", ".") }))} placeholder="Ej. 18,50" />
            </Field>
            <Field label="Latitud">
              <input style={input} value={form.latitude} onChange={(e) => setForm((prev) => ({ ...prev, latitude: e.target.value.replace(",", ".") }))} placeholder="Opcional" />
            </Field>
            <Field label="Longitud">
              <input style={input} value={form.longitude} onChange={(e) => setForm((prev) => ({ ...prev, longitude: e.target.value.replace(",", ".") }))} placeholder="Opcional" />
            </Field>
            <Field label="Notas" full>
              <textarea style={textarea} value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Cobrar en efectivo, entregar en recepcion, no tocar timbre..." />
            </Field>
          </div>

          <div style={buttonRow} className="mobile-agenda-buttons">
            <button type="button" style={primaryButton} onClick={saveOrder} disabled={loading || !tableReady}>
              {selectedId ? "Guardar cambios" : "Guardar pedido"}
            </button>
            <button type="button" style={secondaryButton} onClick={resetForm}>Limpiar</button>
          </div>
        </article>

        <article style={panel}>
          <div style={panelHeader}>
            <h2 style={panelTitle}>Ruta del dia</h2>
            <button type="button" style={secondaryButton} onClick={loadOrders}>Actualizar</button>
          </div>

          <div style={routeControls} className="mobile-agenda-form-grid">
            <label style={field}>
              <span style={fieldLabel}>Fecha a trabajar</span>
              <input type="date" style={input} value={routeDate} onChange={(e) => { setRouteDate(e.target.value); setForm((prev) => ({ ...prev, delivery_date: e.target.value })); }} />
            </label>
            <label style={field}>
              <span style={fieldLabel}>Buscar</span>
              <input style={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cliente, telefono o direccion" />
            </label>
          </div>

          <div style={buttonRow} className="mobile-agenda-buttons">
            <button type="button" style={secondaryButton} onClick={fillMissingCoordinates} disabled={!dailyOrders.length || loading || !tableReady}>
              Completar coordenadas
            </button>
            <button type="button" style={secondaryButton} onClick={saveRouteOrder} disabled={!routeOrders.length || !tableReady}>Guardar orden de ruta</button>
            <button type="button" style={secondaryButton} onClick={resetAutomaticOrder} disabled={!routeOrders.length}>Usar orden automatico</button>
            <button type="button" style={secondaryButton} onClick={openGoogleMapsRoute} disabled={!routeOrders.length}>Abrir ruta en Maps</button>
          </div>

          {missingCoordsToday > 0 ? (
            <div style={helperBox}>
              Hay {missingCoordsToday} pedido(s) del dia sin coordenadas claras. Si pegaste links de Google Maps en direccion, referencia o notas, la app intentara leerlos y convertirlos en coordenadas.
            </div>
          ) : (
            <div style={helperBoxOk}>
              Todos los pedidos visibles ya tienen coordenadas o links validos. La ruta ya puede ordenarse por cercania desde tu ubicacion.
            </div>
          )}

          <div style={{ ...productSummaryCard, marginTop: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Lista rapida de productos del dia</div>
            <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>
              Se arma usando lo que escribes en notas o referencia de los pedidos del dia, para ayudarte a salir con todo preparado.
            </div>
            {productsSummary.length === 0 ? (
              <div style={emptyState}>Aun no detecto productos en notas o referencia para esta fecha.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {productsSummary.map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: 14,
                      background: "rgba(8, 17, 29, 0.92)",
                      border: "1px solid rgba(140, 166, 194, 0.12)",
                    }}
                  >
                    <div style={{ color: "#eef4fb", textTransform: "capitalize" }}>{item.label}</div>
                    <div style={{ color: "#93c5fd", fontWeight: 800 }}>x{item.qty}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={list}>
            {dailyOrders.length === 0 ? (
              <div style={emptyState}>No hay pedidos para esta fecha.</div>
            ) : (
              orderedForDisplay.map((row, index) => (
                <div key={row.id} style={listRow} className="mobile-agenda-list-row">
                  <div style={{ minWidth: 0 }}>
                    <div style={routeBadge}>Parada {index + 1}</div>
                    <div style={rowTitle}>{row.client_name}</div>
                    <div style={rowMeta}>{[row.phone, row.time_window || "Sin hora", row.priority, row.status].filter(Boolean).join(" - ")}</div>
                    <div style={rowAddress}>{row.address}</div>
                    <div style={rowHint}>
                      {row.latitude != null && row.longitude != null ? "Coordenadas listas" : "Sin coordenadas todavia"}
                    </div>
                    {row.reference ? <div style={rowHint}>Referencia: {row.reference}</div> : null}
                    {row.notes ? <div style={rowHint}>Nota: {row.notes}</div> : null}
                  </div>

                  <div style={rowActions} className="mobile-agenda-row-actions">
                    <button type="button" style={secondaryButton} onClick={() => moveStop(row.id, "up")} disabled={index === 0}>Subir</button>
                    <button type="button" style={secondaryButton} onClick={() => moveStop(row.id, "down")} disabled={index === orderedForDisplay.length - 1}>Bajar</button>
                    <button type="button" style={secondaryButton} onClick={() => editOrder(row)}>Editar</button>
                    {row.status !== "EN_RUTA" ? <button type="button" style={secondaryButton} onClick={() => updateStatus(row.id, "EN_RUTA")}>En ruta</button> : null}
                    {row.status !== "ENTREGADO" ? <button type="button" style={primaryButtonMini} onClick={() => updateStatus(row.id, "ENTREGADO")}>Entregado</button> : null}
                    <button type="button" style={dangerButton} onClick={() => deleteOrder(row.id)}>Eliminar</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

function Field({ children, label, full }: { children: ReactNode; label: string; full?: boolean }) {
  return (
    <label style={{ ...field, ...(full ? fieldFull : null) }}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={statCard}>
      <div style={statLabel}>{label}</div>
      <div style={statValue}>{value}</div>
    </div>
  );
}

const page: CSSProperties = { maxWidth: 1380, margin: "0 auto", padding: 24, color: "#eef4fb" };
const hero: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap", marginBottom: 20 };
const eyebrow: CSSProperties = { color: "#93c5fd", textTransform: "uppercase", letterSpacing: 1.8, fontSize: 12, fontWeight: 800 };
const title: CSSProperties = { margin: "8px 0", fontSize: 42, lineHeight: 1 };
const subtitle: CSSProperties = { margin: 0, maxWidth: 780, color: "#9eb1c8", lineHeight: 1.6 };
const heroActions: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap" };
const statsGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 18 };
const statCard: CSSProperties = { borderRadius: 22, border: "1px solid rgba(140, 166, 194, 0.16)", background: "rgba(7, 16, 28, 0.88)", padding: 18, boxShadow: "0 18px 36px rgba(0,0,0,0.16)" };
const statLabel: CSSProperties = { color: "#8fb0cc", fontSize: 13, fontWeight: 700 };
const statValue: CSSProperties = { color: "#f8fbff", fontSize: 30, fontWeight: 900, marginTop: 8 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(360px, 0.92fr) minmax(0, 1.08fr)", gap: 18, alignItems: "start" };
const panel: CSSProperties = { borderRadius: 26, border: "1px solid rgba(140, 166, 194, 0.16)", background: "rgba(7, 16, 28, 0.88)", padding: 20, boxShadow: "0 20px 42px rgba(0,0,0,0.18)" };
const panelHeader: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" };
const panelTitle: CSSProperties = { margin: 0, fontSize: 22 };
const statusChip: CSSProperties = { padding: "6px 10px", borderRadius: 999, background: "rgba(27, 51, 82, 0.8)", color: "#bcd0e7", fontSize: 12 };
const formGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 };
const routeControls: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14, marginBottom: 14 };
const field: CSSProperties = { display: "grid", gap: 6 };
const fieldFull: CSSProperties = { gridColumn: "1 / -1" };
const fieldLabel: CSSProperties = { color: "#9eb1c8", fontSize: 12, fontWeight: 700 };
const input: CSSProperties = { width: "100%", minHeight: 46, borderRadius: 14, border: "1px solid rgba(140, 166, 194, 0.16)", background: "rgba(5, 12, 22, 0.95)", color: "#eef4fb", padding: "12px 14px", outline: "none" };
const pasteRow: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center" };
const helperInline: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "center", padding: 12, borderRadius: 14, border: "1px solid rgba(140, 166, 194, 0.12)", background: "rgba(8, 17, 29, 0.7)" };
const helperText: CSSProperties = { color: "#9eb1c8", fontSize: 13, lineHeight: 1.6 };
const textarea: CSSProperties = { ...input, minHeight: 110, resize: "vertical" };
const buttonRow: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 };
const primaryButton: CSSProperties = { padding: "12px 16px", borderRadius: 14, border: "1px solid rgba(96,165,250,0.24)", background: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)", color: "#f8fafc", fontWeight: 800, cursor: "pointer", textDecoration: "none" };
const primaryButtonMini: CSSProperties = { ...primaryButton, padding: "10px 14px" };
const secondaryButton: CSSProperties = { padding: "12px 16px", borderRadius: 14, border: "1px solid rgba(140, 166, 194, 0.18)", background: "rgba(12, 24, 39, 0.88)", color: "#eef4fb", fontWeight: 700, cursor: "pointer" };
const dangerButton: CSSProperties = { padding: "10px 14px", borderRadius: 14, border: "1px solid rgba(248, 113, 113, 0.26)", background: "rgba(69, 10, 10, 0.76)", color: "#fecaca", fontWeight: 700, cursor: "pointer" };
const ghostLink: CSSProperties = { ...secondaryButton, textDecoration: "none", display: "inline-flex", alignItems: "center" };
const list: CSSProperties = { display: "grid", gap: 12, maxHeight: "72vh", overflowY: "auto", paddingRight: 4 };
const listRow: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 14, alignItems: "start", padding: 16, borderRadius: 18, background: "rgba(8, 17, 29, 0.92)", border: "1px solid rgba(140, 166, 194, 0.12)" };
const routeBadge: CSSProperties = { display: "inline-flex", marginBottom: 8, padding: "5px 9px", borderRadius: 999, background: "rgba(59,130,246,0.16)", border: "1px solid rgba(96,165,250,0.26)", color: "#dbeafe", fontSize: 11, fontWeight: 800 };
const rowTitle: CSSProperties = { fontSize: 17, fontWeight: 800 };
const rowMeta: CSSProperties = { marginTop: 6, color: "#9eb1c8", fontSize: 13 };
const rowAddress: CSSProperties = { marginTop: 8, color: "#e2edf8", fontSize: 13, lineHeight: 1.5 };
const rowHint: CSSProperties = { marginTop: 6, color: "#8ea2bb", fontSize: 12, lineHeight: 1.5 };
const rowActions: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" };
const emptyState: CSSProperties = { padding: 18, borderRadius: 18, border: "1px dashed rgba(140, 166, 194, 0.18)", color: "#8ea2bb", textAlign: "center" };
const helperBox: CSSProperties = { marginTop: 14, padding: 12, borderRadius: 14, border: "1px solid rgba(245, 158, 11, 0.2)", background: "rgba(66, 32, 6, 0.18)", color: "#f4dfb3", lineHeight: 1.6, fontSize: 13 };
const helperBoxOk: CSSProperties = { marginTop: 14, padding: 12, borderRadius: 14, border: "1px solid rgba(45, 212, 191, 0.22)", background: "rgba(8, 54, 49, 0.2)", color: "#d1fae5", lineHeight: 1.6, fontSize: 13 };
const productSummaryCard: CSSProperties = { marginTop: 14, padding: 16, borderRadius: 18, border: "1px solid rgba(140, 166, 194, 0.12)", background: "rgba(8, 17, 29, 0.92)" };
const warningCard: CSSProperties = { marginBottom: 18, padding: 18, borderRadius: 22, border: "1px solid rgba(245, 158, 11, 0.24)", background: "rgba(66, 32, 6, 0.24)" };
const warningTitle: CSSProperties = { margin: "0 0 8px", color: "#fde68a", fontSize: 20 };
const warningText: CSSProperties = { margin: 0, color: "#f4dfb3", lineHeight: 1.6 };
const statusText: CSSProperties = { marginTop: 10, color: "#f8d484" };
