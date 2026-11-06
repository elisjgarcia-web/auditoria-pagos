(function(root){
'use strict';
let activo=false,subscription=null,flight=null,generacion=0;
function clave64(s){const bytes=atob(s.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(bytes,c=>c.charCodeAt(0));}
async function rpc(client,name,args){const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message||'No se pudo activar el aviso push');return data;}
async function conectar(client,crear){
 const epoca=generacion;
 if(!root.isSecureContext||!navigator.serviceWorker||!root.PushManager)throw Error('Este navegador no admite avisos con la app cerrada. Usa la app instalada o Chrome actualizado.');
 if(root.Notification?.permission!=='granted')throw Error('Permite las notificaciones del navegador para activar avisos con la app cerrada.');
 const {data,error}=await client.auth.getSession();if(error||!data?.session)throw Error('Verifica tu acceso a Pagos.');
 const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
 await navigator.serviceWorker.ready;
 let sub=await registration.pushManager.getSubscription();
 if(!sub&&!crear){activo=false;return false;}
 const config=await rpc(client,'pagos_push_clave',{});
 if(!config?.publicKey)throw Error('El servidor de avisos todavía no está listo.');
 const key=clave64(config.publicKey);
 if(sub?.options?.applicationServerKey){const old=new Uint8Array(sub.options.applicationServerKey);if(old.length!==key.length||old.some((v,i)=>v!==key[i])){if(!crear){activo=false;return false;}await sub.unsubscribe();sub=null;}}
 if(!sub)sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 if(epoca!==generacion){await sub.unsubscribe().catch(()=>{});return false;}
 await rpc(client,'pagos_push_guardar',{p_suscripcion:sub.toJSON()});
 if(epoca!==generacion){await sub.unsubscribe().catch(()=>{});return false;}
 subscription=sub;activo=true;return true;
}
function activar(client){if(!flight)flight=conectar(client,true).finally(()=>flight=null);return flight;}
async function restaurar(client){if(flight)return flight;try{await conectar(client,false);}catch{activo=false;}return activo;}
async function desactivar(client){
 generacion++;activo=false;let sub=subscription;subscription=null;
 try{if(!sub&&navigator.serviceWorker?.getRegistration){const r=await navigator.serviceWorker.getRegistration('./');sub=await r?.pushManager.getSubscription();}
  if(sub)await rpc(client,'pagos_push_desactivar',{p_endpoint:sub.endpoint});
 }catch{}finally{if(sub)await sub.unsubscribe().catch(()=>{});}
}
async function probar(client){if(!activo||!subscription)throw Error('Activa primero las notificaciones.');return rpc(client,'pagos_push_probar',{p_endpoint:subscription.endpoint});}
root.PagosPush={activar,restaurar,desactivar,probar,get activo(){return activo;}};
})(typeof window==='object'?window:globalThis);
