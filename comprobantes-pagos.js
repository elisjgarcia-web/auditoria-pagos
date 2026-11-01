(function(){
 'use strict';
 const estados=new Map(),grupos=new WeakMap();let dbPromise,activo=null,activoTipo="pago",secuencia=0;
 function abrirDB(){
  if(!window.indexedDB)return Promise.reject(Error('Almacenamiento no disponible'));
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open('bingo-comprobantes-premios',1);r.onupgradeneeded=()=>r.result.createObjectStore('recibos',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Almacenamiento ocupado'));});
  return dbPromise;
 }
 async function almacenar(action,value){const db=await abrirDB();return new Promise((resolve,reject)=>{const tx=db.transaction('recibos',action==='get'?'readonly':'readwrite'),s=tx.objectStore('recibos'),merge=action==='mergePago'||action==='mergeResultado',r=action==='get'?s.get(value):merge?s.get(value.key):action==='put'?s.put(value):s.clear();let result;r.onsuccess=()=>{result=r.result;if(merge){const anterior=r.result||{key:value.key};s.put(action==='mergePago'?{...anterior,blob:value.blob,masks:value.masks}:{...anterior,resultado:value.resultado});}};tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error||Error('No se pudo guardar'));});}
 function clave(p,c){return JSON.stringify([String(c.source||''),String(c.fecha||''),c.tipo,String(p.carton||''),String(p.x?.cedulaCompra||p.nombre||p.x?.nombre||''),Number(p.monto)||0]);}
 function el(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text)n.textContent=text;return n;}
 function aviso(s,text){s.message=text;for(const v of s.views)if(v.wrap.isConnected)v.status.textContent=text;}
 function avisoResultado(s,text){s.resultMsg=text;for(const v of s.views)if(v.wrap.isConnected)v.resultStatus.textContent=text;}
 function persistir(s,tipo='pago'){return almacenar(tipo==='resultado'?'mergeResultado':'mergePago',{key:s.key,blob:s.blob,masks:s.masks.map(m=>({...m})),resultado:s.resultBlob});}
 function listo(s){return !!(s.image&&s.masks.length===2&&!s.busy&&s.file);}
 function actualizar(s){for(const v of [...s.views]){if(!v.wrap.isConnected){s.views.delete(v);continue;}v.share.disabled=!listo(s);v.paste.disabled=!!s.busy;v.resultPaste.disabled=!!s.resultBusy;v.resultCanvas.hidden=!s.resultado;if(s.resultado){v.resultCanvas.width=s.resultado.width;v.resultCanvas.height=s.resultado.height;v.resultCanvas.getContext("2d").drawImage(s.resultado,0,0);}v.canvas.hidden=!s.image;if(s.image)pintar(s,v.canvas);}for(const g of s.groups){if(!g.button?.isConnected)s.groups.delete(g);else actualizarGrupo(g);}}
 function actualizarGrupo(g){if(!g.button)return;const n=g.states.filter(listo).length;g.button.disabled=n!==g.states.length||g.states.some(s=>s.busy);g.status.textContent=n+' de '+g.states.length+' comprobantes listos.';}
 function pintar(s,canvas){
  const W=s.image.width,H=s.image.height;canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d');ctx.drawImage(s.image,0,0,W,H);
  for(const m of s.masks){ctx.fillStyle='#43194e';ctx.fillRect(m.x*W,m.y*H,m.w*W,m.h*H);}
  // El nombre se escribe en el espacio blanco derecho del formato Mercantil.
  const centerX=W*.755,centerY=H*.515,name='🎉 '+s.nombre;let size=Math.round(W*.039);ctx.textAlign='center';ctx.font='700 '+size+'px system-ui';while(ctx.measureText(name).width>W*.39&&size>10){size--;ctx.font='700 '+size+'px system-ui';}ctx.fillStyle='#43194e';ctx.fillText(name,centerX,centerY);
  const detail=(s.carton?(/^\d+$/.test(s.carton)?'Cartón '+s.carton:s.carton)+' · ':'')+s.context.titulo;let detailSize=Math.round(W*.022);ctx.font='600 '+detailSize+'px system-ui';while(ctx.measureText(detail).width>W*.34&&detailSize>9){detailSize--;ctx.font='600 '+detailSize+'px system-ui';}
  const iconSize=W*.028,gap=W*.009,total=iconSize+gap+ctx.measureText(detail).width,left=centerX-total/2,baseline=centerY+W*.045;ctx.fillStyle='#fff7df';ctx.fillRect(left,baseline-iconSize,iconSize,iconSize);ctx.strokeStyle='#8a6323';ctx.lineWidth=Math.max(1,W*.0012);ctx.strokeRect(left,baseline-iconSize,iconSize,iconSize);ctx.beginPath();for(let i=1;i<5;i++){ctx.moveTo(left+iconSize*i/5,baseline-iconSize);ctx.lineTo(left+iconSize*i/5,baseline);ctx.moveTo(left,baseline-iconSize+iconSize*i/5);ctx.lineTo(left+iconSize,baseline-iconSize+iconSize*i/5);}ctx.stroke();ctx.fillStyle='#43194e';ctx.fillRect(left+iconSize*2/5,baseline-iconSize*3/5,iconSize/5,iconSize/5);ctx.textAlign='left';ctx.fillText(detail,left+iconSize+gap,baseline);
  [[-.17,-.075,.4],[-.11,-.095,-.4],[.10,-.09,.7],[.17,-.065,-.6],[-.18,.025,-.3],[.18,.035,.5],[-.15,.075,.6],[.14,.085,-.5]].forEach(([dx,dy,angle],i)=>{ctx.save();ctx.translate(centerX+W*dx,centerY+W*dy);ctx.rotate(angle);ctx.fillStyle=i%2?'#c49b4b':'#6b3378';ctx.fillRect(-W*.0025,-W*.005,W*.005,W*.01);ctx.restore();});
 }
 function blobCanvas(c){return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('No se pudo preparar la imagen')),'image/png'));}
 async function imagenBlob(blob){const url=URL.createObjectURL(blob);try{return await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('No se pudo abrir la captura'));i.src=url;});}finally{URL.revokeObjectURL(url);}}
 async function guardar(s){if(s.cancelled)return;const revision=++s.revision;s.file=null;actualizar(s);try{const out=document.createElement('canvas');pintar(s,out);const b=await blobCanvas(out);if(revision!==s.revision||s.cancelled)return;s.file=new File([b],'premio-'+String(s.carton||'ganador').replace(/[^a-z0-9-]/gi,'-')+'.png',{type:'image/png'});try{await persistir(s);if(revision===s.revision)aviso(s,'Captura guardada en este dispositivo. Revisa la cobertura antes de compartir.');}catch{if(revision===s.revision)aviso(s,'Captura lista. No se pudo guardar en este dispositivo; mantenla abierta hasta compartir.');}}catch(e){aviso(s,e.message);}finally{actualizar(s);}}
 async function cargar(s,file){
  if(!file)return;await s.restauracion;if(s.busy||s.cancelled)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){aviso(s,'Usa una captura JPG, PNG o WebP.');return;}
  if(file.size>20*1024*1024){aviso(s,'Selecciona una captura de menos de 20 MB.');return;}
  if(s.image&&!confirm('¿Reemplazar el comprobante de '+s.nombre+'?'))return;
  s.busy=true;actualizar(s);aviso(s,'Preparando captura…');
  try{const img=await imagenBlob(file);if(s.cancelled)return;if(img.width*img.height>40000000)throw Error('La captura es demasiado grande.');const c=document.createElement('canvas'),scale=Math.min(1,1200/img.width,2600/img.height);c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);const blob=await blobCanvas(c);if(s.cancelled)return;s.image=c;s.blob=blob;s.masks=localizarDatos(c);await guardar(s);if(s.masks.length!==2){s.file=null;aviso(s,'No reconocí las filas de este formato. Toca la primera mitad del teléfono y luego la de la cédula para colocar los bloques.');}}
  catch(e){aviso(s,e.message||'No se pudo abrir la captura.');}finally{s.busy=false;actualizar(s);}
 }
 function punto(e,canvas){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};}
 function ajustarCobertura(s,canvas){let drag=null;
  canvas.onpointerdown=e=>{if(!s.image||s.busy)return;activo=s;const p=punto(e,canvas);for(let i=s.masks.length-1;i>=0;i--){const m=s.masks[i];if(p.x>=m.x&&p.x<=m.x+m.w&&p.y>=m.y&&p.y<=m.y+m.h){drag={i,dx:p.x-m.x,dy:p.y-m.y};s.file=null;canvas.setPointerCapture?.(e.pointerId);e.preventDefault();actualizar(s);return;}}if(s.masks.length<2){s.masks.push({x:Math.max(0,Math.min(.86,p.x)),y:Math.max(0,Math.min(.975,p.y-.01)),w:.14,h:.025});actualizar(s);if(s.masks.length===2)guardar(s);else aviso(s,'Ahora toca sobre los primeros dígitos de la cédula.');}};
  canvas.onpointermove=e=>{if(!drag)return;const p=punto(e,canvas),m=s.masks[drag.i];m.x=Math.max(0,Math.min(1-m.w,p.x-drag.dx));m.y=Math.max(0,Math.min(1-m.h,p.y-drag.dy));for(const v of s.views)if(v.wrap.isConnected)pintar(s,v.canvas);};
  canvas.onpointerup=canvas.onpointercancel=()=>{if(drag){drag=null;guardar(s);}};
 }
 function descargar(file){const a=el('a'),url=URL.createObjectURL(file);a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 async function compartir(file,status){try{if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Bingo Andino 75 · Comprobantes'});status('Imagen preparada para compartir.');return;}catch(e){if(e.name==='AbortError'){status('Compartir cancelado.');return;}if(e.name!=='NotAllowedError')throw e;}}descargar(file);status('Imagen descargada. Adjunta ese archivo en WhatsApp.');}catch{status('No se pudo compartir la imagen. Intenta de nuevo.');}}
 async function cargarResultado(s,file){
  if(!file)return false;await s.restauracion;if(s.resultBusy||s.cancelled)return false;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024){avisoResultado(s,'Usa una captura JPG, PNG o WebP de menos de 20 MB.');return false;}
  if(s.resultado&&!confirm('¿Reemplazar el resultado de '+s.nombre+'?'))return false;
  const revision=++s.resultRevision;s.resultBusy=true;actualizar(s);avisoResultado(s,'Preparando resultado de '+s.nombre+'…');
  try{const img=await imagenBlob(file);if(s.cancelled||revision!==s.resultRevision)return false;if(img.width*img.height>40000000)throw Error('La imagen es demasiado grande.');const c=document.createElement('canvas'),scale=Math.min(1,1600/img.width,2600/img.height);c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);const blob=await blobCanvas(c);if(s.cancelled||revision!==s.resultRevision)return false;s.resultado=c;s.resultBlob=blob;try{await persistir(s,'resultado');avisoResultado(s,'Resultado guardado para '+s.nombre+' · Cartón '+s.carton+'. Revisa que sea la imagen correcta del bingo.');}catch{avisoResultado(s,'Resultado listo, pero no se pudo guardar en este dispositivo. Mantenlo abierto.');}return true;}
  catch(e){avisoResultado(s,e.message||'No se pudo abrir el resultado.');return false;}finally{s.resultBusy=false;actualizar(s);}
 }
 async function pegar(s,input,tipo='pago'){if(s.cancelled||(tipo==='resultado'?s.resultBusy:s.busy))return;activo=s;activoTipo=tipo;const cargarArchivo=file=>tipo==='resultado'?cargarResultado(s,file):cargar(s,file);const informar=text=>tipo==='resultado'?avisoResultado(s,text):aviso(s,text);try{if(!navigator.clipboard?.read)throw Error();const items=await navigator.clipboard.read();for(const item of items){const type=item.types.find(t=>['image/png','image/jpeg','image/webp'].includes(t));if(type){await cargarArchivo(await item.getType(type));return;}}informar('No hay una imagen copiada. Selecciona la captura desde tus fotos.');}catch{informar('No se pudo pegar desde el portapapeles. Selecciona la captura desde tus fotos.');}input.click();}
 function obtenerEstado(p,context){const key=clave(p,context);let s=estados.get(key);if(s){const nombre=String(p.nombre||p.x?.nombre||'Ganador').trim(),changed=nombre!==s.nombre||context.titulo!==s.context.titulo;s.context=context;s.nombre=nombre;if(changed&&s.image)guardar(s);return s;}
  s={id:++secuencia,key,context,nombre:String(p.nombre||p.x?.nombre||'Ganador').trim(),carton:String(p.carton||''),masks:[],views:new Set(),groups:new Set(),busy:false,revision:0,resultRevision:0,resultBusy:false,resultado:null,resultBlob:null,resultMsg:"Resultado del bingo de este ganador.",cancelled:false,file:null,image:null,blob:null,message:'Pega el comprobante de este ganador. Se conserva la foto original.'};estados.set(key,s);
  s.restauracion=(async()=>{try{const r=await almacenar('get',key);if(!r||s.revision||s.busy||s.resultRevision||s.resultBusy||s.cancelled)return;
   const pago=r.blob?await imagenBlob(r.blob):null,resultado=r.resultado?await imagenBlob(r.resultado):null;
   if(s.revision||s.busy||s.resultRevision||s.resultBusy||s.cancelled)return;
   if(pago){s.image=pago;s.blob=r.blob;s.masks=Array.isArray(r.masks)?r.masks.filter(m=>['x','y','w','h'].every(k=>Number.isFinite(m[k]))&&m.x>=0&&m.y>=0&&m.w>0&&m.h>0&&m.x+m.w<=1.001&&m.y+m.h<=1.001).slice(0,2):[];const c=document.createElement('canvas');pintar(s,c);s.file=s.masks.length===2?new File([await blobCanvas(c)],'premio-'+s.carton+'.png',{type:'image/png'}):null;aviso(s,'Comprobante recuperado de este dispositivo. Revisa antes de compartir.');}
   if(resultado){s.resultado=resultado;s.resultBlob=r.resultado;avisoResultado(s,'Resultado recuperado para '+s.nombre+' · Cartón '+s.carton+'.');}actualizar(s);
  }catch{/* No hay copia local disponible. */}})();return s;
 }
 function agregarGanador(cont,p,context){if(!p.x)return;const s=obtenerEstado(p,context),wrap=el('div','recibo-pago');wrap.dataset.reciboKey=s.key;
  const owner=el('p','small recibo-titular',s.nombre+' · '+(s.carton?'Cartón '+s.carton:context.titulo)),buttons=el('div','recibo-acciones'),resultPaste=el('button','copy recibo-pegar-resultado','📋 Pegar resultado'),paste=el('button','copy recibo-pegar-pago','📋 Pegar comprobante'),share=el('button','sec recibo-compartir','Compartir comprobante ↗'),input=el('input','recibo-pago-input'),resultInput=el('input','recibo-resultado-input'),canvas=el('canvas','recibo-vista recibo-pago-vista'),resultCanvas=el('canvas','recibo-vista recibo-resultado-vista'),status=el('p','small recibo-estado',s.message),resultStatus=el('p','small recibo-resultado-estado',s.resultMsg);
  for(const b of [resultPaste,paste,share])b.type='button';resultPaste.dataset.reciboTipo='resultado';paste.dataset.reciboTipo='pago';resultCanvas.dataset.reciboTipo='resultado';canvas.dataset.reciboTipo='pago';resultPaste.setAttribute('aria-label','Pegar resultado del bingo de '+s.nombre);paste.setAttribute('aria-label','Pegar comprobante de pago de '+s.nombre);share.setAttribute('aria-label','Compartir comprobante de '+s.nombre);
  for(const f of [input,resultInput]){f.type='file';f.accept='image/png,image/jpeg,image/webp';f.hidden=true;}share.disabled=true;canvas.hidden=resultCanvas.hidden=true;canvas.setAttribute('aria-label','Comprobante de '+s.nombre+'; arrastra los bloques para ajustar la cobertura');resultCanvas.setAttribute('aria-label','Resultado del bingo de '+s.nombre+' · Cartón '+s.carton);for(const st of [status,resultStatus]){st.setAttribute('role','status');st.setAttribute('aria-live','polite');}
  buttons.append(resultPaste,paste);wrap.append(owner,buttons,resultInput,input,resultCanvas,resultStatus,canvas,status,share);cont.append(wrap);s.views.add({wrap,paste,share,canvas,status,resultPaste,resultCanvas,resultStatus});
  resultPaste.onclick=()=>pegar(s,resultInput,'resultado');paste.onclick=()=>pegar(s,input,'pago');resultInput.onchange=()=>{const file=resultInput.files[0];resultInput.value='';cargarResultado(s,file);};input.onchange=()=>{const file=input.files[0];input.value='';cargar(s,file);};wrap.addEventListener('focusin',e=>{activo=s;const tipo=e.target?.dataset?.reciboTipo;if(tipo)activoTipo=tipo;});share.onclick=async()=>{if(!listo(s))return;if(!confirm('¿Revisaste que este comprobante corresponde a '+s.nombre+' y cubre la primera mitad del teléfono y la cédula?'))return;await compartir(s.file,t=>aviso(s,t));};ajustarCobertura(s,canvas);actualizar(s);return s;
 }
 function lienzoPago(s){const c=document.createElement('canvas');pintar(s,c);return c;}
 function pareja(s){const pago=lienzoPago(s);if(!s.resultado)return pago;const r=s.resultado,W=Math.min(1200,Math.max(r.width,pago.width)),header=Math.round(W*.1),rh=Math.round(W*r.height/r.width),ph=Math.round(W*pago.height/pago.width),height=header+rh+ph+8,scale=Math.min(1,12000/height,Math.sqrt(16000000/(W*height))),c=document.createElement('canvas');c.width=Math.floor(W*scale);c.height=Math.floor(height*scale);const ctx=c.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#43194e';ctx.fillRect(0,0,W,height);ctx.textAlign='center';ctx.fillStyle='#fffaf0';ctx.font='700 '+Math.round(W*.035)+'px system-ui';ctx.fillText(s.nombre+' · Cartón '+s.carton,W/2,header*.44,W*.94);ctx.font='600 '+Math.round(W*.022)+'px system-ui';ctx.fillStyle='#e4c585';ctx.fillText(s.context.titulo+' · Resultado y pago',W/2,header*.8,W*.94);ctx.drawImage(r,0,header,W,rh);ctx.drawImage(pago,0,header+rh+8,W,ph);return c;}
 function layout(sizes){const cols=sizes.length>6?3:2,gap=24,pad=24,header=110,cell=900,rows=[];for(let i=0;i<sizes.length;i+=cols)rows.push(Math.max(...sizes.slice(i,i+cols).map(s=>cell*s.height/s.width)));const width=pad*2+cols*cell+gap*(cols-1),height=header+pad+rows.reduce((a,b)=>a+b,0)+gap*Math.max(0,rows.length-1),scale=Math.min(1,12000/height,Math.sqrt(16000000/(width*height)));return {cols,gap,pad,header,cell,rows,width,height,scale};}
 async function collage(g){const images=g.states.map(s=>g.parejas?pareja(s):lienzoPago(s)),l=layout(images),c=document.createElement('canvas');c.width=Math.max(1,Math.floor(l.width*l.scale));c.height=Math.max(1,Math.floor(l.height*l.scale));const ctx=c.getContext('2d');ctx.scale(l.scale,l.scale);ctx.fillStyle='#fffaf0';ctx.fillRect(0,0,l.width,l.height);ctx.fillStyle='#43194e';ctx.fillRect(0,0,l.width,l.header);ctx.fillStyle='#fffaf0';ctx.textAlign='center';ctx.font='700 32px system-ui';ctx.fillText('COMPROBANTES · '+g.context.titulo,l.width/2,47,l.width-48);ctx.font='22px system-ui';ctx.fillStyle='#e4c585';ctx.fillText('BINGO ANDINO 75 · '+g.context.fecha,l.width/2,83,l.width-48);let y=l.header;images.forEach((img,i)=>{const row=Math.floor(i/l.cols),col=i%l.cols;if(i&&col===0)y+=l.rows[row-1]+l.gap;const remaining=Math.min(l.cols,images.length-row*l.cols),offset=(l.cols-remaining)*(l.cell+l.gap)/2;ctx.drawImage(img,l.pad+offset+col*(l.cell+l.gap),y,l.cell,l.cell*img.height/img.width);});return new File([await blobCanvas(c)],'comprobantes-'+g.context.tipo+'.png',{type:'image/png'});}
 function finalizarRonda(cont,pagos,context){const old=grupos.get(cont);if(old)for(const s of old.states)s.groups.delete(old);const states=pagos.filter(p=>p.x).map(p=>obtenerEstado(p,context));if(states.length<2)return;const wrap=el('div','recibo-grupo'),button=el('button','copy','🖼️ Compartir comprobantes de esta ronda'),status=el('p','small');button.type='button';status.setAttribute('role','status');wrap.append(button,status);cont.append(wrap);const g={states,context,button,status};grupos.set(cont,g);for(const s of states)s.groups.add(g);actualizarGrupo(g);button.onclick=async()=>{if(button.disabled)return;if(!confirm('¿Revisaste los '+states.length+' comprobantes de '+context.titulo+' y la cobertura de sus datos?'))return;button.disabled=true;status.textContent='Uniendo comprobantes…';try{const file=await collage(g);await compartir(file,t=>{status.textContent=t;});}catch{status.textContent='No se pudo preparar la imagen conjunta. Puedes compartir cada comprobante por separado.';}finally{button.disabled=!states.every(listo);}};}
 document.addEventListener('paste',e=>{const key=e.target?.closest?.('[data-recibo-key]')?.dataset.reciboKey,s=key?estados.get(key):activo;if(!s||![...s.views].some(v=>v.wrap.isConnected))return;const item=Array.from(e.clipboardData?.items||[]).find(x=>x.type.startsWith('image/'));if(item){e.preventDefault();const tipo=e.target?.dataset?.reciboTipo||activoTipo;if(tipo==='resultado')cargarResultado(s,item.getAsFile());else cargar(s,item.getAsFile());}});
 async function limpiar(){for(const s of estados.values()){s.cancelled=true;s.revision++;s.resultRevision++;s.image=null;s.file=null;s.blob=null;s.resultado=null;s.resultBlob=null;s.masks=[];actualizar(s);}estados.clear();activo=null;try{await almacenar('clear');}catch{}}
 function fechaRecibos(text){return window.ResultadosPublicos.fechaISO(text);}
 function activosDia(fecha){return [...estados.values()].filter(s=>[...s.views].some(v=>v.wrap.isConnected)&&fechaRecibos(s.context.fecha)===fecha);}
 function firmaDia(fecha){return JSON.stringify(activosDia(fecha).map(s=>[s.id,s.revision,s.resultRevision,s.busy,s.resultBusy,!!s.file,!!s.resultado,s.nombre,s.context.titulo,s.masks]));}
 function jpeg(canvas,quality){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('No se pudo preparar la imagen pública.')),'image/jpeg',quality));}
 async function prepararDia(fecha){
  fecha=fechaRecibos(fecha);const states=activosDia(fecha);if(!states.length)throw Error('Primero genera los pagos de esta fecha y pega sus comprobantes.');
  await Promise.all(states.map(s=>s.restauracion));
  const faltantes=states.filter(s=>!listo(s)||s.resultBusy);if(faltantes.length)throw Error('Falta pegar o revisar: '+faltantes.map(s=>s.nombre+' ('+s.context.titulo+')').join(', '));
  const sinResultado=states.filter(s=>/^pagosBtns\d+$/.test(s.context.tipo)&&(!s.resultado||s.resultBusy));if(sinResultado.length)throw Error('Falta pegar el resultado del bingo de: '+sinResultado.map(s=>s.nombre+' ('+s.context.titulo+')').join(', '));
  const firma=firmaDia(fecha),groups=new Map();for(const s of states){if(!groups.has(s.context.tipo))groups.set(s.context.tipo,[]);groups.get(s.context.tipo).push(s);}
  const orden=tipo=>Number(tipo.match(/^pagosBtns(\d+)$/)?.[1]||({pagosBtnsPozo:90,pagosBtnsCon:100,pagosBtnsTop:110}[tipo]||120));const imagenes=[];
  for(const [ronda,ss] of [...groups].sort((a,b)=>orden(a[0])-orden(b[0]))){
   let c=document.createElement('canvas');if(ss.length===1)c=pareja(ss[0]);else{const f=await collage({states:ss,context:ss[0].context,parejas:true}),i=await imagenBlob(f);c.width=i.width;c.height=i.height;c.getContext('2d').drawImage(i,0,0);}
   const thumb=document.createElement('canvas'),scale=Math.min(1,420/c.width,600/c.height);thumb.width=Math.max(1,Math.round(c.width*scale));thumb.height=Math.max(1,Math.round(c.height*scale));thumb.getContext('2d').drawImage(c,0,0,thumb.width,thumb.height);
   const blob=await jpeg(c,.88),miniatura=await jpeg(thumb,.8);if(blob.size>8388608)throw Error('Una imagen es demasiado pesada para publicar.');
   imagenes.push({ronda,titulo:ss[0].context.titulo,ancho:c.width,alto:c.height,ganadores:ss.map(s=>({nombre:s.nombre,carton:s.carton})),blob,miniatura});
  }
  if(firmaDia(fecha)!==firma)throw Error('Los comprobantes cambiaron. Genera otra vista previa.');
  return {fecha,firma,imagenes};
 }
 async function recibirResultado({tipo,carton,fecha,source,blob,reemplazar=true}){
 const lista=[...estados.values()].filter(s=>s.context.tipo===tipo&&s.carton===String(carton)&&fechaRecibos(s.context.fecha)===fecha&&String(s.context.source||'')===String(source||'')&&[...s.views].some(v=>v.wrap.isConnected));
 if(lista.length!==1)throw Error('No hay un único ganador listo para adjuntar el resultado del cartón '+carton+'.');
 const s=lista[0];await s.restauracion;if(s.resultBusy||s.cancelled)throw Error('Espera a que termine de cargar el resultado.');if(!reemplazar&&s.resultado)throw Error('Ya hay una captura guardada para este ganador. Revisa el envío.');const ok=await cargarResultado(s,blob);if(!ok)throw Error('No se adjuntó el resultado del cartón '+carton+'.');
 }
 window.ComprobantesPagos=Object.freeze({agregarGanador,finalizarRonda,limpiar,prepararDia,firmaDia,recibirResultado});
