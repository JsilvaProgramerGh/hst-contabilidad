"use client";

import { ChangeEvent, CSSProperties, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  DEFAULT_QUOTE_COMPANY_PROFILE,
  mapQuoteCompanyProfile,
  type QuoteCompanyProfile,
} from "@/lib/quote-company-profile";

export default function EmpresaCotizacionesPage() {
  const [profile, setProfile] = useState<QuoteCompanyProfile>(DEFAULT_QUOTE_COMPANY_PROFILE);
  const [status, setStatus] = useState("");
  const [tableReady, setTableReady] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let active = true;
    const sb = supabaseBrowser();

    (async () => {
      const { data, error } = await sb
        .from("quote_company_profile")
        .select("id,name,ruc,address,city,phone,email,website,logo_url,accent_blue")
        .eq("id", "default")
        .maybeSingle();

      if (!active) return;

      if (error) {
        setTableReady(false);
        setStatus("Falta crear la tabla quote_company_profile en Supabase.");
        return;
      }

      setTableReady(true);
      if (data) setProfile(mapQuoteCompanyProfile(data as Partial<QuoteCompanyProfile>));
    })();

    return () => {
      active = false;
    };
  }, []);

  const previewHeader = useMemo(
    () => [
      profile.name,
      profile.ruc,
      profile.address,
      profile.city,
      profile.phone,
      profile.email,
      profile.website,
    ].filter(Boolean),
    [profile],
  );

  const setField = (field: keyof QuoteCompanyProfile, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const uploadLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const sb = supabaseBrowser();
    setUploading(true);
    setStatus("Subiendo logo...");

    try {
      const extension = (file.name.split(".").pop() || "png").toLowerCase();
      const fileName = `branding/quote-logo-${Date.now()}.${extension}`;
      const { error } = await sb.storage.from("docs").upload(fileName, file, {
        upsert: true,
        contentType: file.type || "image/png",
      });

      if (error) throw error;

      const { data } = sb.storage.from("docs").getPublicUrl(fileName);
      setField("logo_url", data.publicUrl);
      setStatus("Logo subido. No olvides guardar.");
    } catch (error: any) {
      setStatus(error?.message || "No se pudo subir el logo.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const saveProfile = async () => {
    const sb = supabaseBrowser();
    setSaving(true);
    setStatus("Guardando datos de la empresa...");

    const payload = {
      ...profile,
      id: "default",
    };

    const { error } = await sb.from("quote_company_profile").upsert(payload, {
      onConflict: "id",
    });

    if (error) {
      setTableReady(false);
      setStatus(`No se pudo guardar. Si falta la tabla, corre el SQL de C:\\Users\\julia\\hst-contabilidad\\docs\\quote-company-profile.sql. ${error.message}`);
      setSaving(false);
      return;
    }

    setTableReady(true);
    setStatus("Datos guardados correctamente.");
    setSaving(false);
  };

  return (
    <main style={page}>
      <div style={hero}>
        <div>
          <div style={eyebrow}>Marca de cotizaciones</div>
          <h1 style={title}>Logo y datos de empresa</h1>
          <p style={subtitle}>
            Aquí cambiamos solo lo que aparece en cotizaciones, PDFs y etiquetas: logo, nombre, RUC, correo, teléfono y demás datos de cabecera.
          </p>
        </div>
        <Link href="/cotizacion" style={backLink}>
          Volver a cotizaciones
        </Link>
      </div>

      {!tableReady ? (
        <div style={warningCard}>
          Falta preparar la tabla <code>quote_company_profile</code> en Supabase. Te dejé el SQL en <code>C:\Users\julia\hst-contabilidad\docs\quote-company-profile.sql</code>.
        </div>
      ) : null}

      <section style={layout}>
        <div style={card}>
          <div style={cardTitle}>Editar datos</div>

          <div style={grid}>
            <Field label="Nombre de empresa">
              <input style={input} value={profile.name} onChange={(e) => setField("name", e.target.value)} />
            </Field>

            <Field label="RUC">
              <input style={input} value={profile.ruc} onChange={(e) => setField("ruc", e.target.value)} />
            </Field>

            <Field label="Correo">
              <input style={input} value={profile.email} onChange={(e) => setField("email", e.target.value)} />
            </Field>

            <Field label="Teléfono">
              <input style={input} value={profile.phone} onChange={(e) => setField("phone", e.target.value)} />
            </Field>

            <Field label="Ciudad">
              <input style={input} value={profile.city} onChange={(e) => setField("city", e.target.value)} />
            </Field>

            <Field label="Sitio web (opcional)">
              <input style={input} value={profile.website} onChange={(e) => setField("website", e.target.value)} />
            </Field>

            <Field label="Dirección" full>
              <input style={input} value={profile.address} onChange={(e) => setField("address", e.target.value)} />
            </Field>

            <Field label="Color principal" full={false}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input style={{ ...input, width: "100%" }} value={profile.accent_blue} onChange={(e) => setField("accent_blue", e.target.value)} />
                <div style={{ width: 42, height: 42, borderRadius: 14, border: "1px solid rgba(148,163,184,0.18)", background: profile.accent_blue }} />
              </div>
            </Field>

            <Field label="Logo por URL" full>
              <input style={input} value={profile.logo_url} onChange={(e) => setField("logo_url", e.target.value)} placeholder="https://..." />
            </Field>

            <Field label="Subir logo" full>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <input type="file" accept="image/*" onChange={uploadLogo} />
                <div style={helper}>{uploading ? "Subiendo..." : "Puedes subir PNG, JPG o SVG. Se guarda en el bucket docs."}</div>
              </div>
            </Field>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
            <button style={primaryButton} onClick={saveProfile} disabled={saving}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
            <button style={ghostButton} onClick={() => setProfile(DEFAULT_QUOTE_COMPANY_PROFILE)}>
              Restablecer vista base
            </button>
          </div>

          {status ? <div style={statusBox}>{status}</div> : null}
        </div>

        <div style={card}>
          <div style={cardTitle}>Vista previa</div>

          <div style={previewSheet}>
            <div style={{ ...previewBar, background: profile.accent_blue }} />
            <div style={previewHeaderCard}>
              <div style={previewLogoWrap}>
                {profile.logo_url ? <img src={profile.logo_url} alt="Logo empresa" style={previewLogo} /> : <div style={previewLogoPlaceholder}>Logo</div>}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={previewTitle}>{profile.name}</div>
                {previewHeader.map((line) => (
                  <div key={line} style={previewMeta}>
                    {line}
                  </div>
                ))}
              </div>
            </div>

            <div style={previewClientBox}>
              <div style={previewSectionTitle}>Cliente</div>
              <div style={previewLine}><b>Nombre:</b> Cliente ejemplo</div>
              <div style={previewLine}><b>Documento:</b> 1720000000</div>
              <div style={previewLine}><b>Dirección:</b> Quito - La Carolina</div>
            </div>

            <div style={previewTotals}>
              <div style={previewMiniTitle}>TOTAL</div>
              <div style={previewTotalValue}>$ 149,99</div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : undefined }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const page: CSSProperties = {
  maxWidth: 1380,
  margin: "0 auto",
  padding: 24,
  color: "#eef4fb",
};

const hero: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 18,
  flexWrap: "wrap",
  marginBottom: 18,
};

const eyebrow: CSSProperties = {
  fontSize: 12,
  letterSpacing: 1.6,
  textTransform: "uppercase",
  fontWeight: 800,
  color: "#93c5fd",
};

const title: CSSProperties = {
  margin: "6px 0 8px",
  fontSize: 40,
  lineHeight: 1,
};

const subtitle: CSSProperties = {
  margin: 0,
  color: "#94a3b8",
  maxWidth: 760,
  lineHeight: 1.6,
};

const backLink: CSSProperties = {
  padding: "12px 16px",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(15, 23, 37, 0.96)",
  color: "#f8fafc",
  textDecoration: "none",
  fontWeight: 700,
};

const warningCard: CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(240, 180, 41, 0.2)",
  background: "rgba(89, 52, 9, 0.18)",
  color: "#fde68a",
  padding: 14,
  marginBottom: 18,
};

