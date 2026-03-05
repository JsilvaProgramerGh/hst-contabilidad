"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Category = { id: string; name: string; created_at: string };

export default function InvCategoriasPage() {
  const [items, setItems] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");

  async function load() {
    setStatus("Cargando...");
    const { data, error } = await supabase.from("inv_categories").select("*").order("name");
    if (error) return setStatus(error.message);
    setItems(data || []);
    setStatus("Listo ✅");
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) return;
    setStatus("Guardando...");
    const { error } = await supabase.from("inv_categories").insert({ name: name.trim() });
    if (error) return setStatus(error.message);
    setName("");
    await load();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar categoría?")) return;
    setStatus("Eliminando...");
    const { error } = await supabase.from("inv_categories").delete().eq("id", id);
    if (error) return setStatus(error.message);
    await load();
  }

  return (
    <main style={page}>
      <header style={header}>
        <h1 style={h1}>Inventario · Categorías</h1>
        <a href="/inventario" style={link}>← Volver</a>
      </header>

      <div style={card}>
        <label style={label}>Nueva categoría</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Insumos médicos"
          />
          <button style={btn} onClick={add}>Agregar</button>
        </div>
        <p style={statusStyle}>{status}</p>
      </div>

      <div style={card}>
        <h2 style={h2}>Listado</h2>
        {items.length === 0 ? (
          <p style={{ color: "#777" }}>No hay categorías.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {items.map((c) => (
              <li key={c.id} style={row}>
                <span>{c.name}</span>
                <button style={danger} onClick={() => remove(c.id)}>Eliminar</button>
              </li>
            ))}
          </ul>
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
const label: React.CSSProperties = { display: "block", marginBottom: 6, color: "#aaa" };
const input: React.CSSProperties = { flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #333", background: "#0b0b0b", color: "#fff" };
const btn: React.CSSProperties = { padding: "10px 14px", borderRadius: 10, background: "#d4af37", border: "none", cursor: "pointer" };
const danger: React.CSSProperties = { padding: "8px 10px", borderRadius: 10, background: "#2a1212", border: "1px solid #5a2b2b", color: "#ffb3b3", cursor: "pointer" };
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", border: "1px solid #222", borderRadius: 12 };
const statusStyle: React.CSSProperties = { color: "#777", marginTop: 10, fontSize: 12 };