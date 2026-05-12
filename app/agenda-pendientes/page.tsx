"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { supabase } from "../lib/supabase";

type TaskStatus = "PENDIENTE" | "EN_PROCESO" | "HECHO" | "CANCELADO";
type TaskPriority = "ALTA" | "MEDIA" | "BAJA";

type TaskRow = {
  id: string;
  title: string;
  details: string | null;
  due_date: string | null;
  due_time: string | null;
  category: string;
  contact_name: string | null;
  contact_phone: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  created_at?: string | null;
};

const today = new Date().toISOString().slice(0, 10);

const emptyForm = {
  title: "",
  details: "",
  due_date: today,
  due_time: "",
  category: "GENERAL",
  contact_name: "",
  contact_phone: "",
  priority: "MEDIA" as TaskPriority,
  status: "PENDIENTE" as TaskStatus,
};

export default function AgendaPendientesPage() {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [status, setStatus] = useState("Cargando pendientes...");
  const [tableReady, setTableReady] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"TODOS" | TaskStatus>("TODOS");
  const [form, setForm] = useState(emptyForm);

  async function loadTasks() {
    setLoading(true);
    const { data, error } = await supabase
      .from("task_agenda")
      .select("*")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(400);

    if (error) {
      setRows([]);
      setTableReady(false);
      setStatus(`No pude leer task_agenda: ${error.message}`);
      setLoading(false);
      return;
    }

    setRows((data as TaskRow[]) || []);
    setTableReady(true);
    setStatus(`Pendientes cargados: ${(data || []).length}`);
    setLoading(false);
  }

  useEffect(() => {
    loadTasks();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchText = !needle || [row.title, row.details, row.contact_name, row.contact_phone, row.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);

      const matchStatus = filterStatus === "TODOS" || row.status === filterStatus;
      return matchText && matchStatus;
    });
  }, [rows, query, filterStatus]);

  const urgentCount = filtered.filter((row) => row.priority === "ALTA" && row.status !== "HECHO").length;
  const todayCount = filtered.filter((row) => row.due_date === today && row.status !== "HECHO").length;

  function resetForm() {
    setSelectedId(null);
    setForm(emptyForm);
  }

  function editTask(row: TaskRow) {
    setSelectedId(row.id);
    setForm({
      title: row.title,
      details: row.details || "",
      due_date: row.due_date || today,
      due_time: row.due_time || "",
      category: row.category,
      contact_name: row.contact_name || "",
      contact_phone: row.contact_phone || "",
      priority: row.priority,
      status: row.status,
    });
  }

  async function saveTask() {
    if (!form.title.trim()) return alert("Escribe al menos el pendiente principal.");

    setLoading(true);
    setStatus(selectedId ? "Actualizando pendiente..." : "Guardando pendiente...");

    const payload = {
      title: form.title.trim(),
      details: form.details.trim() || null,
      due_date: form.due_date || null,
      due_time: form.due_time.trim() || null,
      category: form.category.trim() || "GENERAL",
      contact_name: form.contact_name.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      priority: form.priority,
      status: form.status,
    };

    const query = selectedId
      ? supabase.from("task_agenda").update(payload).eq("id", selectedId)
      : supabase.from("task_agenda").insert(payload);

    const { error } = await query;
    if (error) {
      setStatus(`No pude guardar el pendiente: ${error.message}`);
      setLoading(false);
      return;
    }

    resetForm();
    await loadTasks();
  }

  async function updateTaskStatus(id: string, nextStatus: TaskStatus) {
    const { error } = await supabase.from("task_agenda").update({ status: nextStatus }).eq("id", id);
    if (error) return setStatus(`No pude actualizar el pendiente: ${error.message}`);
    await loadTasks();
  }

  async function deleteTask(id: string) {
    if (!confirm("¿Eliminar este pendiente?")) return;
    const { error } = await supabase.from("task_agenda").delete().eq("id", id);
    if (error) return setStatus(`No pude eliminar el pendiente: ${error.message}`);
    await loadTasks();
  }

  return (
    <main style={page} className="mobile-agenda-page">
      <section style={hero} className="mobile-agenda-hero">
        <div>
          <div style={eyebrow}>Seguimiento</div>
          <h1 style={title}>Agenda de pendientes</h1>
          <p style={subtitle}>
            Anota tareas urgentes del negocio como facturar, llamar clientes, confirmar pagos o resolver compras.
          </p>
        </div>

        <div style={heroActions}>
          <Link href="/" style={ghostLink}>Volver al panel</Link>
          <button type="button" style={primaryButton} onClick={loadTasks}>Actualizar</button>
        </div>
      </section>

      {!tableReady && (
        <section style={warningCard}>
          <h2 style={warningTitle}>Falta preparar la tabla `task_agenda`</h2>
          <p style={warningText}>
            Corre el SQL de `C:\Users\julia\hst-contabilidad\docs\agenda-tables.sql` en Supabase para activar esta agenda.
          </p>
          <p style={statusText}>{status}</p>
        </section>
      )}

      <section style={statsGrid} className="mobile-agenda-stats">
        <StatCard label="Pendientes visibles" value={String(filtered.length)} />
        <StatCard label="Urgentes" value={String(urgentCount)} />
        <StatCard label="Para hoy" value={String(todayCount)} />
        <StatCard label="Hechos" value={String(rows.filter((row) => row.status === "HECHO").length)} />
      </section>

      <section style={grid} className="mobile-agenda-layout">
        <article style={panel}>
          <div style={panelHeader}>
            <h2 style={panelTitle}>{selectedId ? "Editar pendiente" : "Nuevo pendiente"}</h2>
            <span style={statusChip}>{status}</span>
          </div>

          <div style={formGrid} className="mobile-agenda-form-grid">
            <Field label="Pendiente principal" full>
              <input style={input} value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Realizar factura a Jose" />
            </Field>
            <Field label="Categoria">
              <input style={input} value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} placeholder="Facturacion, llamadas, compras..." />
            </Field>
            <Field label="Prioridad">
              <select style={input} value={form.priority} onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as TaskPriority }))}>
                <option value="ALTA">Alta</option>
                <option value="MEDIA">Media</option>
                <option value="BAJA">Baja</option>
              </select>
            </Field>
            <Field label="Fecha limite">
              <input type="date" style={input} value={form.due_date} onChange={(e) => setForm((prev) => ({ ...prev, due_date: e.target.value }))} />
            </Field>
            <Field label="Hora">
              <input type="time" style={input} value={form.due_time} onChange={(e) => setForm((prev) => ({ ...prev, due_time: e.target.value }))} />
            </Field>
            <Field label="Contacto relacionado">
              <input style={input} value={form.contact_name} onChange={(e) => setForm((prev) => ({ ...prev, contact_name: e.target.value }))} placeholder="Jose / Empresa KI" />
            </Field>
            <Field label="Telefono / referencia">
              <input style={input} value={form.contact_phone} onChange={(e) => setForm((prev) => ({ ...prev, contact_phone: e.target.value }))} placeholder="098... / interno / email" />
            </Field>
            <Field label="Estado">
              <select style={input} value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as TaskStatus }))}>
                <option value="PENDIENTE">Pendiente</option>
                <option value="EN_PROCESO">En proceso</option>
                <option value="HECHO">Hecho</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
            </Field>
            <Field label="Notas" full>
              <textarea style={textarea} value={form.details} onChange={(e) => setForm((prev) => ({ ...prev, details: e.target.value }))} placeholder="Detalles de seguimiento, pasos, datos de apoyo..." />
            </Field>
          </div>

          <div style={buttonRow} className="mobile-agenda-buttons">
            <button type="button" style={primaryButton} onClick={saveTask} disabled={loading || !tableReady}>
              {selectedId ? "Guardar cambios" : "Guardar pendiente"}
            </button>
            <button type="button" style={secondaryButton} onClick={resetForm}>Limpiar</button>
          </div>
        </article>

        <article style={panel}>
          <div style={panelHeader}>
            <h2 style={panelTitle}>Lista de pendientes</h2>
            <select style={{ ...input, margin: 0, minWidth: 180 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as "TODOS" | TaskStatus)}>
              <option value="TODOS">Todos</option>
              <option value="PENDIENTE">Pendientes</option>
              <option value="EN_PROCESO">En proceso</option>
              <option value="HECHO">Hechos</option>
              <option value="CANCELADO">Cancelados</option>
            </select>
          </div>

          <input style={{ ...input, marginBottom: 16 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por tarea, categoria o contacto" />

          <div style={list}>
            {filtered.length === 0 ? (
              <div style={emptyState}>No hay pendientes para mostrar.</div>
            ) : (
              filtered.map((row) => (
                <div key={row.id} style={listRow} className="mobile-agenda-list-row">
                  <div style={{ minWidth: 0 }}>
                    <div style={rowTitle}>{row.title}</div>
                    <div style={rowMeta}>{[row.category, row.priority, row.status, row.due_date, row.due_time].filter(Boolean).join(" - ")}</div>
                    {row.contact_name || row.contact_phone ? (
                      <div style={rowAddress}>
                        {[row.contact_name, row.contact_phone].filter(Boolean).join(" - ")}
                      </div>
                    ) : null}
                    {row.details ? <div style={rowHint}>{row.details}</div> : null}
                  </div>

                  <div style={rowActions} className="mobile-agenda-row-actions">
                    <button type="button" style={secondaryButton} onClick={() => editTask(row)}>Editar</button>
                    {row.status !== "EN_PROCESO" ? <button type="button" style={secondaryButton} onClick={() => updateTaskStatus(row.id, "EN_PROCESO")}>En proceso</button> : null}
                    {row.status !== "HECHO" ? <button type="button" style={primaryButtonMini} onClick={() => updateTaskStatus(row.id, "HECHO")}>Hecho</button> : null}
                    <button type="button" style={dangerButton} onClick={() => deleteTask(row.id)}>Eliminar</button>
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
const eyebrow: CSSProperties = { color: "#5eead4", textTransform: "uppercase", letterSpacing: 1.8, fontSize: 12, fontWeight: 800 };
const title: CSSProperties = { margin: "8px 0", fontSize: 42, lineHeight: 1 };
const subtitle: CSSProperties = { margin: 0, maxWidth: 780, color: "#9eb1c8", lineHeight: 1.6 };
const heroActions: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap" };
const statsGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 18 };
const statCard: CSSProperties = { borderRadius: 22, border: "1px solid rgba(140, 166, 194, 0.16)", background: "rgba(7, 16, 28, 0.88)", padding: 18, boxShadow: "0 18px 36px rgba(0,0,0,0.16)" };
const statLabel: CSSProperties = { color: "#8fb0cc", fontSize: 13, fontWeight: 700 };
const statValue: CSSProperties = { color: "#f8fbff", fontSize: 30, fontWeight: 900, marginTop: 8 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(360px, 0.9fr) minmax(0, 1.1fr)", gap: 18, alignItems: "start" };
const panel: CSSProperties = { borderRadius: 26, border: "1px solid rgba(140, 166, 194, 0.16)", background: "rgba(7, 16, 28, 0.88)", padding: 20, boxShadow: "0 20px 42px rgba(0,0,0,0.18)" };
const panelHeader: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" };
const panelTitle: CSSProperties = { margin: 0, fontSize: 22 };
const statusChip: CSSProperties = { padding: "6px 10px", borderRadius: 999, background: "rgba(27, 51, 82, 0.8)", color: "#bcd0e7", fontSize: 12 };
const formGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 };
const field: CSSProperties = { display: "grid", gap: 6 };
const fieldFull: CSSProperties = { gridColumn: "1 / -1" };
const fieldLabel: CSSProperties = { color: "#9eb1c8", fontSize: 12, fontWeight: 700 };
const input: CSSProperties = { width: "100%", minHeight: 46, borderRadius: 14, border: "1px solid rgba(140, 166, 194, 0.16)", background: "rgba(5, 12, 22, 0.95)", color: "#eef4fb", padding: "12px 14px", outline: "none" };
const textarea: CSSProperties = { ...input, minHeight: 120, resize: "vertical" };
const buttonRow: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 };
const primaryButton: CSSProperties = { padding: "12px 16px", borderRadius: 14, border: "1px solid rgba(96,165,250,0.24)", background: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)", color: "#f8fafc", fontWeight: 800, cursor: "pointer", textDecoration: "none" };
const primaryButtonMini: CSSProperties = { ...primaryButton, padding: "10px 14px" };
const secondaryButton: CSSProperties = { padding: "12px 16px", borderRadius: 14, border: "1px solid rgba(140, 166, 194, 0.18)", background: "rgba(12, 24, 39, 0.88)", color: "#eef4fb", fontWeight: 700, cursor: "pointer" };
const dangerButton: CSSProperties = { padding: "10px 14px", borderRadius: 14, border: "1px solid rgba(248, 113, 113, 0.26)", background: "rgba(69, 10, 10, 0.76)", color: "#fecaca", fontWeight: 700, cursor: "pointer" };
const ghostLink: CSSProperties = { ...secondaryButton, textDecoration: "none", display: "inline-flex", alignItems: "center" };
const list: CSSProperties = { display: "grid", gap: 12, maxHeight: "72vh", overflowY: "auto", paddingRight: 4 };
const listRow: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 14, alignItems: "start", padding: 16, borderRadius: 18, background: "rgba(8, 17, 29, 0.92)", border: "1px solid rgba(140, 166, 194, 0.12)" };
const rowTitle: CSSProperties = { fontSize: 17, fontWeight: 800 };
const rowMeta: CSSProperties = { marginTop: 6, color: "#9eb1c8", fontSize: 13 };
const rowAddress: CSSProperties = { marginTop: 8, color: "#e2edf8", fontSize: 13, lineHeight: 1.5 };
const rowHint: CSSProperties = { marginTop: 8, color: "#8ea2bb", fontSize: 12, lineHeight: 1.6 };
const rowActions: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" };
const emptyState: CSSProperties = { padding: 18, borderRadius: 18, border: "1px dashed rgba(140, 166, 194, 0.18)", color: "#8ea2bb", textAlign: "center" };
const warningCard: CSSProperties = { marginBottom: 18, padding: 18, borderRadius: 22, border: "1px solid rgba(45, 212, 191, 0.24)", background: "rgba(8, 54, 49, 0.22)" };
const warningTitle: CSSProperties = { margin: "0 0 8px", color: "#99f6e4", fontSize: 20 };
const warningText: CSSProperties = { margin: 0, color: "#d1fae5", lineHeight: 1.6 };
const statusText: CSSProperties = { marginTop: 10, color: "#99f6e4" };
