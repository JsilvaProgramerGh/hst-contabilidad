"use client";
import { useId, useState } from 'react';
import { decimalInput } from '@/lib/decimal-input';
import s from './accounting.module.css';

export default function DecimalField({label,name,value,required=true,help}: {
  label:string;name:string;value?:number|null;required?:boolean;help?:string;
}) {
  const [error,setError]=useState('');const descriptionId=useId();
  return <label className={s.label}>{label}
    <span className={s.moneyInput}><span aria-hidden="true">$</span><input className={s.field} name={name} type="text" inputMode="decimal" required={required}
      defaultValue={value===null||value===undefined?'':String(value).replace('.',',')} placeholder="0,00" aria-label={label} aria-describedby={error||help?descriptionId:undefined} aria-invalid={Boolean(error)}
      onChange={event=>{event.currentTarget.setCustomValidity('');setError('');}}
      onBlur={event=>{try { decimalInput(event.currentTarget.value);event.currentTarget.setCustomValidity('');setError(''); }
        catch(cause){const message=(cause as Error).message;event.currentTarget.setCustomValidity(message);setError(message);}}}/></span>
    {(error||help)&&<small id={descriptionId} className={error?s.bad:s.caption}>{error||help}</small>}
  </label>;
}
