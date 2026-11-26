"use client";
import {useRef,useState,type FormEvent} from 'react';
import {money} from '@/lib/accounting';
import {decimalInput} from '@/lib/decimal-input';
import {type TreasurySettings} from '@/lib/treasury';
import DecimalField from './decimal-field';
import s from './accounting.module.css';

export default function TreasurySetup({config,busy,onSave}: {config:TreasurySettings|null;busy:boolean;onSave:(event:FormEvent<HTMLFormElement>)=>void}) {
  const [step,setStep]=useState(0);const form=useRef<HTMLFormElement>(null);
  const [draft,setDraft]=useState<Record<string,unknown>>(config?{...config}:{});
  const amount=(name:string)=>{try {const n=decimalInput(draft[name]);return n===''?null:Number(n);}catch{return null;}};
  const main=amount('opening_main'),petty=amount('opening_petty');
  const initial=main===null||petty===null?null:main+petty;
  function next(){const fields=form.current?.querySelectorAll<HTMLInputElement>(`fieldset[data-step="${step}"] input`);if(fields)for(const input of fields)if(!input.reportValidity())return;setStep(step+1);}
  const titles=['Tu dinero inicial','Lo que quieres proteger','Revisar y guardar'];
  return <form noValidate ref={form} className={s.setup} onChange={e=>setDraft(Object.fromEntries(new FormData(e.currentTarget)))} onSubmit={event=>{
    if(step!==2){event.preventDefault();next();return;}
    for(const input of Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('input'))){
      if(!input.checkValidity()){event.preventDefault();setStep(Number(input.closest('fieldset')?.getAttribute('data-step')??0));requestAnimationFrame(()=>input.reportValidity());return;}
    }
    onSave(event);
  }}>
    <div className={s.setupHeading}><div><span className={s.eyebrow}>{config?'EDITAR CONFIGURACIÓN':'CONFIGURACIÓN INICIAL'} · PASO {step+1} DE 3</span><h3>{titles[step]}</h3></div><span className={s.caption}>USD · admite coma o punto</span></div>
    <ol className={s.steps} aria-label="Progreso">{titles.map((title,i)=><li key={title} aria-current={step===i?'step':undefined} className={step>=i?s.stepActive:''}><span>{i<step?'✓':i+1}</span>{title}</li>)}</ol>
    <fieldset data-step="0" hidden={step!==0} className={s.setupBody}>
      <legend className={s.srOnly}>Tu dinero inicial</legend>
      <p>¿Cuánto dinero tenías al comenzar el <b>24 de noviembre de 2026</b>?</p>
      <p className={s.caption}>Usa los saldos antes de los cobros y pagos de ese día. Después HST suma cada movimiento automáticamente.</p>
      <div className={s.setupFields}><DecimalField label="Dinero en bancos y caja principal" name="opening_main" value={config?.opening_main} help="Todo tu efectivo y bancos, sin incluir la caja chica."/>
      <DecimalField label="Dinero en caja chica" name="opening_petty" value={config?.opening_petty} help="El efectivo separado para gastos pequeños. Si no usas caja chica, escribe 0."/></div>
      <div className={s.setupExample}>Ejemplo: banco $500,50 + efectivo principal $20 = <b>520,50</b> en la primera casilla. Si aparte tienes $15 en caja chica, escribe <b>15</b> en la segunda.</div>
      <div className={s.previewLine}><span>Total de dinero inicial</span><strong>{initial===null?'Completa ambas casillas':money(initial)}</strong></div>
    </fieldset>
    <fieldset data-step="1" hidden={step!==1} className={s.setupBody}>
      <legend className={s.srOnly}>Capital y reservas</legend>
      <div className={s.setupFields}><DecimalField label="¿Cuánto capital propio habías aportado?" name="opening_capital" value={config?.opening_capital} help="Tu inversión inicial, incluso la que ya estaba en productos. No se suma otra vez al dinero en caja."/>
      <DecimalField label="¿Cuánto quieres guardar para volver a comprar?" name="working_reserve" value={config?.working_reserve} help="El mínimo de dinero que quieres proteger para que el negocio siga funcionando."/></div>
      <div className={s.setupFields}><DecimalField label="Otra reserva" name="other_reserve" value={config?.other_reserve} help="Por ejemplo, un fondo para imprevistos. Escribe 0 si no necesitas uno."/>
      <DecimalField label="Dinero reservado para impuestos (opcional)" name="tax_reserve" value={config?.tax_reserve} required={false} help="Vacío: HST estima el IVA. Si escribes un importe, reemplaza esa estimación."/></div>
      <div className={s.setupExample}>HST aparta las compras pendientes automáticamente. No repitas esas deudas ni los impuestos en “Otra reserva”.</div>
    </fieldset>
    <fieldset data-step="2" hidden={step!==2} className={s.setupBody}>
      <legend className={s.srOnly}>Revisar configuración</legend><p>Revisa los importes antes de guardarlos.</p>
      <dl className={s.review}>{[['Bancos y caja principal','opening_main'],['Caja chica','opening_petty'],['Capital propio aportado','opening_capital'],['Reserva para próximas compras','working_reserve'],['Otra reserva','other_reserve'],['Reserva de impuestos','tax_reserve']].map(([label,name])=><div key={name}><dt>{label}</dt><dd>{name==='tax_reserve'&&amount(name)===null?'Calcular con el IVA registrado':money(amount(name))}</dd></div>)}</dl>
      <p className={s.caption}>Estos son tus saldos iniciales y tus reservas. No crean ventas, ganancias ni cobros. {config?'Al guardar, se reemplaza la configuración anterior.':''}</p>
    </fieldset>
    <footer className={s.setupFooter}>{step>0?<button className={s.subtle} type="button" disabled={busy} onClick={()=>setStep(step-1)}>← Volver</button>:<span className={s.caption}>Ejemplos válidos: 125,50 · 125.50</span>}
      <button key="continue" hidden={step===2} className={s.button} type="button" onClick={next}>Continuar →</button>
      <button key="save" hidden={step!==2} type="submit" className={s.button} disabled={busy}>{busy?'Guardando…':'Confirmar y guardar'}</button>
    </footer>
  </form>;
}
