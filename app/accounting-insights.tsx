"use client";
import { useState, type FormEvent } from 'react';
import { money, startDate, summarize, type Ledger } from '@/lib/accounting';
import { treasurySummary, periodContribution, type Treasury } from '@/lib/treasury';
import s from './accounting.module.css';

export function Overview({ ledger, treasury, today, sales, go }: {
  ledger: Ledger; treasury: Treasury; today: string; sales: Ledger['sales']; go: (tab: string) => void;
}) {
  const t = treasurySummary(ledger, treasury, today);
  const profit = periodContribution(ledger,sales);
  const months = Array.from({length:6},(_,i) => {
    const d = new Date(today.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-5+i);
    const from=d.toISOString().slice(0,10);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).toISOString().slice(0,10);
    return { label: new Intl.DateTimeFormat('es-EC',{month:'short',timeZone:'UTC'}).format(d), ...summarize({...ledger,movements:[...ledger.movements,...treasury.entries.filter(e=>e.kind==="petty_expense").map(e=>({id:e.id,type:"GASTO",amount:e.amount,date:e.date,description:e.description}))]},{from,to:last},false,today) };
  });
  const max=Math.max(1,...months.flatMap(m=>[m.cashIn,m.cashOut]));
  const status=t.surplus===null?'Por configurar':t.surplus<0?'Reservas sin cubrir':t.surplus===0?'Sin excedente':'Excedente disponible';
  const tone=t.surplus===null?s.neutral:t.surplus>0?s.good:t.surplus<0?s.bad:s.warning;
  const free=t.withdrawable ?? 0;
  const covered=t.liquid!==null?Math.max(0,Math.min(t.liquid,t.reserved??t.liquid)):0;
  const proportion=t.liquid && t.liquid>0?Math.min(100,covered/t.liquid*100):100;
  return <>
    <div className={s.heroGrid}>
      <section className={s.hero}>
        <div className={s.eyebrow}>TU DINERO · SALDO ACTUAL</div>
        <h2>¿Cuánto puedo disponer?</h2>
        <strong className={s.heroAmount}>{t.withdrawable===null?'Por configurar':money(t.withdrawable)}</strong>
        <span className={`${s.badge} ${tone}`}>{status}</span>
        <p>Excedente de caja después de separar capital de trabajo, deudas y reservas. No equivale a ganancia.</p>
        <button className={s.lightButton} onClick={()=>go('cash')}>{treasury.settings?'Gestionar caja y reservas':'Configurar mi capital'} <span aria-hidden>↗</span></button>
      </section>
      <section className={s.panel}>
        <div className={s.sectionHeading}><div><span className={s.eyebrow}>DISTRIBUCIÓN</span><h2>Dinero y compromisos</h2></div></div>
        <div className={s.distribution}>
          <svg viewBox="0 0 120 120" className={s.donut} role="img" aria-label={t.liquid===null?'Distribución pendiente de configurar':`Dinero ${money(t.liquid)}; reservas y deudas ${money(t.reserved)}`}>
            <circle cx="60" cy="60" r="46" fill="none" stroke="#27364b" strokeWidth="12" />
            <circle cx="60" cy="60" r="46" fill="none" stroke={t.surplus===null?'#73849b':t.surplus<0?'#f48a94':'#47d7b4'} strokeWidth="12" pathLength="100" strokeDasharray={`${100-proportion} 100`} transform="rotate(-90 60 60)" strokeLinecap="round" />
            <text x="60" y="58" textAnchor="middle" fill="#aebdd0" fontSize="10">Excedente</text><text x="60" y="74" textAnchor="middle" fill="#edf4fc" fontSize="14" fontWeight="700">{t.withdrawable===null?'—':money(free)}</text>
          </svg>
          <dl className={s.legend}><div><dt><i className={s.dotMint}/>Dinero total</dt><dd>{money(t.liquid)}</dd></div><div><dt><i className={s.dotSlate}/>Reservas y deudas</dt><dd>{money(t.reserved)}</dd></div><div><dt><i className={s.dotAmber}/>Faltante para reservas</dt><dd className={t.surplus!==null&&t.surplus<0?s.bad:''}>{t.surplus===null?'Por configurar':money(Math.max(0,-t.surplus))}</dd></div></dl>
        </div>
      </section>
    </div>
    <div className={s.cards}>
      {[['Cuenta principal',t.main,'Caja y bancos registrados'],['Caja chica',t.petty,'Para gastos pequeños'],['Capital aportado actual',t.capital,'Inicial + aportes − devolución de capital'],['Contribución de ventas',profit,'Del período · después de costos asignados']].map(([label,value,help])=><article className={s.metric} key={String(label)}><span>{label}</span><strong className={typeof value==='number'&&value<0?s.bad:''}>{value===null?'Por configurar':money(value as number)}</strong><small>{help}</small></article>)}
    </div>
    <div className={s.heroGrid}>
      <section className={s.panel}><div className={s.sectionHeading}><div><span className={s.eyebrow}>FLUJO DE EFECTIVO</span><h2>Entradas y salidas</h2></div><span className={s.caption}>Últimos 6 meses</span></div>
        <div className={s.chartLegend}><span><i className={s.dotMint}/>Cobros</span><span><i className={s.dotRose}/>Pagos</span></div>
        <div className={s.bars} role="img" aria-label="Comparación mensual de cobros y pagos registrados desde el inicio operativo">
          {months.map((m,i)=><div className={s.barGroup} key={i}><div className={s.barPair}><div className={s.barIn} style={{height:`${m.cashIn/max*100}%`}} title={`${m.label}: cobros ${money(m.cashIn)}`} /><div className={s.barOut} style={{height:`${m.cashOut/max*100}%`}} title={`${m.label}: pagos ${money(m.cashOut)}`} /></div><span>{m.label}</span></div>)}
        </div>
        <details className={s.chartTable}><summary>Ver cifras del gráfico</summary><table><thead><tr><th>Mes</th><th>Cobros</th><th>Pagos</th></tr></thead><tbody>{months.map((m,i)=><tr key={i}><td>{m.label}</td><td>{money(m.cashIn)}</td><td>{money(m.cashOut)}</td></tr>)}</tbody></table></details>
        <p className={s.caption}>Sin datos anteriores al inicio operativo. Los aportes y traspasos de capital no son ventas.</p>
      </section>
      <section className={s.panel}><span className={s.eyebrow}>PRÓXIMOS PASOS</span><h2>Tu negocio, en orden</h2>
        <button className={s.actionRow} onClick={()=>go('sales')}><span><b>Cuentas por cobrar</b><small>Facturas nuevas y saldos iniciales de noviembre</small></span><strong>{money(t.receivable)} →</strong></button>
        <button className={s.actionRow} onClick={()=>go('purchases')}><span><b>Cuentas por pagar</b><small>Compromisos pendientes registrados</small></span><strong className={t.payable>0?s.warning:''}>{money(t.payable)} →</strong></button>
        <button className={s.actionRow} onClick={()=>go('tax')}><span><b>Reserva de impuestos</b><small>{treasury.settings?.tax_reserve!==null&&treasury.settings?'Reserva manual':'Estimación acumulada de IVA'}</small></span><strong>{money(t.tax)} →</strong></button>
      </section>
    </div>
  </>;
}

