"use client";

export default function ReportesPage() {
  return (
    <div>
      <h1 style={{ fontSize: 34, marginBottom: 8 }}>📊 Reportes</h1>
      <p style={{ color: "#aaa" }}>
        Aquí agruparemos: Historial de ventas + Alertas de stock (y más reportes después).
      </p>

      <div style={{ marginTop: 18, padding: 16, border: "1px solid #222", background: "#111", borderRadius: 14 }}>
        <b>En el siguiente paso:</b> movemos “historial-ventas” y “alertas-stock” aquí, o los dejamos como subpáginas.
      </div>
    </div>
  );
}