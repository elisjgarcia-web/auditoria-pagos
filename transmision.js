(function(){
 'use strict';
 const el=id=>document.getElementById(id),T=window.TransmisionYouTube;
 let revision=null,busy=false,dirty=false;
 const field=el('transmisionEnlace'),send=el('transmisionEnviar'),remove=el('transmisionQuitar'),refresh=el('transmisionConsultar');
 function status(text){el('transmisionEstado').textContent=text;}
 function buttons(){send.disabled=busy||revision===null;remove.disabled=busy||revision===null;refresh.disabled=busy;field.disabled=busy;}
 function show(data,replace){
  T.row(data);revision=data.revision;
  const url=T.validId(data.video_id)?'https://www.youtube.com/watch?v='+data.video_id:'';
  if(replace&&!dirty)field.value=url;
  el('transmisionActual').textContent=T.active(data)?'Enlace enviado: '+url+' · Disponible hasta '+new Date(data.expira_en).toLocaleString('es-VE',{timeZone:'America/Caracas'}):'Sin transmisión activa en la página.';
 }
 async function read(){
  const {data,error}=await supa.from('transmision_juego').select('video_id,revision,expira_en').eq('id',1).single();
  if(error)throw Error('No se pudo consultar la transmisión. Revisa tu conexión y vuelve a consultar.');
  show(data,true);return data;
 }
 refresh.onclick=async()=>{
  if(busy)return;busy=true;buttons();status('Consultando…');
  try{await read();status('Estado actualizado.')}catch(e){status(e.message)}finally{busy=false;buttons()}
 };
 async function write(id){
  if(busy||revision===null)return;
  busy=true;buttons();status('Enviando…');
  try{
   const {data:auth,error:authError}=await supa.auth.getSession();
   if(authError||!auth?.session)throw Error('Primero verifica tu acceso con el correo autorizado.');
   const {data,error}=await supa.rpc('guardar_transmision_juego_v1',{p_video_id:id,p_revision:revision});
   if(error){revision=null;throw Error('No se confirmó el cambio. Pulsa Consultar estado antes de volver a enviar. Puede faltar autorización, conexión o haber cambiado el enlace desde otro equipo.');}
   show(data,false);if(data.video_id!==id)throw Error('Respuesta inesperada. Consulta el estado antes de volver a enviar.');
   dirty=false;field.value=id?'https://www.youtube.com/watch?v='+id:'';
   status(id?'Transmisión enviada a Jugar con tus cartones. Se actualizará en los dispositivos en aproximadamente un minuto.':'Transmisión quitada. Los cartones y sus marcas se conservan.');
  }catch(e){revision=null;status(e.message)}finally{busy=false;buttons()}
 }
 send.onclick=()=>{try{const {id}=T.parse(field.value);return write(id)}catch(e){status(e.message);field.focus()}};
 remove.onclick=()=>{if(!busy&&revision!==null&&window.confirm('¿Quitar la transmisión de Jugar con tus cartones para todos?'))return write(null)};
 field.addEventListener('input',()=>dirty=true);
 buttons();refresh.click();
})();
