(function(root){
'use strict';
function fecha(raw){const s=String(raw||'').trim(),m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/)||s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!m)throw Error('Revisa la fecha del sorteo.');const a=m[1].length===4?[m[1],m[2],m[3]]:[m[3],m[2],m[1]],v=a.map((n,i)=>i?String(n).padStart(2,'0'):n).join('-');if(new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)throw Error('Fecha inválida.');return v;}
function uuid(){if(root.crypto?.randomUUID)return root.crypto.randomUUID();const b=new Uint8Array(16);root.crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(n=>n.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
function cartones(raw){if(!/^\s*\d{1,4}(?:\s*[,;]\s*\d{1,4})*\s*$/.test(String(raw||'')))throw Error('Escribe el cartón; si hay varios, sepáralos con comas.');const n=String(raw).split(/[,;]/).map(Number);if(n.some(x=>x<1||x>9999)||new Set(n).size!==n.length)throw Error('Revisa los cartones: sin ceros ni repetidos.');return n;}
function leerOCR(texto,lateral=''){
 const clean=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const t=clean(texto),l=clean(lateral),bottom=t.match(/premi[o0]\s+cart[o0]n(?:es)?\s*[:;]?\s*([\d]+(?:\s*[,;]\s*\d+)*)/i),side=l.match(/cart[o0]n\s*(?:n[°ºo.]?\s*)?[:;]?\s*(\d{1,4})/i);let ns=[];
 try{if(bottom)ns=cartones(bottom[1]);else if(side)ns=cartones(side[1]);}catch{}
 const conflicto=!!(bottom&&side&&ns.length&&!ns.includes(Number(side[1])));
 return{cartones:conflicto?[]:ns,conflicto};
}
function ultimos(rows){const m=new Map();for(const e of rows||[])if(!m.has(e.ronda)||m.get(e.ronda).revision<e.revision)m.set(e.ronda,e);return [...m.values()].sort((a,b)=>a.ronda-b.ronda);}
function numeros(e){const ns=e.capturas.flatMap(c=>c.cartones);if(ns.length>100||new Set(ns).size!==ns.length||ns.some(n=>!Number.isInteger(n)||n<1||n>9999))throw Error('Los cartones del envío no son válidos.');return ns;}
function ruta(path,uid,f){return typeof path==='string'&&new RegExp('^'+uid+'/'+f+'/[0-9a-f-]{36}[.]jpg$').test(path);}
let dbp;
function db(){return dbp||(dbp=new Promise((ok,no)=>{const r=indexedDB.open('andino-presentadora',1);r.onupgradeneeded=()=>r.result.createObjectStore('borradores');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);}));}
async function local(key,value){const d=await db();return new Promise((ok,no)=>{const tx=d.transaction('borradores',value===undefined?'readonly':'readwrite'),r=value===undefined?tx.objectStore('borradores').get(key):tx.objectStore('borradores').put(value,key);let out;r.onsuccess=()=>out=r.result;tx.oncomplete=()=>ok(out);tx.onerror=tx.onabort=()=>no(tx.error||Error('No se pudo guardar en este equipo'));});}
async function imagen(blob){const u=URL.createObjectURL(blob);try{return await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(Error('No se pudo abrir la captura'));i.src=u;});}finally{URL.revokeObjectURL(u);}}
function jpeg(c){return new Promise((ok,no)=>c.toBlob(b=>b?ok(b):no(Error('No se pudo preparar la captura')),'image/jpeg',.94));}
async function preparar(blob){if(!['image/png','image/jpeg','image/webp'].includes(blob.type)||blob.size>20*1024*1024)throw Error('Usa una captura JPG, PNG o WebP de menos de 20 MB.');const im=await imagen(blob);if(im.width*im.height>40000000)throw Error('La captura es demasiado grande.');const s=Math.min(1,1800/im.width,2600/im.height),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*s));c.height=Math.max(1,Math.round(im.height*s));c.getContext('2d').drawImage(im,0,0,c.width,c.height);return{canvas:c,blob:await jpeg(c)};}
root.EnVivoComun={uuid,fecha,cartones,leerOCR,ultimos,numeros,ruta,local,imagen,preparar};if(typeof module==='object')module.exports=root.EnVivoComun;
})(typeof window==='object'?window:globalThis);
