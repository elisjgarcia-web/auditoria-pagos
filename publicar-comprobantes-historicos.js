/* Publicación histórica de premios pagados · Bingo Andino 75
 * Separa estado, fotos y publicaciones de las rondas y compras activas.
 * Solo se suben composiciones JPEG con datos bancarios cubiertos.
 * La publicación necesita revisión explícita y RPC de autorización. */
(function(){
'use strict';
const $=id=>document.getElementById(id),BUCKET='premios-pagados',CAPTURAS='ganadores-en-vivo';
if(!$('histPubBuscar')||typeof supa==='undefined')return;
const root=$('histPubRaiz'),dia=$('histPubFecha'),buscar=$('histPubBuscar'),estado=$('histPubEstado');
const lista=$('histPubLista'),acciones=$('histPubAcciones'),previa=$('histPubPrevia'),visor=$('histPubDialogo');
const editor=$('histPubEditor'),lienzo=$('histPubLienzo'),editStatus=$('histPubEditEstado'),confirmar=$('histPubConfirmar');
const STORAGE_DB='bingo-andino-historico-recibos-v1',STORAGE_STORE='comprobantes';
const FALLBACK=Object.freeze({
 fecha:'2026-11-10',source:'119691',presentadora:'5121c2ba-c8f1-40f8-8b3e-130a75f60ac5',
 nombres:{
  49:'Elisa Garcia',192:'María Daniela',230:'Tibizay martinez',275:'Atilio zulbaran',
  368:'Mercedes G.',527:'Mercedes Acosta',735:'Betzaida Hernández 🙏🏽',769:'Hilgreg Espinoza',
  872:'Betzaida Hernández 🙏🏽',998:'MARIANGEL MACHADO'
 },
 grupos:[
  {tipo:'ronda',orden:1,ganadores:[{carton:735,premio_centimos:3600000}]},
  {tipo:'ronda',orden:2,ganadores:[{carton:192,premio_centimos:1800000},{carton:872,premio_centimos:1800000}]},
  {tipo:'ronda',orden:3,ganadores:[{carton:49,premio_centimos:3600000}]},
  {tipo:'ronda',orden:4,ganadores:[{carton:998,premio_centimos:3600000}]},
  {tipo:'final',orden:5,ganadores:[{carton:275,premio_centimos:6750000},{carton:769,premio_centimos:6750000}]},
  {tipo:'consolacion',orden:0,ganadores:[{carton:230,premio_centimos:900000},{carton:368,premio_centimos:900000},{carton:527,premio_centimos:900000}]}
 ],
 archivos:[
  [1,'96a84d3f-54e4-4028-b99e-83aaaa1c1aae',735],
  [2,'6b2f5f7f-2d65-4aa4-9a9b-e29019659f3b',192],
  [2,'bcdfdea5-6d1e-4382-bd4d-c099b2c2c6cb',872],
  [3,'7626d845-ed26-4f41-855c-f627b9dc6866',49],
  [4,'d6a0f128-088e-467d-8f5f-5f4357e8e5a9',998],
  [5,'2aa39121-ae5f-4735-82e0-7b6d0720b393',275],
  [5,'319e9092-9b38-4030-9a30-e817042fc862',769]
 ]
});
let fechaActual='',grupos=[],personas=[],resultados=new Map(),comprobantes=new Map(),preparadas=null,ocupado=false,token=0,objetos=[],dbPromise=null,editando=null,inicio=null;
const titulo=g=>g.tipo==='ronda'?g.orden+'ª RONDA':g.tipo==='final'?'CARTÓN LLENO FINAL':g.tipo==='consolacion'?'CONSOLACIÓN':g.tipo==='pozo'?'POZO ACUMULADO':'PREMIO ESPECIAL';
const claveGrupo=g=>g.tipo==='ronda'?'ronda'+g.orden:g.tipo;
const premio=n=>'Bs '+(Number(n||0)/100).toLocaleString('es-VE',{maximumFractionDigits:2});
const aviso=t=>{estado.textContent=t;};
const avisoEditor=t=>{editStatus.textContent=t;};
function fechaOk(f){return /^20\d{2}-\d{2}-\d{2}$/.test(f)&&new Date(f+'T12:00:00Z').toISOString().slice(0,10)===f;}
function bloquear(b){ocupado=b;for(const e of [buscar,dia,$('histPubPreparar'),confirmar])if(e)e.disabled=b;for(const e of lista.querySelectorAll('button,input'))e.disabled=b;}
function soltarObjetos(){for(const u of objetos)URL.revokeObjectURL(u);objetos=[];}
function limpiar(){grupos=[];personas=[];resultados.clear();comprobantes.clear();preparadas=null;lista.replaceChildren();acciones.hidden=true;previa.replaceChildren();soltarObjetos();$('histPubConfirmacion').checked=false;}
async function sesion(){
 const {data,error}=await supa.auth.getSession();
 if(error||!data?.session?.access_token)throw Error('Primero inicia sesión en la app de Pagos con tu correo autorizado.');
 return data.session;
}
function leerIDB(){
 if(!('indexedDB' in window))return Promise.reject(Error('Almacenamiento local no disponible'));
 if(!dbPromise)dbPromise=new Promise((ok,no)=>{
  const req=indexedDB.open(STORAGE_DB,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORAGE_STORE))req.result.createObjectStore(STORAGE_STORE,{keyPath:'key'});};
  req.onsuccess=()=>ok(req.result);req.onerror=()=>no(req.error||Error('Error de almacenamiento'));req.onblocked=()=>no(Error('Almacenamiento bloqueado'));
 });
 return dbPromise;
}
async function idb(accion,key,dato){
 const db=await leerIDB();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORAGE_STORE,accion==='get'?'readonly':'readwrite'),store=tx.objectStore(STORAGE_STORE);
  const req=accion==='get'?store.get(key):store.put({key,...dato});
  req.onsuccess=()=>resolve(req.result);
  tx.onabort=tx.onerror=()=>reject(tx.error||Error('No se pudo guardar localmente'));
 });
}
function validMasks(m){
 return Array.isArray(m)?m.filter(o=>o&&['x','y','w','h'].every(k=>Number.isFinite(o[k]))&&o.x>=0&&o.y>=0&&o.w>=.006&&o.h>=.006&&o.x+o.w<=1.001&&o.y+o.h<=1.001).slice(0,14):[];
}
async function imagen(blob,maxW=1500,maxH=2800){
 if(!blob||!['image/jpeg','image/png','image/webp'].includes(blob.type)||blob.size>20*1024*1024)throw Error('Usa una imagen JPG, PNG o WebP de hasta 20 MB.');
 const u=URL.createObjectURL(blob);
 try{
  const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(Error('No se pudo leer la foto'));i.src=u;});
  if(img.naturalWidth*img.naturalHeight>40000000)throw Error('La imagen es demasiado grande');
  const factor=Math.min(1,maxW/img.naturalWidth,maxH/img.naturalHeight),c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(img.naturalWidth*factor));c.height=Math.max(1,Math.round(img.naturalHeight*factor));
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  return c;
 }finally{URL.revokeObjectURL(u);}
}
function jpegear(c,q=.83){return new Promise((ok,no)=>c.toBlob(b=>b?ok(b):no(Error('No se pudo preparar la imagen JPG')),'image/jpeg',q));}
function autoCubrir(imagen){
 // Mismo reconocimiento de campos de Mercantil usado por los comprobantes del día.
 const w=imagen.width,h=imagen.height,p=imagen.getContext('2d').getImageData(0,0,w,h).data;
 const bands=[];let last=-100,current=null;
 for(let y=Math.floor(h*.22);y<Math.floor(h*.88);y++){
  let blue=0,white=0,total=0;
  for(let x=Math.floor(w*.02);x<Math.floor(w*.55);x++){const i=(y*w+x)*4,r=p[i],g=p[i+1],b=p[i+2];if(b>r+25&&g>r+12&&b>g-8&&r<170)blue++;}
  for(let x=Math.floor(w*.65);x<Math.floor(w*.92);x++){const i=(y*w+x)*4;if(Math.min(p[i],p[i+1],p[i+2])>225)white++;total++;}
  if(blue>Math.max(4,w*.009)&&white/Math.max(1,total)>.88){
   if(y-last>Math.max(3,Math.floor(h*.003))){current={top:y,bottom:y};bands.push(current);}else current.bottom=y;last=y;
  }
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
function fotoCubierta(canvas,masks){
 const c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height;
 const ctx=c.getContext('2d');ctx.drawImage(canvas,0,0);
 ctx.fillStyle='#32123f';
 for(const m of masks)ctx.fillRect(Math.round(m.x*c.width),Math.round(m.y*c.height),Math.ceil(m.w*c.width),Math.ceil(m.h*c.height));
 return c;
}
function refrescarEditor(){
 if(!editando)return;
 const s=comprobantes.get(editando);
 if(!s?.image)return;
 const c=fotoCubierta(s.image,s.masks);lienzo.width=c.width;lienzo.height=c.height;
 lienzo.getContext('2d').drawImage(c,0,0);
 avisoEditor(s.masks.length+' bloque(s) de privacidad. Arrastra sobre cada número que deba quedar cubierto. Revisa teléfono, cédula y cualquier otro dato sensible.');
 $('histPubEditorAceptar').disabled=s.masks.length<2;
}
function punto(e){
 const rect=lienzo.getBoundingClientRect();
 return {x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))};
}
function aplicarMarca(a,b){
 const s=comprobantes.get(editando);if(!s)return;
 const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.max(.008,Math.abs(b.x-a.x)),h=Math.max(.008,Math.abs(b.y-a.y));
 s.masks.push({x:Math.min(x,1-w),y:Math.min(y,1-h),w,h});s.masks=s.masks.slice(-14);s.reviewed=false;preparadas=null;
 refrescarEditor();
}
lienzo.addEventListener('pointerdown',e=>{
 if(!editando)return;inicio=punto(e);lienzo.setPointerCapture?.(e.pointerId);e.preventDefault();
});
lienzo.addEventListener('pointerup',e=>{
 if(!inicio)return;const b=punto(e),a=inicio;inicio=null;aplicarMarca(a,b);e.preventDefault();
});
lienzo.addEventListener('pointercancel',()=>{inicio=null;});
$('histPubDeshacer').onclick=()=>{const s=comprobantes.get(editando);if(!s)return;s.masks.pop();s.reviewed=false;preparadas=null;refrescarEditor();};
$('histPubLimpiar').onclick=()=>{const s=comprobantes.get(editando);if(!s)return;s.masks=[];s.reviewed=false;preparadas=null;refrescarEditor();};
$('histPubEditorCerrar').onclick=()=>{editor.close();editando=null;};
$('histPubEditorAceptar').onclick=async()=>{
 const k=editando,s=comprobantes.get(k);
 if(!s||s.masks.length<2)return;
 if(!confirm('¿Comprobaste que el teléfono, la cédula y otros datos privados quedaron cubiertos en esta foto?'))return;
 s.reviewed=true;
 try{await idb('put',fechaActual+':'+k,{blob:s.blob,masks:s.masks,reviewed:true});}
 catch(e){avisoEditor('No se pudo guardar en el teléfono: '+e.message);return;}
 editor.close();editando=null;preparadas=null;pintarGanadores();
};
function abrirEditor(carton){
 const s=comprobantes.get(carton);
 if(!s?.image){aviso('Primero selecciona el comprobante de pago de ese ganador.');return;}
 editando=carton;refrescarEditor();editor.showModal();
}
editor.addEventListener('cancel',()=>{editando=null;});
async function cargarComprobante(persona,archivo){
 if(!archivo)return;
 bloquear(true);
 try{
  aviso('Preparando comprobante del cartón '+persona.carton+'…');
  const base=await imagen(archivo,1200,2500),blob=await jpegear(base,.87),masks=autoCubrir(base);
  const s={blob,image:base,masks,reviewed:false};
  comprobantes.set(persona.carton,s);preparadas=null;
  await idb('put',fechaActual+':'+persona.carton,{blob,masks,reviewed:false});
  pintarGanadores();abrirEditor(persona.carton);
  aviso('Comprueba y ajusta la cobertura del cartón '+persona.carton+'.');
 }catch(e){aviso('⚠️ '+(e.message||'No se pudo preparar el comprobante.'));}
 finally{bloquear(false);}
}
function pintarGanadores(){
 const cont=document.createDocumentFragment(),total=personas.length,listos=personas.filter(p=>{
  const s=comprobantes.get(p.carton);return s?.image&&s.reviewed&&s.masks.length>=2;
 }).length;
 $('histPubProgreso').textContent=listos+' de '+total+' comprobantes revisados';
 $('histPubPreparar').disabled=ocupado||listos!==total||total<1;
 for(const g of grupos){
  const grupo=document.createElement('section');grupo.className='hist-pub-grupo';
  const tituloEl=document.createElement('h3');
  tituloEl.textContent=titulo(g)+' · '+g.ganadores.length+' ganador(es)';
  grupo.append(tituloEl);
  for(const p of g.ganadores){
   const s=comprobantes.get(p.carton);
   const tarjeta=document.createElement('div');tarjeta.className='hist-pub-persona';
   const heading=document.createElement('strong');heading.textContent=p.nombre+' · Cartón '+p.carton+' · '+premio(p.premio_centimos);
   const stat=document.createElement('p');
   stat.textContent=s?.reviewed?'✅ Cobertura revisada':s?.image?'⚠️ Debes revisar los datos cubiertos':'📷 Falta adjuntar comprobante de pago';
   const entrada=document.createElement('input');entrada.type='file';entrada.accept='image/png,image/jpeg,image/webp';
   entrada.setAttribute('aria-label','Adjuntar comprobante del cartón '+p.carton);
   entrada.onchange=()=>{const f=entrada.files?.[0];entrada.value='';cargarComprobante(p,f);};
   tarjeta.append(heading,stat,entrada);
   if(s?.image){
    const ver=document.createElement('button');ver.type='button';ver.className='sec';ver.textContent='✏️ Ver y ajustar cobertura';
    ver.onclick=()=>abrirEditor(p.carton);tarjeta.append(ver);
   }
   grupo.append(tarjeta);
  }
  cont.append(grupo);
 }
 lista.replaceChildren(cont);
}
function armarPersonas(datos,nombres){
 const names=new Map();
 for(const n of nombres){const k=Number(n.carton);if(!Number.isInteger(k)||!String(n.nombre||'').trim())throw Error('Falta el nombre de un ganador');if(names.has(k)&&names.get(k)!==n.nombre)throw Error('Hay nombres diferentes para el mismo cartón');names.set(k,String(n.nombre).trim());}
 const gruposLimpios=[],vistos=new Set();
 for(const g of datos.grupos||[]){
  if(!['ronda','final','consolacion','pozo'].includes(g.tipo)||!Array.isArray(g.ganadores)||!g.ganadores.length)continue;
  const grupo={tipo:g.tipo,orden:Number(g.orden)||0,ganadores:[]};
  for(const item of g.ganadores){
   const carton=Number(item.carton),nombre=names.get(carton),monto=Number(item.premio_centimos);
   if(!Number.isInteger(carton)||carton<1||carton>9999||vistos.has(carton)||!nombre||!Number.isInteger(monto)||monto<0)throw Error('Un ganador no coincide con los resultados guardados: '+carton);
   vistos.add(carton);grupo.ganadores.push({carton,nombre,premio_centimos:monto,grupo:claveGrupo(grupo)});
  }
  gruposLimpios.push(grupo);
 }
 if(!gruposLimpios.length||vistos.size>100)throw Error('No hay ganadores históricos válidos para publicar.');
 const ordenar=g=>g.tipo==='ronda'?g.orden:g.tipo==='final'?90:g.tipo==='pozo'?95:100;
 gruposLimpios.sort((a,b)=>ordenar(a)-ordenar(b));
 return gruposLimpios;
}
function agregarImagenesRespaldo(map){
 if(fechaActual!==FALLBACK.fecha)return;
 for(const [ronda,id,carton] of FALLBACK.archivos){
  const key=Number(carton);if(map.has(key))continue;
  map.set(key,FALLBACK.presentadora+'/'+FALLBACK.fecha+'/'+id+'.jpg');
 }
}
async function referenciasCapturas(){
 const map=new Map();
 try{
  const {data,error}=await supa.from('en_vivo_envios')
   .select('fecha,source,ronda,revision,capturas,creado_por').eq('fecha',fechaActual).order('revision',{ascending:false}).limit(200);
  if(error)throw Error(error.message);
  const recientes=new Map();
  for(const fila of data||[]){
   const key=String(fila.source)+':'+fila.ronda;
   if(!recientes.has(key))recientes.set(key,fila);
  }
  for(const fila of recientes.values()){
   for(const cap of fila.capturas||[]){
    for(const raw of cap.cartones||[]){
     const carton=Number(raw);
     if(Number.isInteger(carton)&&!map.has(carton)&&/^[-a-f0-9]{36}\/20\d{2}-\d{2}-\d{2}\/[-a-f0-9]{36}\.jpg$/i.test(String(cap.ruta||''))){
      map.set(carton,cap.ruta);
     }
    }
   }
  }
 }catch(e){if(fechaActual!==FALLBACK.fecha)throw Error('No se pudieron consultar capturas de la presentadora: '+e.message);}
 agregarImagenesRespaldo(map);
 return map;
}
async function cargarHistorial(){
 if(ocupado)return;
 const f=dia.value;if(!fechaOk(f)){aviso('Selecciona una fecha válida.');return;}
 token++;limpiar();bloquear(true);fechaActual=f;
 try{
  await sesion();aviso('Consultando resultados y ganadores guardados del '+f+'…');
  const consulta=await Promise.allSettled([
   supa.from('resultados_publicados').select('resultado').eq('fecha',f).maybeSingle(),
   supa.from('nombres_resultados_publicados').select('carton,nombre').eq('fecha',f).limit(200)
  ]);
  let resultadosFuente, nombresFuente, origen='';
  if(consulta.every(r=>r.status==='fulfilled'&&!r.value.error)&&consulta[0].value.data?.resultado){
   resultadosFuente=consulta[0].value.data.resultado;
   nombresFuente=consulta[1].value.data||[];origen='Historial público confirmado';
  } else if(f===FALLBACK.fecha){
   resultadosFuente={grupos:FALLBACK.grupos};
   nombresFuente=Object.entries(FALLBACK.nombres).map(([carton,nombre])=>({carton:Number(carton),nombre}));
   origen='Respaldo verificado del 10/11/2026 · consultas temporalmente indisponibles';
  }else{
   const err=consulta.find(r=>r.status==='rejected'||r.value?.error);
   throw Error(err?.reason?.message||err?.value?.error?.message||'No existe un historial de ganadores publicado para esta fecha.');
  }
  grupos=armarPersonas(resultadosFuente,nombresFuente);
  personas=grupos.flatMap(g=>g.ganadores);
  resultados=await referenciasCapturas();
  for(const p of personas){
   try{
    const r=await idb('get',f+':'+p.carton);
    if(r?.blob&&validMasks(r.masks).length>=2){
     const img=await imagen(r.blob,1200,2500);
     comprobantes.set(p.carton,{blob:r.blob,image:img,masks:validMasks(r.masks),reviewed:r.reviewed===true});
    }else if(r?.blob){
     comprobantes.set(p.carton,{blob:r.blob,image:await imagen(r.blob,1200,2500),masks:validMasks(r.masks),reviewed:false});
    }
   }catch{} // Si IndexedDB falla, permite seleccionar otra vez la foto.
  }
  pintarGanadores();acciones.hidden=false;
  aviso('✓ '+personas.length+' ganadores recuperados del '+f+'. '+origen+'. Adjunta y revisa sus comprobantes bancarios.');
 }catch(e){limpiar();aviso('⚠️ '+(e.message||'No se pudo consultar la fecha.'));}
 finally{bloquear(false);}
}
function pintarEnMarco(ctx,img,x,y,w,h){
 ctx.fillStyle='#fffaf0';ctx.fillRect(x,y,w,h);
 const factor=Math.min(w/img.width,h/img.height);const ancho=img.width*factor,alto=img.height*factor;
 ctx.drawImage(img,x+(w-ancho)/2,y+(h-alto)/2,ancho,alto);
}
function textoAjustado(ctx,text,x,y,max,tam=34){
 let font=tam;
 do{ctx.font='700 '+font+'px system-ui';font-=2;}while(font>15&&ctx.measureText(text).width>max);
 ctx.fillText(text,x,y,max);
}
async function crearComposicion(g){
 const ganadores=g.ganadores,cols=ganadores.length>1?2:1;
 const tileW=1100,tileH=1660,gap=16,pad=22,head=120,foot=50,rows=Math.ceil(ganadores.length/cols);
 const W=pad*2+cols*tileW+(cols-1)*gap,H=head+pad*2+rows*tileH+(rows-1)*gap+foot;
 if(W*H>16000000||H>12000)throw Error('Demasiados ganadores para una sola imagen. Divide la publicación.');
 const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fffaf0';ctx.fillRect(0,0,W,H);
 ctx.fillStyle='#32123f';ctx.fillRect(0,0,W,head);
 ctx.textAlign='center';ctx.fillStyle='#f2d480';ctx.font='700 43px system-ui';
 ctx.fillText('BINGO ANDINO 75 · '+titulo(g),W/2,51,W-60);
 ctx.font='600 26px system-ui';ctx.fillStyle='#fffaf0';ctx.fillText('Premios pagados · '+fechaActual,W/2,91,W-60);
 for(let i=0;i<ganadores.length;i++){
  const p=ganadores[i],s=comprobantes.get(p.carton),row=Math.floor(i/cols),col=i%cols;
  const x=pad+col*(tileW+gap),y=head+pad+row*(tileH+gap);
  ctx.fillStyle='#f1e5ca';ctx.fillRect(x,y,tileW,tileH);
  ctx.fillStyle='#32123f';ctx.fillRect(x,y,tileW,142);
  ctx.textAlign='center';ctx.fillStyle='#fffaf0';textoAjustado(ctx,p.nombre,x+tileW/2,y+55,tileW-80,38);
  ctx.fillStyle='#e9c66c';ctx.font='700 31px system-ui';ctx.fillText('Cartón '+p.carton+' · '+premio(p.premio_centimos),x+tileW/2,y+104,tileW-70);
  const ruta=resultados.get(p.carton);
  if(ruta){
   let b;
   try{const {data,error}=await supa.storage.from(CAPTURAS).download(ruta);
    if(error||!data)throw Error(error?.message||'No disponible');b=data;
   }catch(e){throw Error('No pude recuperar la captura del cartón '+p.carton+': '+e.message);}
   const img=await imagen(b,1600,2400);
   pintarEnMarco(ctx,img,x+20,y+162,tileW-40,635);
  }else if(g.tipo==='ronda'||g.tipo==='final'){
   throw Error('Falta la captura original de la presentadora del cartón '+p.carton+'. No se publicará incompleto.');
  }else{
   ctx.fillStyle='#45215a';ctx.fillRect(x+20,y+162,tileW-40,635);
   ctx.fillStyle='#e9c66c';ctx.font='700 43px system-ui';ctx.fillText(titulo(g),x+tileW/2,y+460,tileW-100);
   ctx.fillStyle='#fffaf0';ctx.font='26px system-ui';ctx.fillText('Cartón ganador '+p.carton,x+tileW/2,y+517,tileW-100);
  }
  ctx.fillStyle='#32123f';ctx.fillRect(x+20,y+817,tileW-40,46);
  ctx.fillStyle='#fffaf0';ctx.font='700 23px system-ui';ctx.fillText('COMPROBANTE DE PAGO · DATOS PRIVADOS CUBIERTOS',x+tileW/2,y+848,tileW-65);
  if(!s?.reviewed||s.masks.length<2)throw Error('Falta cubrir y revisar el comprobante del cartón '+p.carton);
  pintarEnMarco(ctx,fotoCubierta(s.image,s.masks),x+20,y+877,tileW-40,740);
 }
 ctx.textAlign='center';ctx.font='600 22px system-ui';ctx.fillStyle='#32123f';
 ctx.fillText('Publicación verificada por Bingo Andino 75 · '+fechaActual,W/2,H-23,W-55);
 const thumb=document.createElement('canvas'),factor=Math.min(1,420/W,700/H);
 thumb.width=Math.max(1,Math.round(W*factor));thumb.height=Math.max(1,Math.round(H*factor));
 thumb.getContext('2d').drawImage(canvas,0,0,thumb.width,thumb.height);
 const blob=await jpegear(canvas,.88),miniatura=await jpegear(thumb,.79);
 if(blob.size>8388608||miniatura.size>8388608)throw Error('La imagen de '+titulo(g)+' es demasiado pesada para publicar.');
 return {ronda:claveGrupo(g),titulo:titulo(g),ancho:W,alto:H,ganadores:ganadores.map(p=>({nombre:p.nombre,carton:String(p.carton)})),blob,miniatura};
}
async function consultarPublicacion(){
 const {data,error}=await supa.from('premios_pagados').select('fecha,revision,publicado').eq('fecha',fechaActual).maybeSingle();
 if(error)throw Error('No se pudo verificar si ya está publicado: '+error.message);
 return data;
}
function urlPublico(f){return 'https://bingoandino75.com/premios/?premios='+encodeURIComponent(f);}
async function preparar(){
 if(ocupado||!personas.length)return;
 bloquear(true);preparadas=null;previa.replaceChildren();soltarObjetos();
 try{
  await sesion();
  if(personas.some(p=>{const s=comprobantes.get(p.carton);return !s?.reviewed||s.masks.length<2;}))throw Error('Debes cargar y revisar los comprobantes bancarios de todos los ganadores.');
  aviso('Preparando vista previa pública, sin subir originales…');
  const revision=await consultarPublicacion(),imagenes=[];
  for(let i=0;i<grupos.length;i++){
   aviso('Preparando '+titulo(grupos[i])+' ('+(i+1)+' de '+grupos.length+')…');
   imagenes.push(await crearComposicion(grupos[i]));
  }
  const fragment=document.createDocumentFragment();
  for(const img of imagenes){
   const card=document.createElement('div');card.className='hist-pub-vista';
   const label=document.createElement('strong');label.textContent=img.titulo+' · '+img.ganadores.length+' ganador(es)';
   const photo=document.createElement('img'),u=URL.createObjectURL(img.blob);objetos.push(u);
   photo.src=u;photo.alt='Vista previa de '+img.titulo;photo.style.cssText='width:100%;height:auto;display:block';
   card.append(label,photo);fragment.append(card);
  }
  previa.replaceChildren(fragment);
  preparadas={fecha:fechaActual,revision:revision?.revision||0,imagenes,marcas:personas.map(p=>({carton:p.carton,blob:comprobantes.get(p.carton).blob,masks:JSON.stringify(comprobantes.get(p.carton).masks)}))};
  $('histPubPublicacion').hidden=false;
  $('histPubConfirmacion').checked=false;confirmar.disabled=true;
  aviso('✓ Vista previa preparada. Revisa las '+imagenes.length+' imágenes completas, especialmente teléfonos y cédulas cubiertos. Nada está publicado todavía.');
 }catch(e){preparadas=null;$('histPubPublicacion').hidden=true;aviso('⚠️ '+(e.message||'No se pudo preparar la vista previa.'));}
 finally{bloquear(false);}
}
function intacto(){
 return preparadas&&preparadas.fecha===fechaActual&&preparadas.marcas.length===personas.length&&preparadas.marcas.every(m=>{
  const s=comprobantes.get(m.carton);
  return s?.reviewed&&s.blob===m.blob&&JSON.stringify(s.masks)===m.masks;
 });
}
async function publicar(){
 if(ocupado||!intacto()||!$('histPubConfirmacion').checked)return;
 if(!confirm('¿Confirmas publicar los comprobantes cubiertos de '+fechaActual+'? Esta acción los mostrará al público.'))return;
 bloquear(true);const subidos=[];let llamado=false;
 try{
  await sesion();
  const prefijo=preparadas.fecha+'/'+crypto.randomUUID(),datos=[];
  for(let i=0;i<preparadas.imagenes.length;i++){
   if(!intacto())throw Error('Cambió un comprobante. Genera de nuevo la vista previa.');
   const it=preparadas.imagenes[i],base=prefijo+'/'+crypto.randomUUID(),ruta=base+'.jpg',mini=base+'-mini.jpg';
   aviso('Subiendo imágenes cubiertas '+(i+1)+' de '+preparadas.imagenes.length+'…');
   for(const [path,blob] of [[ruta,it.blob],[mini,it.miniatura]]){
    const {error}=await supa.storage.from(BUCKET).upload(path,blob,{contentType:'image/jpeg',upsert:false,cacheControl:'0'});
    if(error)throw Error('No se pudo subir la imagen cubierta: '+error.message);
    subidos.push(path);
   }
   datos.push({ronda:it.ronda,titulo:it.titulo,ruta,miniatura:mini,ancho:it.ancho,alto:it.alto,ganadores:it.ganadores});
  }
  if(!intacto())throw Error('Los datos cambiaron; vuelve a preparar la vista previa.');
  aviso('Confirmando publicación del '+preparadas.fecha+'…');llamado=true;
  const {data,error}=await supa.rpc('premios_pagados_publicar_v1',{p_fecha:preparadas.fecha,p_revision:preparadas.revision,p_imagenes:datos,p_confirmado:true});
  if(error)throw Error('No se confirmó la publicación. Consulta la fecha antes de volver a intentar: '+error.message);
  if(data?.publicado!==true||data.fecha!==preparadas.fecha||Number(data.imagenes)!==datos.length)throw Error('Respuesta incompleta. Consulta la publicación de esa fecha antes de reintentar.');
  const enlace=$('histPubEnlace');enlace.hidden=false;enlace.href=urlPublico(preparadas.fecha);
  enlace.textContent='Ver publicación del '+preparadas.fecha;
  aviso('✅ Publicación histórica confirmada. No se modificaron compras ni rondas activas.');
  $('histPubPublicacion').hidden=true;preparadas=null;soltarObjetos();
 }catch(e){
  if(!llamado&&subidos.length){try{await supa.storage.from(BUCKET).remove(subidos);}catch{}}
  if(llamado){preparadas=null;$('histPubPublicacion').hidden=true;}
  aviso('⚠️ '+(e.message||'No se pudo publicar.'));
 }finally{bloquear(false);}
}
buscar.addEventListener('click',cargarHistorial);
dia.addEventListener('change',()=>{token++;limpiar();aviso('Selecciona «Recuperar ganadores y premios» para esta fecha.');});
$('histPubPreparar').onclick=preparar;
$('histPubConfirmacion').onchange=()=>{confirmar.disabled=ocupado||!intacto()||!$('histPubConfirmacion').checked;};
confirmar.onclick=publicar;
$('histPubPublicacion').hidden=true;acciones.hidden=true;
})();