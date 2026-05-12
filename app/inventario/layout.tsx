"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

const navItems = [
  { href: "/inventario", label: "Inventario" },
];

export default function InventarioLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={shell} className="inventory-shell">
      <aside style={sidebar} className="inventory-sidebar-panel">
        <div style={brandCard}>
          <div style={eyebrow}>HST Suite</div>
          <div style={brandTitle}>Inventario</div>
          <p style={brandCopy}>Una sola vista para registrar productos, variantes y consultar tu catalogo sin saltar entre modulos.</p>
        </div>

        <nav style={nav}>
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  ...navLink,
                  ...(active ? navLinkActive : null),
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={sideFooter}>
          <Link href="/" style={backLink}>
            Volver a contabilidad
          </Link>
          <p style={footerCopy}>Diseno actualizado para trabajar mejor en desktop y movil.</p>
        </div>
      </aside>

      <div style={mainColumn}>
        <header style={mobileHeader} className="inventory-mobile-header">
          <div>
            <div style={mobileEyebrow}>HST</div>
            <div style={mobileTitle}>Inventario</div>
          </div>
          <Link href="/" style={mobileBack}>
            Contabilidad
          </Link>
        </header>

        <main style={content}>{children}</main>
      </div>
    </div>
  );
}

const shell: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  gridTemplateColumns: "300px minmax(0, 1fr)",
  background:
    "radial-gradient(circle at top left, rgba(86,149,255,0.16), transparent 26%), linear-gradient(180deg, #0b1220 0%, #0f172a 100%)",
};

const sidebar: CSSProperties = {
  position: "sticky",
  top: 0,
  height: "100vh",
  overflowY: "auto",
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 18,
  borderRight: "1px solid rgba(148, 163, 184, 0.14)",
  background: "rgba(9, 15, 27, 0.88)",
  backdropFilter: "blur(18px)",
  paddingBottom: 32,
};

const brandCard: CSSProperties = {
  padding: 20,
  borderRadius: 24,
  background: "linear-gradient(180deg, rgba(18,30,48,0.98) 0%, rgba(11,18,31,0.98) 100%)",
  border: "1px solid rgba(148, 163, 184, 0.14)",
  boxShadow: "0 18px 32px rgba(0,0,0,0.18)",
};

const eyebrow: CSSProperties = {
  color: "#8fb7ff",
  fontSize: 12,
  letterSpacing: 1.6,
  textTransform: "uppercase",
  fontWeight: 700,
};

const brandTitle: CSSProperties = {
  marginTop: 8,
  color: "#f8fafc",
  fontSize: 30,
  fontWeight: 800,
};

const brandCopy: CSSProperties = {
  margin: "10px 0 0",
  color: "#94a3b8",
  lineHeight: 1.5,
  fontSize: 14,
};

const nav: CSSProperties = {
  display: "grid",
  gap: 10,
};

const navLink: CSSProperties = {
  display: "block",
  padding: "13px 16px",
  borderRadius: 16,
  color: "#e8eff8",
  textDecoration: "none",
  fontWeight: 700,
  background: "rgba(15, 23, 37, 0.88)",
  border: "1px solid rgba(148, 163, 184, 0.12)",
  transition: "all 140ms ease",
};

const navLinkActive: CSSProperties = {
  background: "linear-gradient(135deg, rgba(96,165,250,0.22), rgba(59,130,246,0.1))",
  border: "1px solid rgba(96,165,250,0.28)",
  color: "#eff6ff",
  boxShadow: "0 12px 26px rgba(0,0,0,0.18)",
};

const sideFooter: CSSProperties = {
  marginTop: "auto",
  paddingTop: 18,
  borderTop: "1px solid rgba(137, 160, 185, 0.12)",
};

const backLink: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  color: "#93c5fd",
  textDecoration: "none",
  fontWeight: 700,
};

const footerCopy: CSSProperties = {
  margin: "10px 0 0",
  color: "#94a3b8",
  fontSize: 13,
  lineHeight: 1.5,
};

const mainColumn: CSSProperties = {
  minWidth: 0,
};

const mobileHeader: CSSProperties = {
  display: "none",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "18px 18px 0",
};

const mobileEyebrow: CSSProperties = {
  color: "#8fb7ff",
  fontSize: 11,
  letterSpacing: 1.4,
  textTransform: "uppercase",
  fontWeight: 700,
};

const mobileTitle: CSSProperties = {
  color: "#f7fbff",
  fontSize: 24,
  fontWeight: 800,
};

const mobileBack: CSSProperties = {
  color: "#93c5fd",
  textDecoration: "none",
  fontWeight: 700,
};

const content: CSSProperties = {
  padding: 28,
  color: "#e8eff8",
};