const layout: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.05fr) minmax(360px, 0.95fr)",
  gap: 18,
};

const card: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.14)",
  background: "linear-gradient(180deg, rgba(17, 24, 39, 0.96) 0%, rgba(10, 15, 26, 0.96) 100%)",
  borderRadius: 22,
  padding: 18,
  boxShadow: "0 18px 36px rgba(0,0,0,0.14)",
};

const cardTitle: CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
  marginBottom: 16,
};

const grid: CSSProperties = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#94a3b8",
  marginBottom: 6,
  fontWeight: 700,
};

const input: CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(148, 163, 184, 0.16)",
  background: "rgba(8, 14, 24, 0.95)",
  color: "#f8fafc",
  outline: "none",
};

const helper: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
};

const primaryButton: CSSProperties = {
  padding: "12px 16px",
  borderRadius: 14,
  border: "1px solid rgba(96, 165, 250, 0.24)",
  background: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)",
  color: "#f8fafc",
  fontWeight: 800,
  cursor: "pointer",
};

const ghostButton: CSSProperties = {
  padding: "12px 16px",
  borderRadius: 14,
  border: "1px solid rgba(148, 163, 184, 0.16)",
  background: "rgba(15, 23, 37, 0.96)",
  color: "#e2e8f0",
  fontWeight: 700,
  cursor: "pointer",
};

