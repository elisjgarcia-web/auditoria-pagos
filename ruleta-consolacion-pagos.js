/* Ruleta -> Consolación. Solo consulta resultados verificados del sorteo actual.
 * Los cartones gratis se ignoran y jamás se modifica un pago ya realizado. */
(function(root){
'use strict';
if(!root.document)return;
const d=root.document,$=id=>d.getElementById(id);
let cargando=false,anterior='',mounted=false;
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
 const reload=d.createElement('button');reload.className='sec';reload.type='button';reload.id='traerGanadoresRuleta';reload.textContent='↓ Traer ganadores';reload.onclick=()=>revisar(true);
 top.append(name,reload);
 const state=d.createElement('p');state.id='ruletaPagosEstado';state.setAttribute('role','status');state.setAttribute('aria-live','polite');state.textContent='Primero pulsa «Enviar ganadores a pagos» en la ruleta y luego «Traer ganadores» aquí.';
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
  cash.push({carton:ticket,monto:parsed.monto,drawId:row.drawId,premio:row.prize,tipo:row.prizeType});
 }
 return{cash,pendientes,regalos};
}
function convertirConsolacion(cash,usd,tasa){
 const hayConsolacion=cash.some(w=>w.tipo==='consolation');
 if(!hayConsolacion||!Number.isFinite(usd)||usd<=0)return{cash,nota:''};
 if(!Number.isFinite(tasa)||tasa<=0)throw Error('Coloca la tasa Bs/$ en Preparar para calcular la consolación.');
 const esperado=Math.round(usd*tasa);
 if(!Number.isSafeInteger(esperado)||esperado<=0||esperado>1000000000)throw Error('Revisa el monto en USD y la tasa de consolación.');
 const diferentes=cash.filter(w=>w.tipo==='consolation'&&w.monto!==esperado);
 return{cash:cash.map(w=>w.tipo==='consolation'?{...w,monto:esperado}:w),
  nota:diferentes.length?' · Se usó '+usd+' USD × '+tasa+' Bs/$ = '+esperado+' Bs; el monto fijo de la ruleta era diferente.':''};
}
async function revisar(forzado=false){
 montar();
 if(cargando)return;
 if(!forzado&&d.hidden)return;
 if(typeof supa==='undefined'||!root.ResultadosPublicos||!$('fechaSorteo'))return;
 cargando=true;
 const boton=$('traerGanadoresRuleta');if(boton){boton.disabled=true;boton.textContent='Trayendo ganadores…';}
 try{
  if(root.pagosRestauracionLista)await root.pagosRestauracionLista;
  texto('Consultando los ganadores enviados desde la ruleta…');
  const {data:auth,error:authError}=await supa.auth.getSession();
  if(authError||!auth?.session){texto('Inicia sesión en Pagos para traer los ganadores enviados.');return;}
  const {data,error}=await supa.rpc('pagos_ruleta_consolacion');
  if(error)throw Error('No se pudo consultar la ruleta: '+error.message);
  if(!data||!Array.isArray(data.winners))throw Error('La ruleta respondió sin ganadores válidos.');
  if(!SLOT_APPROVED_SOURCE||String(data.source)!==String(SLOT_APPROVED_SOURCE)){
   texto('Carga los compradores aprobados del sorteo actual para vincular la ruleta.');return;
  }
  let fecha;
  try{fecha=ResultadosPublicos.fechaISO($('fechaSorteo').value);}catch{texto('Configura la fecha del sorteo para recibir premios de la ruleta.');return;}
  const tasa=Number(String($('tasaCambio')?.value||'').trim().replace(',','.')),{cash:recibidos,pendientes,regalos}=listaCash(data.winners,fecha,tasa);
  const {cash,nota}=convertirConsolacion(recibidos,Number(String($('usdConsol')?.value||'').replace(',','.')),tasa);
  actualizarBadge(cash.length);
  const invalid=pendientes.filter(w=>w.prizeType==='consolation');
  if(invalid.length){
   texto('⚠️ '+invalid.length+' premio(s) de dinero necesitan revisión: '+invalid[0].motivo+'. No se modificó Consolación.');return;
  }
  if(!cash.length){texto(regalos.length?'🎁 '+regalos.length+' cartón(es) gratis en la ruleta. Sin premios en dinero para esta fecha.':'No hay ganadores de dinero enviados. Pulsa «Enviar ganadores a pagos» en la ruleta y vuelve a traerlos.');return;}
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
   texto('✓ '+cash.length+' ganador(es) de consola recibidos · '+fmt(amount)+' Bs por ganador. Cartones gratis excluidos.'+nota);
   return;
  }
  if(!root.PagosCompartidos?.conectado||!root.PagosCompartidos?.puedeEditar){
   texto('🎰 '+missing.length+' ganador(es) de ruleta esperando a que Pagos termine de sincronizar.');return;
  }
  if(!forzado&&['premioCon','cartonesCon','fechaSorteo','tasaCambio'].includes(d.activeElement?.id)){
   texto('🎰 '+missing.length+' ganador(es) listos; pulsa «Traer ganadores» al terminar de editar.');return;
  }
  const firma=JSON.stringify([data.source,fecha,expected,amount]);
  if(anterior===firma&&!forzado)return;
  const editar=root.PagosCompartidos.editarCuandoLibre||root.PagosCompartidos.editar;
  texto('Preparando los pagos de '+cash.length+' ganador(es)…');
  await editar(async()=>{
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
  },{vigente:()=>String(SLOT_APPROVED_SOURCE)===String(data.source)&&ResultadosPublicos.fechaISO($('fechaSorteo').value)===fecha});
  anterior=firma;
  texto('✓ '+cash.length+' ganador(es) de la ruleta cargados en Consolación · '+fmt(amount)+' Bs c/u. Revisa antes de transferir.'+nota);
 }catch(e){texto('⚠️ '+(e?.message||'No se pudo sincronizar la consola.'));
 }
 finally{
  cargando=false;
  if(boton){boton.disabled=false;boton.textContent='↓ Traer ganadores';}
 }
}
root.RuletaConsolacionPagos=Object.freeze({interpretar,dineroEnBs,dineroEnUsd,listaCash,convertirConsolacion,revisar});
montar();
})(typeof window!=='undefined'?window:globalThis);
