"use client";

import React, { useEffect, useState } from "react";

export default function InventoryDrawer() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    window.location.href = href;
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={fab}
        aria-label="Abrir menú"
        title="Menú"
      >
        ☰
      </button>

      {open && <div style={backdrop} onClick={() => setOpen(false)} />}

      <aside style={{ ...drawer, transform: open ? "translateX(0)" : "translateX(-110%)" }}>
        <div style={drawerHeader}>
          <div>
            <div style={brandTitle}>HST</div>
            <div style={brandSub}>Menú rápido</div>
          </div>

          <button type="button" onClick={() => setOpen(false)} style={closeBtn} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div style={sectionTitle}>INVENTARIO</div>

        <nav style={nav}>
          <button style={item} onClick={() => go("/inventario")}>🏠 Inicio</button>
          <button style={item} onClick={() => go("/inventario/productos")}>📦 Productos</button>
          <button style={item} onClick={() => go("/inventario/compras")}>🧾 Compras</button>
          <button style={item} onClick={() => go("/inventario/calculadora-pvp")}>🧮 Calculadora PVP</button>
          <button style={item} onClick={() => go("/inventario/stock")}>📦 Inventario (Stock)</button>
          <button style={item} onClick={() => go("/inventario/venta")}>💰 Venta (POS)</button>
          <button style={item} onClick={() => go("/inventario/reportes")}>📊 Reportes</button>

          <button style={{ ...item, ...soft }} onClick={() => go("/inventario/tipos")}>
            ⚙️ Tipos y Campos
          </button>
        </nav>

        <div style={divider} />

        <div style={sectionTitle}>CONTABILIDAD</div>
        <nav style={nav}>
          <button style={item} onClick={() => go("/")}>📊 Ir a Contabilidad</button>
        </nav>

        <div style={footer}>
          <div style={{ color: "#777", fontSize: 11 }}>HST Global Store</div>
        </div>
      </aside>
    </>
  );
}

const fab: React.CSSProperties = {
  position: "fixed",
  top: 16,
  left: 16,
  zIndex: 50,
  borderRadius: 12,
  padding: "10px 12px",
  border: "1px solid #5a4b2b",
  background: "#d4af37",
  color: "#000",
  fontWeight: 900,
  cursor: "pointer",
};

const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.55)",
  zIndex: 49,
};

const drawer: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  height: "100vh",
  width: 300,
  background: "#0b0b0b",
  borderRight: "1px solid #222",
  zIndex: 50,
  padding: 14,
  transition: "transform .18s ease",
  display: "flex",
  flexDirection: "column",
};

const drawerHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 12,
};

const brandTitle: React.CSSProperties = { color: "#d4af37", fontWeight: 900, fontSize: 16 };
const brandSub: React.CSSProperties = { color: "#aaa", fontSize: 12, marginTop: 2 };

const closeBtn: React.CSSProperties = {
  border: "1px solid #333",
  background: "#111",
  color: "#fff",
  borderRadius: 10,
  padding: "8px 10px",
  cursor: "pointer",
};

const sectionTitle: React.CSSProperties = {
  color: "#777",
  fontSize: 11,
  fontWeight: 900,
  marginTop: 8,
  marginBottom: 8,
  letterSpacing: 1,
};

const nav: React.CSSProperties = { display: "grid", gap: 8 };

const item: React.CSSProperties = {
  textAlign: "left",
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #222",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const soft: React.CSSProperties = {
  border: "1px solid #5a4b2b",
  background: "#14110a",
  color: "#ffe2a8",
};

const divider: React.CSSProperties = { height: 1, background: "#222", marginTop: 12, marginBottom: 12 };

const footer: React.CSSProperties = { marginTop: "auto", paddingTop: 8 };