type Submit = (event: FormEvent<HTMLFormElement>,action:string,additional?:object,onSaved?:()=>void)=>void;
function Amount({label,name,value,required=true}: {label:string;name:string;value?:number|null;required?:boolean}) {
  return <label className={s.label}>{label}<input className={s.field} name={name} type="number" min="0" step="0.01" required={required} defaultValue={value??''}/></label>;
}
export function TreasuryPanel({treasury,ledger,today,submit,busy}: {treasury:Treasury;ledger:Ledger;today:string;submit:Submit;busy:boolean}) {
  const [configure,setConfigure]=useState(!treasury.settings);
  const t=treasurySummary(ledger,treasury,today);const config=treasury.settings;
  return <>
    <section className={s.panel}><div className={s.sectionHeading}><div><span className={s.eyebrow}>CONTROL DE FONDOS</span><h2>Caja, capital y reservas</h2></div><button className={s.subtle} onClick={()=>setConfigure(!configure)}>{configure?'Ocultar configuración':'Editar saldos y reservas'}</button></div>
      <p className={s.caption}>El capital es tu inversión; la contribución proviene de las ventas. El dinero en caja cambia al cobrar y pagar. Las reservas apartan dinero sin generar un gasto.</p>
      <div className={s.cards}><article className={s.metric}><span>Cuenta principal</span><strong className={t.main!==null&&t.main<0?s.bad:''}>{money(t.main)}</strong></article><article className={s.metric}><span>Caja chica</span><strong className={t.petty!==null&&t.petty<0?s.bad:''}>{money(t.petty)}</strong></article><article className={s.metric}><span>Capital aportado actual</span><strong>{money(t.capital)}</strong></article><article className={s.metric}><span>Retiros personales registrados</span><strong>{money(t.draws)}</strong></article></div>
      {configure&&<form key={JSON.stringify(config)} className={s.form} onSubmit={e=>submit(e,'treasury_settings',{},()=>setConfigure(false))}>
        <h3>Saldos al inicio del 24/11/2026</h3><p className={s.caption}>Escribe lo que realmente tenías antes de los movimientos de ese día. No pongas el saldo de hoy: se sumaría dos veces. Estos saldos sustituyen la configuración previa.</p>
        <div className={s.formGrid}><Amount label="Caja y bancos iniciales" name="opening_main" value={config?.opening_main}/><Amount label="Caja chica inicial" name="opening_petty" value={config?.opening_petty}/><Amount label="Capital propio aportado inicialmente" name="opening_capital" value={config?.opening_capital}/></div>
        <h3>Dinero que quieres proteger</h3><div className={s.formGrid}><Amount label="Reserva para compras y capital de trabajo" name="working_reserve" value={config?.working_reserve}/><Amount label="Otras reservas (sin repetir deudas ni IVA)" name="other_reserve" value={config?.other_reserve}/><Amount label="Reserva total de impuestos (vacío: estimar IVA)" name="tax_reserve" value={config?.tax_reserve} required={false}/></div>
        <p className={s.caption}>Las deudas de compras pendientes se apartan automáticamente. La reserva manual de impuestos sustituye la estimación: incluye en ella obligaciones o períodos anteriores que aún debas pagar.</p>
        <button className={s.button} disabled={busy}>Guardar saldos y reservas</button>
      </form>}
    </section>
    {config&&<section className={s.panel}><h2>Registrar movimiento de fondos</h2><form className={s.form} onSubmit={e=>submit(e,'treasury_entry')}><div className={s.formGrid}>
      <label className={s.label}>Tipo de movimiento<select className={s.field} name="kind"><option value="to_petty">Traspaso: principal → caja chica</option><option value="to_main">Traspaso: caja chica → principal</option><option value="petty_expense">Gasto pagado desde caja chica</option><option value="contribution">Aporte de capital a cuenta principal</option><option value="owner_draw">Retiro personal desde cuenta principal</option><option value="capital_return">Devolución de capital desde cuenta principal</option></select></label>
      <Amount label="Monto" name="amount"/><label className={s.label}>Fecha<input className={s.field} type="date" name="date" min={startDate} max={today} defaultValue={today} required/></label>
      <label className={s.label}>Concepto<input className={s.field} name="description" maxLength={500} required/></label></div>
      <p className={s.caption}>Los traspasos no cambian el dinero total. Un aporte no es ingreso por ventas y un retiro personal no es gasto del negocio. Para pagar una compra ya registrada, utiliza su botón de pago; no la registres otra vez aquí.</p><button className={s.button} disabled={busy}>Guardar movimiento</button></form></section>}
    <section className={s.panel}><h2>Historial de capital y caja chica</h2>{!treasury.entries.length?<p className={s.caption}>Aún no hay movimientos. Los saldos iniciales se configuran arriba.</p>:<div className={s.tableScroll}><table><thead><tr><th>Fecha</th><th>Movimiento</th><th>Concepto</th><th>Monto</th></tr></thead><tbody>{[...treasury.entries].reverse().map(e=><tr key={e.id}><td>{e.date}</td><td>{{contribution:'Aporte de capital',capital_return:'Devolución de capital',owner_draw:'Retiro personal',to_petty:'Principal → caja chica',to_main:'Caja chica → principal',petty_expense:'Gasto de caja chica'}[e.kind]}</td><td>{e.description}</td><td>{money(e.amount)}</td></tr>)}</tbody></table></div>}</section>
  </>;
}
