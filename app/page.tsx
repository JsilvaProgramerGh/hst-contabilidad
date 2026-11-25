"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AccountingDashboard from "./accounting-dashboard";

/** ✅ MENÚ LATERAL (hamburguesa + drawer) */
function InventoryDrawer() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={drawerFab}
        aria-label="Abrir menu"
        title="Menu"
      >
        Menu
      </button>

      {open && <div style={drawerBackdrop} onClick={() => setOpen(false)} />}

      <aside
        style={{
          ...drawerPanel,
          transform: open ? "translateX(0)" : "translateX(-110%)",
        }}
      >
        <div style={drawerHeader}>
          <div>
            <div style={drawerBrandTitle}>HST</div>
            <div style={drawerBrandSub}>Menu rapido</div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            style={drawerClose}
            aria-label="Cerrar"
            title="Cerrar"
          >
            X
          </button>
        </div>

        <div style={drawerSection}>CONTABILIDAD</div>
        <nav style={{ display: "grid", gap: 8 }}>
          <Link style={drawerItem} href="/" onClick={() => setOpen(false)}>
            Panel contabilidad
          </Link>
          <Link style={drawerItem} href="/clientes" onClick={() => setOpen(false)}>
            Clientes
          </Link>
          <Link style={drawerItem} href="/cotizacion" onClick={() => setOpen(false)}>
            Cotizaciones
          </Link>
          <Link style={drawerItem} href="/guias-entrega" onClick={() => setOpen(false)}>Guías de entrega</Link>
          <Link style={drawerItem} href="/agenda-pedidos" onClick={() => setOpen(false)}>
            Agenda de pedidos
          </Link>
          <Link style={drawerItem} href="/agenda-pendientes" onClick={() => setOpen(false)}>
            Agenda de pendientes
          </Link>
        </nav>

        <div style={drawerDivider} />

        <div style={drawerSection}>INVENTARIO</div>
        <nav style={{ display: "grid", gap: 8 }}>
          <Link style={drawerItem} href="/inventario" onClick={() => setOpen(false)}>
            Abrir modulo de inventario
          </Link>
        </nav>

        <div style={drawerFooter}>
          <div style={{ color: "#777", fontSize: 11 }}>HST Global Store</div>
        </div>
      </aside>
    </>
  );
}

const drawerFab: React.CSSProperties = {
  position: "fixed",
  left: 14,
  top: 14,
  zIndex: 9999,
  minWidth: 82,
  height: 42,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid rgba(137, 160, 185, 0.22)",
  background: "rgba(10, 18, 31, 0.9)",
  color: "#eef4fb",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  boxShadow: "0 14px 28px rgba(0,0,0,0.2)",
  backdropFilter: "blur(16px)",
};

const drawerBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  zIndex: 9998,
};

const drawerPanel: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  height: "100vh",
  width: 320,
  background: "linear-gradient(180deg, rgba(8, 14, 24, 0.98) 0%, rgba(11, 18, 32, 0.98) 100%)",
  borderRight: "1px solid rgba(137, 160, 185, 0.12)",
  zIndex: 9999,
  padding: 18,
  transition: "transform 180ms ease-out",
  overflowY: "auto",
};

const drawerHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  paddingBottom: 10,
};

const drawerBrandTitle: React.CSSProperties = {
  color: "#f4f7fb",
  fontWeight: 900,
  fontSize: 20,
  letterSpacing: 1,
};

const drawerBrandSub: React.CSSProperties = {
  color: "#8ea1bb",
  fontSize: 12,
  marginTop: 2,
};

const drawerClose: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 12,
  border: "1px solid rgba(137, 160, 185, 0.14)",
  background: "rgba(15, 24, 39, 0.86)",
  color: "#eef4fb",
  cursor: "pointer",
  fontWeight: 900,
};

const drawerSection: React.CSSProperties = {
  color: "#7f93ab",
  fontSize: 11,
  fontWeight: 900,
  marginTop: 8,
  marginBottom: 8,
  letterSpacing: 0.5,
};

const drawerItem: React.CSSProperties = {
  display: "block",
  padding: "12px 14px",
  borderRadius: 16,
  background: "rgba(14, 25, 40, 0.76)",
  border: "1px solid rgba(137, 160, 185, 0.12)",
  color: "#eef4fb",
  textDecoration: "none",
  fontWeight: 700,
};

const drawerDivider: React.CSSProperties = {
  height: 1,
  background: "rgba(137, 160, 185, 0.12)",
  margin: "12px 0",
};

const drawerFooter: React.CSSProperties = {
  marginTop: 14,
  paddingTop: 10,
  borderTop: "1px solid #222",
};

export default function Home() {
  return <><InventoryDrawer /><AccountingDashboard /></>;
}
