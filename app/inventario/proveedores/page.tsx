"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Supplier = { id: string; name: string; phone: string | null; notes: string | null };

export default function InvProveedoresPage() {
  const [items, setItems] = useState<Supplier[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");

  async function load() {
    setStatus("Cargando...");
    const { data, error } = await supabase.from("inv_suppliers").select("id,name,phone,notes").order("name");
    if (error) return setStatus(error.message);
    setItems(data || []);
    setStatus("Listo ✅");
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) return;
    setStatus("Guardando...");
    const { error } = await supabase.from("inv_suppliers").insert({
      name: name.trim(),
      phone: phone.trim() || null,
      notes: notes.trim() || null,
    });
    if (error) return setStatus(error.message);
    setName(""); setPhone(""); setNotes("");
    await load();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar proveedor?")) return;
    setStatus("Eliminando...");
    const { error } = await supabase.from("inv_suppliers").delete().eq("id", id);
    if (error) return setStatus(error.message);
    await load();
  }

  return (
    <main style={page}>
      <header style={header}>
        <h1 style={h1}>Inventario · Proveedores</h1>
        <a href="/inventario" style={link}>← Volver</a>
      </header>

      <div style={card}>
        <h2 style={h2}>Nuevo proveedor</h2>

        <div style={grid}>
          <div>
            <label style={label}>Nombre</label>
            <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Distribuidora XYZ" />
          </div>

          <div>
            <label style={label}>WhatsApp / Teléfono</label>
            <input style={input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ej: 0982124443" />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={label}>Notas</label>
            <input style={input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Crédito, horarios, condiciones..." />
          </div>
        </div>

        <button style={btn} onClick={add}>Agregar</button>
        <p style={statusStyle}>{status}</p>
      </div>

      <div style={card}>
        <h2 style={h2}>Listado</h2>

        {items.length === 0 ? (
          <p style={{ color: "#777" }}>No hay proveedores todavía.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {items.map((s) => (
              <div key={s.id} style={row}>
                <div>
                  <div style={{ color: "#fff", fontWeight: 800 }}>{s.name}</div>
                  <div style={{ color: "#aaa", fontSize: 12 }}>
                    {s.phone ? `WhatsApp: ${s.phone}` : "Sin teléfono"} {s.notes ? ` · ${s.notes}` : ""}
                  </div>
                </div>
                <button style={danger} onClick={() => remove(s.id)}>Eliminar</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

const page: React.CSSProperties = { minHeight: "100vh", background: "#0b0b0b", color: "#d4af37", padding: 24, fontFamily: "Arial" };
const header: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 };
const h1: React.CSSProperties = { fontSize: 28, margin: 0 };
const h2: React.CSSProperties = { fontSize: 18, margin: "0 0 12px 0", color: "#fff" };
const link: React.CSSProperties = { color: "#aaa", textDecoration: "none" };
const card: React.CSSProperties = { background: "#111", border: "1px solid #333", borderRadius: 14, padding: 16, marginBottom: 16 };
const label: React.CSSProperties = { display: "block", marginBottom: 6, color: "#aaa", fontSize: 12 };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #333", background: "#0b0b0b", color: "#fff" };
const btn: React.CSSProperties = { marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "#d4af37", border: "none", cursor: "pointer" };
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 12px", border: "1px solid #222", borderRadius: 12 };
const danger: React.CSSProperties = { padding: "8px 10px", borderRadius: 10, background: "#2a1212", border: "1px solid #5a2b2b", color: "#ffb3b3", cursor: "pointer" };
const statusStyle: React.CSSProperties = { color: "#777", marginTop: 10, fontSize: 12 };
const grid: React.CSSProperties = { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" };