"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";

type Customer = {
  id: string;
  document_type: "CEDULA" | "RUC" | "PASAPORTE" | null;
  document_number: string | null;
  display_name: string | null;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  active: boolean | null;
  created_at?: string | null;
};

const emptyForm = {
  document_type: "CEDULA",
  document_number: "",
  display_name: "",
  legal_name: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
  active: true,
};

export default function ClientesPage() {
  const [status, setStatus] = useState("Cargando clientes...");
  const [rows, setRows] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [tableReady, setTableReady] = useState(true);

  async function loadCustomers() {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("id,document_type,document_number,display_name,legal_name,email,phone,address,notes,active,created_at")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      setRows([]);
      setTableReady(false);
      setStatus(`No pude leer la tabla customers: ${error.message}`);
      setLoading(false);
      return;
    }

    setTableReady(true);
    setRows((data as Customer[]) || []);
    setStatus(`Clientes cargados: ${(data || []).length}`);
    setLoading(false);
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((row) => {
      const haystack = [
        row.display_name,
        row.legal_name,
        row.document_number,
        row.email,
        row.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [rows, query]);

  function resetForm() {
    setSelectedId(null);
    setForm(emptyForm);
  }

  function selectCustomer(row: Customer) {
    setSelectedId(row.id);
    setForm({
      document_type: row.document_type || "CEDULA",
      document_number: row.document_number || "",
      display_name: row.display_name || "",
      legal_name: row.legal_name || "",
      email: row.email || "",
      phone: row.phone || "",
      address: row.address || "",
      notes: row.notes || "",
      active: row.active ?? true,
    });
  }

  async function saveCustomer() {
    if (!form.display_name.trim()) return alert("Escribe al menos el nombre visible del cliente.");

    setLoading(true);
    setStatus(selectedId ? "Actualizando cliente..." : "Creando cliente...");

    const payload = {
      document_type: form.document_type,
      document_number: form.document_number.trim() || null,
      display_name: form.display_name.trim(),
      legal_name: form.legal_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      active: form.active,
    };

    const query = selectedId
      ? supabase.from("customers").update(payload).eq("id", selectedId)
      : supabase.from("customers").insert(payload);

    const { error } = await query;

    if (error) {
      setStatus(`No pude guardar el cliente: ${error.message}`);
      setLoading(false);
      return;
    }

    resetForm();
    await loadCustomers();
  }

  async function toggleCustomer(row: Customer) {
    setLoading(true);
    setStatus("Actualizando estado del cliente...");

    const { error } = await supabase
      .from("customers")
      .update({ active: !(row.active ?? true) })
      .eq("id", row.id);

    if (error) {
      setStatus(`No pude actualizar el estado: ${error.message}`);
      setLoading(false);
      return;
    }

    await loadCustomers();
  }

  return (
    <main style={page}>
      <section style={hero}>
        <div>
          <div style={eyebrow}>Mi negocio</div>
          <h1 style={title}>Clientes</h1>
          <p style={subtitle}>
            Esta base te servirá para cotizaciones, ventas y facturas sin volver a escribir cédula, RUC,
            correo o dirección cada vez.
          </p>
        </div>

        <div style={heroActions}>
          <Link href="/cotizacion" style={ghostLink}>
            Ir a cotizaciones
          </Link>
          <button type="button" onClick={resetForm} style={primaryButton}>
            Nuevo cliente
          </button>
        </div>
      </section>

      {!tableReady && (
        <section style={warningCard}>
          <h2 style={warningTitle}>Falta preparar la tabla `customers` en Supabase</h2>
          <p style={warningText}>
            La pantalla ya quedó lista, pero tu base todavía no responde a la tabla `customers`. Cuando quieras,
            en el siguiente paso te dejo el SQL exacto para crearla sin tocar tus registros contables.
          </p>
          <p style={statusText}>{status}</p>
        </section>
      )}

      <section style={grid}>
        <article style={panel}>
          <div style={panelHeader}>
            <h2 style={panelTitle}>{selectedId ? "Editar cliente" : "Registrar cliente"}</h2>
            <span style={statusChip}>{status}</span>
          </div>

          <div style={formGrid}>
            <Field label="Tipo de documento">
              <select
                value={form.document_type}
                onChange={(e) => setForm((prev) => ({ ...prev, document_type: e.target.value as typeof prev.document_type }))}
                style={input}
              >
                <option value="CEDULA">Cedula</option>
                <option value="RUC">RUC</option>
                <option value="PASAPORTE">Pasaporte</option>
              </select>
            </Field>

            <Field label="Cedula / RUC">
              <input
                value={form.document_number}
                onChange={(e) => setForm((prev) => ({ ...prev, document_number: e.target.value }))}
                style={input}
                placeholder="1104..."
              />
            </Field>

            <Field label="Nombre visible">
              <input
                value={form.display_name}
                onChange={(e) => setForm((prev) => ({ ...prev, display_name: e.target.value }))}
                style={input}
                placeholder="Nombre con el que lo identificas rapido"
              />
            </Field>

            <Field label="Razon social / nombre completo">
              <input
                value={form.legal_name}
                onChange={(e) => setForm((prev) => ({ ...prev, legal_name: e.target.value }))}
                style={input}
                placeholder="Opcional"
              />
            </Field>

            <Field label="Correo">
              <input
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                style={input}
                placeholder="cliente@correo.com"
              />
            </Field>

            <Field label="Telefono">
              <input
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                style={input}
                placeholder="098..."
              />
            </Field>

            <Field label="Direccion" full>
              <input
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                style={input}
                placeholder="Direccion de entrega o facturacion"
              />
            </Field>

            <Field label="Notas internas" full>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                style={textarea}
                placeholder="Observaciones, forma de pago, detalle importante..."
              />
            </Field>

            <Field label="Estado">
              <select
                value={form.active ? "activo" : "inactivo"}
                onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.value === "activo" }))}
                style={input}
              >
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </Field>
          </div>

          <div style={buttonRow}>
            <button type="button" onClick={saveCustomer} style={primaryButton} disabled={loading || !tableReady}>
              {selectedId ? "Guardar cambios" : "Crear cliente"}
            </button>
            <button type="button" onClick={resetForm} style={secondaryButton}>
              Limpiar
            </button>
          </div>
        </article>

        <article style={panel}>
          <div style={panelHeader}>
            <h2 style={panelTitle}>Base de clientes</h2>
            <button type="button" onClick={loadCustomers} style={secondaryButton}>
              Actualizar
            </button>
          </div>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ ...input, marginBottom: 16 }}
            placeholder="Buscar por nombre, documento, correo o telefono"
          />

          <div style={list}>
            {filtered.length === 0 ? (
              <div style={emptyState}>
                {tableReady
                  ? "Todavia no hay clientes cargados."
                  : "Cuando la tabla exista, aqui veras tu base de clientes reutilizable."}
              </div>
            ) : (
              filtered.map((row) => (
                <div key={row.id} style={listRow}>
                  <div style={{ minWidth: 0 }}>
                    <div style={rowTitle}>{row.display_name || row.legal_name || "Sin nombre"}</div>
                    <div style={rowMeta}>
                      {[row.document_type, row.document_number, row.email, row.phone].filter(Boolean).join(" · ")}
                    </div>
                    {row.address ? <div style={rowAddress}>{row.address}</div> : null}
                  </div>

                  <div style={rowActions}>
                    <button type="button" onClick={() => selectCustomer(row)} style={secondaryButton}>
                      Editar
                    </button>
                    <button type="button" onClick={() => toggleCustomer(row)} style={secondaryButton}>
                      {row.active ?? true ? "Desactivar" : "Activar"}
                    </button>
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

function Field({
  children,
  label,
  full,
}: {
  children: React.ReactNode;
  label: string;
  full?: boolean;
}) {
  return (
    <label style={{ ...field, ...(full ? fieldFull : null) }}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

const page: React.CSSProperties = {
  maxWidth: 1320,
  margin: "0 auto",
  padding: 24,
  color: "#eef4fb",
};

const hero: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 20,
  flexWrap: "wrap",
  marginBottom: 20,
};

const eyebrow: React.CSSProperties = {
  color: "#d3b056",
  textTransform: "uppercase",
  letterSpacing: 1.6,
  fontSize: 12,
  fontWeight: 700,
};

const title: React.CSSProperties = {
  margin: "8px 0",
  fontSize: 42,
  lineHeight: 1,
};

const subtitle: React.CSSProperties = {
  margin: 0,
  maxWidth: 760,
  color: "#9eb1c8",
  lineHeight: 1.6,
};

const heroActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(360px, 0.9fr) minmax(0, 1.1fr)",
  gap: 18,
  alignItems: "start",
};

const panel: React.CSSProperties = {
  borderRadius: 26,
  border: "1px solid rgba(140, 166, 194, 0.16)",
  background: "rgba(7, 16, 28, 0.88)",
  padding: 20,
  boxShadow: "0 20px 42px rgba(0,0,0,0.18)",
};

const panelHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 16,
  flexWrap: "wrap",
};

const panelTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
};

const statusChip: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(27, 51, 82, 0.8)",
  color: "#bcd0e7",
  fontSize: 12,
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
};

const field: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const fieldFull: React.CSSProperties = {
  gridColumn: "1 / -1",
};

const fieldLabel: React.CSSProperties = {
  color: "#9eb1c8",
  fontSize: 12,
  fontWeight: 700,
};

const input: React.CSSProperties = {
  width: '100%',
  minHeight: 46,
  borderRadius: 14,
  border: "1px solid rgba(140, 166, 194, 0.16)",
  background: "rgba(5, 12, 22, 0.95)",
  color: "#eef4fb",
  padding: "12px 14px",
  outline: "none",
};

const textarea: React.CSSProperties = {
  ...input,
  minHeight: 110,
  resize: "vertical",
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 18,
};

const primaryButton: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 14,
  border: "1px solid rgba(211, 176, 86, 0.24)",
  background: "linear-gradient(135deg, #d3b056 0%, #f0d58f 100%)",
  color: "#1f1604",
  fontWeight: 800,
  cursor: "pointer",
  textDecoration: "none",
};

