(function(root){
'use strict';
const C=root.EnVivoComun;
function plan(e,{fecha,source,car,aprobados,editable=true}){const ns=C.numeros(e);if(!editable||e.fecha!==fecha||String(e.source)!==String(source||''))return{tipo:'bloqueado',motivo:'El envío no corresponde a la fecha y el sorteo cargados.'};const invalidos=ns.filter(n=>!aprobados(n));if(invalidos.length)return{tipo:'bloqueado',motivo:'Carga y revisa los aprobados: cartón(es) '+invalidos.join(', ')+'.'};let old=[];try{old=car.trim()?C.cartones(car):[];}catch{return{tipo:'conflicto',ns};}return{tipo:!old.length?'llenar':old.length===ns.length&&old.every(n=>ns.includes(n))?'igual':'conflicto',ns};}
// Las capturas de una misma ronda se procesan independientemente: un fallo
// no impide guardar las de los demás cartones ni preparar sus pagos.
async function cargarCapturasIndependientes(capturas,obtener,incorporar){
 const correctos=[],faltantes=[];
 for(const c of capturas){
  let foto;
  try{foto=await obtener(c);}
  catch(err){
   for(const n of c.cartones)faltantes.push({carton:n,motivo:String(err?.message||'No se pudo descargar la imagen.')});
   continue;
  }
  for(const n of c.cartones){
   try{await incorporar(c,n,foto);correctos.push(n);}
   catch(err){faltantes.push({carton:n,motivo:String(err?.message||'No se pudo guardar la imagen.')});}
  }
 }
 return {correctos,faltantes};
}
function enlaceVigente(data,envios=[]){
 const jornada=data?.jornada;
 if(!jornada?.fecha||!data?.source||String(jornada.source)!==String(data.source))return null;
 const T=root.TransmisionYouTube;
 if(typeof T?.parse!=='function')return null;
 const opciones=[];
 const add=(raw,fecha,origen)=>{
  if(!raw)return;
  try{
   const url=T.parse(raw).url,parsed=Date.parse(fecha);
   opciones.push({url,origen,fecha:jornada.fecha,source:String(data.source),
    tiempo:Number.isFinite(parsed)?parsed:0});
  }catch{}
 };
 add(jornada.youtube,jornada.youtube_actualizado_en,'Enlace enviado por Presentadora');
 for(const e of envios||[]){
  if(e?.fecha!==jornada.fecha||String(e.source)!==String(data.source))continue;
  add(e.youtube,e.creado_en,'Enlace de ronda '+e.ronda);
 }
 opciones.sort((a,b)=>b.tiempo-a.tiempo);
 return opciones[0]||null;
}
async function prepararCapturas(capturas,descargar,concurrencia=3){
 const resultado=new Array(capturas.length);let cursor=0;
 async function worker(){while(cursor<capturas.length){const i=cursor++,c=capturas[i];try{resultado[i]={...c,blob:await descargar(c)};}catch(error){resultado[i]={...c,error};}}}
 await Promise.all(Array.from({length:Math.min(concurrencia,capturas.length)},worker));return resultado;
}
root.EnVivoRecepcion={plan,cargarCapturasIndependientes,enlaceVigente,prepararCapturas};if(typeof module==='object')module.exports=root.EnVivoRecepcion;if(typeof document==='undefined')return;
const $=id=>document.getElementById(id),BUCKET='ganadores-en-vivo';let ocupado=false,consultando=false,aplicando=false,urls=[],audio=null,avisos=root.Notification?.permission==='granted',context=null,turno=0,avisoClave='',avisoMapa=null;const pendientesImagenes=new Map();
const status=t=>{$('envivoEstado').textContent=t;};

function actualizarEnlaceRecibido(data){
 const info=$('transmisionRecibido'),btn=$('transmisionUsarRecibido');
 if(!info||!btn)return;
 let enlace=null;
 try{
  const f=current();
  if(data?.pagos&&f.source&&String(data.source)===String(f.source)&&data.jornada?.fecha===f.fecha)
   enlace=enlaceVigente(data,ultimosVigentes(data));
 }catch{}
 if(!enlace){
  info.hidden=true;info.textContent='';btn.hidden=true;btn.onclick=null;return;
 }
 info.hidden=false;
 info.textContent='📺 '+enlace.origen+': '+enlace.url+' · '+enlace.fecha+
  '. Aún no se ha enviado a los jugadores.';
 btn.hidden=false;btn.textContent='📥 Usar enlace de Presentadora';
 btn.onclick=()=>{
  const f=current();
  if(f.fecha!==enlace.fecha||String(f.source)!==enlace.source){
   info.textContent='⚠️ El sorteo cambió. Consulta de nuevo las capturas y el enlace.';
   btn.hidden=true;return;
  }
  if(root.PagosTransmision?.recibirDePresentadora(enlace.url)){
   info.textContent='✓ Enlace colocado en Pagos: '+enlace.url+
    '. Pulsa «Enviar transmisión a la página» para que lo vean los jugadores.';
   btn.textContent='✓ Enlace colocado · volver a usar';
  }else info.textContent='⚠️ No se pudo cargar el enlace. Comprueba el campo de YouTube.';
 };
}
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
 if(root.PagosPush?.activo||!avisos||!root.Notification||root.Notification.permission!=='granted')return;
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
// Push also informs the open Payments window without importing anything.
const avisosPushVistos=new Set();
navigator.serviceWorker?.addEventListener?.('message',event=>{
 const e=event.data?.aviso;
 if(event.data?.type!=='pagos-aviso'||!root.PagosPush?.activo||!e?.id||avisosPushVistos.has(e.id)||!['youtube','consolacion'].includes(e.type))return;
 let f;try{f=current();}catch{return;}
 if(e.fecha!==f.fecha||String(e.source)!==String(f.source))return;
 avisosPushVistos.add(e.id);if(avisosPushVistos.size>100)avisosPushVistos.delete(avisosPushVistos.values().next().value);
 mostrarAlerta(e.type==='youtube'?'▶️ Enlace de YouTube recibido. Pulsa «Traer enlace de Presentadora».':'🎰 Ganadores de consolación enviados. Pulsa «Traer ganadores».');
 sonarAviso();
});
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
     actualizarEnlaceRecibido(nuevo);
     const seleccionado=ultimosVigentes(nuevo).find(x=>x.ronda===i);
     if(!seleccionado){info.textContent='Esta ronda todavía no tiene capturas enviadas por la presentadora.';return;}
     if(seleccionado.fecha!==ahora.fecha)throw Error('La fecha recibida no coincide con la del sorteo.');
     const cargado=await aplicar(seleccionado);
     if(cargado)info.textContent='✓ Todas las capturas guardadas en Pagos. Verifica cada imagen antes de transferir.';
     else if(!pendientesImagenes.has(i))info.textContent=$('envivoEstado').textContent||'No se completó la recepción. Puedes seguir trabajando y reintentar.';
     actualizarRondas(context);
    }catch(err){info.textContent='No se pudo cargar esta ronda: '+(err.message||'error de conexión.');}
   });
  }
  const actual=ultimos.find(x=>x.ronda===i),btn=$('cp-recibir-'+i),info=$('cp-recibo-estado-'+i),acc=$('cp-acordeon-'+i);
  if(acc)acc.dataset.recibidos=!actual?'':actual.aplicado?'✓ Confirmada en servidor':'📥 Disponible';
  root.PagosCompacto?.etiquetaRonda?.(i);
  const parcial=pendientesImagenes.get(i);
  if(parcial&&parcial.envio!==actual?.id)pendientesImagenes.delete(i);
  if(!actual){
   btn.textContent='📥 Traer capturas de esta ronda';
   info.textContent=!data?'Pulsa «Traer capturas» para consultar esta ronda.':data?.cortes?.[String(i)]?'Sin capturas nuevas desde el reinicio. Las anteriores quedaron archivadas.':'No hay capturas nuevas en la última consulta. Pulsa para volver a buscar.';
  }else{
   let cantidad=0;try{cantidad=C.numeros(actual).length;}catch{}
   const estado=estadoPara(actual);
   if(estado.tipo==='conflicto'){
    btn.textContent='⚠️ Actualizar a los ganadores más recientes';
    info.textContent='⚠️ Los cartones de Pagos no coinciden con la revisión '+actual.revision+'. Comprueba los ganadores antes de transferir.';
    if(acc)acc.dataset.recibidos='⚠️ Revisar';
   }else{
    btn.textContent=actual.aplicado?'↻ Recuperar capturas de esta ronda':'📥 Traer '+(cantidad||'')+' captura(s) de esta ronda';
    if(!info.textContent||info.textContent.startsWith('Sin capturas')||info.textContent.startsWith('⚠️')||info.textContent.startsWith('Sin consultar'))info.textContent=actual.aplicado?'✓ Confirmada en servidor. Para verla en este equipo, pulsa Recuperar capturas.':'Capturas disponibles · revisión '+actual.revision;
   }
  }
  if(actual&&pendientesImagenes.has(i)){
   const aviso=pendientesImagenes.get(i);
   info.textContent=aviso.mensaje;
   btn.textContent='↻ Reintentar capturas de esta ronda';
   if(acc)acc.dataset.recibidos='⚠️ Fotos pendientes';
  }
 }
}
root.EnVivoRecepcion.actualizarRondas=actualizarRondas;
function mostrar(data){
 liberar();$('envivoLista').replaceChildren();const es=ultimosVigentes(data);let pendientes=0;
 for(const e of es){if(!e.aplicado)pendientes++;const box=node('article',null,'ev-envio'),head=node('h3',(data.jornada?.rondas[e.ronda-1]||'Ronda '+e.ronda)+(e.aplicado?' · Confirmado en servidor ✓':' · Nuevos ganadores')),nums=C.numeros(e),names=nums.map(n=>{const x=estadoCarton(n)==='OK'?buscar(n):null;return'Cartón '+n+(x?' · '+x.nombre:' · Falta revisar aprobados');}),p=node('p',names.join('\n'),'ev-nombres'),details=node('details'),summary=node('summary','Ver '+e.capturas.length+' captura(s) del resultado'),photos=node('div'),button=node('button',e.aplicado?'Recuperar capturas de esta ronda':'Revisar y completar ronda','gen'),hint=node('p','Revisión '+e.revision+' · '+new Date(e.creado_en).toLocaleTimeString('es-VE'),'small');details.append(summary,photos);let loaded=false;details.ontoggle=async()=>{if(!details.open||loaded)return;loaded=true;try{for(const c of e.capturas){const b=await descargar(c,e);if(!box.isConnected)return;const img=node('img');const u=URL.createObjectURL(b);urls.push(u);img.src=u;img.alt='Resultado · Cartón '+c.cartones.join(', ');photos.append(img);}}catch(err){photos.textContent=err.message;loaded=false;}};button.onclick=()=>aplicar(e);const st=estadoPara(e);if(st.tipo==='bloqueado')hint.textContent=st.motivo;else if(st.tipo==='conflicto')hint.textContent='Esta ronda ya tiene otros cartones. Se pedirá confirmación antes de reemplazarlos.';box.append(head,p,details,hint,button);$('envivoLista').append(box);
 }
 $('envivoTitulo').textContent=pendientes?'🔔 Ganadores del en vivo · '+pendientes+' por revisar':'🎙️ Ganadores del en vivo';if(!es.length)$('envivoLista').textContent='No hay capturas nuevas en esta consulta. Si la presentadora acaba de enviar, pulsa Buscar capturas enviadas.';
 // Traer capturas solo a petición de Pagos. No tocar premios o rondas al consultar.
 if(data.jornada)status('✓ Capturas consultadas para '+data.jornada.fecha+'. Abre la ronda y toca «Traer capturas» para incorporarlas. No hay consultas automáticas.');else status('Sin rondas preparadas. Usa «Preparar rondas» para habilitar a la presentadora.');
}
async function descargar(c,e){if(!C.ruta(c.ruta,e.creado_por,e.fecha))throw Error('La ruta de una captura no es válida.');const{data,error}=await supa.storage.from(BUCKET).download(c.ruta);if(error||!data||data.size>8388608||data.type!=='image/jpeg')throw Error('No se pudo descargar una captura. Revisa la conexión.');return data;}
async function refrescar(){
 if(ocupado||consultando||aplicando)return;consultando=true;const token=++turno;
 try{if(root.pagosRestauracionLista)await root.pagosRestauracionLista;const{data:a}=await supa.auth.getSession();if(!a?.session){limpiarVistaManual('Verifica tu acceso a Supabase antes de traer capturas.');return;}const f=current();let data=await contextoVigente(f.fecha);if(token!==turno||f.fecha!==current().fecha||f.source!==current().source)return;if(!data?.pagos){actualizarEnlaceRecibido(null);liberar();$('envivoLista').replaceChildren();$('envivoLista').dataset.version='';status('Se necesita el acceso autorizado de la app de pagos.');return;}
 let avisoConfiguracion='';
 if(!f.source||String(data.source)!==String(f.source)){
  avisoConfiguracion='Carga los compradores aprobados del sorteo actual antes de traer capturas.';
 }else if(!data.jornada){
  avisoConfiguracion='Todavía no están preparadas las rondas de la presentadora. Usa «Preparar rondas» una vez.';
 }else{
  const nombres=Array.from({length:Number($('cant').value)},(_,i)=>String($('nom'+(i+1))?.value||'').trim());
  if(JSON.stringify(data.jornada.rondas)!==JSON.stringify(nombres)){
   avisoConfiguracion='⚠️ Los nombres o la cantidad de rondas cambiaron. Comprueba la configuración antes de traer capturas.';
  }
 }
 if(token!==turno||f.fecha!==current().fecha||f.source!==current().source)return;
 context=data;actualizarEnlaceRecibido(data);comprobarAvisos(ultimosVigentes(data),data,a.session.user.id);actualizarRondas(data);const serial=JSON.stringify([f.fecha,data.source,f.source,data.cortes,data.jornada,data.envios,(data.envios||[]).flatMap(e=>C.numeros(e).map(n=>[n,estadoCarton(n),estadoCarton(n)==='OK'?buscar(n)?.nombre:''])),Array.from({length:Number($('cant').value)},(_,i)=>$('car'+(i+1))?.value)]);if($('envivoLista').dataset.version!==serial){$('envivoLista').dataset.version=serial;mostrar(data);}if(avisoConfiguracion)status(avisoConfiguracion);
 }catch(e){status('No se pudo actualizar la recepción: '+e.message);}finally{consultando=false;}
}
function firmaRonda(i){return JSON.stringify([$('fechaSorteo').value,SLOT_APPROVED_SOURCE,$('cant').value,$('car'+i)?.value,$('pre'+i)?.value,$('nom'+i)?.value]);}

