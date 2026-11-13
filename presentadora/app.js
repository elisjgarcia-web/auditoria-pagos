(function(){
'use strict';
const C=window.EnVivoComun,$=id=>document.getElementById(id),client=window.supabase.createClient('https://dbkixcpwirjwjvjintkr.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRia2l4Y3B3aXJqd2p2amludGtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwNjYxNDksImV4cCI6MjA2MTY0MjE0OX0.QJmWLWSe-pRYwxWeel8df7JLhNUvMKaTpL0MCDorgho'),BUCKET='ganadores-en-vivo';
let user=null,config=null,rows=[],selected=0,draft=null,busy=false,exportando=false,cargandoFecha=false,fechaPendiente=false,turno=0,revisionReinicioLocal=0,urls=[],worker=null,ocrScript=null,activeCard=null,autoFecha=false,esperandoNuevoSorteo=false,ocrQueue=Promise.resolve(),visorCaptura=null;
function resumen(){
 const estado=$('resumenTrabajo');if(!estado)return;
 if(!draft){estado.textContent='Selecciona una ronda';return;}
 const total=draft.cards.length,capturas=draft.cards.filter(c=>!!c.blob).length;
 let numeros=0,errores=0;const vistos=new Set();
 for(const card of draft.cards){
  try{const ns=C.cartones(card.numeros);if(!card.blob||!ns.length)errores++;else for(const n of ns){if(vistos.has(n))errores++;vistos.add(n);numeros++;}}
  catch{errores++;}
 }
 estado.textContent=draft.sent?'✓ Enviado a Pagos · '+numeros+' cartón(es)':capturas+'/'+total+' captura(s) · '+numeros+' cartón(es)'+(errores?' · '+errores+' por revisar':' · listo para enviar');
 estado.dataset.estado=draft.sent?'enviado':errores?'incompleto':'listo';
}
function abrirVisor(blob,titulo){
 if(!blob)return;
 if(!visorCaptura){
  const dialog=node('dialog',null,'visor-captura'),barra=node('div',null,'visor-barra'),heading=node('strong'),cerrar=node('button','✕ Cerrar'),imagen=node('img');
  cerrar.type='button';cerrar.onclick=()=>dialog.close();barra.append(heading,cerrar);dialog.append(barra,imagen);
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>{if(dialog.dataset.url){URL.revokeObjectURL(dialog.dataset.url);delete dialog.dataset.url;}imagen.removeAttribute('src');});
  document.body.append(dialog);visorCaptura={dialog,heading,imagen};
 }
 if(visorCaptura.dialog.dataset.url){URL.revokeObjectURL(visorCaptura.dialog.dataset.url);delete visorCaptura.dialog.dataset.url;}
 const url=URL.createObjectURL(blob);
 visorCaptura.dialog.dataset.url=url;
 visorCaptura.heading.textContent=titulo;
 visorCaptura.imagen.src=url;
 visorCaptura.imagen.alt=titulo;
 visorCaptura.dialog.showModal();
}
function hoyCaracas(){
 const partes=new Intl.DateTimeFormat('en-US',{timeZone:'America/Caracas',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const datos={};for(const p of partes)if(p.type!=='literal')datos[p.type]=p.value;
 return datos.year+'-'+datos.month+'-'+datos.day;
}
function fechaSegura(raw){
 const valor=String(raw||'').trim();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(valor))throw Error('Completa la fecha con día, mes y año de cuatro dígitos. Usa el botón 📅 Hoy si es el sorteo actual.');
 const anio=Number(valor.slice(0,4));
 if(anio<2025||anio>2100)throw Error('El año del sorteo debe estar entre 2025 y 2100. Usa 📅 Hoy.');
 return C.fecha(valor);
}
function informarFecha(){
 const ayuda=$('fechaAyuda');
 if(ayuda)ayuda.textContent=$('fecha').value?'Fecha: '+$('fecha').value.split('-').reverse().join('/')+' · seleccionada para esta jornada.':'Pulsa 📅 Hoy para seleccionar el sorteo actual.';
}
const notice=t=>{$('estado').textContent=t;},status=t=>{
 $('envioEstado').textContent=t;
 let bottom=$('resultadoEnvio');
 if(!bottom){bottom=document.createElement('p');bottom.id='resultadoEnvio';bottom.setAttribute('role','status');bottom.setAttribute('aria-live','polite');bottom.style.cssText='font-size:14px;font-weight:650;line-height:1.5;color:#43194e;white-space:pre-wrap';$('enviar').insertAdjacentElement('afterend',bottom);}
 bottom.textContent=t;
};
function controls(){document.querySelectorAll('button,input,select').forEach(n=>{n.disabled=busy&&!(cargandoFecha&&(n.id==='fecha'||n.id==='fechaHoy'));});$('descargarCapturas').disabled=busy||exportando||!config||!user;$('enviar').disabled=busy||!draft||draft.sent||draft.cards.some(c=>preparando.has(c));$('agregar').disabled=busy||!draft||draft.sent;if($('proximaRonda'))$('proximaRonda').disabled=busy;if($('youtubeEnviar'))$('youtubeEnviar').disabled=busy||!user||!config||esperandoNuevoSorteo||!!draft?.uncertain;if($('guardarRondas'))$('guardarRondas').disabled=busy||!user||!config||esperandoNuevoSorteo||!!draft?.uncertain;if($('cantidadRondas'))$('cantidadRondas').disabled=busy||!user||!config||esperandoNuevoSorteo||!!draft?.uncertain;if(draft?.sent||draft?.uncertain)document.querySelectorAll('#capturas button,#capturas input').forEach(n=>n.disabled=true);if(draft?.uncertain){$('youtube').disabled=$('fecha').disabled=$('agregar').disabled=true;document.querySelectorAll('#rondas button').forEach(n=>n.disabled=true);$('enviar').textContent='Reintentar envío';}else if(!draft||draft.sent)$('enviar').textContent='Enviar a pagos';}
function claveEpocaLocal(fecha,source){return 'envivo-epoca-borrador-v1:'+user.id+':'+fecha+':'+source;}
function key(ronda=selected){
 const partes=[user.id,config.fecha,config.source,ronda];
 // Antes del primer reinicio conserva las claves antiguas y no pierde borradores
 // actuales. Tras un reinicio, cada jornada lógica usa un espacio separado.
 if(config.maestroId)partes.push(String(config.maestroId));
 const epoca=localStorage.getItem(claveEpocaLocal(config.fecha,config.source));
 if(epoca)partes.push(epoca);
 return partes.join(':');
}
async function save(){if(draft)await C.local(key(),draft);}
function release(){urls.forEach(u=>URL.revokeObjectURL(u));urls=[];}
// Los envíos entregados son registros de Pagos: archivarlos SOLO en la vista local.
function claveCierre(fecha,source){return 'envivo-reinicio-v1:'+user.id+':'+fecha+':'+source;}
function versionesCerradas(fecha,source){
 try{const m=JSON.parse(localStorage.getItem(claveCierre(fecha,source))||'{}');
  return m&&typeof m==='object'&&!Array.isArray(m)?m:{};}catch{return {};}
}
function capturaAnterior(row){
 if(!row||!config||!user)return false;
 const guardada=Number(versionesCerradas(config.fecha,config.source)[row.ronda]||0);
 const servidor=Number(config.cortes?.[String(row.ronda)]||0);
 const n=Math.max(guardada,servidor);
 return Number.isInteger(n)&&n>=Number(row.revision)&&n>0;
}
function registrarCierre(fecha,source,envios){
 if(!source)return null;
 const k=claveCierre(fecha,source),anterior=localStorage.getItem(k);
 const m=versionesCerradas(fecha,source);
 for(const e of envios||[]){
  const n=Number(e?.revision),r=Number(e?.ronda);
  if(Number.isInteger(r)&&r>=1&&r<=6&&Number.isInteger(n)&&n>0)m[r]=Math.max(Number(m[r])||0,n);
 }
 localStorage.setItem(k,JSON.stringify(m));
 if(localStorage.getItem(k)!==JSON.stringify(m))throw Error('No se pudo registrar el reinicio.');
 return {key:k,previous:anterior};
}
async function rpc(name,args){const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message);return data;}

// Los reinicios del en vivo se comparten entre los equipos autorizados.
// Archivan capturas sin borrar compras, comprobantes ni el formulario de Pagos.
function claveMaestro(fecha,source){return 'envivo-maestro-v1:'+user.id+':'+fecha+':'+source;}
async function atenderReinicioMaestro(corte,fecha,{forzado=false}={}){
 const source=String(corte?.source||''),id=String(corte?.maestro_id||'');
 if(!user||!source||!id||(!forzado&&(busy||exportando)))return false;
 const clave=claveMaestro(fecha,source);
 if(localStorage.getItem(clave)===id)return false;
 // Invalidar las preparaciones de imágenes pendientes antes de limpiar.
 // Una conversión PNG/JPEG tardía no podrá regenerar los borradores antiguos.
 revisionReinicioLocal++;
 // Limpiar exclusivamente borradores locales. El servidor conserva las
 // imágenes, las revisiones y la evidencia de pagos históricos.
 await C.borrarBorradores(user.id+':'+fecha+':');
 localStorage.removeItem('envivo-youtube:'+user.id+':'+fecha+':'+source);
 localStorage.setItem(clave,id);
 localStorage.setItem('envivo-esperando-fecha:'+user.id,fecha);
 esperandoNuevoSorteo=true;autoFecha=false;fechaPendiente=false;++turno;
 selected=0;draft=null;config=null;rows=[];activeCard=null;release();
 $('rondas').replaceChildren();$('capturas').replaceChildren();
 $('fecha').value='';$('youtube').value='';if($('youtubeEstado'))$('youtubeEstado').textContent='Elige la fecha del próximo sorteo para enviar otro enlace.';
 paint();informarFecha();
 notice('♻️ Se reinició el en vivo desde otro equipo. La presentadora quedó limpia. Elige la fecha del próximo sorteo.');
 status('✓ Borradores anteriores limpiados en esta laptop. Las capturas históricas siguen archivadas.');
 return true;
}
let consultandoMaestro=false;
async function comprobarReinicioMaestro(){
 if(consultandoMaestro||busy||exportando||!user||esperandoNuevoSorteo||document.hidden)return;
 const f=config?.fecha||$('fecha').value;
 if(!f)return;
 try{
  const fecha=fechaSegura(f);
  consultandoMaestro=true;
  const corte=await rpc('en_vivo_cortes',{p_fecha:fecha});
  if(config?.source&&String(config.source)!==String(corte?.source||'')){
   status('⚠️ Cambiaron los aprobados del sorteo. Actualiza las rondas antes de enviar.');
   return;
  }
  await atenderReinicioMaestro(corte,fecha);
 }catch(e){
  // Sin borrar borradores en fallos de red. Se reintentará al reconectar.
  if(/borradores|almacenamiento|indexeddb|quota/i.test(e?.message||''))status('No se pudo aplicar el reinicio maestro: '+e.message);
 }finally{consultandoMaestro=false;}
}

function node(tag,text,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
const nombresGanadores=window.PresentadoraGanadores.crear({rpc});
const consultasGanadores=new WeakMap();
function mostrarGanador(card,elemento){
 clearTimeout(consultasGanadores.get(card));
 const raw=String(card.numeros||'').trim(),original=draft,ctx=config;
 elemento.replaceChildren();elemento.dataset.estado='pendiente';
 if(!raw){elemento.textContent=card.blob?'Escribe el cartón o espera la lectura automática para ver el nombre.':'El cartón y el nombre aparecerán al pegar la captura.';return;}
 let numeros;try{numeros=C.cartones(raw);}catch{elemento.textContent='⚠️ Revisa el número del cartón.';return;}
 elemento.textContent='Buscando nombre entre los aprobados…';
 const vigente=()=>elemento.isConnected&&draft===original&&config===ctx&&original?.cards.includes(card)&&String(card.numeros||'').trim()===raw;
 consultasGanadores.set(card,setTimeout(async()=>{
  if(!vigente())return;
  try{
   const ganadores=await nombresGanadores.consultar(ctx,numeros);
   if(!vigente())return;
   elemento.replaceChildren();let advertencia=false;
   for(const g of ganadores){
    const ok=g.estado==='aprobado'&&g.nombre;
    const texto=ok?'🎟️ Cartón '+g.carton+' · '+g.nombre:g.estado==='ambiguo'?'⚠️ Cartón '+g.carton+': aparece en varias compras. Revisar en Pagos.':g.estado==='aprobado'?'⚠️ Cartón '+g.carton+': aprobado sin nombre registrado.':'⚠️ Cartón '+g.carton+': no aparece entre los aprobados del sorteo.';
    elemento.append(node('div',texto));if(!ok)advertencia=true;
   }
   elemento.dataset.estado=advertencia?'advertencia':'encontrado';
  }catch(e){if(vigente()){elemento.textContent='⚠️ No se pudo consultar el nombre. '+e.message;elemento.dataset.estado='advertencia';}}
 },350));
}
function paint(){
 release();
 const galeria=$('capturas');
 galeria.replaceChildren();
 // Adaptar el número de columnas al total de ganadores, no a la cantidad de capturas cargadas.
 // Se recalcula al agregar, quitar, cambiar de ronda y restaurar un envío.
 const cantidad=draft?.cards?.length||0;
 galeria.dataset.densidad=cantidad<=3?'normal':cantidad===4?'cuatro':cantidad===5?'cinco':'seis';
 galeria.dataset.ganadores=String(cantidad);
 $('tituloRonda').textContent=config?.rondas[selected-1]||'Elige una ronda';
 const editable=!!draft&&!draft.sent;
 $('agregar').hidden=$('enviar').hidden=$('revisionTexto').hidden=!editable;
 $('corregir').hidden=!draft?.sent;
 if(draft&&!draft.sent){
  const anterior=rows.some(e=>e.ronda===selected);
  $('enviar').textContent=anterior?'🔁 Reemplazar capturas en Pagos':'📤 Enviar ganadores a Pagos';
 }
 if($('proximaRonda'))$('proximaRonda').hidden=!draft?.sent||selected>=Number(config?.rondas?.length||0);
 if(!draft){resumen();controls();return;}
 draft.cards.forEach((c,i)=>{
  const box=node('div',null,'capture'),title=node('h3','Ganador '+(i+1)),
   acciones=node('div',null,'capture-actions'),
   paste=node('button',c.blob?'📋 Reemplazar imagen':'📋 Pegar imagen'),
   file=node('input'),img=node('img'),placeholder=node('div','Pega aquí con Ctrl+V o selecciona una imagen','capture-placeholder'),
   label=node('label','Cartón comprobado'),input=node('input'),
   msg=node('p',c.msg||'Pega la captura de este ganador.','hint'),identidad=node('div',null,'ganador-identificado');
  identidad.setAttribute('role','status');identidad.setAttribute('aria-live','polite');
  box.dataset.estado=draft.sent?'enviado':c.blob&&c.numeros?'listo':'incompleto';
  file.type='file';file.accept='image/png,image/jpeg,image/webp';file.hidden=true;
  input.value=c.numeros||'';input.inputMode='numeric';input.placeholder='Número: ej. 738';input.id='cartones-'+i;label.htmlFor=input.id;
  input.setAttribute('aria-label','Cartón del ganador '+(i+1));
  paste.type='button';paste.disabled=input.disabled=!!draft.sent;
  const cargarArchivo=archivo=>{if(archivo)cargar(c,archivo);};
  paste.onclick=async()=>{
   if(busy||draft.sent)return;
   activeCard=c;
   try{
    if(!navigator.clipboard?.read)throw Error();
    const items=await navigator.clipboard.read();
    for(const it of items){
     const type=it.types.find(t=>['image/png','image/jpeg','image/webp'].includes(t));
     if(type){cargarArchivo(await it.getType(type));return;}
    }
   }catch{}
   file.click();
  };
  file.onchange=()=>{const blob=file.files[0];file.value='';cargarArchivo(blob);};
  box.addEventListener('pointerdown',()=>{activeCard=c;});
  box.addEventListener('dragover',e=>{if(editable&&e.dataTransfer?.types?.includes('Files')){e.preventDefault();box.classList.add('captura-arrastrando');}});
  box.addEventListener('dragleave',()=>box.classList.remove('captura-arrastrando'));
  box.addEventListener('drop',e=>{
   box.classList.remove('captura-arrastrando');
   if(!editable)return;const foto=[...(e.dataTransfer?.files||[])].find(f=>f.type.startsWith('image/'));
   if(foto){e.preventDefault();activeCard=c;cargarArchivo(foto);}
  });
  input.onfocus=()=>activeCard=c;
  input.oninput=()=>{
   c.numeros=input.value;c.userEdited=true;box.dataset.estado=c.blob&&c.numeros?'listo':'incompleto';
   resumen();mostrarGanador(c,identidad);save().catch(()=>status('No se pudo guardar el borrador local.'));
  };
  if(c.blob){
   const u=URL.createObjectURL(c.blob);urls.push(u);img.src=u;
   img.alt='Resultado de '+config.rondas[selected-1]+' · Captura '+(i+1);
   img.title='Toca para ver la captura en grande';img.tabIndex=0;img.setAttribute('role','button');
   img.onclick=()=>abrirVisor(c.blob,'Ganador '+(i+1)+' · '+config.rondas[selected-1]);
   img.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();img.click();}};
   placeholder.hidden=true;
  }else{
   img.hidden=true;placeholder.tabIndex=editable?0:-1;
   placeholder.onclick=()=>{if(editable){activeCard=c;file.click();}};
   placeholder.onkeydown=e=>{if(editable&&(e.key==='Enter'||e.key===' ')){e.preventDefault();placeholder.click();}};
  }
  acciones.append(paste);
  if(editable&&draft.cards.length>1){
   const remove=node('button','Quitar','secondary remove');remove.type='button';
   remove.onclick=async()=>{if(busy||!confirm('¿Quitar esta captura del borrador?'))return;draft.cards.splice(i,1);if(activeCard===c)activeCard=draft.cards[0]||null;await save();paint();};
   acciones.append(remove);
  }
  box.append(title,acciones,file,img,placeholder,label,input,identidad,msg);
  $('capturas').append(box);
  mostrarGanador(c,identidad);
 });
 document.querySelectorAll('#rondas button').forEach((b,i)=>{
  b.setAttribute('aria-pressed',String(selected===i+1));
  const enviada=rows.some(row=>row.ronda===i+1&&!capturaAnterior(row));
  b.dataset.estado=enviada?'enviada':'pendiente';
  const nombre=config?.rondas[i]||('Ronda '+(i+1));
  b.textContent=(enviada?'✓ ':'')+nombre;
  b.title=enviada?'Ganadores enviados a Pagos':'Pendiente de enviar';
 });
 resumen();controls();
 if(draft.sent)status('✓ Enviado a Pagos. Puedes continuar a la siguiente ronda.');
}
function loadScript(){return ocrScript||(ocrScript=new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';s.onload=ok;s.onerror=()=>{ocrScript=null;no(Error('No se pudo cargar la lectura automática.'));};document.head.append(s);}));}
async function ocr(canvas){
 await loadScript();if(!worker)worker=await Tesseract.createWorker('eng',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',langPath:'https://tessdata.projectnaptha.com/4.0.0'});
 async function scan(x,y,w,h){const c=document.createElement('canvas'),scale=2;c.width=Math.round(canvas.width*w*scale);c.height=Math.round(canvas.height*h*scale);const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(canvas,canvas.width*x,canvas.height*y,canvas.width*w,canvas.height*h,0,0,c.width,c.height);await worker.setParameters({tessedit_pageseg_mode:h>.1?'6':'7'});return(await worker.recognize(c)).data;}
 // Leer primero la ventana derecha, que identifica UN cartón comprobado.
 const derecha=await scan(.74,.47,.255,.135),cartonComprobado=C.leerOCR('',derecha.text);
 if(cartonComprobado.cartones.length===1&&!cartonComprobado.conflicto)return cartonComprobado;
 const bottom=await scan(.015,.875,.73,.075),side=await scan(.755,.49,.23,.065),r=C.leerOCR(bottom.text,side.text);if(r.cartones.length===1&&!r.conflicto&&Math.max(bottom.confidence||0,side.confidence||0)>=40)return r;
 await worker.setParameters({tessedit_pageseg_mode:'11'});const full=(await worker.recognize(canvas)).data;return C.leerOCR(full.text,full.text);
}
const preparando=new WeakSet();
async function cargar(card,file){
 if(busy||!draft||draft.sent||preparando.has(card))return;
 const original=draft,originalKey=key(),revisionInicio=revisionReinicioLocal;
 preparando.add(card);
 const indice=original.cards.indexOf(card),anterior={...card};
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024){preparando.delete(card);status('Usa una captura JPG, PNG o WebP de menos de 20 MB.');return;}
 card.blob=file;card.ruta=null;card.uploaded=false;card.numeros='';card.userEdited=false;card.msg='Preparando imagen; ya puedes revisar el cartón.';
 paint();
 status('Guardando captura '+(indice+1)+'…');
 try{
  const v=await C.preparar(file);
  if(revisionInicio!==revisionReinicioLocal||original.sent||!original.cards.includes(card))return;
  card.blob=v.blob;card.ruta=null;card.uploaded=false;
  card.msg='Imagen lista. Escribe el cartón o confirma el que se detecte.';
  if(draft===original)paint();
  // Guardar en la ronda original incluso si la presentadora cambió de ronda al procesar.
  await C.local(originalKey,original);
  if(revisionInicio!==revisionReinicioLocal)return;
  if(draft!==original)return;
  paint();
  // La presentadora puede continuar de inmediato, incluso si el OCR tarda o no hay internet.
  const input=$('cartones-'+indice);if(input&&!input.disabled)input.focus();
  activeCard=original.cards.find(c=>c!==card&&!c.blob)||card;
  status('✓ Captura '+(indice+1)+' guardada. Puedes escribir el cartón y continuar.');
  ocrQueue=ocrQueue.catch(()=>{}).then(async()=>{
   if(draft!==original||original.sent||busy||card.blob!==v.blob||card.userEdited)return;
   let timer;
   try{
    const detected=await Promise.race([
     ocr(v.canvas),
     new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Lectura automática agotada')),20000);})
    ]);
    if(draft!==original||original.sent||busy||card.blob!==v.blob||card.userEdited||card.numeros)return;
    const n=detected.cartones.length===1&&!detected.conflicto?String(detected.cartones[0]):'';
    if(n)card.numeros=n;
    card.msg=n?'Número detectado: '+n+'. Compruébalo con la imagen.':
     'No se pudo identificar un cartón individual. Escríbelo desde la ventana derecha.';
   }catch{
    if(worker){try{await worker.terminate();}catch{}worker=null;}
    if(draft!==original||original.sent||busy||card.blob!==v.blob||card.userEdited)return;
    card.msg='Lectura no disponible. Escribe el cartón comprobado.';
   }finally{clearTimeout(timer);}
   if(draft!==original||original.sent||busy||card.userEdited)return;
   await save();
   const index=original.cards.indexOf(card);
   if(index<0)return;
   const field=$('cartones-'+index);
   if(field&&document.activeElement!==field&&!field.value)field.value=card.numeros||'';
   if(field&&document.activeElement===field&&!field.value)field.value=card.numeros||'';
   const box=$('capturas').children[index];
   if(box){const note=box.querySelector('.hint');if(note)note.textContent=card.msg;box.dataset.estado=card.numeros?'listo':'incompleto';const identidad=box.querySelector('.ganador-identificado');if(identidad)mostrarGanador(card,identidad);}
   resumen();
  });
 }catch(e){if(revisionInicio===revisionReinicioLocal){Object.assign(card,anterior);if(draft===original){paint();status('No se guardó la captura '+(indice+1)+': '+(e?.message||'Error desconocido'));}}}
 finally{preparando.delete(card);if(draft===original)controls();}
}
async function enterRound(n){if(busy||!config)return;busy=true;controls();const token=++turno;selected=n;activeCard=null;status('Cargando ronda…');try{const k=key(),local=await C.local(k),remote=rows.find(e=>e.ronda===n);if(token!==turno)return;
 const archivado=!!remote&&capturaAnterior(remote);
 const borradorPosterior=archivado&&local&&!local.sent&&!local.uncertain&&local.id!==remote.id&&local.baseRevision===remote.revision;
 draft=archivado&&!borradorPosterior?{id:C.uuid(),baseRevision:remote.revision,cards:[{numeros:''}],sent:false}:local||{id:C.uuid(),baseRevision:remote?.revision||0,cards:[{numeros:''}],sent:false};
 if(remote&&!archivado&&(!local||remote.id===local.id||remote.revision>local.baseRevision)){
  if(local&&remote.id!==local.id)await C.local(k+':borrador:'+Date.now(),local);
  const objetivo={id:remote.id,baseRevision:remote.revision,cards:[],sent:true};draft=objetivo;
  const cards=await window.CapturasRapidas.recuperar(remote,local,{
   validar:ruta=>{if(!C.ruta(ruta,user.id,config.fecha))throw Error('La captura no pertenece a este usuario y fecha.');},
   descargar:async ruta=>{const {data,error}=await client.storage.from(BUCKET).download(ruta);if(error)throw Error('No se pudo recuperar una captura enviada.');return data;},
   recibida:(_card,_i,lista)=>{if(token===turno&&draft===objetivo){objetivo.cards=lista;paint();}}
  });
  if(token!==turno||draft!==objetivo)return;
  objetivo.cards=cards;if(!$('youtube').value)$('youtube').value=remote.youtube;paint();
  if(!local?.sent||local.uncertain||local.id!==remote.id||local.baseRevision!==remote.revision||cards.some(c=>!local.cards?.some(x=>x.ruta===c.ruta&&x.blob===c.blob)))await save();
 }
 if(archivado&&!borradorPosterior)await save();
 if(draft.uncertain&&draft.youtube)$('youtube').value=draft.youtube;paint();
 if(archivado)status('Ronda lista para nuevas capturas. Al enviarlas, reemplazarán las anteriores de esta ronda en Pagos.');
 else if(!draft.sent)status('Pega una captura por ganador. Si una imagen muestra varios cartones, puedes enviarlos separados por comas.');
 else if(draft.cards.some(c=>!c.blob))status('Algunas imágenes no se pudieron recuperar. Las demás siguen visibles; pulsa de nuevo la ronda para reintentar.');
 }catch(e){draft=null;paint();status(e.message);}finally{busy=false;controls();}
}
async function loadDate(){
 if(busy){if(cargandoFecha)fechaPendiente=true;return;}
 if(!user||esperandoNuevoSorteo)return;
 let f;
 try{f=fechaSegura($('fecha').value);}
 catch(e){
  notice(e.message);informarFecha();
  // Una fecha incompleta no debe dejar a la vista las rondas de otro día.
  selected=0;config=null;draft=null;rows=[];activeCard=null;
  $('rondas').replaceChildren();paint();return;
 }
 cargandoFecha=true;busy=true;controls();++turno;selected=0;draft=null;activeCard=null;config=null;paint();$('rondas').replaceChildren();let abrirAuto=0;
 try{let data=await rpc('en_vivo_contexto',{p_fecha:f});if(!data)throw Error('Tu correo aún no está autorizado. Pide al encargado de pagos que prepare tu acceso.');
 // No usar rondas de ayer si aún no se prepararon las de hoy.
 if(!data.jornada)throw Error('Rondas pendientes para '+f+'. Se prepararán al iniciar Pagos con los aprobados. Esta pantalla las buscará automáticamente.');
 const corte=await rpc('en_vivo_cortes',{p_fecha:f});
 if(String(corte?.source||'')!==String(data.source||''))throw Error('El sorteo cambió. Actualiza antes de pegar capturas.');
 if(await atenderReinicioMaestro(corte,f,{forzado:true}))return;
 config={...data.jornada,cortes:corte?.revisiones||{},maestroId:corte?.maestro_id||null};rows=data.envios||[];
 if($('cantidadRondas'))$('cantidadRondas').value=String(config.rondas.length);
 if($('cantidadEstado'))$('cantidadEstado').textContent='✓ '+config.rondas.length+' rondas confirmadas.';
 const envioVigente=rows.find(e=>!capturaAnterior(e));
 const enlaceLocal=localStorage.getItem('envivo-youtube:'+user.id+':'+f+':'+config.source)||'';
  const enlaceServidor=String(config.youtube||'').trim();
  $('youtube').value=enlaceLocal||enlaceServidor||envioVigente?.youtube||'';
  $('youtubeEstado').textContent=enlaceServidor&&$('youtube').value===enlaceServidor
   ?'✓ Enlace confirmado en Pagos. Si lo cambias, pulsa Enviar enlace a Pagos.'
   : $('youtube').value
    ?'Enlace escrito aquí. Pulsa Enviar enlace a Pagos para confirmarlo, sin esperar las capturas.'
    :'Pega el enlace y pulsa Enviar enlace a Pagos; no necesitas capturas.';
  config.rondas.forEach((r,i)=>{const b=node('button',r);b.type='button';b.onclick=()=>enterRound(i+1);$('rondas').append(b);});
 // Ir a la primera ronda sin envío de esta jornada.
 abrirAuto=config.rondas.findIndex((_,i)=>!rows.some(e=>e.ronda===i+1&&!capturaAnterior(e)))+1;
 if(abrirAuto<1)abrirAuto=config.rondas.length;
 notice('✓ Jornada lista. Selecciona la ronda o pega la primera captura.');}
 catch(e){notice(e.message);}
 finally{
  cargandoFecha=false;busy=false;controls();informarFecha();
  if(fechaPendiente){fechaPendiente=false;loadDate();return;}
  if(abrirAuto&&config&&!esperandoNuevoSorteo&&!selected)enterRound(abrirAuto);
 }
}

function progresoDescarga(mensaje){
 const estado=$('descargaEstado');
 estado.hidden=false;estado.textContent=mensaje;
}
function carpetaRonda(numero,titulo){
 const nombre=String(titulo||'Ronda '+numero).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,38);
 return 'Ronda_'+String(numero).padStart(2,'0')+'_'+(nombre||'Ganadores');
}
function numerosArchivo(card){
 const raw=Array.isArray(card.cartones)?card.cartones.map(String).join('-'):String(card.cartones||card.numeros||'').replace(/[\s,;]+/g,'-');
 return /^[1-9]\d{0,3}(?:-[1-9]\d{0,3})*$/.test(raw)?raw:'Sin_carton';
}
async function descargarTodasCapturas(){
 if(exportando||busy||!config||!user)return;
 if(!window.ZipCapturasBingo?.crearZip){progresoDescarga('No se cargó el generador ZIP. Actualiza esta página con Ctrl+Shift+R.');return;}
 const uid=user.id,fecha=config.fecha,source=String(config.source),titulos=[...config.rondas];
 exportando=true;controls();progresoDescarga('Consultando las imágenes del sorteo…');
 try{
  const {data:auth,error:authError}=await client.auth.getSession();
  if(authError||auth?.session?.user?.id!==uid)throw Error('La sesión venció. Vuelve a entrar con el correo autorizado.');
  const info=await rpc('en_vivo_contexto',{p_fecha:fecha});
  if(!info?.jornada||String(info.source)!==source||String(info.jornada.source)!==source)throw Error('El sorteo cambió. Actualiza las rondas antes de descargar.');
  const envios=C.ultimos(info.envios||[]).filter(e=>e.fecha===fecha&&String(e.source)===source&&e.creado_por===uid);
  const entries=[],detalle=[];let total=0,totalBytes=0;
  for(let ronda=1;ronda<=titulos.length;ronda++){
   const remoto=envios.find(e=>e.ronda===ronda);
   const cierre=Number(versionesCerradas(fecha,source)[ronda]||0);
   const vigente=remoto&&Number(remoto.revision)>cierre?remoto:null;
   const k=[uid,fecha,source,ronda].join(':');
   const local=(selected===ronda&&draft&&config?.fecha===fecha&&String(config?.source)===source)?draft:await C.local(k);
   const sinEnviar=local&&!local.sent&&!local.uncertain&&Array.isArray(local.cards)&&local.cards.some(c=>!!c.blob)
    &&(!remoto||Number(local.baseRevision||0)>=Number(remoto.revision||0));
   let fotos=[],origen='';
   if(sinEnviar){
    origen='borrador pendiente de enviar';
    fotos=local.cards.filter(c=>!!c.blob).map(c=>({blob:c.blob,cartones:c.numeros||''}));
   }else if(vigente){
    origen='enviado a Pagos';
    for(let j=0;j<vigente.capturas.length;j++){
     const cap=vigente.capturas[j];
     if(!C.ruta(cap.ruta,uid,fecha))throw Error('La ruta de una captura enviada no corresponde a esta fecha o usuario.');
     progresoDescarga('Descargando ronda '+ronda+' de '+titulos.length+' · imagen '+(j+1)+' de '+vigente.capturas.length+'…');
     const {data,error}=await client.storage.from(BUCKET).download(cap.ruta);
     if(error||!data||data.size<1||data.size>8388608)throw Error('No se pudo descargar la imagen '+(j+1)+' de la ronda '+ronda+'. No se generó un ZIP incompleto.');
     fotos.push({blob:data,cartones:cap.cartones});
    }
   }
   if(!fotos.length)continue;
   const carpeta=carpetaRonda(ronda,titulos[ronda-1]);
   for(let j=0;j<fotos.length;j++){
    const foto=fotos[j],carton=numerosArchivo(foto),archivo=carpeta+'/Ganador_'+String(j+1).padStart(2,'0')+'_Carton_'+carton+'.jpg';
    if(!(foto.blob instanceof Blob)||!foto.blob.size)throw Error('La ronda '+ronda+' tiene una imagen sin guardar.');
    totalBytes+=foto.blob.size;
    if(totalBytes>600*1024*1024)throw Error('El conjunto supera los 600 MB. Descarga menos capturas por jornada para evitar agotar la memoria.');
    entries.push({name:archivo,blob:foto.blob});
    total++;
   }
   detalle.push('Ronda '+ronda+' · '+titulos[ronda-1]+': '+fotos.length+' imagen(es) · '+origen);
  }
  if(!total)throw Error('Todavía no hay capturas de esta jornada para descargar. Primero pega o envía al menos una imagen.');
  if(!user||user.id!==uid)throw Error('La sesión cambió durante la descarga. Repite la exportación.');
  const manifiesto='BINGO ANDINO 75 · CAPTURAS DEL EN VIVO\nFecha: '+fecha+
   '\nTotal: '+total+' imágenes\n\n'+detalle.join('\n')+
   '\n\nIncluye las últimas capturas visibles de cada ronda y, cuando existan, borradores locales pendientes de enviar.\nNo incluye versiones anteriores archivadas ni comprobantes bancarios.\n';
  entries.unshift({name:'LEER_PRIMERO.txt',blob:new Blob([manifiesto],{type:'text/plain;charset=utf-8'})});
  progresoDescarga('Preparando el ZIP con '+total+' imágenes…');
  const zip=await window.ZipCapturasBingo.crearZip(entries);
  const url=URL.createObjectURL(zip),a=document.createElement('a');
  a.href=url;a.download='BingoAndino75_Capturas_'+fecha+'.zip';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  progresoDescarga('✓ ZIP listo: '+total+' imágenes, organizadas por ronda. Búscalo en Descargas y envíalo por WhatsApp o correo.');
 }catch(e){progresoDescarga('⚠️ '+(e?.message||'No se pudieron descargar las imágenes.'));}
 finally{exportando=false;controls();}
}
$('descargarCapturas').onclick=descargarTodasCapturas;

$('guardarRondas').onclick=async()=>{
 if(!user||busy||!config||esperandoNuevoSorteo)return;
 const cantidad=Number($('cantidadRondas').value),anterior=config.rondas.length;
 if(![5,6].includes(cantidad))return;
 if(cantidad===anterior){$('cantidadEstado').textContent='✓ Ya están configuradas '+cantidad+' rondas.';return;}
 if(draft?.uncertain||draft?.cards.some(c=>preparando.has(c))){status('Espera a que termine el envío o la preparación de la captura.');return;}
 if(!confirm('¿Cambiar a '+cantidad+' rondas en Presentadora y Pagos? El lleno final será la última ronda. Las capturas enviadas se conservan.'))return;
 busy=true;controls();let ok=false;
 try{
  await save();
  for(const ronda of [5,6]){
   const local=await C.local(key(ronda));
   if(local&&!local.sent&&local.cards?.some(c=>c.blob||String(c.numeros||'').trim()))
    throw Error('Hay capturas pendientes en la quinta ronda o el lleno final. Consérvalas y termina o reinicia antes de cambiar las rondas.');
  }
  const resultado=await rpc('en_vivo_cambiar_cantidad',{
   p_fecha:config.fecha,p_source:String(config.source),p_cantidad:cantidad,
   p_rondas_anteriores:config.rondas,p_maestro_id:config.maestroId||null
  });
  if(resultado?.source!==String(config.source)||resultado?.rondas?.length!==cantidad)throw Error('No se confirmó la cantidad. Pulsa Actualizar para comprobarla.');
  ok=true;$('cantidadEstado').textContent='✓ '+cantidad+' rondas guardadas. Pagos las cargará al actualizar.';
 }catch(e){$('cantidadRondas').value=String(anterior);$('cantidadEstado').textContent='⚠️ '+e.message;status(e.message);}
 finally{busy=false;controls();}
 if(ok)await loadDate();
};
$('nuevoSorteoPresentadora').onclick=async()=>{
 if(!user||busy||!config)return;
 if(draft?.uncertain){status('Confirma el envío pendiente antes de reiniciar.');return;}
 const fecha=config.fecha,source=String(config.source);
 if(!confirm('¿Reiniciar Presentadora? Se limpiarán los borradores de esta fecha y se archivarán los envíos anteriores. También se vaciarán los excluidos de la ruleta. Los comprobantes, pagos e historial se conservan.'))return;
 busy=true;controls();
 try{
  const pendiente='envivo-reinicio-pendiente:'+user.id+':'+fecha+':'+source;
  let operacion=localStorage.getItem(pendiente);
  if(!operacion){operacion=C.uuid();localStorage.setItem(pendiente,operacion);}
  const corte=await rpc('en_vivo_reiniciar_presentadora',{
   p_fecha:fecha,p_source:source,p_maestro_id:config.maestroId||null,p_reinicio:operacion
  });
  if(String(corte?.source)!==source||corte?.maestro_id!==operacion)throw Error('No se confirmó el reinicio. Pulsa de nuevo para comprobarlo.');
  await atenderReinicioMaestro(corte,fecha,{forzado:true});
  localStorage.removeItem(pendiente);
  notice('✓ Presentadora reiniciada. Pulsa 📅 Hoy o elige la fecha del próximo sorteo.');
  status('Los envíos anteriores quedaron archivados. Los comprobantes, pagos e historial se conservaron.');
 }catch(e){status('No se pudo completar el reinicio: '+e.message);}
 finally{busy=false;controls();}
};
$('actualizarRondas').onclick=loadDate;
setInterval(()=>{if(user&&!config&&!busy&&!esperandoNuevoSorteo&&!document.hidden)loadDate();},12000);
setInterval(comprobarReinicioMaestro,9000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)comprobarReinicioMaestro();});
function elegirFecha(){
 autoFecha=false;esperandoNuevoSorteo=false;
 if(user)localStorage.removeItem('envivo-esperando-fecha:'+user.id);
 informarFecha();loadDate();
}
$('fecha').onchange=elegirFecha;
$('fechaHoy').onclick=()=>{
 if(busy&&!cargandoFecha)return;
 $('fecha').value=hoyCaracas();
 elegirFecha();
};
$('youtube').oninput=()=>{
 if(config&&user)localStorage.setItem('envivo-youtube:'+user.id+':'+config.fecha+':'+config.source,$('youtube').value);
 $('youtubeEstado').textContent='Enlace pendiente de enviar a Pagos. Pulsa el botón para confirmarlo.';
};
$('youtubeEnviar').onclick=async()=>{
 if(busy||!user||!config||esperandoNuevoSorteo){
  $('youtubeEstado').textContent='Primero entra y carga la fecha y las rondas preparadas en Pagos.';
  return;
 }
 if(draft?.uncertain){
  $('youtubeEstado').textContent='Confirma primero el envío pendiente de la ronda.';
  return;
 }
 let youtube;
 try{youtube=TransmisionYouTube.parse($('youtube').value).url;}
 catch(e){$('youtubeEstado').textContent='⚠️ '+e.message;return;}
 const fecha=config.fecha,source=config.source,maestro=config.maestroId||null;
 busy=true;controls();$('youtubeEstado').textContent='Enviando enlace de YouTube a Pagos…';
 try{
  const result=await rpc('en_vivo_enlace_guardar',{
   p_fecha:fecha,p_source:source,p_youtube:youtube,p_maestro_id:maestro
  });
  if(result?.youtube!==youtube||String(result?.source)!==String(source))
   throw Error('El servidor no confirmó el enlace. Reintenta.');
  if(config?.fecha===fecha&&config?.source===source){
   config.youtube=youtube;config.youtube_actualizado_en=result.actualizado_en;
   $('youtube').value=youtube;
   localStorage.setItem('envivo-youtube:'+user.id+':'+fecha+':'+source,youtube);
   $('youtubeEstado').textContent='✓ Enlace guardado en Pagos. Allí deben pulsar «Traer enlace de Presentadora» junto al campo de YouTube.';
  }else $('youtubeEstado').textContent='✓ Enlace guardado, pero la fecha cambió. Vuelve a consultar la jornada.';
 }catch(e){
  $('youtubeEstado').textContent='⚠️ Enlace NO confirmado: '+(e.message||'Revisa la conexión.')+' Puedes reintentar sin afectar las capturas.';
 }finally{busy=false;controls();}
};
async function agregarGanador(){
 if(busy||!draft||draft.sent)return false;
 if(draft.cards.length>=20){status('Máximo 20 capturas por envío.');return false;}
 const nuevo={numeros:''};draft.cards.push(nuevo);activeCard=nuevo;await save();paint();
 const cards=$('capturas').children;const nuevoCuadro=cards[cards.length-1];
 nuevoCuadro?.querySelector('.capture-actions button')?.focus();
 return true;
}
$('agregar').onclick=agregarGanador;
$('proximaRonda').onclick=()=>{if(!busy&&draft?.sent&&config&&selected<config.rondas.length)enterRound(selected+1);};
$('corregir').onclick=async()=>{
 if(busy||!draft?.sent)return;
 draft.id=C.uuid();draft.sent=false;await save();paint();
 status('Corrige las capturas y pulsa Enviar. La nueva versión reemplazará las anteriores en Pagos.');
};
async function revisarCapturasGuardadas(){
 let revisadas=0,corregidas=0;
 for(let i=0;i<draft.cards.length;i++){
  const card=draft.cards[i];
  if(!card.blob||card.userEdited||!/[;,]/.test(card.numeros||''))continue;
  let actuales;
  try{actuales=C.cartones(card.numeros);}catch{continue;}
  if(actuales.length<2)continue;
  revisadas++;
  status('Revisando cartón individual de la captura '+(i+1)+'…');
  try{
   const im=await C.imagen(card.blob),canvas=document.createElement('canvas');
   canvas.width=im.naturalWidth||im.width;canvas.height=im.naturalHeight||im.height;
   canvas.getContext('2d').drawImage(im,0,0);
   let timeout;
   const resultado=await Promise.race([
    ocr(canvas),
    new Promise((_,no)=>{timeout=setTimeout(()=>no(Error('Lectura tardó demasiado')),25000);})
   ]).finally(()=>clearTimeout(timeout));
   if(resultado.cartones.length===1&&actuales.includes(resultado.cartones[0])){
    card.numeros=String(resultado.cartones[0]);card.msg='Cartón comprobado individualmente. Verifica el número.';
    corregidas++;
   }
  }catch(e){
   if(worker){try{await worker.terminate();}catch{}worker=null;}
   // No inventar cartones si la lectura falla: se pide corrección manual.
  }
 }
 if(corregidas){await save();paint();status('Se corrigieron '+corregidas+' captura(s) guardadas. Revisa los cartones detectados.');}
 return{revisadas,corregidas};
}
function capturasValidadas(){
 const usados=new Map();
 const capturas=draft.cards.map((card,i)=>{
  if(!card.blob)throw Error('Ganador '+(i+1)+': falta adjuntar la captura.');
  let cartones;try{cartones=C.cartones(card.numeros);}catch(e){throw Error('Ganador '+(i+1)+': '+e.message);}
  for(const numero of cartones){
   if(usados.has(numero)){
    const otro=usados.get(numero);
    const field=$('cartones-'+i);
    if(field){field.style.border='3px solid #c24942';field.scrollIntoView({behavior:'smooth',block:'center'});}
    throw Error('El cartón '+numero+' se repite entre Ganador '+otro+' y Ganador '+(i+1)+'. Corrige el número individual de cada captura; no se ha enviado nada.');
   }
   usados.set(numero,i+1);
  }
  return{ruta:card.ruta,cartones};
 });
 C.numeros({capturas});
 return capturas;
}
$('enviar').onclick=async()=>{
 if(busy||!draft||draft.sent)return;
 if(draft.cards.some(c=>preparando.has(c))){status('La imagen todavía se está guardando. Espera un momento antes de enviar.');return;}
 // Enviar una corrección reemplaza la versión vigente de esta ronda en Pagos.
 // La revisión anterior permanece en el historial de auditoría, pero no se mezcla con la nueva.
 busy=true;controls();try{
 if(draft.cards.some(c=>/[;,]/.test(c.numeros||'')))await revisarCapturasGuardadas();
 const capturas=capturasValidadas(),youtube=TransmisionYouTube.parse($('youtube').value).url;
 const {data:a,error:ae}=await client.auth.getSession();if(ae||a?.session?.user?.id!==user.id)throw Error('Verifica tu acceso de nuevo.');
 const maestroAntes=await rpc('en_vivo_cortes',{p_fecha:config.fecha});
 if(String(maestroAntes?.source||'')!==String(config.source))throw Error('El sorteo cambió. Actualiza las rondas.');
 if(await atenderReinicioMaestro(maestroAntes,config.fecha,{forzado:true}))return;
 if((maestroAntes?.maestro_id||null)!==(config.maestroId||null))throw Error('El reinicio maestro cambió. Actualiza las rondas antes de enviar.');
 for(let i=0;i<draft.cards.length;i++){const c=draft.cards[i];if(!c.ruta){c.ruta=user.id+'/'+config.fecha+'/'+C.uuid()+'.jpg';await save();}capturas[i].ruta=c.ruta;if(c.uploaded)continue;status('Subiendo captura '+(i+1)+' de '+capturas.length+'…');const{error}=await client.storage.from(BUCKET).upload(c.ruta,c.blob,{contentType:'image/jpeg',upsert:false});if(error){const r=await client.storage.from(BUCKET).download(c.ruta);if(r.error||r.data?.size!==c.blob.size)throw error;const [a,b]=await Promise.all([r.data.arrayBuffer(),c.blob.arrayBuffer()]);const aa=new Uint8Array(a),bb=new Uint8Array(b);if(!aa.every((v,j)=>v===bb[j]))throw Error('La captura existente no coincide. Revisa el envío.');}c.uploaded=true;await save();}
 const maestroFinal=await rpc('en_vivo_cortes',{p_fecha:config.fecha});
 if(String(maestroFinal?.source||'')!==String(config.source))throw Error('Cambió el sorteo. No se enviaron estos ganadores.');
 if(await atenderReinicioMaestro(maestroFinal,config.fecha,{forzado:true}))return;
 if((maestroFinal?.maestro_id||null)!==(config.maestroId||null))throw Error('El reinicio maestro cambió. Actualiza la ronda antes de enviar.');
 status('Enviando ganadores a pagos…');draft.uncertain=true;draft.youtube=youtube;await save();const row=await rpc('en_vivo_enviar_activo',{p_id:draft.id,p_fecha:config.fecha,p_source:config.source,p_ronda:selected,p_revision:draft.baseRevision,p_youtube:youtube,p_capturas:capturas,p_maestro_id:config.maestroId||null});if(row.id!==draft.id)throw Error('No se confirmó el envío. Reintenta sin cambiar las capturas.');draft.sent=true;draft.uncertain=false;draft.baseRevision=row.revision;rows=rows.filter(e=>e.ronda!==selected).concat(row);await save();paint();status(row.revision>1?'✓ Capturas nuevas enviadas. Reemplazan la versión anterior de esta ronda en Pagos.':'✓ Capturas enviadas a Pagos.');
 }catch(e){if(draft?.uncertain){try{const data=await rpc('en_vivo_contexto',{p_fecha:config.fecha}),r=data?.envios?.find(e=>e.id===draft.id);if(r){draft.sent=true;draft.uncertain=false;draft.baseRevision=r.revision;rows=rows.filter(e=>e.ronda!==selected).concat(r);await save();paint();status('Enviado ✓ · Confirmado al consultar pagos.');return;}}catch{}}status((e.message||'No se confirmó el envío.')+' Las capturas quedan guardadas; reintenta sin cambiarlas.');}finally{busy=false;controls();}};
