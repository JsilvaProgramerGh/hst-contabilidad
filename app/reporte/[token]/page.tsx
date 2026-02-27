import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function supaServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, service, { auth: { persistSession: false } });
}

async function validarToken(token: string) {
  const supabase = supaServer();
  const { data, error } = await supabase
    .from("share_links")
    .select("token, activo, nombre")
    .eq("token", token)
    .maybeSingle();

  if (error || !data || !data.activo) return null;
  return data;
}

export default async function ReportePage({
  params,
}: {
  params: { token: string };
}) {
  const link = await validarToken(params.token);
  if (!link) {
    return (
      <div style={{ padding: 24, color: "#fff", background: "#000", minHeight: "100vh" }}>
        <h1 style={{ color: "#d4af37" }}>HST CONTABILIDAD</h1>
        <p>Acceso no autorizado.</p>
      </div>
    );
  }

  const supabase = supaServer();

  // Totales (ajusta si tus nombres de columnas difieren)
  const { data: tx } = await supabase.from("transactions").select("tipo,monto,created_at");
  const { data: fac } = await supabase.from("facturas").select("monto,estado,cliente,fecha,pdf_url");

  const ingresos = (tx || []).filter(t => t.tipo === "Ingreso").reduce((a, b) => a + Number(b.monto || 0), 0);
  const gastos = (tx || []).filter(t => t.tipo === "Gasto").reduce((a, b) => a + Number(b.monto || 0), 0);

  const porCobrar = (fac || [])
    .filter(f => (f.estado || "").toLowerCase() !== "pagada")
    .reduce((a, b) => a + Number(b.monto || 0), 0);

  const saldo = ingresos - gastos;

  // Render simple (oscuro elegante)
  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", padding: 24 }}>
      <h1 style={{ color: "#d4af37", letterSpacing: 1 }}>HST CONTABILIDAD</h1>
      <p style={{ color: "#aaa", marginTop: 6 }}>Reporte financiero (solo lectura)</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginTop: 18 }}>
        <Card title="Saldo" value={saldo} />
        <Card title="Ingresos" value={ingresos} />
        <Card title="Gastos" value={gastos} />
        <Card title="Por cobrar" value={porCobrar} />
      </div>

      <div style={{ marginTop: 24, padding: 16, border: "1px solid #222", borderRadius: 14 }}>
        <h2 style={{ color: "#d4af37", marginBottom: 10 }}>Facturas</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {(fac || []).slice(0, 15).map((f, idx) => (
            <div key={idx} style={{ border: "1px solid #222", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{f.cliente || "—"}</div>
                  <div style={{ color: "#aaa", fontSize: 13 }}>
                    {String(f.estado || "—")} • ${Number(f.monto || 0).toFixed(2)}
                  </div>
                </div>

                {f.pdf_url ? (
                  <a
                    href={`/reporte/${params.token}/pdf?path=${encodeURIComponent(f.pdf_url)}`}
                    style={{
                      background: "#d4af37",
                      color: "#000",
                      padding: "10px 14px",
                      borderRadius: 10,
                      textDecoration: "none",
                      fontWeight: 700,
                    }}
                  >
                    Ver PDF
                  </a>
                ) : (
                  <span style={{ color: "#666" }}>Sin PDF</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value: number }) {
  return (
    <div style={{ border: "1px solid #222", borderRadius: 14, padding: 16 }}>
      <div style={{ color: "#d4af37", fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>${Number(value || 0).toFixed(2)}</div>
    </div>
  );
}