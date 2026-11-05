/* Ruleta -> Consolación. Solo consulta resultados verificados del sorteo actual.
 * Los cartones gratis se ignoran y jamás se modifica un pago ya realizado. */
(function(root){
'use strict';
if(!root.document)return;
const d=root.document,$=id=>d.getElementById(id);
let cargando=false,pendiente=false,anterior='',mounted=false,reintento=null;
function reintentar(ms=700){
 if(reintento!==null||d.hidden)return;
 reintento=setTimeout(()=>{reintento=null;revisar();},ms);
}
const texto=t=>{const n=$('ruletaPagosEstado');if(n&&n.textContent!==t)n.textContent=t;};
function fechaCaracas(value){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Caracas',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const f={};for(const p of parts)if(p.type!=='literal')f[p.type]=p.value;
 return f.year+'-'+f.month+'-'+f.day;
}
function dineroEnBs(raw){
 const v=String(raw||'').trim().replace(/\s+/g,'');
 if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(v))return null;
 const n=Number(v.replace(/\./g,'').replace(',','.'));
 return Number.isFinite(n)&&n>0&&n<=1000000000?n:null;
}
function dineroEnUsd(raw){
 const v=String(raw||'').trim().replace(/\s+/g,'');
 if(/^\d+(?:[.,]\d{1,2})?$/.test(v))return Number(v.replace(',','.'));
 if(/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(v))return Number(v.replace(/,/g,''));
 return null;
}
function interpretar(premio,tipo,tasa){
 const textoPremio=String(premio||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/\bcarton(?:es)?\b/.test(textoPremio)&&/\bgratis\b|\bgratuito\b/.test(textoPremio))return {clase:'regalo'};
 const bs=textoPremio.match(/^(?:bs\.?|ves|bolivares?)\s*([\d.,]+)$|^([\d.,]+)\s*(?:bs\.?|ves|bolivares?)$/);
 const usd=textoPremio.match(/^(?:us\$|\$|usd)\s*([\d.,]+)$|^([\d.,]+)\s*(?:us\$|\$|usd|dolares?)$/);
 if(bs){
  const n=dineroEnBs(bs[1]||bs[2]);return n===null?{clase:'pendiente',motivo:'Premio en bolívares no válido'}:{clase:'dinero',monto:Math.round(n),unidad:'Bs'};
 }
 if(usd){
  const n=dineroEnUsd(usd[1]||usd[2]);if(!Number.isFinite(n)||n<=0||n>1000000)return{clase:'pendiente',motivo:'Premio en USD no válido'};
  if(!Number.isFinite(tasa)||tasa<=0)return{clase:'pendiente',motivo:'Falta colocar la tasa Bs/$ en Preparar'};
  return{clase:'dinero',monto:Math.round(n*tasa),unidad:'USD'};
 }
 return{clase:'pendiente',motivo:tipo==='consolation'?'No se identificó el monto de este premio':'Premio no reconocido'};
}
function montar(){
 if(mounted||!$('premioCon'))return;
 const base=$('premioCon').closest('.card');if(!base)return;
 const box=d.createElement('div');box.className='cp-ruleta-directa';box.id='ruletaPagos';
 const top=d.createElement('div');top.className='cp-ruleta-superior';
 const name=d.createElement('strong');name.textContent='🎰 Consolación desde la ruleta';
 const reload=d.createElement('button');reload.className='sec';reload.type='button';reload.textContent='↻ Consultar';reload.onclick=()=>revisar(true);
 top.append(name,reload);
 const state=d.createElement('p');state.id='ruletaPagosEstado';state.setAttribute('role','status');state.setAttribute('aria-live','polite');state.textContent='Los ganadores de dinero se cargarán automáticamente cuando salgan en la ruleta.';
 box.append(top,state);base.insertBefore(box,$('premioCon').previousElementSibling||$('premioCon'));mounted=true;
}
function actualizarBadge(cantidad){
 const resumen=$('premioCon')?.closest('.cp-premios')?.querySelector(':scope > summary');
 if(resumen)resumen.textContent='🎁 Pozo, consolación y Top'+(cantidad?' · 🎰 '+cantidad+' de ruleta':'');
}
function listaCash(rows,fecha,tasa){
 const cash=[],pendientes=[],regalos=[],seen=new Set();
 for(const row of Array.isArray(rows)?rows:[]){
  if(!row||typeof row!=='object'||typeof row.drawId!=='string'||seen.has(row.drawId))continue;
  seen.add(row.drawId);
  if(fechaCaracas(row.createdAt)!==fecha)continue;
  const parsed=interpretar(row.prize,row.prizeType,tasa);
  if(parsed.clase==='regalo'){regalos.push(row);continue;}
  if(parsed.clase==='pendiente'){pendientes.push({...row,motivo:parsed.motivo});continue;}
  const ticket=String(row.ticket||'').trim();
  if(!/^[1-9]\d{0,3}$/.test(ticket)){pendientes.push({...row,motivo:'Cartón fuera de rango'});continue;}
  cash.push({carton:ticket,monto:parsed.monto,drawId:row.drawId,premio:row.prize});
 }
 return{cash,pendientes,regalos};
}
async function revisar(forzado=false){
 montar();
 if(cargando){pendiente=true;return;}
 if(!forzado&&d.hidden)return;
 if(typeof supa==='undefined'||!root.ResultadosPublicos||!$('fechaSorteo'))return;
 cargando=true;
 try{
  if(root.pagosRestauracionLista)await root.pagosRestauracionLista;
  const {data:auth,error:authError}=await supa.auth.getSession();
  if(authError||!auth?.session){texto('Inicia sesión en Pagos para recibir automáticamente los ganadores.');return;}
  const {data,error}=await supa.rpc('pagos_ruleta_consolacion');
  if(error)throw Error('No se pudo consultar la ruleta: '+error.message);
  if(!data||!Array.isArray(data.winners))throw Error('La ruleta respondió sin ganadores válidos.');
  if(!SLOT_APPROVED_SOURCE||String(data.source)!==String(SLOT_APPROVED_SOURCE)){
   texto('Carga los compradores aprobados del sorteo actual para vincular la ruleta.');return;
  }
  let fecha;
  try{fecha=ResultadosPublicos.fechaISO($('fechaSorteo').value);}catch{texto('Configura la fecha del sorteo para recibir premios de la ruleta.');return;}
  const tasa=monto($('tasaCambio')?.value||''),{cash,pendientes,regalos}=listaCash(data.winners,fecha,tasa);
  actualizarBadge(cash.length);
  const invalid=pendientes.filter(w=>w.prizeType==='consolation');
  if(invalid.length){
   texto('⚠️ '+invalid.length+' premio(s) de dinero necesitan revisión: '+invalid[0].motivo+'. No se modificó Consolación.');return;
  }
  if(!cash.length){texto(regalos.length?'🎁 '+regalos.length+' cartón(es) gratis en la ruleta. Sin premios en dinero para esta fecha.':'Sin premios de dinero de ruleta para este sorteo.');return;}
  const nums=new Set();
  if(cash.some(w=>{if(nums.has(w.carton))return true;nums.add(w.carton);return false;})){
   texto('⚠️ Un cartón ganó dinero más de una vez. Revisa los giros antes de crear pagos duplicados.');return;
  }
  if(new Set(cash.map(w=>w.monto)).size!==1){
   texto('⚠️ Hay premios de distintos montos en la ruleta. Consulta los giros antes de preparar pagos individuales.');return;
  }
  if(!cash.every(w=>estadoCarton(w.carton)==='OK')){
   texto('⚠️ Hay cartones de ruleta que no coinciden con los compradores aprobados. Actualiza aprobados.');return;
  }
  const rondas=new Set(Array.from({length:Number($('cant')?.value)||6},(_,i)=>carts($('car'+(i+1))?.value||'')).flat());
  const personasRondas=new Set([...rondas].map(t=>String(buscar(t)?.cedulaCompra||'').replace(/\D/g,'')).filter(Boolean));
  if(cash.some(w=>rondas.has(w.carton)||personasRondas.has(String(buscar(w.carton)?.cedulaCompra||'').replace(/\D/g,'')))){
   texto('⚠️ Una persona ganadora de Consolación también aparece en las rondas. Revisa las exclusiones antes de pagar.');return;
  }
  const amount=cash[0].monto,importeActual=monto($('premioCon')?.value||'');
  const old=carts($('cartonesCon')?.value||'').map(String);
  const expected=cash.map(w=>w.carton);
  if(old.some(ticket=>!expected.includes(ticket)) || (old.length>0&&importeActual!==amount)){
   texto('⚠️ Ya hay una Consolación configurada con datos diferentes. No la reemplacé; revísala antes de sincronizar.');return;
  }
  const missing=expected.filter(ticket=>!old.includes(ticket));
  if(!missing.length){
   texto('✓ '+cash.length+' ganador(es) de consola recibidos · '+fmt(amount)+' Bs por ganador. Cartones gratis excluidos.');
   return;
  }
  if(!root.PagosCompartidos?.conectado||!root.PagosCompartidos?.puedeEditar||root.PagosCompartidos.aplicando){
   texto('🎰 '+missing.length+' ganador(es) de ruleta esperando a que Pagos termine de sincronizar.');if(root.PagosCompartidos?.conectado&&root.PagosCompartidos.puedeEditar)reintentar();return;
  }
  if(['premioCon','cartonesCon','fechaSorteo','tasaCambio'].includes(d.activeElement?.id)){
   texto('🎰 '+missing.length+' ganador(es) listos; terminaré de cargarlos al salir del campo que editas.');return;
  }
  const firma=JSON.stringify([data.source,fecha,expected,amount]);
  if(anterior===firma&&!forzado)return;
  await root.PagosCompartidos.editar(async()=>{
   // Segunda comprobación para no pisar cambios recibidos desde otro teléfono.
   if(String(SLOT_APPROVED_SOURCE)!==String(data.source)||ResultadosPublicos.fechaISO($('fechaSorteo').value)!==fecha)throw Error('El sorteo cambió mientras se recibían ganadores.');
   const actuales=carts($('cartonesCon').value||'').map(String);
   if(actuales.some(t=>!expected.includes(t)) || (actuales.length&&monto($('premioCon').value)!==amount))throw Error('Hay cambios manuales en Consolación. No se reemplazaron.');
   const nuevos=expected.filter(t=>!actuales.includes(t));
   if(!nuevos.length)return;
   const prevCartones=$('cartonesCon').value,prevPremio=$('premioCon').value;
   $('premioCon').value=String(amount);
   $('cartonesCon').value=[...actuales,...nuevos].join(', ');
   if(!generarCon()){
    $('cartonesCon').value=prevCartones;$('premioCon').value=prevPremio;
    throw Error('No se prepararon los pagos. Revisa las compras aprobadas.');
   }
   d.dispatchEvent(new Event('ronda-anuncio-generado'));
  });
  anterior=firma;
  texto('✓ '+cash.length+' ganador(es) de la ruleta cargados en Consolación · '+fmt(amount)+' Bs c/u. Revisa antes de transferir.');
 }catch(e){texto('⚠️ '+(e?.message||'No se pudo sincronizar la consola.'));
  if(/Espera a que termine la sincronización/i.test(e?.message||''))reintentar();
 }
 finally{
  cargando=false;
  if(pendiente){pendiente=false;setTimeout(()=>revisar(),250);}
 }
}
root.RuletaConsolacionPagos=Object.freeze({interpretar,dineroEnBs,dineroEnUsd,listaCash,revisar});
montar();
d.addEventListener('pagos-aprobados-cargados',()=>setTimeout(()=>revisar(),1200));
d.addEventListener('pagos-acceso-verificado',()=>setTimeout(()=>revisar(),1200));
d.addEventListener('visibilitychange',()=>{if(!d.hidden)revisar();});
root.addEventListener('online',()=>revisar());
d.addEventListener('focusout',e=>{if(['premioCon','cartonesCon','fechaSorteo','tasaCambio'].includes(e.target?.id))reintentar(250);});
root.addEventListener('focus',()=>revisar());
setInterval(()=>revisar(),4000);
setTimeout(()=>revisar(),1700);
})(typeof window!=='undefined'?window:globalThis);
