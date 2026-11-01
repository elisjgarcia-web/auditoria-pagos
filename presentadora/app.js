(function(){
'use strict';
const C=window.EnVivoComun,$=id=>document.getElementById(id),client=window.supabase.createClient('https://dbkixcpwirjwjvjintkr.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRia2l4Y3B3aXJqd2p2amludGtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwNjYxNDksImV4cCI6MjA2MTY0MjE0OX0.QJmWLWSe-pRYwxWeel8df7JLhNUvMKaTpL0MCDorgho'),BUCKET='ganadores-en-vivo';
let user=null,config=null,rows=[],selected=0,draft=null,busy=false,turno=0,urls=[],worker=null,ocrScript=null,activeCard=null,autoFecha=false,esperandoNuevoSorteo=false,ocrQueue=Promise.resolve(),visorCaptura=null;
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
const notice=t=>{$('estado').textContent=t;},status=t=>{
 $('envioEstado').textContent=t;
 let bottom=$('resultadoEnvio');
 if(!bottom){bottom=document.createElement('p');bottom.id='resultadoEnvio';bottom.setAttribute('role','status');bottom.setAttribute('aria-live','polite');bottom.style.cssText='font-size:14px;font-weight:650;line-height:1.5;color:#43194e;white-space:pre-wrap';$('enviar').insertAdjacentElement('afterend',bottom);}
 bottom.textContent=t;
};
function controls(){document.querySelectorAll('button,input').forEach(n=>n.disabled=busy);$('enviar').disabled=busy||!draft||draft.sent;$('agregar').disabled=busy||!draft||draft.sent;if($('proximaRonda'))$('proximaRonda').disabled=busy;if(draft?.sent||draft?.uncertain)document.querySelectorAll('#capturas button,#capturas input').forEach(n=>n.disabled=true);if(draft?.uncertain){$('youtube').disabled=$('fecha').disabled=$('agregar').disabled=true;document.querySelectorAll('#rondas button').forEach(n=>n.disabled=true);$('enviar').textContent='Reintentar envío';}else $('enviar').textContent='Enviar a pagos';}
function key(){return [user.id,config.fecha,config.source,selected].join(':');}
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
 const n=Number(versionesCerradas(config.fecha,config.source)[row.ronda]);
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
function node(tag,text,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
function paint(){
 release();
 $('capturas').replaceChildren();
 $('tituloRonda').textContent=config?.rondas[selected-1]||'Elige una ronda';
 const editable=!!draft&&!draft.sent;
 $('agregar').hidden=$('enviar').hidden=$('revisionTexto').hidden=!editable;
 $('corregir').hidden=!draft?.sent;
 if($('proximaRonda'))$('proximaRonda').hidden=!draft?.sent||selected>=Number(config?.rondas?.length||0);
 if(!draft){resumen();controls();return;}
 draft.cards.forEach((c,i)=>{
  const box=node('div',null,'capture'),title=node('h3','Ganador '+(i+1)),
   acciones=node('div',null,'capture-actions'),
   paste=node('button',c.blob?'📋 Reemplazar imagen':'📋 Pegar imagen'),
   file=node('input'),img=node('img'),placeholder=node('div','Pega aquí con Ctrl+V o selecciona una imagen','capture-placeholder'),
   label=node('label','Cartón comprobado'),input=node('input'),
   msg=node('p',c.msg||'Pega la captura de este ganador.','hint');
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
   resumen();save().catch(()=>status('No se pudo guardar el borrador local.'));
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
  box.append(title,acciones,file,img,placeholder,label,input,msg);
  $('capturas').append(box);
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
 const original=draft,originalKey=key();
 preparando.add(card);
 const indice=original.cards.indexOf(card);
 status('Guardando captura '+(indice+1)+'…');
 try{
  const v=await C.preparar(file);
  if(original.sent||!original.cards.includes(card))return;
  card.blob=v.blob;card.ruta=null;card.uploaded=false;card.numeros='';card.userEdited=false;
  card.msg='Imagen lista. Escribe el cartón o confirma el que se detecte.';
  // Guardar en la ronda original incluso si la presentadora cambió de ronda al procesar.
  await C.local(originalKey,original);
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
   if(box){const note=box.querySelector('.hint');if(note)note.textContent=card.msg;box.dataset.estado=card.numeros?'listo':'incompleto';}
   resumen();
  });
 }catch(e){if(draft===original)status('No se guardó la captura '+(indice+1)+': '+(e?.message||'Error desconocido'));}
 finally{preparando.delete(card);}
}
async function enterRound(n){if(busy||!config)return;busy=true;controls();const token=++turno;selected=n;activeCard=null;status('Cargando ronda…');try{const k=key(),local=await C.local(k),remote=rows.find(e=>e.ronda===n);if(token!==turno)return;
 const archivado=!!remote&&capturaAnterior(remote);
 const borradorPosterior=archivado&&local&&!local.sent&&!local.uncertain&&local.id!==remote.id&&local.baseRevision===remote.revision;
 draft=archivado&&!borradorPosterior?{id:C.uuid(),baseRevision:remote.revision,cards:[{numeros:''}],sent:false}:local||{id:C.uuid(),baseRevision:remote?.revision||0,cards:[{numeros:''}],sent:false};
 if(remote&&!archivado&&(!local||remote.id===local.id||remote.revision>local.baseRevision)){
  if(local&&remote.id!==local.id)await C.local(k+':borrador:'+Date.now(),local);
  const cards=[];for(const c of remote.capturas){if(!C.ruta(c.ruta,user.id,config.fecha))throw Error('La captura no pertenece a este usuario y fecha.');const{data,error}=await client.storage.from(BUCKET).download(c.ruta);if(error||!data||data.size>8388608)throw Error('No se pudo recuperar una captura enviada.');cards.push({blob:data,ruta:c.ruta,numeros:c.cartones.join(', '),msg:'Captura enviada a pagos.',uploaded:true});}
  draft={id:remote.id,baseRevision:remote.revision,cards,sent:true};if(!$('youtube').value)$('youtube').value=remote.youtube;await save();
 }
 if(archivado&&!borradorPosterior)await save();
 if(draft.uncertain&&draft.youtube)$('youtube').value=draft.youtube;paint();
 if(archivado)status('Ronda limpia. La captura anterior sigue registrada en Pagos. Si envías otra captura en esta misma fecha se creará una revisión nueva.');
 else if(!draft.sent)status('Pega una captura por ganador. Si una imagen muestra varios cartones, puedes enviarlos separados por comas.');
 }catch(e){draft=null;paint();status(e.message);}finally{busy=false;controls();}
}
async function loadDate(){if(busy||!user||esperandoNuevoSorteo||!$('fecha').value)return;busy=true;controls();++turno;selected=0;draft=null;activeCard=null;config=null;paint();$('rondas').replaceChildren();let abrirAuto=0;try{let f=C.fecha($('fecha').value),data=await rpc('en_vivo_contexto',{p_fecha:f});if(!data)throw Error('Tu correo aún no está autorizado. Pide al encargado de pagos que prepare tu acceso.');
 if(!data.jornada&&autoFecha&&data.source){
  // La configuración de Pagos determina la jornada; no adivinar la fecha.
  const hoy=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Caracas',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const anterior=new Date(hoy+'T12:00:00Z');anterior.setUTCDate(anterior.getUTCDate()-1);
  const {data:jornadas,error}=await client.from('en_vivo_jornadas').select('fecha').eq('source',data.source).gte('fecha',anterior.toISOString().slice(0,10)).order('fecha',{ascending:false}).limit(1);
  if(!error&&jornadas?.length){f=jornadas[0].fecha;$('fecha').value=f;data=await rpc('en_vivo_contexto',{p_fecha:f});}
 }
 if(!data.jornada)throw Error('Todavía no hay rondas para '+f+'. Comprueba que la fecha coincida con Pagos y que allí se hayan cargado los aprobados.');config=data.jornada;rows=data.envios||[];
 const envioVigente=rows.find(e=>!capturaAnterior(e));
 $('youtube').value=localStorage.getItem('envivo-youtube:'+user.id+':'+f+':'+config.source)||envioVigente?.youtube||'';config.rondas.forEach((r,i)=>{const b=node('button',r);b.type='button';b.onclick=()=>enterRound(i+1);$('rondas').append(b);});
 // Ir a la primera ronda sin envío de esta jornada.
 abrirAuto=config.rondas.findIndex((_,i)=>!rows.some(e=>e.ronda===i+1&&!capturaAnterior(e)))+1;
 if(abrirAuto<1)abrirAuto=config.rondas.length;
 notice('✓ Jornada lista. Selecciona la ronda o pega la primera captura.');}
 catch(e){notice(e.message);}finally{busy=false;controls();if(abrirAuto&&config&&!esperandoNuevoSorteo&&!selected)enterRound(abrirAuto);}}
$('nuevoSorteoPresentadora').onclick=async()=>{
 if(!user||busy)return;
 if(draft?.uncertain){status('Confirma el envio pendiente antes de comenzar otro sorteo.');return;}
 let fecha;try{fecha=config?.fecha||C.fecha($('fecha').value);}catch{status('Selecciona la fecha que deseas cerrar.');return;}
 if(!confirm('Nuevo sorteo: se limpiaran los borradores y capturas locales de esta fecha. Los envios anteriores ya recibidos en Pagos y el historial se mantienen. ¿Continuar?'))return;
 busy=true;controls();let registro=null;
 try{
  // Consultar la última revisión antes de ocultarla; no borrar archivos ni filas remotas.
  const consulta=await rpc('en_vivo_contexto',{p_fecha:fecha});
  if(!consulta)throw Error('No se pudo consultar la jornada. Revisa tu conexión.');
  const source=config?.source||consulta.jornada?.source||consulta.source||'';
  const recientes=source&&consulta.source===source?(consulta.envios||[]):rows;
  registro=registrarCierre(fecha,source,recientes);
  await C.borrarBorradores(user.id+':'+fecha+':');
  localStorage.removeItem('envivo-youtube:'+user.id+':'+fecha+':'+source);
  localStorage.setItem('envivo-esperando-fecha:'+user.id,'1');
  esperandoNuevoSorteo=true;autoFecha=false;++turno;
  selected=0;draft=null;config=null;rows=[];activeCard=null;release();
  $('rondas').replaceChildren();$('capturas').replaceChildren();$('fecha').value='';$('youtube').value='';
  paint();notice('La presentadora quedó limpia. Selecciona la fecha del siguiente sorteo.');
  status('Capturas anteriores ocultas aquí. Los resultados ya recibidos siguen guardados en Pagos.');
 }catch(e){
  if(registro){try{if(registro.previous===null)localStorage.removeItem(registro.key);else localStorage.setItem(registro.key,registro.previous);}catch{}}
  status('No se pudo completar el reinicio: '+e.message);
 }finally{busy=false;controls();}
};
$('actualizarRondas').onclick=loadDate;setInterval(()=>{if(user&&!config&&!busy&&!esperandoNuevoSorteo&&!document.hidden)loadDate();},12000);
$('fecha').onchange=()=>{autoFecha=false;esperandoNuevoSorteo=false;if(user)localStorage.removeItem('envivo-esperando-fecha:'+user.id);loadDate();};$('youtube').oninput=()=>{if(config&&user)localStorage.setItem('envivo-youtube:'+user.id+':'+config.fecha+':'+config.source,$('youtube').value);};
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
$('corregir').onclick=async()=>{if(busy||!draft.sent||!confirm('¿Corregir o agregar ganadores? Pagos recibirá una nueva versión y revisará los cambios.'))return;draft.id=C.uuid();draft.sent=false;await save();paint();status('Corrige las capturas o agrega otro ganador y vuelve a enviar.');};
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
 const anterior=rows.find(e=>e.ronda===selected);
 if(anterior&&capturaAnterior(anterior)&&!confirm('Esta misma fecha tiene una captura anterior enviada a Pagos. Al enviar una nueva se creará una revisión para esta ronda. ¿Continuar?'))return;
 busy=true;controls();try{
 if(draft.cards.some(c=>/[;,]/.test(c.numeros||'')))await revisarCapturasGuardadas();
 const capturas=capturasValidadas(),youtube=TransmisionYouTube.parse($('youtube').value).url;
 const {data:a,error:ae}=await client.auth.getSession();if(ae||a?.session?.user?.id!==user.id)throw Error('Verifica tu acceso de nuevo.');
 for(let i=0;i<draft.cards.length;i++){const c=draft.cards[i];if(!c.ruta){c.ruta=user.id+'/'+config.fecha+'/'+C.uuid()+'.jpg';await save();}capturas[i].ruta=c.ruta;if(c.uploaded)continue;status('Subiendo captura '+(i+1)+' de '+capturas.length+'…');const{error}=await client.storage.from(BUCKET).upload(c.ruta,c.blob,{contentType:'image/jpeg',upsert:false});if(error){const r=await client.storage.from(BUCKET).download(c.ruta);if(r.error||r.data?.size!==c.blob.size)throw error;const [a,b]=await Promise.all([r.data.arrayBuffer(),c.blob.arrayBuffer()]);const aa=new Uint8Array(a),bb=new Uint8Array(b);if(!aa.every((v,j)=>v===bb[j]))throw Error('La captura existente no coincide. Revisa el envío.');}c.uploaded=true;await save();}
 status('Enviando ganadores a pagos…');draft.uncertain=true;draft.youtube=youtube;await save();const row=await rpc('en_vivo_enviar',{p_id:draft.id,p_fecha:config.fecha,p_source:config.source,p_ronda:selected,p_revision:draft.baseRevision,p_youtube:youtube,p_capturas:capturas});if(row.id!==draft.id)throw Error('No se confirmó el envío. Reintenta sin cambiar las capturas.');draft.sent=true;draft.uncertain=false;draft.baseRevision=row.revision;rows=rows.filter(e=>e.ronda!==selected).concat(row);await save();paint();status('Enviado ✓ · Los ganadores ya llegaron a pagos.');
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
async function session(){const{data}=await client.auth.getSession();const next=data?.session?.user||null;if(next?.id===user?.id&&user)return;user=next;++turno;draft=null;config=null;rows=[];activeCard=null;release();$('trabajo').hidden=!user;$('salir').hidden=!user;$('acceso').open=!user;$('capturas').replaceChildren();if(user){$('email').value=user.email;esperandoNuevoSorteo=localStorage.getItem('envivo-esperando-fecha:'+user.id)==='1';if(esperandoNuevoSorteo){autoFecha=false;$('fecha').value='';notice('Selecciona la fecha del nuevo sorteo para empezar.');}else await loadDate();}else notice('Verifica tu correo autorizado para comenzar.');}
let fechaInicial;try{fechaInicial=C.fecha(new URL(location.href).searchParams.get('fecha'));}catch{}
autoFecha=!fechaInicial;$('fecha').value=fechaInicial||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Caracas',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
client.auth.onAuthStateChange(()=>setTimeout(session,0));session();if(navigator.serviceWorker?.register)navigator.serviceWorker.register('sw.js',{scope:'./'}).catch(()=>{});
})();
