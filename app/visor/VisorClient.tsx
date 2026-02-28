"use client";

import { useEffect, useMemo, useState, CSSProperties } from "react";
import jsPDF from "jspdf";
import { supabase } from "../lib/supabase";

type Factura = {
  id: number;
  created_at: string;
  cliente: string;
  numero: string;
  monto: number;
  estado: string;
  pdf_url: string;
  fecha: string;
};

function dentroDeRango(fechaISO: string, desdeISO: string, hastaISO: string) {
  const t = new Date(fechaISO).getTime();
  const d = new Date(desdeISO + "T00:00:00").getTime();
  const h = new Date(hastaISO + "T23:59:59").getTime();
  return t >= d && t <= h;
}

export default function VisorClient() {

  const hoyISO = new Date().toISOString().slice(0, 10);
  const primerDiaMesISO = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [desde, setDesde] = useState(primerDiaMesISO);
  const [hasta, setHasta] = useState(hoyISO);

  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {

    const tx = await supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false });

    if (!tx.error && tx.data) setMovimientos(tx.data);

    const f = await supabase
      .from("facturas")
      .select("*")
      .order("created_at", { ascending: false });

    if (!f.error && f.data) setFacturas(f.data as any);
  }

  const movFiltrados = useMemo(() => {
    return movimientos.filter((m) => dentroDeRango(m.created_at, desde, hasta));
  }, [movimientos, desde, hasta]);

  const facFiltradas = useMemo(() => {
    return facturas.filter((f) => dentroDeRango(f.fecha || f.created_at, desde, hasta));
  }, [facturas, desde, hasta]);

  const ingresos = useMemo(() => {
    return movFiltrados
      .filter((m) => m.type === "VENTA_DIRECTA" || m.type === "PAGO_FACTURA")
      .reduce((acc, m) => acc + Number(m.amount || 0), 0);
  }, [movFiltrados]);

  const gastos = useMemo(() => {
    return movFiltrados
      .filter((m) => m.type === "GASTO" || m.type === "COMPRA")
      .reduce((acc, m) => acc + Number(m.amount || 0), 0);
  }, [movFiltrados]);

  const saldo = ingresos - gastos;

  async function verPdf(path: string) {
    const signed = await supabase.storage.from("invoices").createSignedUrl(path, 60 * 10);
    if (signed.error) return alert("Error PDF");
    window.open(signed.data.signedUrl);
  }

  async function generarEstadoCuentaPDF() {
    const doc = new jsPDF("p","mm","a4");
    const { default: autoTable } = await import("jspdf-autotable");

    doc.setFontSize(16);
    doc.text("HST CONTABILIDAD - ESTADO", 12, 20);

    autoTable(doc,{
      startY:30,
      head:[["Concepto","Valor"]],
      body:[
        ["Ingresos", `$${ingresos.toFixed(2)}`],
        ["Gastos", `$${gastos.toFixed(2)}`],
        ["Balance", `$${saldo.toFixed(2)}`],
      ]
    });

    doc.save("Estado_HST.pdf");
  }

  return (
    <main style={page}>
      <h1>HST CONTABILIDAD</h1>
      <p style={{color:"#00ff88"}}>Modo visor (solo lectura)</p>

      <div style={grid}>
        <Card title="Saldo" value={`$${saldo.toFixed(2)}`} />
        <Card title="Ingresos" value={`$${ingresos.toFixed(2)}`} />
        <Card title="Gastos" value={`$${gastos.toFixed(2)}`} />
      </div>

      <section style={panel}>
        <h2>Rango</h2>

        <input type="date" value={desde} onChange={e=>setDesde(e.target.value)} style={input}/>
        <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)} style={input}/>

        <button style={btn} onClick={generarEstadoCuentaPDF}>
          Descargar Estado PDF
        </button>
      </section>

      <section style={panel}>
        <h2>Historial</h2>
        {movFiltrados.map(m=>(
          <div key={m.id} style={{marginBottom:8}}>
            {new Date(m.created_at).toLocaleString()} — {m.description} — ${m.amount}
          </div>
        ))}
      </section>

      <section style={panel}>
        <h2>Facturas</h2>
        {facFiltradas.map(f=>(
          <div key={f.id} style={{marginBottom:8}}>
            {f.cliente} — ${f.monto}
            <button style={btnMini} onClick={()=>verPdf(f.pdf_url)}>Ver PDF</button>
          </div>
        ))}
      </section>

    </main>
  );
}

function Card({title,value}:{title:string,value:string}){
  return(
    <div style={card}>
      <div style={{color:"#aaa"}}>{title}</div>
      <div style={{fontSize:26,fontWeight:700,color:"#d4af37"}}>{value}</div>
    </div>
  )
}

const page:CSSProperties={background:"#0b0b0b",color:"#d4af37",minHeight:"100vh",padding:40,fontFamily:"Arial"}
const panel:CSSProperties={background:"#111",padding:20,borderRadius:12,marginTop:20}
const grid:CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:20}
const card:CSSProperties={background:"#111",padding:20,borderRadius:12}
const input:CSSProperties={padding:10,margin:5,background:"#000",color:"#fff",border:"1px solid #333"}
const btn:CSSProperties={padding:12,background:"#d4af37",border:"none",fontWeight:"bold",marginTop:10,cursor:"pointer"}
const btnMini:CSSProperties={marginLeft:10,padding:"4px 8px",background:"#d4af37",border:"none",cursor:"pointer"}