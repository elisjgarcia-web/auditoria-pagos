(function(root){
'use strict';
const C=root.EnVivoComun;
function plan(e,{fecha,source,car,aprobados,editable=true}){const ns=C.numeros(e);if(!editable||e.fecha!==fecha||String(e.source)!==String(source||''))return{tipo:'bloqueado',motivo:'El envío no corresponde a la fecha y el sorteo cargados.'};const invalidos=ns.filter(n=>!aprobados(n));if(invalidos.length)return{tipo:'bloqueado',motivo:'Carga y revisa los aprobados: cartón(es) '+invalidos.join(', ')+'.'};let old=[];try{old=car.trim()?C.cartones(car):[];}catch{return{tipo:'conflicto',ns};}return{tipo:!old.length?'llenar':old.length===ns.length&&old.every(n=>ns.includes(n))?'igual':'conflicto',ns};}
root.EnVivoRecepcion={plan};if(typeof module==='object')module.exports=root.EnVivoRecepcion;if(typeof document==='undefined')return;
const $=id=>document.getElementById(id),BUCKET='ganadores-en-vivo';let ocupado=false,consultando=false,channel=null,channelKey='',seen=new Set(),primera=true,aplicando=false,urls=[],audio=null,avisos=false,context=null,turno=0;const intentados=new Set();
const status=t=>{$('envivoEstado').textContent=t;};
function current(){return{fecha:C.fecha($('fechaSorteo').value),source:SLOT_APPROVED_SOURCE,editable:root.PagosCompartidos?.puedeEditar!==false,car:''};}
function parametros(){const f=current();return{p_fecha:f.fecha,p_rondas:Array.from({length:Number($('cant').value)},(_,i)=>$('nom'+(i+1)).value),p_email:$('envivoCorreo').value.trim()||null};}
async function rpc(name,args){const{data,error}=await supa.rpc(name,args);if(error)throw Error(error.message);return data;}
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
function liberar(){urls.forEach(u=>URL.revokeObjectURL(u));urls=[];}
function estadoPara(e){const i=$('car'+e.ronda);if(!i)return{tipo:'bloqueado',motivo:'La cantidad de rondas no coincide. Revisa la configuración.'};return plan(e,{...current(),car:i.value,aprobados:n=>estadoCarton(n)==='OK'});}
function avisar(es){if(!es.length)return;$('envivoTitulo').textContent='🔔 '+es.length+' ronda(s) con ganadores recibidos';if(avisos){try{if(audio){const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);g.gain.value=.07;o.frequency.value=660;o.start();o.stop(audio.currentTime+.18);}if(document.hidden&&root.Notification?.permission==='granted')new Notification('Bingo Andino 75',{body:'Nuevos ganadores recibidos del en vivo.',tag:'andino-ganadores'});}catch{}}}
function actualizarRondas(data=context){
 const ultimos=C.ultimos(data?.envios||[]);
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
     const ahora=current(),nuevo=await rpc('en_vivo_contexto',{p_fecha:ahora.fecha});
     if(!nuevo?.pagos||String(nuevo.source)!==String(ahora.source))throw Error('Carga los aprobados del sorteo actual en Pagos.');
     const seleccionado=C.ultimos(nuevo.envios||[]).find(x=>x.ronda===i);
     if(!seleccionado){info.textContent='Esta ronda todavía no tiene capturas enviadas por la presentadora.';return;}
     if(seleccionado.fecha!==ahora.fecha)throw Error('La fecha recibida no coincide con la del sorteo.');
     await aplicar(seleccionado);
     const confirmado=await rpc('en_vivo_contexto',{p_fecha:ahora.fecha});
     const actualizado=C.ultimos(confirmado?.envios||[]).find(x=>x.ronda===i);
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
   if(!info.textContent||info.textContent.startsWith('✓'))info.textContent='Sin capturas recibidas para esta ronda.';
  }else{
   let cantidad=0;try{cantidad=C.numeros(actual).length;}catch{}
   btn.textContent=actual.aplicado?'↻ Revisar capturas de esta ronda':'📥 Cargar '+(cantidad||'')+' ganador(es) recibido(s)';
   if(!info.textContent||info.textContent.startsWith('Sin capturas'))info.textContent=actual.aplicado?'Recibido ✓':'Capturas disponibles · revisión '+actual.revision;
  }
 }
}
root.EnVivoRecepcion.actualizarRondas=actualizarRondas;
function mostrar(data){
 liberar();$('envivoLista').replaceChildren();const es=C.ultimos(data.envios||[]);const nuevos=es.filter(e=>!e.aplicado&&!seen.has(e.id));es.forEach(e=>seen.add(e.id));if(!primera)avisar(nuevos);else{primera=false;if(nuevos.length)avisar(nuevos);}let pendientes=0;
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
 try{if(root.pagosRestauracionLista)await root.pagosRestauracionLista;const{data:a}=await supa.auth.getSession();if(!a?.session){liberar();$('envivoLista').replaceChildren();$('envivoLista').dataset.version='';if(channel)supa.removeChannel(channel);channel=null;channelKey='';status('Verifica tu acceso a Supabase para recibir ganadores.');return;}const f=current();let data=await rpc('en_vivo_contexto',{p_fecha:f.fecha});if(token!==turno||f.fecha!==current().fecha||f.source!==current().source)return;if(!data?.pagos){liberar();$('envivoLista').replaceChildren();$('envivoLista').dataset.version='';status('Se necesita el acceso autorizado de la app de pagos.');return;}
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
     data=await rpc('en_vivo_contexto',{p_fecha:f.fecha});
    }catch(e){avisoConfiguracion='No se pudieron enviar las rondas: '+e.message;}
   }
  }
 }else if(!f.source){avisoConfiguracion='Carga primero las compras aprobadas en Pagos para activar las rondas del en vivo.';}
 if(token!==turno||f.fecha!==current().fecha||f.source!==current().source)return;
 context=data;actualizarRondas(data);const serial=JSON.stringify([f.fecha,data.source,f.source,data.jornada,data.envios,(data.envios||[]).flatMap(e=>C.numeros(e).map(n=>[n,estadoCarton(n),estadoCarton(n)==='OK'?buscar(n)?.nombre:''])),Array.from({length:Number($('cant').value)},(_,i)=>$('car'+(i+1))?.value)]);if($('envivoLista').dataset.version!==serial){$('envivoLista').dataset.version=serial;mostrar(data);}if(avisoConfiguracion)status(avisoConfiguracion);const ck=a.session.user.id+':'+f.fecha;if(ck!==channelKey){if(channel)supa.removeChannel(channel);channelKey=ck;channel=supa.channel('ganadores-en-vivo:'+ck).on('postgres_changes',{event:'*',schema:'public',table:'en_vivo_envios',filter:'fecha=eq.'+f.fecha},()=>refrescar()).subscribe();}
 }catch(e){status('No se pudo actualizar la recepción: '+e.message);}finally{consultando=false;}
}
function firmaRonda(i){return JSON.stringify([$('fechaSorteo').value,SLOT_APPROVED_SOURCE,$('cant').value,$('car'+i)?.value,$('pre'+i)?.value,$('nom'+i)?.value]);}
async function aplicar(e,{automatico=false}={}){if(ocupado||aplicando)return;ocupado=true;const dlg=$('envivoProcesando');try{
 const st=estadoPara(e);if(st.tipo==='bloqueado')throw Error(st.motivo);if(automatico&&!['llenar','igual'].includes(st.tipo))return;const i=e.ronda;if(!monto($('pre'+i).value))throw Error('Coloca el premio de la ronda '+i+' antes de completar sus pagos.');
 if(!automatico&&!confirm((st.tipo==='conflicto'?'Esta ronda tiene otros cartones y será reemplazada.\n\n':'')+'¿Confirmas los cartones '+st.ns.join(', ')+' de '+$('nom'+i).value+'? Se prepararán sus pagos con el premio configurado.'))return;
 const before=firmaRonda(i),check=await rpc('en_vivo_contexto',{p_fecha:e.fecha}),latest=check?.envios?.find(x=>x.ronda===i);if(automatico&&latest?.aplicado)return;if(!latest||latest.id!==e.id||check.source!==e.source)throw Error('Llegó otra versión o cambió el sorteo. Revisa el envío más reciente.');if(before!==firmaRonda(i))throw Error('La ronda cambió mientras revisabas. Vuelve a intentarlo.');
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
$('envivoAvisos').onclick=async()=>{try{avisos=true;if(root.AudioContext||root.webkitAudioContext){audio=audio||new(root.AudioContext||root.webkitAudioContext)();await audio.resume();}if(root.Notification&&Notification.permission==='default')await Notification.requestPermission();status('Avisos activados mientras esta app permanezca abierta.');}catch{status('Los avisos visuales siguen activos; el navegador no permitió sonido o notificaciones.');}};
$('envivoActualizar').onclick=refrescar;$('fechaSorteo').addEventListener('change',()=>{primera=true;seen.clear();refrescar();});
let timerConfig=null;document.addEventListener('pagos-local-guardado',()=>{clearTimeout(timerConfig);timerConfig=setTimeout(refrescar,700);});
for(const ev of ['pagos-acceso-verificado','pagos-aprobados-cargados','ronda-anuncio-generado'])document.addEventListener(ev,refrescar);
document.addEventListener('pagos-sesion-cerrada',()=>{++turno;if(channel)supa.removeChannel(channel);channel=null;channelKey='';seen.clear();liberar();$('envivoLista').replaceChildren();$('envivoLista').dataset.version='';status('Sesión cerrada.');});
root.addEventListener('online',refrescar);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refrescar();});setInterval(refrescar,15000);Promise.resolve().then(refrescar);
})(typeof window==='object'?window:globalThis);
