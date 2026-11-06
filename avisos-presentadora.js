/* Avisos de nuevas capturas: una conexión en tiempo real, sin importar rondas. */
(function(root){
'use strict';
function crear(ad){
 let activo=false,conexion=null,turno=0;
 function cerrar(){const anterior=conexion;conexion=null;if(anterior){anterior.vigente=false;if(anterior.canal)try{Promise.resolve(ad.cerrar(anterior.canal)).catch(()=>{});}catch{}}}
 async function consultar(c){
  if(!c.vigente||conexion!==c)return;
  if(c.ocupado){c.pendiente=true;return;}
  c.ocupado=true;
  try{
   do{
    c.pendiente=false;
    const data=await ad.consultar(c.contexto);
    if(!c.vigente||conexion!==c)return;
    if(!data?.pagos||String(data.source)!==c.contexto.source||data.jornada?.fecha!==c.contexto.fecha){
     ad.estado('⚠️ Revisa el acceso, la fecha y los aprobados para recibir avisos.');return;
    }
    ad.notificar(data,c.contexto.uid);
   }while(c.pendiente);
  }catch{if(c.vigente&&conexion===c)ad.estado('⚠️ No se pudieron comprobar los avisos. Pulsa «Activar avisos» para reintentar.');}
  finally{c.ocupado=false;}
 }
 async function actualizar(forzar=false){
  if(!activo)return;
  const t=++turno;
  let f;
  try{f=await ad.contexto();}catch{}
  if(t!==turno||!activo)return;
  if(!f?.uid||!f.fecha||!f.source){cerrar();ad.estado('Verifica tu acceso y carga los aprobados para activar los avisos.');return;}
  f={...f,source:String(f.source)};
  const clave=JSON.stringify([f.uid,f.fecha,f.source]);
  if(!forzar&&conexion?.clave===clave)return;
  cerrar();
  const c={contexto:f,clave,vigente:true,ocupado:false,pendiente:false,canal:null};conexion=c;
  ad.estado('Conectando avisos de la presentadora…');
  try{
   c.canal=ad.suscribir(f,payload=>{
    const e=payload?.new;
    if(c.vigente&&conexion===c&&e?.fecha===f.fecha&&String(e.source)===f.source)consultar(c);
   },estado=>{
    if(!c.vigente||conexion!==c)return;
    if(estado==='SUBSCRIBED'){ad.estado('🔔 Avisos conectados. Mantén Pagos abierto; las capturas se traen manualmente.');consultar(c);}
    else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(estado))ad.estado('⚠️ Avisos desconectados. Pulsa «Activar avisos» para reconectar.');
   });
  }catch{if(conexion===c){cerrar();ad.estado('⚠️ No se pudo conectar. Pulsa «Activar avisos» para reintentar.');}}
 }
 return{activar(){activo=true;return actualizar(true);},actualizar,pausar(){++turno;cerrar();},get activo(){return activo;}};
}
root.EnVivoAvisos={crear};if(typeof module==='object')module.exports=root.EnVivoAvisos;
})(typeof window==='object'?window:globalThis);