document.addEventListener('paste',async e=>{
 if(busy||!draft||draft.sent||!config)return;
 const item=[...(e.clipboardData?.items||[])].find(x=>/^image\/(png|jpeg|webp)$/.test(x.type));
 if(!item)return;
 // Capturar el archivo antes de cualquier await: algunos navegadores vacían el portapapeles al acabar el evento.
 const foto=item.getAsFile();
 if(!foto)return;
 e.preventDefault();
 let card=draft.cards.find(c=>!c.blob);
 // Si todos están llenos, una nueva imagen es otro ganador. Para reemplazar, usa el botón de su cuadro.
 if(!card){
  if(draft.cards.length>=20){status('Máximo 20 capturas por envío.');return;}
  card={numeros:''};draft.cards.push(card);await save();paint();
 }
 activeCard=card;
 cargar(card,foto);
});
document.addEventListener('keydown',e=>{
 if(!user||$('trabajo').hidden||busy||e.repeat||draft?.uncertain)return;
 if(e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){
  if(/^Digit[1-6]$/.test(e.code)){
   const n=Number(e.code.slice(-1));
   if(config?.rondas[n-1]){e.preventDefault();enterRound(n);}return;
  }
  if(e.code==='KeyN'&&draft&&!draft.sent){e.preventDefault();agregarGanador();return;}
 }
 if((e.ctrlKey||e.metaKey)&&e.code==='Enter'&&draft&&!draft.sent&&!e.altKey){
  e.preventDefault();$('enviar').click();
 }
});
$('pedir').onclick=async()=>{if(busy)return;busy=true;controls();try{const{error}=await client.auth.signInWithOtp({email:$('email').value.trim()});if(error)throw error;notice('Revisa tu correo y escribe el código recibido.');}catch(e){notice(e.message);}finally{busy=false;controls();}};
$('verificar').onclick=async()=>{if(busy)return;busy=true;controls();try{const{error}=await client.auth.verifyOtp({email:$('email').value.trim(),token:$('codigo').value.trim(),type:'email'});if(error)throw error;notice('Acceso verificado.');}catch(e){notice(e.message);}finally{busy=false;controls();await session();}};
$('salir').onclick=async()=>{if(busy)return;await client.auth.signOut();await session();};
async function session(){const{data}=await client.auth.getSession();const next=data?.session?.user||null;if(next?.id===user?.id&&user)return;user=next;++turno;draft=null;config=null;rows=[];activeCard=null;release();$('trabajo').hidden=!user;$('salir').hidden=!user;$('acceso').open=!user;$('capturas').replaceChildren();if(user){$('email').value=user.email;const fechaCerrada=localStorage.getItem('envivo-esperando-fecha:'+user.id);
  // Conservar el cierre del sorteo del mismo día. En fecha distinta,
  // buscar la jornada nueva sin volver a solicitar el botón Hoy.
  esperandoNuevoSorteo=!!fechaCerrada&&(fechaCerrada==='1'||fechaCerrada===hoyCaracas());
  if(fechaCerrada&&!esperandoNuevoSorteo){
   localStorage.removeItem('envivo-esperando-fecha:'+user.id);
   autoFecha=true;$('fecha').value=hoyCaracas();
  }
  if(esperandoNuevoSorteo){
   autoFecha=false;$('fecha').value='';
   notice('El sorteo anterior está cerrado. Selecciona una fecha nueva para continuar.');
   informarFecha();
  }else await loadDate();}else notice('Verifica tu correo autorizado para comenzar.');}
let fechaInicial;try{fechaInicial=fechaSegura(new URL(location.href).searchParams.get('fecha'));}catch{}
autoFecha=!fechaInicial;$('fecha').value=fechaInicial||hoyCaracas();
informarFecha();
client.auth.onAuthStateChange(()=>setTimeout(session,0));session();if(navigator.serviceWorker?.register)navigator.serviceWorker.register('sw.js',{scope:'./'}).catch(()=>{});
})();