function localizarDatos(imagen){
 const w=imagen.width,h=imagen.height,p=imagen.getContext('2d').getImageData(0,0,w,h).data;
 const bands=[];let last=-100,current=null;
 for(let y=Math.floor(h*.22);y<Math.floor(h*.88);y++){
  let blue=0,white=0,total=0;
  for(let x=Math.floor(w*.02);x<Math.floor(w*.55);x++){const i=(y*w+x)*4,r=p[i],g=p[i+1],b=p[i+2];if(b>r+25&&g>r+12&&b>g-8&&r<170)blue++;}
  for(let x=Math.floor(w*.65);x<Math.floor(w*.92);x++){const i=(y*w+x)*4;if(Math.min(p[i],p[i+1],p[i+2])>225)white++;total++;}
  if(blue>Math.max(4,w*.009)&&white/total>.88){if(y-last>Math.max(3,Math.floor(h*.003))){current={top:y,bottom:y};bands.push(current)}else current.bottom=y;last=y;}
 }
 const labels=bands.filter(b=>b.bottom-b.top>h*.006);let best=null;
 for(let i=0;i+6<labels.length;i++){
  const rows=labels.slice(i,i+7),gaps=rows.slice(1).map((b,j)=>b.top-rows[j].top),mean=gaps.reduce((a,b)=>a+b,0)/6;
  if(mean<h*.025||mean>h*.12)continue;
  const score=Math.sqrt(gaps.reduce((a,b)=>a+(b-mean)**2,0)/6)/mean;
  if(!best||score<best.score)best={score,rows};
 }
 if(!best||best.score>.12)return [];
 const result=[];
 for(const n of [4,5]){
  let left=w,right=-1,top=h,bottom=-1;
  for(let y=best.rows[n].bottom+2;y<best.rows[n+1].top;y++){
   const xs=[];
   for(let x=Math.floor(w*.02);x<Math.floor(w*.62);x++){const i=(y*w+x)*4,hi=Math.max(p[i],p[i+1],p[i+2]),lo=Math.min(p[i],p[i+1],p[i+2]);if(hi<150&&hi-lo<30)xs.push(x);}
   if(xs.length>Math.max(4,w*.006)){left=Math.min(left,xs[0]);right=Math.max(right,xs[xs.length-1]);top=Math.min(top,y);bottom=y;}
  }
  if(right-left<w*.04||bottom<top)return [];
  const pad=Math.max(2,Math.round(w*.003));
  result.push({x:Math.max(0,left-pad)/w,y:Math.max(0,top-pad)/h,w:Math.min(w-left,Math.ceil((right-left+1)/2)+pad*2)/w,h:(bottom-top+1+pad*2)/h});
 }
 return result;
}
})();

