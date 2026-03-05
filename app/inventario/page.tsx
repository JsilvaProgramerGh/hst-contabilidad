"use client";

export default function InventarioHome() {
  return (
    <main style={wrap}>
      <h1 style={title}>HST INVENTARIO</h1>
      <p style={subtitle}>Sistema organizado y profesional</p>

      <div style={grid}>
        <a href="/inventario/productos" style={card}>
          <h3>📦 Productos</h3>
          <p>Categorías, subcategorías y variantes</p>
        </a>

        <a href="/inventario/compras" style={card}>
          <h3>🛒 Compras</h3>
          <p>Proveedores y costos</p>
        </a>

        <a href="/inventario/calculadora" style={card}>
          <h3>🧮 Calculadora PVP</h3>
          <p>IVA + margen + guardar precio</p>
        </a>

        <a href="/inventario/stock" style={card}>
          <h3>📦 Inventario</h3>
          <p>Control de stock y mínimos</p>
        </a>

        <a href="/inventario/venta" style={card}>
          <h3>💰 Venta (POS)</h3>
          <p>Buscador inteligente y registro rápido</p>
        </a>

        <a href="/inventario/reportes" style={card}>
          <h3>📊 Reportes</h3>
          <p>Historial y alertas</p>
        </a>
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0b0b0b",
};

const title: React.CSSProperties = {
  fontSize: 38,
  marginBottom: 8,
};

const subtitle: React.CSSProperties = {
  color: "#aaa",
  marginBottom: 24,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 16,
};

const card: React.CSSProperties = {
  display: "block",
  padding: 20,
  borderRadius: 14,
  background: "#111",
  border: "1px solid #222",
  textDecoration: "none",
  color: "#d4af37",
};