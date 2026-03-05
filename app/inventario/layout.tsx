"use client";

import React from "react";

export default function InventarioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={wrap}>
      <aside style={sidebar}>
        <div style={brand}>
          <div style={brandTitle}>HST INVENTARIO</div>
          <div style={brandSub}>Sistema de gestión</div>
        </div>

        <nav style={nav}>
          <a href="/inventario" style={link}>🏠 Inicio</a>
          <a href="/inventario/productos" style={link}>📦 Productos</a>
          <a href="/inventario/compras" style={link}>🧾 Compras</a>
          <a href="/inventario/calculadora-pvp" style={link}>🧮 Calculadora PVP</a>
          <a href="/inventario/stock" style={link}>📦 Inventario (Stock)</a>
          <a href="/inventario/venta" style={link}>💰 Venta (POS)</a>
          <a href="/inventario/reportes" style={link}>📊 Reportes</a>

          <a href="/inventario/tipos" style={linkSoft}>⚙️ Tipos y Campos</a>
        </nav>

        <div style={divider} />

        <a href="/" style={backHome}>← Volver a Contabilidad</a>

        <div style={footer}>
          <div style={{ color: "#777", fontSize: 11 }}>
            HST Global Store · Inventario
          </div>
        </div>
      </aside>

      <main style={content}>{children}</main>
    </div>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0b0b0b",
  display: "grid",
  gridTemplateColumns: "280px 1fr",
};

const sidebar: React.CSSProperties = {
  position: "sticky",
  top: 0,
  alignSelf: "start",
  height: "100vh",
  borderRight: "1px solid #222",
  background: "#0b0b0b",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const brand: React.CSSProperties = {
  border: "1px solid #2a2a2a",
  borderRadius: 14,
  padding: 12,
  background: "#111",
};

const brandTitle: React.CSSProperties = {
  color: "#d4af37",
  fontWeight: 900,
  fontSize: 16,
  letterSpacing: 0.5,
};

const brandSub: React.CSSProperties = {
  color: "#aaa",
  fontSize: 12,
  marginTop: 4,
};

const nav: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const link: React.CSSProperties = {
  display: "block",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #222",
  background: "#111",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 800,
};

const linkSoft: React.CSSProperties = {
  ...link,
  border: "1px solid #5a4b2b",
  background: "#14110a",
  color: "#ffe2a8",
};

const divider: React.CSSProperties = {
  height: 1,
  background: "#222",
  marginTop: 8,
};

const backHome: React.CSSProperties = {
  marginTop: 6,
  color: "#aaa",
  textDecoration: "none",
  fontWeight: 700,
};

const footer: React.CSSProperties = {
  marginTop: "auto",
  paddingTop: 8,
};

const content: React.CSSProperties = {
  padding: 24,
  color: "#d4af37",
};