const secondaryButton: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 14,
  border: "1px solid rgba(140, 166, 194, 0.18)",
  background: "rgba(12, 24, 39, 0.88)",
  color: "#eef4fb",
  fontWeight: 700,
  cursor: "pointer",
};

const ghostLink: React.CSSProperties = {
  ...secondaryButton,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};

const list: React.CSSProperties = {
  display: "grid",
  gap: 12,
  maxHeight: "68vh",
  overflowY: "auto",
  paddingRight: 4,
};

const listRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 14,
  alignItems: "start",
  padding: 16,
  borderRadius: 18,
  background: "rgba(8, 17, 29, 0.92)",
  border: "1px solid rgba(140, 166, 194, 0.12)",
};

const rowTitle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
};

const rowMeta: React.CSSProperties = {
  marginTop: 6,
  color: "#9eb1c8",
  lineHeight: 1.5,
  fontSize: 13,
};

const rowAddress: React.CSSProperties = {
  marginTop: 8,
  color: "#c7d5e4",
  fontSize: 13,
};

const rowActions: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const emptyState: React.CSSProperties = {
  padding: 18,
  borderRadius: 18,
  border: "1px dashed rgba(140, 166, 194, 0.18)",
  color: "#8ea2bb",
  textAlign: "center",
};

const warningCard: React.CSSProperties = {
  marginBottom: 18,
  padding: 18,
  borderRadius: 22,
  border: "1px solid rgba(211, 176, 86, 0.28)",
  background: "rgba(44, 30, 4, 0.28)",
};

const warningTitle: React.CSSProperties = {
  margin: "0 0 8px",
  color: "#ffe3a3",
  fontSize: 20,
};

const warningText: React.CSSProperties = {
  margin: 0,
  color: "#f4dfb3",
  lineHeight: 1.6,
};

const statusText: React.CSSProperties = {
  marginTop: 10,
  color: "#f8d484",
};
