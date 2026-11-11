/* Bingo Andino 75: consulta privada, de solo lectura, de capturas archivadas.
   No importa capturas a las rondas activas ni escribe en Supabase. */
(function(){
'use strict';
const $ = id => document.getElementById(id);
const buscar = $('historicoCapturasBuscar');
if (!buscar || typeof supa === 'undefined') return;
const fechaInput = $('historicoCapturasFecha');
const origenWrap = $('historicoCapturasOrigenWrap');
const origenInput = $('historicoCapturasOrigen');
const mensaje = $('historicoCapturasEstado');
const lista = $('historicoCapturasLista');
const zipBtn = $('historicoCapturasZip');
const BUCKET = 'ganadores-en-vivo';
/* Respaldo verificado del 10/11/2026. Son referencias privadas del bucket,
   NO imágenes públicas ni datos de pagos. Supabase Storage aplica RLS al descargar.
   Evita depender de PostgREST cuando su pool está saturado (error PGRST003). */
const RESPALDO_10NOV = Object.freeze({
 fecha:'2026-11-10',
 source:'119691',
 presentadora:'5121c2ba-c8f1-40f8-8b3e-130a75f60ac5',
 filas:[
  [1,'96a84d3f-54e4-4028-b99e-83aaaa1c1aae',[735]],
  [2,'6b2f5f7f-2d65-4aa4-9a9b-e29019659f3b',[192]],
  [2,'bcdfdea5-6d1e-4382-bd4d-c099b2c2c6cb',[872]],
  [3,'7626d845-ed26-4f41-855c-f627b9dc6866',[49]],
  [4,'d6a0f128-088e-467d-8f5f-5f4357e8e5a9',[998]],
  [5,'2aa39121-ae5f-4735-82e0-7b6d0720b393',[275]],
  [5,'319e9092-9b38-4030-9a30-e817042fc862',[769]]
 ]
});
let grupos = new Map(), fotos = [], ocupado = false, cache = new Map(), vistas = [];
let solicitud = 0;

function informar(t){ mensaje.textContent = t; }
function bloquear(valor){
 ocupado = valor;
 for (const control of [buscar,fechaInput,origenInput,zipBtn]) control.disabled = valor;
 for (const boton of lista.querySelectorAll('button')) boton.disabled = valor;
}
function limpiarVistas(){
 for (const u of vistas) URL.revokeObjectURL(u);
 vistas = [];
}
function limpiarLista(){
 fotos = []; cache.clear(); limpiarVistas(); lista.replaceChildren(); zipBtn.hidden = true;
}
function fechaValida(f){ return /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(new Date(f+'T12:00:00Z').getTime()); }
function rutaValida(foto){
 const ruta = String(foto.ruta || '');
 const uid = String(foto.creado_por || '');
 const fecha = String(foto.fecha || '');
 if (!/^[0-9a-f-]{36}$/i.test(uid) || !fechaValida(fecha)) return false;
 return ruta.startsWith(uid+'/'+fecha+'/') &&
    /^[0-9a-f-]{36}\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.jpg$/i.test(ruta);
}
function numCartones(raw){
 if (!Array.isArray(raw)) return [];
 return raw.filter(n=>Number.isInteger(Number(n)) && Number(n)>=1 && Number(n)<=9999).map(n=>String(Number(n)));
}
function nombreArchivo(foto){
 const cartones = foto.cartones.length ? '_Carton_'+foto.cartones.join('-') : '';
 return 'Ronda_'+String(foto.ronda).padStart(2,'0')+'_Imagen_'+String(foto.indice).padStart(2,'0')+cartones+'.jpg';
}
function descargarBlob(blob,nombre){
 const u = URL.createObjectURL(blob);
 const a = document.createElement('a'); a.href = u; a.download = nombre;
 document.body.append(a); a.click(); a.remove();
 setTimeout(()=>URL.revokeObjectURL(u),60000);
}
async function autorizar(){
 // La descarga se valida en el servidor por RLS. Evita una petición de
 // autenticación extra cuando la base de datos o el API está saturado.
 const {data,error} = await supa.auth.getSession();
 if (error || !data?.session?.access_token) throw Error('Debes iniciar sesión con el correo autorizado de la app de Pagos.');
 return data.session.user;
}
async function leerFoto(foto){
 if (!rutaValida(foto)) throw Error('Una captura tiene una ruta no válida. No se descargará.');
 if (cache.has(foto.ruta)) return cache.get(foto.ruta);
 const {data,error} = await supa.storage.from(BUCKET).download(foto.ruta);
 if (error || !data || data.size < 1 || data.size > 8388608 ||
   (data.type && data.type !== 'image/jpeg')) {
   throw Error('No se pudo descargar la captura de la ronda '+foto.ronda+'. Comprueba tu conexión y el acceso de Pagos.');
 }
 cache.set(foto.ruta,data);
 return data;
}
async function accion(foto,tipo){
 if (ocupado) return;
 bloquear(true);
 try {
  informar('Recuperando ronda '+foto.ronda+', imagen '+foto.indice+'…');
  const archivo = await leerFoto(foto);
  if (tipo === 'descarga') {
   descargarBlob(archivo,nombreArchivo(foto));
   informar('✓ Captura descargada: '+nombreArchivo(foto));
  } else {
   const cuadro = $('historicoCapturasVista');
   limpiarVistas();
   const url = URL.createObjectURL(archivo);
   vistas.push(url);
   cuadro.replaceChildren();
   const titulo = document.createElement('p');
   titulo.textContent = 'Ronda '+foto.ronda+' · cartón '+(foto.cartones.join(', ')||'sin número');
   const img = document.createElement('img');
   img.src = url;
   img.alt = 'Captura histórica de la ronda '+foto.ronda;
   img.style.cssText = 'max-width:100%;height:auto;max-height:65vh;object-fit:contain;display:block;margin:0 auto 12px';
   cuadro.append(titulo,img);
   const dialogo = $('historicoCapturasDialogo');
   if (!dialogo.open) dialogo.showModal();
   informar('✓ Captura histórica visualizada. No se alteraron las rondas activas.');
  }
 } catch(e) {
  informar('⚠️ '+(e?.message||'No se pudo recuperar la imagen.'));
 } finally { bloquear(false); }
}
function pintar(){
 limpiarLista();
 const origen = origenInput.value;
 const registros = grupos.get(origen);
 if (!registros) {
  informar('Selecciona una jornada archivada.');
  return;
 }
 for (const fila of [...registros.values()].sort((a,b)=>Number(a.ronda)-Number(b.ronda))) {
  (fila.capturas||[]).forEach((c,i)=>{
   fotos.push({ruta:c?.ruta,cartones:numCartones(c?.cartones),
    indice:i+1,ronda:Number(fila.ronda),fecha:fila.fecha,creado_por:fila.creado_por});
  });
 }
 const frag = document.createDocumentFragment();
 for (const foto of fotos) {
  const caja = document.createElement('div');
  caja.style.cssText = 'padding:10px 0;border-bottom:1px solid #684479';
  const texto = document.createElement('p');
  texto.textContent = 'Ronda '+foto.ronda+' · imagen '+foto.indice+
    (foto.cartones.length?' · cartón '+foto.cartones.join(', '):'');
  const ver = document.createElement('button'); ver.type='button';
  ver.className='sec'; ver.textContent='👁 Ver captura'; ver.onclick=()=>accion(foto,'vista');
  const bajar = document.createElement('button'); bajar.type='button';
  bajar.className='sec'; bajar.textContent='⬇ Descargar JPG'; bajar.onclick=()=>accion(foto,'descarga');
  caja.append(texto,ver,bajar); frag.append(caja);
 }
 lista.replaceChildren(frag);
 zipBtn.hidden = !fotos.length;
 zipBtn.textContent = '⬇ Descargar '+fotos.length+' capturas en ZIP';
 informar(fotos.length
  ? '✓ Encontré '+fotos.length+' captura(s) del '+fechaInput.value+'. Selecciona una imagen o descarga el ZIP.'
  : 'Esta jornada no tiene capturas enviadas.');
}
async function consultar(){
 if (ocupado) return;
 const fecha = fechaInput.value;
 if (!fechaValida(fecha)) { informar('Selecciona una fecha válida.'); return; }
 bloquear(true); limpiarLista(); origenWrap.hidden=true; grupos=new Map();
 const token=++solicitud;
 try {
  await autorizar();
  if (fecha===RESPALDO_10NOV.fecha) {
   const respaldo=RESPALDO_10NOV;
   const rondas=new Map();
   for (const [ronda,archivo,cartones] of respaldo.filas) {
    if (!rondas.has(ronda)) rondas.set(ronda,{
     fecha:respaldo.fecha,source:respaldo.source,ronda,revision:1,
     creado_por:respaldo.presentadora,capturas:[]
    });
    rondas.get(ronda).capturas.push({
     ruta:respaldo.presentadora+'/'+respaldo.fecha+'/'+archivo+'.jpg',
     cartones
    });
   }
   grupos.set(respaldo.source,rondas);
   origenInput.replaceChildren();
   const opcion=document.createElement('option');
   opcion.value=respaldo.source;
   opcion.textContent='Jornada '+respaldo.source+' · '+rondas.size+' rondas';
   origenInput.append(opcion);
   origenInput.value=respaldo.source;
   origenWrap.hidden=true;
   pintar();
   informar('✓ Encontré '+fotos.length+' capturas del 10/11/2026 en el respaldo. Puedes verlas o descargarlas. La descarga requiere conexión a Storage.');
   return;
  }
  informar('Buscando capturas del '+fecha+' en el historial privado…');
  const abortador=new AbortController();
  const limite=setTimeout(()=>abortador.abort(),13000);
  let data,error;
  try {
   const respuesta = await supa.from('en_vivo_envios')
    .select('fecha,source,ronda,revision,capturas,creado_por,creado_en')
    .eq('fecha',fecha).order('revision',{ascending:false}).limit(200)
    .abortSignal(abortador.signal);
   data=respuesta.data;error=respuesta.error;
  } finally { clearTimeout(limite); }
  if (error) throw Error('Supabase no respondió al consultar los envíos antiguos: '+error.message);
  if (token !== solicitud) return;
  if ((data||[]).length === 200) throw Error('Hay más de 200 envíos. Consulta este historial con soporte antes de descargar.');
  for (const fila of data||[]) {
   const source=String(fila.source||''),ronda=Number(fila.ronda),revision=Number(fila.revision);
   if (!source || !Number.isInteger(ronda)||ronda<1||ronda>6) continue;
   if (!grupos.has(source)) grupos.set(source,new Map());
   const anteriores=grupos.get(source),anterior=anteriores.get(ronda);
   if (!anterior||revision>Number(anterior.revision)) anteriores.set(ronda,fila);
  }
  if (!grupos.size) { informar('No encontré capturas de la presentadora para '+fecha+'.'); return; }
  origenInput.replaceChildren();
  for (const [source,rondas] of grupos) {
   const option=document.createElement('option');
   option.value=source;
   option.textContent='Jornada '+source+' · '+rondas.size+' ronda(s)';
   origenInput.append(option);
  }
  origenInput.value=grupos.keys().next().value;
  origenWrap.hidden=grupos.size===1;
  pintar();
 } catch(e) { informar('⚠️ '+((e?.name==='AbortError')?'La consulta tardó demasiado por saturación de Supabase. Intenta nuevamente cuando se restablezca la conexión.':(e?.message||'Error consultando el historial.'))); }
 finally { bloquear(false); }
}
async function descargarTodo(){
 if (ocupado || !fotos.length) return;
 bloquear(true);
 try {
  await autorizar();
  if (!window.ZipCapturasBingo?.crearZip) throw Error('No se cargó el generador de ZIP. Actualiza la app.');
  const entradas=[]; let peso=0;
  for (let i=0;i<fotos.length;i++) {
   const foto=fotos[i];
   informar('Descargando imagen '+(i+1)+' de '+fotos.length+'…');
   const archivo=await leerFoto(foto);
   peso+=archivo.size;
   if(peso>600*1024*1024) throw Error('Los archivos superan 600 MB.');
   entradas.push({name:nombreArchivo(foto),blob:archivo});
  }
  informar('Preparando archivo ZIP…');
  const zip=await window.ZipCapturasBingo.crearZip(entradas);
  descargarBlob(zip,'BingoAndino75_Capturas_'+fechaInput.value+'.zip');
  informar('✓ Se inició la descarga de '+fotos.length+' capturas históricas. Revisa la carpeta Descargas.');
 } catch(e) { informar('⚠️ '+(e?.message||'No se pudo descargar el ZIP.')); }
 finally { bloquear(false); }
}
buscar.addEventListener('click',consultar);
origenInput.addEventListener('change',()=>{if(!ocupado)pintar();});
fechaInput.addEventListener('change',()=>{if(!ocupado){grupos.clear();limpiarLista();origenWrap.hidden=true;informar('Pulsa Buscar capturas para consultar la fecha seleccionada.');}});
zipBtn.addEventListener('click',descargarTodo);
$('historicoCapturasCerrar').addEventListener('click',()=>$('historicoCapturasDialogo').close());
$('historicoCapturasDialogo').addEventListener('close',()=>{
 limpiarVistas();$('historicoCapturasVista').replaceChildren();
});
})();