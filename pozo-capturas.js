/* Pozo: leer el contador «N de 75», nunca el número de la última bola. */
(function(root){
'use strict';
function contador(texto){
 const valores=[...String(texto||'').matchAll(/(?:^|[^\da-z])(\d{1,2})\s*de\s*75(?!\d)/gi)].map(m=>Number(m[1]));
 const unicos=[...new Set(valores)];return unicos.length===1&&unicos[0]>=1&&unicos[0]<=75?unicos[0]:null;
}
function evaluar(capturas,lecturas){
 if(!capturas.length||capturas.length!==lecturas.length||lecturas.some(n=>!Number.isInteger(n)||n<1||n>75))return{tipo:'revisar'};
 if(new Set(lecturas).size!==1)return{tipo:'revisar'};
 const bolitas=lecturas[0],cartones=capturas.flatMap(c=>c.cartones||[]);
 if(!cartones.length||new Set(cartones).size!==cartones.length||cartones.some(n=>!Number.isInteger(n)||n<1||n>9999))return{tipo:'revisar'};
 return{tipo:bolitas<=52?'califica':'no_califica',bolitas,cartones};
}
function crear({leer,vigente,aplicar,aviso}){
 const jornadas=new Map();let cola=Promise.resolve();
 function revisar(e,capturas){
  const tarea=async()=>{
   if(!await vigente(e))return;
   const key=JSON.stringify([e.fecha,String(e.source)]);
   if(!jornadas.has(key)){if(jornadas.size>3)jornadas.clear();jornadas.set(key,new Map());}
   const rondas=jornadas.get(key),previa=rondas.get(e.ronda);
   let r=previa?.e.id===e.id?previa:null;
   if(!r){
    aviso('🔎 Revisando el contador de bolitas de la ronda '+e.ronda+'…',e);
    const lecturas=[];
    for(const c of capturas){try{lecturas.push(c.error?null:await leer(c.blob));}catch{lecturas.push(null);}}
    if(!await vigente(e))return;
    r={e,capturas,resultado:evaluar(capturas,lecturas)};rondas.set(e.ronda,r);
   }
   for(const [n,fila] of rondas)if(!await vigente(fila.e))rondas.delete(n);
   if(!rondas.has(e.ronda))return;
   if(r.resultado.tipo==='revisar')aviso('⚠️ No se leyó claramente «N de 75» en todas las capturas de la ronda '+e.ronda+'. Revisa el pozo manualmente.',e);
   else if(r.resultado.tipo==='no_califica')aviso('Ronda '+e.ronda+': '+r.resultado.bolitas+' bolitas. No gana el pozo (límite: 52).',e);
   const candidato=[...rondas.values()].filter(x=>x.resultado.tipo==='califica').sort((a,b)=>a.e.ronda-b.e.ronda)[0];
   if(!candidato)return;
   for(let i=1;i<candidato.e.ronda;i++){
    if(!rondas.has(i)||rondas.get(i).resultado.tipo==='revisar'){
     aviso('⚠️ Posible pozo en ronda '+candidato.e.ronda+' con '+candidato.resultado.bolitas+' bolitas. Trae o revisa las capturas de las rondas anteriores para confirmar el primer ganador.',candidato.e);return;
    }
   }
   if(!await vigente(candidato.e))return;
   await aplicar(candidato);
  };
  const p=cola.catch(()=>{}).then(tarea).catch(err=>aviso('⚠️ No se pudo revisar el pozo: '+(err.message||'Revisa manualmente.'),e));cola=p;return p;
 }
 return{revisar};
}
root.PozoCapturas={contador,evaluar,crear};if(typeof module==='object')module.exports=root.PozoCapturas;
if(!root.document)return;
const d=root.document,$=id=>d.getElementById(id);let carga=null,worker=null,generacion=0;
function cargarOCR(){
 if(root.Tesseract)return Promise.resolve();
 return carga||(carga=new Promise((ok,no)=>{const s=d.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';s.onload=ok;s.onerror=()=>{carga=null;no(Error('Lectura automática sin conexión.'));};d.head.append(s);}));
}
async function leer(blob){
 let timer;const turno=++generacion;const activo=()=>{if(turno!==generacion)throw Error('Lectura cancelada.');};
 try{return await Promise.race([(async()=>{
  const im=await root.EnVivoComun.imagen(blob);
  // Formato completo del bingo: el contador está sobre las cinco últimas bolas.
  if(im.width/im.height<1.7||im.width/im.height>2.2)throw Error('Captura recortada.');
  const c=d.createElement('canvas'),w=Math.round(im.width*.10),h=Math.round(im.height*.055);
  c.width=w*3+40;c.height=h*3+40;const ctx=c.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
  ctx.drawImage(im,im.width*.44,im.height*.66,w,h,20,20,w*3,h*3);
  const pix=ctx.getImageData(0,0,c.width,c.height);
  for(let i=0;i<pix.data.length;i+=4){const v=Math.max(pix.data[i],pix.data[i+1],pix.data[i+2])<150?0:255;pix.data[i]=pix.data[i+1]=pix.data[i+2]=v;pix.data[i+3]=255;}
  ctx.putImageData(pix,0,0);await cargarOCR();activo();
  if(!worker){const nuevo=await root.Tesseract.createWorker('eng',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',langPath:'https://tessdata.projectnaptha.com/4.0.0'});if(turno!==generacion){await nuevo.terminate();throw Error('Lectura cancelada.');}worker=nuevo;}
  const resultados=[];
  for(const modo of ['7','6']){activo();await worker.setParameters({tessedit_pageseg_mode:modo});const r=(await worker.recognize(c)).data;activo();const n=contador(r.text);if(n===null||Number(r.confidence)<80)return null;resultados.push(n);}
  return resultados[0]===resultados[1]?resultados[0]:null;
 })(),new Promise((_,no)=>{timer=setTimeout(()=>no(Error('La lectura de bolitas tardó demasiado.')),25000);})]);}
 catch{generacion++;if(worker){try{await worker.terminate();}catch{}worker=null;}return null;}
 finally{clearTimeout(timer);}
}
function localVigente(e){
 try{return !(typeof REINICIANDO_SORTEO!=='undefined'&&REINICIANDO_SORTEO)&&String(SLOT_APPROVED_SOURCE)===String(e.source)&&root.ResultadosPublicos.fechaISO($('fechaSorteo').value)===e.fecha&&root.EnVivoComun.numeros(e).slice().sort((a,b)=>a-b).join(',')===root.EnVivoComun.cartones($('car'+e.ronda)?.value).sort((a,b)=>a-b).join(',');}catch{return false;}
}
async function vigente(e){
 if(!localVigente(e))return false;
 const {data,error}=await supa.rpc('en_vivo_contexto',{p_fecha:e.fecha});if(error||!data?.pagos||String(data.source)!==String(e.source))return false;
 const {data:c,error:ce}=await supa.rpc('en_vivo_cortes',{p_fecha:e.fecha});if(ce||String(c?.source)!==String(e.source)||e.revision<=Number(c?.revisiones?.[String(e.ronda)]||0))return false;
 const actual=root.EnVivoComun.ultimos(data.envios).find(x=>x.ronda===e.ronda);
 return actual?.id===e.id&&localVigente(e);
}
function aviso(texto,e){
 const n=$('pozoAutoEstado');if(n)n.textContent=texto;
 if(e){let m=$('pozo-auto-ronda-'+e.ronda);const host=$('car'+e.ronda)?.closest('#rondas > .card');
  if(!m&&host){m=d.createElement('p');m.id='pozo-auto-ronda-'+e.ronda;m.className='small';m.setAttribute('role','status');(host.querySelector('.cp-cuerpo')||host).append(m);}
  if(m)m.textContent=texto;
 }
}
const detector=crear({leer,vigente,aviso,aplicar:async({e,capturas,resultado})=>{
 const editar=root.PagosCompartidos?.editarCuandoLibre||root.PagosCompartidos?.editar;
 if(!editar||root.PagosCompartidos?.puedeEditar===false)throw Error('Espera la sincronización de Pagos y vuelve a traer las capturas.');
 const cartones=resultado.cartones.slice().sort((a,b)=>a-b);
 await editar(async()=>{
  if(!await vigente(e))throw Error('Cambió el sorteo o la ronda.');
  const campo=$('cartonPozo'),antes=campo.value,previo=$('premioPozo').value,premio=root.monto(previo);
  if(antes.trim()){
   const mismos=root.EnVivoComun.cartones(antes).slice().sort((a,b)=>a-b).join(',')===cartones.join(',');
   aviso(mismos?'✓ Pozo ya preparado para estos cartones. No se modificaron sus pagos.':'⚠️ El pozo ya tiene otros ganadores. Se conservó; revisa las rondas antes de cambiarlo.',e);return;
  }
  if(!Number.isFinite(premio)||premio<=0)throw Error('Configura el monto del pozo en Bs y vuelve a traer las capturas.');
  if(cartones.some(n=>root.estadoCarton(String(n))!=='OK'))throw Error('Hay cartones sin aprobación.');
  campo.value=cartones.join(', ');
  try{if(!root.generarPozo())throw Error('No se pudo preparar el pozo.');}
  catch(err){campo.value=antes;throw err;}
  const fallos=[];
  for(const c of capturas)for(const n of c.cartones){try{await root.ComprobantesPagos.recibirResultado({tipo:'pagosBtnsPozo',carton:n,fecha:e.fecha,source:e.source,blob:c.blob,reemplazar:false});}catch{fallos.push(n);}}
  root.guardarEstadoAhora();
  aviso('💰 POZO DETECTADO · Ronda '+e.ronda+' · '+resultado.bolitas+' bolitas · Cartón(es) '+cartones.join(', ')+'. Premio preparado; revisa antes de transferir.'+(fallos.length?' Falta adjuntar la captura del pozo para '+fallos.join(', ')+'.':''),e);
 },{vigente:()=>localVigente(e)});
}});
root.PozoCapturas.revisar=detector.revisar;
})(typeof window==='object'?window:globalThis);