async function aplicar(e,{automatico=false}={}){
 if(ocupado||aplicando)return false;
 ocupado=true;let completo=false;
 const dlg=$('envivoProcesando');
 try{
  const st=estadoPara(e);
  if(st.tipo==='bloqueado')throw Error(st.motivo);
  if(automatico&&!['llenar','igual'].includes(st.tipo))return false;
  const i=e.ronda;
  if(!monto($('pre'+i).value))throw Error('Coloca el premio de la ronda '+i+' antes de completar sus pagos.');
  if(!automatico&&!confirm((st.tipo==='conflicto'?'Esta ronda tiene otros cartones y será reemplazada.\\n\\n':'')+
    '¿Confirmas los cartones '+st.ns.join(', ')+' de '+$('nom'+i).value+'? Se prepararán sus pagos con el premio configurado.'))return false;
  const before=firmaRonda(i);
  const check=await contextoVigente(e.fecha),latest=ultimosVigentes(check).find(x=>x.ronda===i);
  if(automatico&&latest?.aplicado)return false;
  if(!latest||latest.id!==e.id||check.source!==e.source)throw Error('Llegó otra versión o cambió el sorteo. Revisa el envío más reciente.');
  if(before!==firmaRonda(i))throw Error('La ronda cambió mientras revisabas. Vuelve a intentarlo.');
  dlg.showModal();
  // Una descarga fallida se anota, pero no impide descargar las otras imágenes.
  const preparados=await prepararCapturas(e.capturas,c=>descargar(c,e));
  if(before!==firmaRonda(i))throw Error('Los datos cambiaron durante la descarga. Revisa otra vez.');
  let resultado={correctos:[],faltantes:[]};
  const editar=async()=>{
   const st2=estadoPara(e);
   if(st2.tipo==='bloqueado')throw Error(st2.motivo);
   if(before!==firmaRonda(i))throw Error('La ronda cambió antes de completarla.');
   const car=$('car'+i),oldCar=car.value,oldMsg=$('msg'+i).innerText,
    oldPag=$('pag'+i).innerText,cont=$('pagosBtns'+i),oldNodes=[...cont.childNodes],
    restaurando=RESTAURANDO_ESTADO,regen=REGENERANDO_GUARDADO;
   aplicando=true;RESTAURANDO_ESTADO=true;REGENERANDO_GUARDADO=true;
   try{
    // Preparar todos los ganadores de la ronda, incluso si falta alguna imagen.
    car.value=st2.ns.join(', ');
    if(!genR(i))throw Error('No se pudieron preparar los pagos de esta ronda.');
    resultado=await cargarCapturasIndependientes(
     preparados,
     async c=>{if(c.error)throw c.error;return c.blob;},
     async (c,n,blob)=>root.ComprobantesPagos.recibirResultado({
      tipo:'pagosBtns'+i,carton:n,fecha:e.fecha,source:e.source,blob,reemplazar:true
     })
    );
   }catch(err){
    // Solo revertir si hubo un error general al preparar la ronda; nunca
    // borrar otras imágenes porque haya fallado una captura individual.
    car.value=oldCar;$('msg'+i).innerText=oldMsg;$('pag'+i).innerText=oldPag;
    cont.replaceChildren(...oldNodes);throw err;
   }finally{
    RESTAURANDO_ESTADO=restaurando;REGENERANDO_GUARDADO=regen;aplicando=false;
   }
   guardarEstadoAhora();
  };
  if(root.PagosCompartidos?.editar)await root.PagosCompartidos.editar(editar);else await editar();
  document.dispatchEvent(new Event('ronda-anuncio-generado'));
  if(resultado.faltantes.length){
   const cartones=resultado.faltantes.map(x=>x.carton).join(', ');
   const mensaje='⚠️ Ronda '+i+': '+resultado.correctos.length+' de '+st.ns.length+
    ' imagen(es) guardadas. Faltan cartón(es) '+cartones+
    '. Los demás ganadores y pagos siguen disponibles. Reintenta cuando quieras.';
   pendientesImagenes.set(i,{envio:e.id,mensaje,cartones});
   status(mensaje);
   // La confirmación del servidor sigue pendiente para permitir recuperar lo faltante.
   // No se deshabilitan otras rondas ni el trabajo en Pagos.
   return false;
  }
  pendientesImagenes.delete(i);
  try{
   await rpc('en_vivo_aplicar',{p_id:e.id});
   if(context?.envios){const fila=context.envios.find(x=>x.id===e.id);if(fila)fila.aplicado=true;}
  }catch(err){
   status('⚠️ Las '+st.ns.length+' imágenes se guardaron en este equipo, pero el servidor no confirmó la recepción: '+
    (err.message||'Reintenta cuando quieras.')+'. Puedes continuar trabajando.');
   return false;
  }
  // El enlace se confirma aparte: no sobrescribir sin preguntar el campo de Pagos.
  status('✓ Ronda '+i+': '+resultado.correctos.length+' imagen(es) guardadas. Verifica cada cartón antes de transferir.');
  completo=true;
 }catch(err){
  status('⚠️ No se pudo completar la recepción: '+(err.message||'Error inesperado.')+'. Puedes continuar con las demás rondas.');
 }finally{
  if(dlg.open)dlg.close();
  ocupado=false;actualizarRondas(context);
 }
 return completo;
}
$('envivoProcesando').addEventListener('cancel',e=>e.preventDefault());
$('envivoPreparar').onclick=async()=>{if(ocupado)return;ocupado=true;try{const p=parametros();const data=await rpc('en_vivo_configurar',p);status('Rondas preparadas para '+data.fecha+(p.p_email?' · Correo autorizado.':'.'));$('envivoEnlace').hidden=false;$('envivoEnlace').href=new URL('presentadora/?fecha='+data.fecha,location.href).href;}catch(e){status(e.message);}finally{ocupado=false;refrescar();}};
$('envivoRevocar').onclick=async()=>{if(ocupado||!$('envivoCorreo').value.trim()||!confirm('¿Retirar el acceso de este correo a la app del en vivo?'))return;ocupado=true;try{await rpc('en_vivo_configurar',{...parametros(),p_activo:false});status('Acceso retirado para este correo.');}catch(e){status(e.message);}finally{ocupado=false;}};
$('envivoCopiar').onclick=async()=>{try{const u=new URL('presentadora/?fecha='+current().fecha,location.href);await navigator.clipboard.writeText(u.href);status('Enlace de la presentadora copiado.');}catch{status('Abre el enlace de la presentadora y copia su dirección.');}};
const avisosAutomaticos=root.EnVivoAvisos?.crear({
 contexto:async()=>{const {data,error}=await supa.auth.getSession();if(error||!data?.session)return null;const f=current();return {...f,uid:data.session.user.id};},
 consultar:f=>contextoVigente(f.fecha),
 suscribir:(f,nuevo,estado)=>supa.channel('avisos-presentadora:'+f.uid+':'+f.fecha+':'+f.source)
  .on('postgres_changes',{event:'INSERT',schema:'public',table:'en_vivo_envios',filter:'source=eq.'+f.source},nuevo).subscribe(estado),
 cerrar:canal=>supa.removeChannel(canal),
 notificar:(data,uid)=>{actualizarEnlaceRecibido(data);comprobarAvisos(ultimosVigentes(data),data,uid);},
 estado:texto=>{const n=$('envivoAvisosEstado');if(n)n.textContent=texto;}
})||null;
$('envivoAvisos').onclick=async()=>{
 if(!avisosAutomaticos){status('No se cargó el sistema de avisos. Actualiza la aplicación; puedes seguir trayendo capturas manualmente.');return;}
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
  $('envivoAvisos').textContent='🔔 Activar avisos / reconectar';
  await avisosAutomaticos.activar();
  if(permiso==='granted'&&root.PagosPush){
   try{if(!await root.PagosPush.activar(supa))throw Error('El dispositivo no quedó registrado.');status('✅ Avisos push activados en este dispositivo. Puedes usar otras aplicaciones. Pulsa «Probar notificación» para comprobarlo.');}
   catch(e){status('Avisos con Pagos abierto activos. No se activó el aviso con la app cerrada: '+e.message);}
  }else status('Avisos con Pagos abierto activos. Permite las notificaciones para recibir avisos con la app cerrada.');
 }catch{avisos=true;await avisosAutomaticos.activar();status('Avisos en pantalla activados. El navegador no permitió activar el sonido o las notificaciones.');}
};
$('envivoProbarAviso').onclick=async()=>{
 if(root.PagosPush?.activo){try{await root.PagosPush.probar(supa);status('Prueba enviada desde el servidor a este dispositivo. Puedes dejar Pagos en segundo plano.');}catch(e){status('No se pudo enviar la prueba: '+e.message);}return;}
 avisar([{ronda:1,capturas:[{cartones:[123]}]}],{prueba:true});
 status('Prueba de sonido y alerta visual. Ninguna captura se ha descargado ni se ha registrado un ganador.');
};
$('envivoCerrarAviso').onclick=ocultarAlerta;
function limpiarVistaManual(mensaje){
 ++turno;
 pendientesImagenes.clear();
 context=null;avisoClave='';avisoMapa=null;actualizarEnlaceRecibido(null);
 ocultarAlerta();liberar();
 $('envivoLista').replaceChildren();$('envivoLista').dataset.version='';
 actualizarRondas(null);
 status(mensaje);
}
$('envivoActualizar').onclick=refrescar;
$('fechaSorteo').addEventListener('change',()=>{limpiarVistaManual('Fecha cambiada. Pulsa «Buscar capturas enviadas» cuando quieras consultar.');avisosAutomaticos?.actualizar();});
document.addEventListener('pagos-local-guardado',()=>actualizarRondas(context));
document.addEventListener('pagos-aprobados-cargados',()=>{limpiarVistaManual('Aprobados cargados. Pulsa «Buscar capturas enviadas» cuando la presentadora haya enviado resultados.');avisosAutomaticos?.actualizar();root.PagosPush?.restaurar(supa);});
document.addEventListener('pagos-sesion-cerrada',()=>{avisosAutomaticos?.pausar();root.PagosPush?.desactivar(supa);limpiarVistaManual('Sesión cerrada. Verifica tu acceso antes de traer capturas.');});
document.addEventListener('pagos-acceso-verificado',()=>{avisosAutomaticos?.actualizar();root.PagosPush?.restaurar(supa);});
root.addEventListener('online',()=>avisosAutomaticos?.actualizar(true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)avisosAutomaticos?.actualizar(true);});
actualizarRondas(null);
status('Pulsa «Activar avisos» para recibir alertas de nuevas capturas. Para incorporarlas, usa «Traer capturas» en cada ronda.');
})(typeof window==='object'?window:globalThis);
