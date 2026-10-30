(function(root){
'use strict';
function crear(ad){
 let connected=false,online=false,controller=false,revision=-1,formRevision=-1,applying=false,busy=false,dirty=false,timer=null,needsReload=false,lastShared='',latest=null,paymentKeys=[],conflictHint='';
 const device=ad.device,label=ad.label;let source=null;
 const estado=()=>({connected,online,controller,busy,applying,revision,formRevision,latest,paymentKeys});
 function notice(text){ad.notice(text,estado());}
 function render(){ad.roles(estado());}
 async function rpc(action,extra={}){
  const r=await ad.rpc({action,device,label:label(),source,formRevision:needsReload?-1:formRevision,op:ad.uuid(),...extra});
  if(r.error)throw Error(r.error.message||'No se pudo sincronizar');return r.data;
 }
 async function accept(data,own=false){
  latest=data;if(data.state)paymentKeys=data.state.paymentKeys||[];online=true;controller=data.controller;revision=data.revision;
  if(data.state&&(!own||needsReload)){
   if(dirty){ad.backup(ad.snapshot());conflictHint='Otro teléfono guardó cambios mientras editabas.';}
   applying=true;try{await ad.apply(data.state);}finally{applying=false;}
   dirty=false;
  }
  formRevision=data.formRevision;needsReload=false;
  ad.payments(data.payments||{});if(data.state)lastShared=JSON.stringify(data.state);
  notice(conflictHint?'⚠️ Se cargaron los cambios más recientes. Repite tu última edición; quedó un borrador local.':'☁️ Datos compartidos actualizados · Puedes editar desde este teléfono.');
  render();ad.events(data.events||[]);
 }
 function failed(error){if(/Otro teléfono|más reciente/i.test(error.message))conflictHint=error.message;if(dirty||controller)ad.backup(ad.snapshot());dirty=false;online=false;needsReload=true;notice('⚠️ Sin sincronizar: '+error.message+' · Cambios compartidos pausados.');render();}
 async function ejecutar(action,extra={},own=false){
  if(busy)return false;busy=true;render();try{await accept(await rpc(action,extra),own);return true;}catch(e){failed(e);return false;}finally{busy=false;render();if(dirty)programar();}
 }
 async function conectar(src){if(busy)return false;if(source!==src){revision=-1;formRevision=-1;paymentKeys=[];}source=src;connected=true;needsReload=true;return ejecutar('join',{state:ad.seed?ad.seed():ad.snapshot()});}
 async function leer(){if(!connected||busy)return;if(dirty&&online)await guardar();if(busy)return;return ejecutar('read');}
 async function tomar(){if(!connected||!online||busy)return false;return ejecutar('claim',{state:ad.snapshot()});}
 async function liberar(){if(!controller||!online)return false;await guardar();if(!online)return false;return ejecutar('release');}
 function programar(){if(!connected||!online||!controller||applying)return;dirty=JSON.stringify(ad.snapshot())!==lastShared;if(!dirty)return;clearTimeout(timer);timer=setTimeout(guardar,350);}
 async function guardar(){
  if(!dirty||!online||!controller||busy||applying)return;
  const state=ad.snapshot(),serial=JSON.stringify(state);dirty=false;
  const ok=await ejecutar('save',{state},true);
  // An edit made while the request was running must be sent after this one.
  if(ok){conflictHint='';lastShared=serial;if(JSON.stringify(ad.snapshot())!==serial){dirty=true;programar();}}
 }
 async function marcar(key){
  if(dirty&&controller)await guardar();
  if(!connected||!online||busy||!paymentKeys.includes(key))return false;
  const previous=!!(latest?.payments||{})[key];
  return ejecutar('payment',{key,previous,value:!previous});
 }
 async function salir(){connected=false;online=false;controller=false;dirty=false;clearTimeout(timer);notice('Verifica tu acceso para cargar los datos compartidos.');render();return true;}
 return {conectar,leer,tomar,liberar,programar,guardar,marcar,salir,estado};
}
root.PagosSync={crear};if(typeof module!=='undefined')module.exports=root.PagosSync;
if(typeof document==='undefined')return;
const el=id=>document.getElementById(id);let client,starting=false;
const deviceKey='andino_pagos_device_v1';let device;
try{device=sessionStorage.getItem(deviceKey);if(!device){device=crypto.randomUUID();sessionStorage.setItem(deviceKey,device);}}catch{device=crypto.randomUUID();}
const readonlyActions=/^(aplicarPlantilla|convertirPremios|cambiarRondas|toggleTop|limpiarTodo|nuevoSorteo|procesarManual|importarRespaldo|recuperarGuardadoLocal)/;
function bloquear(s){
 const locked=s.connected&&!s.online;
 const keys=new Set(Object.keys(capturarPagosCompartidos().form));
 document.querySelectorAll('input,select,textarea').forEach(n=>{
  if(!keys.has(n.id)&&!/^((nom|pre|car)[1-6]|escaleraManual[1-6])$/.test(n.id))return;
  if(locked&&!n.disabled){n.dataset.syncLocked='1';n.disabled=true;}
  if(!locked&&n.dataset.syncLocked){n.disabled=false;delete n.dataset.syncLocked;}
 });
 document.querySelectorAll('button[onclick]').forEach(n=>{
  if(!readonlyActions.test(n.getAttribute('onclick'))&&!/importarRespaldoArchivo/.test(n.getAttribute('onclick')))return;
  if(locked&&!n.disabled){n.dataset.syncLocked='1';n.disabled=true;}
  if(!locked&&n.dataset.syncLocked){n.disabled=false;delete n.dataset.syncLocked;}
 });
 document.querySelectorAll('[data-clave-pago]').forEach(n=>{n.disabled=n.dataset.paymentBlocked==='1'||(s.connected&&(!s.online||s.busy||!s.paymentKeys.includes(n.dataset.clavePago)));});
}
function semilla(){
 const s=capturarPagosCompartidos();
 const hoy=new Intl.DateTimeFormat('es-VE',{timeZone:'America/Caracas',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date());
 if(String(s.form.fechaSorteo||'').replace(/\s/g,'')!==hoy){
  s.form.fechaSorteo=hoy;s.form.rondas=s.form.rondas.map(r=>({...r,car:''}));s.form.cartonPozo='';s.form.cartonesCon='';s.paymentKeys=[];
 }
 return s;
}
client=crear({device,label:()=>('Teléfono '+device.slice(0,4).toUpperCase()),uuid:()=>crypto.randomUUID(),
 rpc:a=>supa.rpc('pagos_sincronizar',{a}),snapshot:()=>capturarPagosCompartidos(),seed:semilla,apply:s=>aplicarPagosCompartidos(s),
 backup:s=>{try{localStorage.setItem('andino_pagos_borrador_v1',JSON.stringify({savedAt:new Date().toISOString(),state:s}));}catch{}},
 payments:p=>{PAGO_ESTADOS=p;document.querySelectorAll('[data-clave-pago]').forEach(b=>actualizarBotonPagado(b,b.dataset.clavePago));},
 notice:text=>{el('syncStatus').textContent=text;},roles:bloquear,events:()=>{}
});
root.PagosCompartidos={get aplicando(){return client.estado().applying;},get conectado(){return client.estado().connected;},get puedeEditar(){const s=client.estado();return !s.connected||s.online;},guardar:()=>client.programar(),marcar:key=>client.marcar(key)};
for(const name of ['aplicarPlantilla','convertirPremios','cambiarRondas','toggleTop','limpiarTodo','nuevoSorteo','procesarManual','importarRespaldo','recuperarGuardadoLocal']){
 const original=root[name];if(typeof original!=='function')continue;
 root[name]=function(...args){if(!root.PagosCompartidos.puedeEditar&&!client.estado().applying){alert('No hay conexión para guardar. Refresca cuando vuelva el internet.');return false;}return original.apply(this,args);};
}
async function iniciar(){
 if(starting||client.estado().busy)return;starting=true;
 try{
  if(root.pagosRestauracionLista)await root.pagosRestauracionLista;
  const {data,error}=await supa.auth.getSession();if(error||!data?.session){await client.salir();return;}
  if(client.estado().connected&&SLOT_APPROVED_SOURCE){await client.leer();return;}
  el('syncStatus').textContent='☁️ Cargando los datos compartidos…';
  await supaCargar();if(!SLOT_APPROVED_SOURCE)throw Error('No se pudieron cargar los aprobados. Refresca para reintentar.');
  await client.conectar(SLOT_APPROVED_SOURCE);
 }catch(e){el('syncStatus').textContent='⚠️ '+e.message;}finally{starting=false;bloquear(client.estado());}
}
document.addEventListener('pagos-local-guardado',()=>client.programar());
document.addEventListener('ronda-anuncio-generado',()=>{client.programar();bloquear(client.estado());});
document.addEventListener('pagos-acceso-verificado',iniciar);
document.addEventListener('pagos-sesion-cerrada',()=>client.salir());
document.addEventListener('pagos-aprobados-cargados',async()=>{
 if(starting)return;
 if(client.estado().connected&&client.estado().latest?.source!==SLOT_APPROVED_SOURCE)await client.salir();
 iniciar();
});
window.addEventListener('online',iniciar);
window.addEventListener('offline',()=>client.leer());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)iniciar();});
setInterval(()=>{if(!document.hidden)iniciar();},3000);
bloquear(client.estado());
Promise.resolve().then(iniciar);
})(typeof window!=='undefined'?window:globalThis);
