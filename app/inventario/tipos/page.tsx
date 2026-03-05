"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type InvType = { id: string; name: string; created_at?: string };

type TypeField = {
  id: string;
  type_id: string;
  key: string;
  label: string;
  input_type: "text" | "number" | "select";
  required: boolean;
  options: string[] | null;
  sort: number;
};

function slugKey(v: string) {
  return v
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export default function TiposCamposPage() {
  const [status, setStatus] = useState("");
  const [types, setTypes] = useState<InvType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");

  const selectedType = useMemo(
    () => types.find((t) => t.id === selectedTypeId) || null,
    [types, selectedTypeId]
  );

  const [fields, setFields] = useState<TypeField[]>([]);

  // crear tipo
  const [newType, setNewType] = useState("");

  // crear campo
  const [fKey, setFKey] = useState("");
  const [fLabel, setFLabel] = useState("");
  const [fInputType, setFInputType] = useState<TypeField["input_type"]>("text");
  const [fRequired, setFRequired] = useState(false);
  const [fOptions, setFOptions] = useState(""); // coma separada
  const [fSort, setFSort] = useState("10");

  // edición inline de campos
  const [editing, setEditing] = useState<Record<string, Partial<TypeField>>>({});

  useEffect(() => {
    loadTypes();
  }, []);

  useEffect(() => {
    if (selectedTypeId) loadFields(selectedTypeId);
    else setFields([]);
  }, [selectedTypeId]);

  async function loadTypes() {
    setStatus("Cargando tipos...");
    const { data, error } = await supabase.from("inv_types").select("id,name,created_at").order("name");
    if (error) return setStatus("❌ " + error.message);

    const list = (data as any as InvType[]) || [];
    setTypes(list);
    setStatus("Listo ✅");

    if (!selectedTypeId && list[0]?.id) setSelectedTypeId(list[0].id);
  }

  async function loadFields(typeId: string) {
    setStatus("Cargando campos...");
    const { data, error } = await supabase
      .from("inv_type_fields")
      .select("id,type_id,key,label,input_type,required,options,sort")
      .eq("type_id", typeId)
      .order("sort", { ascending: true });

    if (error) return setStatus("❌ " + error.message);
    setFields(((data as any) || []) as TypeField[]);
    setStatus("Listo ✅");
    setEditing({});
  }

  async function createType() {
    const name = newType.trim();
    if (!name) return;

    setStatus("Creando tipo...");
    const { error } = await supabase.from("inv_types").insert({ name });
    if (error) return setStatus("❌ " + error.message);

    setNewType("");
    await loadTypes();
    setStatus("✅ Tipo creado");
  }

  async function renameType(typeId: string) {
    const current = types.find((t) => t.id === typeId);
    const next = prompt("Nuevo nombre del tipo:", current?.name || "");
    if (!next) return;

    setStatus("Renombrando...");
    const { error } = await supabase.from("inv_types").update({ name: next.trim() }).eq("id", typeId);
    if (error) return setStatus("❌ " + error.message);

    await loadTypes();
    setStatus("✅ Tipo actualizado");
  }

  async function deleteType(typeId: string) {
    const current = types.find((t) => t.id === typeId);
    if (!confirm(`¿Eliminar el tipo "${current?.name}"? (Se borran también sus campos)`)) return;

    setStatus("Eliminando tipo...");
    const { error } = await supabase.from("inv_types").delete().eq("id", typeId);
    if (error) return setStatus("❌ " + error.message);

    setSelectedTypeId("");
    await loadTypes();
    setStatus("✅ Tipo eliminado");
  }

  async function createField() {
    if (!selectedTypeId) return alert("Selecciona un tipo primero.");

    const key = slugKey(fKey || fLabel);
    const label = fLabel.trim();
    if (!label) return alert("Falta el nombre del campo (label).");
    if (!key) return alert("Falta la key del campo.");

    const sort = Number(fSort);
    const options =
      fInputType === "select"
        ? fOptions
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : null;

    if (fInputType === "select" && (!options || options.length === 0)) {
      return alert("Para 'select', agrega opciones separadas por coma.");
    }

    setStatus("Creando campo...");
    const { error } = await supabase.from("inv_type_fields").insert({
      type_id: selectedTypeId,
      key,
      label,
      input_type: fInputType,
      required: fRequired,
      options,
      sort: Number.isFinite(sort) ? sort : 0,
    });

    if (error) return setStatus("❌ " + error.message);

    // reset form campo
    setFKey("");
    setFLabel("");
    setFInputType("text");
    setFRequired(false);
    setFOptions("");
    setFSort("10");

    await loadFields(selectedTypeId);
    setStatus("✅ Campo creado");
  }

  function startEditField(f: TypeField) {
    setEditing((prev) => ({
      ...prev,
      [f.id]: { ...f, options: f.options || null },
    }));
  }

  function cancelEditField(id: string) {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function saveEditField(id: string) {
    const e = editing[id];
    if (!e) return;

    const key = slugKey(String(e.key || ""));
    const label = String(e.label || "").trim();
    const input_type = (e.input_type || "text") as TypeField["input_type"];
    const required = Boolean(e.required);
    const sort = Number(e.sort ?? 0);

    let options: string[] | null = null;
    if (input_type === "select") {
      const raw = Array.isArray(e.options)
        ? e.options
        : String(e.options || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

      options = raw.map((x) => String(x).trim()).filter(Boolean);
      if (!options.length) return alert("Un select necesita opciones.");
    }

    if (!key) return alert("Key inválida.");
    if (!label) return alert("Label vacío.");

    setStatus("Guardando campo...");
    const { error } = await supabase
      .from("inv_type_fields")
      .update({ key, label, input_type, required, options, sort: Number.isFinite(sort) ? sort : 0 })
      .eq("id", id);

    if (error) return setStatus("❌ " + error.message);

    await loadFields(selectedTypeId);
    setStatus("✅ Campo actualizado");
  }

  async function deleteField(id: string) {
    if (!confirm("¿Eliminar este campo?")) return;

    setStatus("Eliminando campo...");
    const { error } = await supabase.from("inv_type_fields").delete().eq("id", id);
    if (error) return setStatus("❌ " + error.message);

    await loadFields(selectedTypeId);
    setStatus("✅ Campo eliminado");
  }

  return (
    <main style={page}>
      <header style={header}>
        <div>
          <h1 style={h1}>⚙️ Tipos y Campos</h1>
          <div style={{ color: "#aaa" }}>
            Crea tipos (ej: Guantes, Alcohol, Batas, etc.) y define sus campos (talla, color, ml, gramos...).
          </div>
        </div>
        <a href="/inventario" style={linkBack}>← Volver</a>
      </header>

      <div style={grid2}>
        {/* Panel tipos */}
        <section style={card}>
          <h2 style={h2}>Tipos</h2>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={input}
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              placeholder="Ej: Guantes / Fertilizantes / Limpieza..."
            />
            <button style={btnSmall} onClick={createType}>Crear</button>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {types.map((t) => (
              <div
                key={t.id}
                style={{
                  ...row,
                  borderColor: t.id === selectedTypeId ? "#5a4b2b" : "#222",
                  background: t.id === selectedTypeId ? "#14110a" : "#0f0f0f",
                }}
              >
                <button
                  style={rowPick}
                  onClick={() => setSelectedTypeId(t.id)}
                  title="Seleccionar"
                >
                  {t.name}
                </button>

                <div style={{ display: "flex", gap: 8 }}>
                  <button style={softBtn} onClick={() => renameType(t.id)}>Renombrar</button>
                  <button style={dangerBtn} onClick={() => deleteType(t.id)}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Panel campos */}
        <section style={card}>
          <h2 style={h2}>Campos del tipo: {selectedType?.name || "—"}</h2>

          {!selectedTypeId ? (
            <div style={{ color: "#aaa" }}>Selecciona un tipo para ver/crear campos.</div>
          ) : (
            <>
              {/* Crear campo */}
              <div style={{ ...box, marginBottom: 14 }}>
                <div style={grid4}>
                  <div>
                    <label style={label}>Label (lo que se ve)</label>
                    <input style={input} value={fLabel} onChange={(e) => setFLabel(e.target.value)} placeholder="Ej: Talla" />
                  </div>
                  <div>
                    <label style={label}>Key (interno)</label>
                    <input style={input} value={fKey} onChange={(e) => setFKey(e.target.value)} placeholder="Ej: talla (si lo dejas vacío, se genera)" />
                  </div>
                  <div>
                    <label style={label}>Tipo de input</label>
                    <select style={input} value={fInputType} onChange={(e) => setFInputType(e.target.value as any)}>
                      <option value="text">text</option>
                      <option value="number">number</option>
                      <option value="select">select</option>
                    </select>
                  </div>
                  <div>
                    <label style={label}>Orden</label>
                    <input style={input} value={fSort} onChange={(e) => setFSort(e.target.value)} type="number" />
                  </div>
                </div>

                <div style={{ ...grid2Inside, marginTop: 10 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", color: "#ddd", fontWeight: 800 }}>
                    <input type="checkbox" checked={fRequired} onChange={(e) => setFRequired(e.target.checked)} />
                    Requerido
                  </label>

                  {fInputType === "select" ? (
                    <div>
                      <label style={label}>Opciones (separadas por coma)</label>
                      <input style={input} value={fOptions} onChange={(e) => setFOptions(e.target.value)} placeholder="Ej: S, M, L, XL" />
                    </div>
                  ) : (
                    <div style={{ color: "#777", fontSize: 12 }}>
                      Para <b>select</b>, escribe opciones separadas por coma.
                    </div>
                  )}
                </div>

                <button style={btn} onClick={createField}>Agregar campo</button>
              </div>

              {/* Lista de campos */}
              {fields.length === 0 ? (
                <div style={{ color: "#aaa" }}>Este tipo aún no tiene campos.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {fields.map((f) => {
                    const ed = editing[f.id];
                    const isEdit = Boolean(ed);

                    return (
                      <div key={f.id} style={rowField}>
                        <div style={{ flex: 1 }}>
                          {!isEdit ? (
                            <>
                              <div style={{ color: "#fff", fontWeight: 900 }}>
                                {f.label} <span style={{ color: "#777", fontWeight: 700 }}>({f.key})</span>
                              </div>
                              <div style={{ color: "#aaa", fontSize: 12 }}>
                                input: <b>{f.input_type}</b> · requerido: <b>{String(f.required)}</b> · orden: <b>{f.sort}</b>
                                {f.input_type === "select" && f.options?.length ? (
                                  <> · opciones: <b>{f.options.join(", ")}</b></>
                                ) : null}
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={grid4}>
                                <div>
                                  <label style={label}>Label</label>
                                  <input
                                    style={input}
                                    value={String(ed.label ?? "")}
                                    onChange={(e) =>
                                      setEditing((p) => ({ ...p, [f.id]: { ...p[f.id], label: e.target.value } }))
                                    }
                                  />
                                </div>
                                <div>
                                  <label style={label}>Key</label>
                                  <input
                                    style={input}
                                    value={String(ed.key ?? "")}
                                    onChange={(e) =>
                                      setEditing((p) => ({ ...p, [f.id]: { ...p[f.id], key: e.target.value } }))
                                    }
                                  />
                                </div>
                                <div>
                                  <label style={label}>Input</label>
                                  <select
                                    style={input}
                                    value={(ed.input_type as any) || "text"}
                                    onChange={(e) =>
                                      setEditing((p) => ({ ...p, [f.id]: { ...p[f.id], input_type: e.target.value as any } }))
                                    }
                                  >
                                    <option value="text">text</option>
                                    <option value="number">number</option>
                                    <option value="select">select</option>
                                  </select>
                                </div>
                                <div>
                                  <label style={label}>Orden</label>
                                  <input
                                    style={input}
                                    type="number"
                                    value={String(ed.sort ?? 0)}
                                    onChange={(e) =>
                                      setEditing((p) => ({ ...p, [f.id]: { ...p[f.id], sort: Number(e.target.value) } }))
                                    }
                                  />
                                </div>
                              </div>

                              <div style={{ display: "flex", gap: 12, marginTop: 10, alignItems: "center" }}>
                                <label style={{ display: "flex", gap: 8, alignItems: "center", color: "#ddd", fontWeight: 800 }}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(ed.required)}
                                    onChange={(e) =>
                                      setEditing((p) => ({ ...p, [f.id]: { ...p[f.id], required: e.target.checked } }))
                                    }
                                  />
                                  Requerido
                                </label>

                                {(ed.input_type || f.input_type) === "select" ? (
                                  <div style={{ flex: 1 }}>
                                    <label style={label}>Opciones (coma)</label>
                                    <input
                                      style={input}
                                      value={Array.isArray(ed.options) ? ed.options.join(", ") : String(ed.options ?? "")}
                                      onChange={(e) =>
                                        setEditing((p) => ({ ...p, [f.id]: { ...p[f.id], options: e.target.value } }))
                                      }
                                      placeholder="Ej: S, M, L"
                                    />
                                  </div>
                                ) : (
                                  <div style={{ color: "#777", fontSize: 12 }}>
                                    Cambia a <b>select</b> para definir opciones.
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "start" }}>
                          {!isEdit ? (
                            <>
                              <button style={softBtn} onClick={() => startEditField(f)}>Editar</button>
                              <button style={dangerBtn} onClick={() => deleteField(f.id)}>Eliminar</button>
                            </>
                          ) : (
                            <>
                              <button style={btnSmall} onClick={() => saveEditField(f.id)}>Guardar</button>
                              <button style={softBtn} onClick={() => cancelEditField(f.id)}>Cancelar</button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div style={{ marginTop: 12, color: "#777", fontSize: 12 }}>{status}</div>
        </section>
      </div>
    </main>
  );
}

const page: React.CSSProperties = { minHeight: "100vh", background: "#0b0b0b", color: "#d4af37", padding: 24, fontFamily: "Arial" };
const header: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 16 };
const h1: React.CSSProperties = { margin: 0, fontSize: 28 };
const h2: React.CSSProperties = { margin: "0 0 10px 0", fontSize: 18, color: "#fff" };
const linkBack: React.CSSProperties = { color: "#aaa", textDecoration: "none", fontWeight: 800 };

const grid2: React.CSSProperties = { display: "grid", gap: 14, gridTemplateColumns: "340px 1fr", alignItems: "start" };
const card: React.CSSProperties = { background: "#111", border: "1px solid #333", borderRadius: 14, padding: 14 };
const box: React.CSSProperties = { background: "#0f0f0f", border: "1px solid #222", borderRadius: 14, padding: 12 };

const label: React.CSSProperties = { display: "block", marginBottom: 6, color: "#aaa", fontSize: 12, fontWeight: 800 };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #333", background: "#0b0b0b", color: "#fff" };

const btn: React.CSSProperties = { marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "#d4af37", border: "none", cursor: "pointer", fontWeight: 900, width: "100%" };
const btnSmall: React.CSSProperties = { padding: "10px 14px", borderRadius: 10, background: "#2a2412", border: "1px solid #5a4b2b", color: "#ffe2a8", cursor: "pointer", fontWeight: 900, whiteSpace: "nowrap" };
const softBtn: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "#121a2a", border: "1px solid #2b3a5a", color: "#b8d2ff", cursor: "pointer", fontWeight: 900 };
const dangerBtn: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "#2a1212", border: "1px solid #5a2b2b", color: "#ffb3b3", cursor: "pointer", fontWeight: 900 };

const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", border: "1px solid #222", borderRadius: 12, padding: 10, background: "#0f0f0f" };
const rowPick: React.CSSProperties = { background: "transparent", border: "none", color: "#fff", fontWeight: 900, cursor: "pointer", textAlign: "left", flex: 1 };

const rowField: React.CSSProperties = { display: "flex", gap: 12, border: "1px solid #222", borderRadius: 14, padding: 12, background: "#0f0f0f" };

const grid4: React.CSSProperties = { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" };
const grid2Inside: React.CSSProperties = { display: "grid", gap: 10, gridTemplateColumns: "240px 1fr", alignItems: "end" };