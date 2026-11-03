(function(root){
'use strict';
const C=root.EnVivoComun;
function plan(e,{fecha,source,car,aprobados,editable=true}){const ns=C.numeros(e);if(!editable||e.fecha!==fecha||String(e.source)!==String(source||''))return{tipo:'bloqueado',motivo:'El envío no corresponde a la fecha y el sorteo cargados.'};const invalidos=ns.filter(n=>!aprobados(n));if(invalidos.length)return{tipo:'bloqueado',motivo:'Carga y revisa los aprobados: cartón(es) '+invalidos.join(', ')+'.'};let old=[];try{old=car.trim()?C.cartones(car):[];}catch{return{tipo:'conflicto',ns};}return{tipo:!old.length?'llenar':old.length===ns.length&&old.every(n=>ns.includes(n))?'igual':'conflicto',ns};}
root.EnVivoRecepcion={plan};if(typeof module==='object')module.exports=root.EnVivoRecepcion;if(typeof document==='undefined')return;
const $=id=>document.getElementById(id),BUCKET='ganadores-en-vivo';let ocupado=false,consultando=false,channel=null,channelKey='',aplicando=false,urls=[],audio=null,avisos=false,context=null,turno=0,avisoClave='',avisoMapa=null,avisoUltimaConsulta='';const intentados=new Set();
const status=t=>{$('envivoEstado').textContent=t;};

function ultimosVigentes(data){
 const cortes=data?.cortes||{};
 return C.ultimos(data?.envios||[]).filter(e=>{
  const corte=Number(cortes[String(e.ronda)]||0);
  return Number(e.revision)>corte;
 });
}
async function contextoVigente(fecha){
 const data=await rpc('en_vivo_contexto',{p_fecha:fecha});
 if(!data)return data;
 const corte=await rpc('en_vivo_cortes',{p_fecha:fecha});
 if(String(data.source||'')!==String(corte?.source||''))throw Error('El sorteo cambió mientras se consultaban las capturas. Actualiza.');
 const revisiones=corte?.revisiones;
 if(!revisiones||typeof revisiones!=='object'||Array.isArray(revisiones))throw Error('No se pudo verificar el reinicio de las capturas. No se cargarán envíos antiguos.');
 return {...data,cortes:revisiones};
}

function current(){return{fecha:C.fecha($('fechaSorteo').value),source:SLOT_APPROVED_SOURCE,editable:root.PagosCompartidos?.puedeEditar!==false,car:''};}
function parametros(){const f=current();return{p_fecha:f.fecha,p_rondas:Array.from({length:Number($('cant').value)},(_,i)=>$('nom'+(i+1)).value),p_email:$('envivoCorreo').value.trim()||null};}
async function rpc(name,args){const{data,error}=await supa.rpc(name,args);if(error)throw Error(error.message);return data;}
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
function liberar(){urls.forEach(u=>URL.revokeObjectURL(u));urls=[];}
function estadoPara(e){const i=$('car'+e.ronda);if(!i)return{tipo:'bloqueado',motivo:'La cantidad de rondas no coincide. Revisa la configuración.'};return plan(e,{...current(),car:i.value,aprobados:n=>estadoCarton(n)==='OK'});}

function avisosGuardados(fecha,source,uid){
 // Solo se guardan IDs y revisiones de las rondas, nunca imágenes, datos personales ni bancos.
 return 'andino-envivo-notificaciones-v2:'+uid+':'+fecha+':'+source;
}
function formatearAviso(es,prueba=false){
 const texto=es.map(e=>'Ronda '+e.ronda+' · cartón(es) '+C.numeros(e).join(', ')).join(' | ');
 return (prueba?'PRUEBA DE AVISOS · ':'📸 Nueva captura recibida · ')+texto;
}
function mostrarAlerta(texto){
 const banner=$('envivoAvisoNuevo');
 if(banner){banner.hidden=false;banner.textContent=texto;}
}
function ocultarAlerta(){
 const banner=$('envivoAvisoNuevo');
 if(banner){banner.hidden=true;banner.textContent='';}
}
function sonarAviso(){
 if(!avisos||!audio)return;
 try{
  if(audio.state==='suspended')audio.resume().catch(()=>{});
  const ahora=audio.currentTime;
  for(const [offset,frecuencia] of [[0,800],[.16,1040],[.32,860]]){
   const osc=audio.createOscillator(),gan=audio.createGain();
   osc.type='sine';osc.frequency.value=frecuencia;
   osc.connect(gan);gan.connect(audio.destination);
   gan.gain.setValueAtTime(.0001,ahora+offset);
   gan.gain.exponentialRampToValueAtTime(.11,ahora+offset+.02);
   gan.gain.exponentialRampToValueAtTime(.0001,ahora+offset+.13);
   osc.start(ahora+offset);osc.stop(ahora+offset+.14);
  }
 }catch{}
}
async function notificacionSistema(texto){
 if(!avisos||!root.Notification||root.Notification.permission!=='granted')return;
 try{
  const opciones={body:texto,tag:'bingo-andino-nuevo-ganador',renotify:true,icon:'./icon-192.png',data:{url:new URL('./',location.href).href}};
  if(navigator.serviceWorker?.ready){
   const registro=await navigator.serviceWorker.ready;
   if(registro?.showNotification){await registro.showNotification('🎙️ Bingo Andino 75',opciones);return;}
  }
  new Notification('🎙️ Bingo Andino 75',opciones);
 }catch(e){console.warn('No se pudo mostrar el aviso del sistema',e);}
}
function avisar(es,{prueba=false}={}){
 if(!es.length)return;
 const texto=formatearAviso(es,prueba);
 mostrarAlerta('🔔 '+texto);
 sonarAviso();
 if(avisos)notificacionSistema(texto);
}
function comprobarAvisos(es,data,uid){
 const fecha=String(data?.jornada?.fecha||$('fechaSorteo').value||'');
 const source=String(data?.source||'');
 if(!uid||!fecha||!source)return;
 const clave=avisosGuardados(fecha,source,uid);
 if(avisoClave!==clave){
  avisoClave=clave;avisoMapa=null;ocultarAlerta();
  try{const anterior=JSON.parse(localStorage.getItem(clave)||'null');
   if(anterior&&typeof anterior==='object'&&!Array.isArray(anterior))avisoMapa=anterior;
  }catch{}
 }
 const mapa={};
 for(const e of es)mapa[String(e.ronda)]={id:String(e.id),revision:Number(e.revision)};
 let nuevos=[];
 if(avisoMapa){
  nuevos=es.filter(e=>avisoMapa[String(e.ronda)]?.id!==String(e.id));
 }else{
  // Primer uso: no reproducir avisos de fechas antiguas, pero destacar los pendientes reales.
  nuevos=es.filter(e=>!e.aplicado);
 }
 avisoMapa=mapa;
 try{localStorage.setItem(clave,JSON.stringify(mapa));}catch{}
 if(nuevos.length)avisar(nuevos);
}

function actualizarRondas(data=context){
 const ultimos=ultimosVigentes(data);
 const cuantos=Number($('cant')?.value)||6;
 for(let i=1;i<=cuantos;i++){
  const card=$('car'+i)?.closest('#rondas > .card');
  if(!card)continue;
  const target=card.querySelector('.cp-cuerpo')||card;
  let host=card.querySelector('.cp-recepcion');
  if(!host){
   host=document.createElement('div');host.className='cp-recepcion';
   const btn=document.createElement('button');btn.type='button';btn.id='cp-recibir-'+i;
   const info=document.createElement('span');info.id='cp-recibo-estado-'+i;info.className='cp-recibo-estado';info.setAttribute('role','status');
   host.append(btn,info);
   const generar=[...target.children].find(x=>x.tagName==='BUTTON'&&x.getAttribute('onclick')==='genR('+i+')');
   target.insertBefore(host,generar||null);
   btn.addEventListener('click',async()=>{
    if(ocupado||aplicando){info.textContent='Hay una recepción en curso. Intenta nuevamente.';return;}
    info.textContent='Buscando los ganadores enviados de esta ronda…';
    try{
     const ahora=current(),nuevo=await contextoVigente(ahora.fecha);
     if(!nuevo?.pagos||String(nuevo.source)!==String(ahora.source))throw Error('Carga los aprobados del sorteo actual en Pagos.');
     const seleccionado=ultimosVigentes(nuevo).find(x=>x.ronda===i);
     if(!seleccionado){info.textContent='Esta ronda todavía no tiene capturas enviadas por la presentadora.';return;}
     if(seleccionado.fecha!==ahora.fecha)throw Error('La fecha recibida no coincide con la del sorteo.');
     await aplicar(seleccionado);
     const confirmado=await contextoVigente(ahora.fecha);
     const actualizado=ultimosVigentes(confirmado).find(x=>x.ronda===i);
     info.textContent=actualizado?.aplicado?'✓ Ganadores y capturas cargados en esta ronda. Revisa los pagos antes de transferir.':($('envivoEstado').textContent||'Esta ronda continúa pendiente de revisión.');
     actualizarRondas(confirmado);
    }catch(err){info.textContent='No se pudo cargar esta ronda: '+(err.message||'error de conexión.');}
   });
  }
  const actual=ultimos.find(x=>x.ronda===i),btn=$('cp-recibir-'+i),info=$('cp-recibo-estado-'+i),acc=$('cp-acordeon-'+i);
  if(acc)acc.dataset.recibidos=!actual?'':actual.aplicado?'✓ Cargada':'📥 Recibidos';
  root.PagosCompacto?.etiquetaRonda?.(i);
  if(!actual){
   btn.textContent='📥 Cargar ganadores enviados';
   info.textContent=data?.cortes?.[String(i)]?'Sin capturas nuevas desde el reinicio. Las anteriores quedaron archivadas.':'Sin capturas recibidas para esta ronda.';
  }else{
   let cantidad=0;try{cantidad=C.numeros(actual).length;}catch{}
   const estado=estadoPara(actual);
   if(estado.tipo==='conflicto'){
    btn.textContent='⚠️ Actualizar a los ganadores más recientes';
    info.textContent='⚠️ Los cartones de Pagos no coinciden con la revisión '+actual.revision+'. Comprueba los ganadores antes de transferir.';
    if(acc)acc.dataset.recibidos='⚠️ Revisar';
   }else{
    btn.textContent=actual.aplicado?'↻ Revisar capturas de esta ronda':'📥 Cargar '+(cantidad||'')+' ganador(es) recibido(s)';
    if(!info.textContent||info.textContent.startsWith('Sin capturas')||info.textContent.startsWith('⚠️'))info.textContent=actual.aplicado?'Recibido ✓':'Capturas disponibles · revisión '+actual.revision;
   }
  }
 }
}
root.EnVivoRecepcion.actualizarRondas=actualizarRondas;
function mostrar(data){
 liberar();$('envivoLista').replaceChildren();const es=ultimosVigentes(data);let pendientes=0;
 for(const e of es){if(!e.aplicado)pendientes++;const box=node('article',null,'ev-envio'),head=node('h3',(data.jornada?.rondas[e.ronda-1]||'Ronda '+e.ronda)+(e.aplicado?' · Recibido ✓':' · Nuevos ganadores')),nums=C.numeros(e),names=nums.map(n=>{const x=estadoCarton(n)==='OK'?buscar(n):null;return'Cartón '+n+(x?' · '+x.nombre:' · Falta revisar aprobados');}),p=node('p',names.join('\n'),'ev-nombres'),details=node('details'),summary=node('summary','Ver '+e.capturas.length+' captura(s) del resultado'),photos=node('div'),button=node('button',e.aplicado?'Recuperar capturas de esta ronda':'Revisar y completar ronda','gen'),hint=node('p','Revisión '+e.revision+' · '+new Date(e.creado_en).toLocaleTimeString('es-VE'),'small');details.append(summary,photos);let loaded=false;details.ontoggle=async()=>{if(!details.open||loaded)return;loaded=true;try{for(const c of e.capturas){const b=await descargar(c,e);if(!box.isConnected)return;const img=node('img');const u=URL.createObjectURL(b);urls.push(u);img.src=u;img.alt='Resultado · Cartón '+c.cartones.join(', ');photos.append(img);}}catch(err){photos.textContent=err.message;loaded=false;}};button.onclick=()=>aplicar(e);const st=estadoPara(e);if(st.tipo==='bloqueado')hint.textContent=st.motivo;else if(st.tipo==='conflicto')hint.textContent='Esta ronda ya tiene otros cartones. Se pedirá confirmación antes de reemplazarlos.';box.append(head,p,details,hint,button);$('envivoLista').append(box);
 }
 $('envivoTitulo').textContent=pendientes?'🔔 Ganadores del en vivo · '+pendientes+' por revisar':'🎙️ Ganadores del en vivo';if(!es.length)$('envivoLista').textContent='Aquí llegarán las capturas de la presentadora.';
 if(!document.hidden&&!/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||'')){const auto=es.find(e=>{
  if(e.aplicado||intentados.has(e.id)||!monto($('pre'+e.ronda)?.value))return false;
  // Capturas corregidas de los mismos cartones se sustituyen sin pasos adicionales.
  // Un cambio de ganadores requiere revisión explícita en Pagos antes de modificar pagos.
  return ['llenar','igual'].includes(estadoPara(e).tipo);
 });if(auto){intentados.add(auto.id);setTimeout(()=>aplicar(auto,{automatico:true}),0);}}
 if(data.jornada)status('Recepción conectada para '+data.jornada.fecha+'. Los avisos llegan con esta app abierta.');else status('Prepara las rondas para que la presentadora pueda enviar sus capturas.');
}
async function descargar(c,e){if(!C.ruta(c.ruta,e.creado_por,e.fecha))throw Error('La ruta de una captura no es válida.');const{data,error}=await supa.storage.from(BUCKET).download(c.ruta);if(error||!data||data.size>8388608||data.type!=='image/jpeg')throw Error('No se pudo descargar una captura. Revisa la conexión.');return data;}
async function refrescar(){
 if(ocupado||consultando||aplicando)return;consultando=true;const token=++turno;
 try{if(root.pagosRestauracionLista)await root.pagosRestauracionLista;const{data:a}=await supa.auth.getSession();if(!a?.session){liberar();$('envivoLista').replaceChildren();$('envivoLista').dataset.version='';if(channel)supa.removeChannel(channel);channel=null;channelKey='';status('Verifica tu acceso a Supabase para recibir ganadores.');return;}const f=current();let data=await contextoVigente(f.fecha);if(token!==turno||f.fecha!==current().fecha||f.source!==current().source)return;if(!data?.pagos){liberar();$('envivoLista').replaceChildren();$('envivoLista').dataset.version='';status('Se necesita el acceso autorizado de la app de pagos.');return;}
 let avisoConfiguracion='';
 if(f.editable&&f.source&&String(data.source)===String(f.source)){
  const nombres=Array.from({length:Number($('cant').value)},(_,i)=>String($('nom'+(i+1))?.value||'').trim());
  const coincide=data.jornada&&JSON.stringify(data.jornada.rondas)===JSON.stringify(nombres);
  if([5,6].includes(nombres.length)&&nombres.every(n=>n.length>0&&n.length<=80)&&!coincide){
   if((data.envios||[]).length){
    avisoConfiguracion='Hay ganadores recibidos: revisa las rondas antes de cambiar su configuración.';
   }else{
    try{
     // Solo publica las rondas. No autoriza correos ni cambia compras, cartones o pagos.
     await rpc('en_vivo_configurar',{p_fecha:f.fecha,p_rondas:nombres,p_email:null});
     data=await contextoVigente(f.fecha);
    }catch(e){avisoConfiguracion='No se pudieron enviar las rondas: '+e.message;}
   }
  }
 }else if(!f.source){avisoConfiguracion='Carga primero las compras aprobadas en Pagos para activar las rondas del en vivo.';}
 if(token!==turno||f.fecha!==current().fecha||f.source!==current().source)return;
 context=data;comprobarAvisos(ultimosVigentes(data),data,a.session.user.id);actualizarRondas(data);const serial=JSON.stringify([f.fecha,data.source,f.source,data.cortes,data.jornada,data.envios,(data.envios||[]).flatMap(e=>C.numeros(e).map(n=>[n,estadoCarton(n),estadoCarton(n)==='OK'?buscar(n)?.nombre:''])),Array.from({length:Number($('cant').value)},(_,i)=>$('car'+(i+1))?.value)]);if($('envivoLista').dataset.version!==serial){$('envivoLista').dataset.version=serial;mostrar(data);}if(avisoConfiguracion)status(avisoConfiguracion);const ck=a.session.user.id+':'+f.fecha;if(ck!==channelKey){if(channel)supa.removeChannel(channel);channelKey=ck;channel=supa.channel('ganadores-en-vivo:'+ck).on('postgres_changes',{event:'*',schema:'public',table:'en_vivo_envios',filter:'fecha=eq.'+f.fecha},()=>refrescar()).subscribe();}
 }catch(e){status('No se pudo actualizar la recepción: '+e.message);}finally{consultando=false;}
}
function firmaRonda(i){return JSON.stringify([$('fechaSorteo').value,SLOT_APPROVED_SOURCE,$('cant').value,$('car'+i)?.value,$('pre'+i)?.value,$('nom'+i)?.value]);}
async function aplicar(e,{automatico=false}={}){if(ocupado||aplicando)return;ocupado=true;const dlg=$('envivoProcesando');try{
 const st=estadoPara(e);if(st.tipo==='bloqueado')throw Error(st.motivo);if(automatico&&!['llenar','igual'].includes(st.tipo))return;const i=e.ronda;if(!monto($('pre'+i).value))throw Error('Coloca el premio de la ronda '+i+' antes de completar sus pagos.');
 if(!automatico&&!confirm((st.tipo==='conflicto'?'Esta ronda tiene otros cartones y será reemplazada.\n\n':'')+'¿Confirmas los cartones '+st.ns.join(', ')+' de '+$('nom'+i).value+'? Se prepararán sus pagos con el premio configurado.'))return;
 const before=firmaRonda(i),check=await contextoVigente(e.fecha),latest=ultimosVigentes(check).find(x=>x.ronda===i);if(automatico&&latest?.aplicado)return;if(!latest||latest.id!==e.id||check.source!==e.source)throw Error('Llegó otra versión o cambió el sorteo. Revisa el envío más reciente.');if(before!==firmaRonda(i))throw Error('La ronda cambió mientras revisabas. Vuelve a intentarlo.');
 dlg.showModal();const blobs=[];for(const c of e.capturas)blobs.push(await descargar(c,e));if(before!==firmaRonda(i))throw Error('Los datos cambiaron durante la descarga. Revisa otra vez.');
 const editar=async()=>{const st2=estadoPara(e);if(st2.tipo==='bloqueado')throw Error(st2.motivo);if(before!==firmaRonda(i))throw Error('La ronda cambió antes de completarla.');const car=$('car'+i),oldCar=car.value,oldMsg=$('msg'+i).innerText,oldPag=$('pag'+i).innerText,cont=$('pagosBtns'+i),oldNodes=[...cont.childNodes],restaurando=RESTAURANDO_ESTADO,regen=REGENERANDO_GUARDADO;aplicando=true;RESTAURANDO_ESTADO=true;REGENERANDO_GUARDADO=true;
 try{car.value=st2.ns.join(', ');if(!genR(i))throw Error('No se pudieron preparar los pagos.');for(let j=0;j<e.capturas.length;j++)for(const n of e.capturas[j].cartones)await root.ComprobantesPagos.recibirResultado({tipo:'pagosBtns'+i,carton:n,fecha:e.fecha,source:e.source,blob:blobs[j],reemplazar:true});}
 catch(err){car.value=oldCar;$('msg'+i).innerText=oldMsg;$('pag'+i).innerText=oldPag;cont.replaceChildren(...oldNodes);throw err;}
 finally{RESTAURANDO_ESTADO=restaurando;REGENERANDO_GUARDADO=regen;aplicando=false;}
 guardarEstadoAhora();};
 if(root.PagosCompartidos?.editar)await root.PagosCompartidos.editar(editar);else await editar();
 await rpc('en_vivo_aplicar',{p_id:e.id});if(!$('transmisionEnlace').value){$('transmisionEnlace').value=e.youtube;$('transmisionEnlace').dispatchEvent(new Event('input',{bubbles:true}));}
 status('✓ Última versión de la ronda cargada. Capturas anteriores reemplazadas; revisa los pagos antes de transferir.');document.dispatchEvent(new Event('ronda-anuncio-generado'));
 }catch(err){status(err.message);}finally{if(dlg.open)dlg.close();ocupado=false;await refrescar();}
}
$('envivoProcesando').addEventListener('cancel',e=>e.preventDefault());
$('envivoPreparar').onclick=async()=>{if(ocupado)return;ocupado=true;try{const p=parametros();const data=await rpc('en_vivo_configurar',p);status('Rondas preparadas para '+data.fecha+(p.p_email?' · Correo autorizado.':'.'));$('envivoEnlace').hidden=false;$('envivoEnlace').href=new URL('presentadora/?fecha='+data.fecha,location.href).href;}catch(e){status(e.message);}finally{ocupado=false;refrescar();}};
$('envivoRevocar').onclick=async()=>{if(ocupado||!$('envivoCorreo').value.trim()||!confirm('¿Retirar el acceso de este correo a la app del en vivo?'))return;ocupado=true;try{await rpc('en_vivo_configurar',{...parametros(),p_activo:false});status('Acceso retirado para este correo.');}catch(e){status(e.message);}finally{ocupado=false;}};
$('envivoCopiar').onclick=async()=>{try{const u=new URL('presentadora/?fecha='+current().fecha,location.href);await navigator.clipboard.writeText(u.href);status('Enlace de la presentadora copiado.');}catch{status('Abre el enlace de la presentadora y copia su dirección.');}};
$('envivoAvisos').onclick=async()=>{
 try{
  avisos=true;
  if(root.AudioContext||root.webkitAudioContext){
   audio=audio||new(root.AudioContext||root.webkitAudioContext)();await audio.resume();
  }
  let permiso='no disponible';
  if(root.Notification){
   permiso=Notification.permission;
   if(permiso==='default')permiso=await Notification.requestPermission();
  }
  $('envivoAvisos').textContent='🔔 Avisos activados';
  status(permiso==='granted'?'✓ Sonido y avisos del sistema habilitados con la app abierta. Pulsa Probar aviso.':
   '✓ Avisos visuales y sonido activados. Para avisos del sistema, permite las notificaciones en el navegador. Pulsa Probar aviso.');
 }catch{avisos=true;status('Los avisos visuales siguen activos, pero el navegador no permitió activar el sonido.');}
};
$('envivoProbarAviso').onclick=()=>{
 avisar([{ronda:1,capturas:[{cartones:[123]}]}],{prueba:true});
 status('Aviso de prueba mostrado. Comprueba el sonido y las notificaciones de tu dispositivo.');
};
$('envivoCerrarAviso').onclick=ocultarAlerta;
$('envivoActualizar').onclick=refrescar;$('fechaSorteo').addEventListener('change',()=>{avisoClave='';avisoMapa=null;ocultarAlerta();refrescar();});
let timerConfig=null;document.addEventListener('pagos-local-guardado',()=>{clearTimeout(timerConfig);timerConfig=setTimeout(refrescar,700);});
for(const ev of ['pagos-acceso-verificado','pagos-aprobados-cargados','ronda-anuncio-generado'])document.addEventListener(ev,refrescar);
document.addEventListener('pagos-sesion-cerrada',()=>{++turno;if(channel)supa.removeChannel(channel);channel=null;channelKey='';avisoClave='';avisoMapa=null;ocultarAlerta();liberar();$('envivoLista').replaceChildren();$('envivoLista').dataset.version='';status('Sesión cerrada.');});
root.addEventListener('online',refrescar);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refrescar();});setInterval(()=>{if(!document.hidden)refrescar();},7000);Promise.resolve().then(refrescar);
})(typeof window==='object'?window:globalThis);
