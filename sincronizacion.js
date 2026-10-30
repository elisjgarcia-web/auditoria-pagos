(function(root){
'use strict';
function crear(ad){
 let connected=false,online=false,controller=false,revision=-1,formRevision=-1,applying=false,busy=false,dirty=false,timer=null,needsReload=false,lastShared='',latest=null;
 const device=ad.device,label=ad.label;let source=null;
 const estado=()=>({connected,online,controller,busy,applying,revision,formRevision,latest});
 function notice(text){ad.notice(text,estado());}
 function render(){ad.roles(estado());}
 async function rpc(action,extra={}){
  const r=await ad.rpc({action,device,label:label(),source,formRevision:needsReload?-1:formRevision,op:ad.uuid(),...extra});
  if(r.error)throw Error(r.error.message||'No se pudo sincronizar');return r.data;
 }
 async function accept(data,own=false){
  latest=data;online=true;controller=data.controller;revision=data.revision;
  if(data.state&&(!own||needsReload)){
   if(dirty)ad.backup(ad.snapshot());
   applying=true;try{await ad.apply(data.state);}finally{applying=false;}
   dirty=false;
  }
  formRevision=data.formRevision;needsReload=false;
  ad.payments(data.payments||{});if(data.state)lastShared=JSON.stringify(data.state);
  notice((controller?'✅ Teléfono principal':'👀 Consulta y pagos')+' · Sincronizado'+(data.controllerLabel&&data.leaseActive?' · Control: '+data.controllerLabel:''));
  render();ad.events(data.events||[]);
 }
 function failed(error){if(dirty||controller)ad.backup(ad.snapshot());dirty=false;online=false;needsReload=true;notice('⚠️ Sin sincronizar: '+error.message+' · Cambios compartidos pausados.');render();}
 async function ejecutar(action,extra={},own=false){
  if(busy)return false;busy=true;render();try{await accept(await rpc(action,extra),own);return true;}catch(e){failed(e);return false;}finally{busy=false;render();if(dirty)programar();}
 }
 async function conectar(src){if(busy)return false;source=src;connected=true;needsReload=true;return ejecutar('join');}
 async function leer(){if(!connected||busy)return;return ejecutar('read');}
 async function tomar(){if(!connected||!online||busy)return false;return ejecutar('claim',{state:ad.snapshot()});}
 async function liberar(){if(!controller||!online)return false;await guardar();if(!online)return false;return ejecutar('release');}
 function programar(){if(!connected||!online||!controller||applying)return;dirty=JSON.stringify(ad.snapshot())!==lastShared;if(!dirty)return;clearTimeout(timer);timer=setTimeout(guardar,350);}
 async function guardar(){
  if(!dirty||!online||!controller||busy||applying)return;
  const state=ad.snapshot(),serial=JSON.stringify(state);dirty=false;
  const ok=await ejecutar('save',{state},true);
  // An edit made while the request was running must be sent after this one.
  if(ok){lastShared=serial;if(JSON.stringify(ad.snapshot())!==serial){dirty=true;programar();}}
 }
 async function marcar(key){
  if(dirty&&controller)await guardar();
  if(!connected||!online||busy||!(latest?.state?.paymentKeys||ad.snapshot().paymentKeys).includes(key))return false;
  const previous=!!(latest?.payments||{})[key];
  return ejecutar('payment',{key,previous,value:!previous});
 }
 async function salir(){if(controller&&online){await liberar();if(controller)return false;}connected=false;online=false;controller=false;clearTimeout(timer);notice('Sincronización desconectada · Trabajo local');render();return true;}
 return {conectar,leer,tomar,liberar,programar,guardar,marcar,salir,estado};
}
root.PagosSync={crear};if(typeof module!=='undefined')module.exports=root.PagosSync;
if(typeof document==='undefined')return;
const el=id=>document.getElementById(id);let client,connecting=false;
const deviceKey='andino_pagos_device_v1';let device;
try{device=sessionStorage.getItem(deviceKey);if(!device){device=crypto.randomUUID();sessionStorage.setItem(deviceKey,device);}}catch{device=crypto.randomUUID();}
const readonlyActions=/^(aplicarPlantilla|convertirPremios|cambiarRondas|toggleTop|limpiarTodo|nuevoSorteo|procesarManual|importarRespaldo|recuperarGuardadoLocal)/;
function bloquear(s){
 const locked=s.connected&&(!s.online||!s.controller);
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
 document.querySelectorAll('[data-clave-pago]').forEach(n=>{n.disabled=n.dataset.paymentBlocked==='1'||(s.connected&&(!s.online||s.busy));});
 el('syncClaim').disabled=!s.connected||!s.online||s.busy||s.controller;
 el('syncRelease').disabled=!s.connected||!s.online||s.busy||!s.controller;
 el('syncConnect').disabled=s.busy||connecting;
 el('syncDisconnect').disabled=!s.connected||s.busy;
 el('syncLabel').disabled=s.connected;
}
client=crear({device,label:()=>el('syncLabel').value.trim()||'Teléfono',uuid:()=>crypto.randomUUID(),
 rpc:a=>supa.rpc('pagos_sincronizar',{a}),snapshot:()=>capturarPagosCompartidos(),apply:s=>aplicarPagosCompartidos(s),
 backup:s=>{try{localStorage.setItem('andino_pagos_borrador_'+Date.now(),JSON.stringify(s));}catch{}},
 payments:p=>{PAGO_ESTADOS=p;document.querySelectorAll('[data-clave-pago]').forEach(b=>actualizarBotonPagado(b,b.dataset.clavePago));},
 notice:text=>{el('syncStatus').textContent=text;},roles:bloquear,
 events:events=>{el('syncEvents').replaceChildren();for(const e of events){const p=document.createElement('p');const names={claim:'Tomó el control',release:'Liberó el control',save:'Actualizó ganadores o premios',payment:e.detalle?.pagado?'Marcó un pago realizado':'Desmarcó un pago'};p.textContent=new Date(e.fecha).toLocaleTimeString('es-VE',{timeZone:'America/Caracas'})+' · '+e.dispositivo+' · '+(names[e.accion]||e.accion)+(e.accion==='payment'?' · '+e.detalle.pago:'');el('syncEvents').appendChild(p);}}
});
root.PagosCompartidos={get aplicando(){return client.estado().applying;},get conectado(){return client.estado().connected;},get puedeEditar(){const s=client.estado();return !s.connected||(s.online&&s.controller);},guardar:()=>client.programar(),marcar:key=>client.marcar(key)};
for(const name of ['aplicarPlantilla','convertirPremios','cambiarRondas','toggleTop','limpiarTodo','nuevoSorteo','procesarManual','importarRespaldo','recuperarGuardadoLocal']){
 const original=root[name];if(typeof original!=='function')continue;
 root[name]=function(...args){if(!root.PagosCompartidos.puedeEditar&&!client.estado().applying){alert('Este teléfono está en consulta. Toma el control para editar.');return false;}return original.apply(this,args);};
}
el('syncConnect').onclick=async()=>{
 if(connecting)return;connecting=true;el('syncConnect').disabled=true;
 try{if(client.estado().connected){await client.leer();return;}
 await supaCargar();if(!SLOT_APPROVED_SOURCE)throw Error('Verifica tu acceso y carga los aprobados actuales.');
 await client.conectar(SLOT_APPROVED_SOURCE);
 }catch(e){el('syncStatus').textContent='⚠️ '+e.message;}finally{connecting=false;bloquear(client.estado());}
};
el('syncClaim').onclick=async()=>{
 const s=client.estado();
 if(!s.latest?.hasState&&!confirm('¿Compartir los ganadores y premios que tienes abiertos en este teléfono? Revisa la fecha y los cartones antes de continuar.'))return;
 await client.tomar();
};
el('syncRelease').onclick=()=>client.liberar();
el('syncDisconnect').onclick=async()=>{if(confirm('¿Desconectar este teléfono? Los datos compartidos se conservan.'))await client.salir();};
document.addEventListener('pagos-local-guardado',()=>client.programar());
document.addEventListener('ronda-anuncio-generado',()=>{client.programar();bloquear(client.estado());});
window.addEventListener('offline',()=>client.leer());
window.addEventListener('online',()=>client.leer());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)client.leer();});
setInterval(()=>{if(!document.hidden)client.leer();},3000);
bloquear(client.estado());
})(typeof window!=='undefined'?window:globalThis);