const statusBox: CSSProperties = {
  marginTop: 14,
  borderRadius: 14,
  padding: "12px 14px",
  background: "rgba(59, 130, 246, 0.1)",
  border: "1px solid rgba(96, 165, 250, 0.18)",
  color: "#bfdbfe",
};

const previewSheet: CSSProperties = {
  background: "#fff",
  color: "#0f172a",
  borderRadius: 24,
  overflow: "hidden",
  border: "1px solid #dbe4f0",
};

const previewBar: CSSProperties = {
  height: 16,
};

const previewHeaderCard: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "90px minmax(0, 1fr)",
  gap: 16,
  padding: 18,
  alignItems: "start",
};

const previewLogoWrap: CSSProperties = {
  width: 90,
  height: 90,
  borderRadius: 18,
  overflow: "hidden",
  border: "1px solid #dbe4f0",
  background: "#f8fafc",
  display: "grid",
  placeItems: "center",
};

const previewLogo: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
};

const previewLogoPlaceholder: CSSProperties = {
  color: "#64748b",
  fontWeight: 800,
};

const previewTitle: CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  lineHeight: 1.05,
  marginBottom: 10,
};

const previewMeta: CSSProperties = {
  color: "#334155",
  fontSize: 13,
  lineHeight: 1.5,
};

const previewClientBox: CSSProperties = {
  margin: "0 18px 18px",
  borderRadius: 18,
  border: "1px solid #dbe4f0",
  padding: 16,
};

const previewSectionTitle: CSSProperties = {
  fontWeight: 900,
  marginBottom: 10,
};

const previewLine: CSSProperties = {
  color: "#334155",
  lineHeight: 1.6,
  fontSize: 14,
};

const previewTotals: CSSProperties = {
  margin: "0 18px 18px auto",
  width: 220,
  borderRadius: 18,
  border: "1px solid #dbe4f0",
  padding: 16,
  textAlign: "right",
};

const previewMiniTitle: CSSProperties = {
  color: "#64748b",
  fontWeight: 800,
  fontSize: 12,
};

const previewTotalValue: CSSProperties = {
  fontSize: 30,
  fontWeight: 900,
  marginTop: 6,
};
