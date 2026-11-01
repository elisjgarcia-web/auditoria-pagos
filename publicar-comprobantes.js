(function(){
'use strict';
const $=id=>document.getElementById(id),BUCKET='premios-pagados';let pendiente=null,ocupado=false,urls=[];
const estado=t=>{$('publicarComprobantesEstado').textContent=t;};
function fecha(){return ResultadosPublicos.fechaISO($('fechaSorteo').value);}
function liberar(){for(const u of urls)URL.revokeObjectURL(u);urls=[];}
function botones(){const ok=!!pendiente&&!ocupado&&$('confirmoComprobantes').checked;$('confirmarComprobantes').disabled=!ok;$('cancelarComprobantes').disabled=ocupado;$('confirmoComprobantes').disabled=ocupado;}
function vigente(){return pendiente&&fecha()===pendiente.fecha&&ComprobantesPagos.firmaDia(pendiente.fecha)===pendiente.firma;}
async function sesion(){const {data,error}=await supa.auth.getSession();if(error||!data?.session)throw Error('Primero verifica tu acceso a Supabase.');return data.session;}
async function publicacion(f){const {data,error}=await supa.from('premios_pagados').select('fecha,revision,publicado').eq('fecha',f).maybeSingle();if(error)throw Error('No se pudo consultar la publicación. '+error.message);return data;}
function enlace(f){const u=new URL('https://bingoandino75.com/');u.searchParams.set('premios',f);return u.href;}
window.vistaPreviaComprobantes=async function(){if(ocupado)return;ocupado=true;pendiente=null;liberar();botones();estado('Preparando las imágenes del día…');try{
 await sesion();const dia=await ComprobantesPagos.prepararDia(fecha()),previa=await publicacion(dia.fecha);pendiente={...dia,revision:previa?.revision||0};
 const box=$('vistaComprobantes');box.replaceChildren();const intro=document.createElement('p');intro.textContent=dia.imagenes.length+' rondas · '+dia.fecha+(previa?.publicado?' · Reemplazará la publicación de esta fecha.':'');box.append(intro);
 for(const i of dia.imagenes){const card=document.createElement('div'),title=document.createElement('h3'),img=document.createElement('img');title.textContent=i.titulo+' · '+i.ganadores.length+' ganador(es)';const url=URL.createObjectURL(i.blob);urls.push(url);img.src=url;img.alt='Imagen pública de '+i.titulo;img.style.cssText='display:block;max-width:100%;height:auto;margin:auto';card.append(title,img);box.append(card);}
 $('confirmoComprobantes').checked=false;$('dialogoComprobantes').showModal();estado('Revisa cada imagen, la fecha y la cobertura. Solo estas imágenes preparadas se subirán.');
 }catch(e){pendiente=null;liberar();estado(e.message||'No se pudo preparar la vista previa.');}finally{ocupado=false;botones();}};
window.cancelarComprobantes=()=>{if(ocupado)return;pendiente=null;liberar();$('dialogoComprobantes').close();botones();};
$('confirmoComprobantes').addEventListener('change',botones);$('dialogoComprobantes').addEventListener('cancel',e=>{if(ocupado)e.preventDefault();else{pendiente=null;liberar();botones();}});
window.confirmarComprobantes=async function(){if(ocupado||!pendiente||!$('confirmoComprobantes').checked)return;if(!vigente()){estado('Los comprobantes cambiaron. Cierra y genera otra vista previa.');pendiente=null;botones();return;}
 ocupado=true;botones();const paths=[];let intentandoPublicar=false;
 try{await sesion();const prefijo=pendiente.fecha+'/'+crypto.randomUUID(),imagenes=[];
 for(let n=0;n<pendiente.imagenes.length;n++){
  if(!vigente())throw Error('Los datos cambiaron mientras se preparaba la subida. Revisa otra vez.');const i=pendiente.imagenes[n],base=prefijo+'/'+crypto.randomUUID(),ruta=base+'.jpg',mini=base+'-mini.jpg';estado('Subiendo '+(n+1)+' de '+pendiente.imagenes.length+'…');
  for(const [path,blob] of [[ruta,i.blob],[mini,i.miniatura]]){const {error}=await supa.storage.from(BUCKET).upload(path,blob,{contentType:'image/jpeg',upsert:false,cacheControl:'0'});if(error)throw Error('No se pudo subir la imagen. '+error.message);paths.push(path);}
  imagenes.push({ronda:i.ronda,titulo:i.titulo,ruta,miniatura:mini,ancho:i.ancho,alto:i.alto,ganadores:i.ganadores});
 }
 if(!vigente())throw Error('Los comprobantes cambiaron. Genera otra vista previa.');intentandoPublicar=true;
 const f=pendiente.fecha,{data,error}=await supa.rpc('premios_pagados_publicar_v1',{p_fecha:f,p_revision:pendiente.revision,p_imagenes:imagenes,p_confirmado:true});
 if(error)throw Error('No se recibió confirmación de publicación. Consulta esta fecha antes de reintentar. '+error.message);
 if(!data?.publicado||data.fecha!==f||Number(data.imagenes)!==imagenes.length)throw Error('Respuesta incompleta. Consulta la publicación de esta fecha antes de reintentar.');
 const link=$('enlaceComprobantes');link.href=enlace(f);link.hidden=false;link.textContent='Ver comprobantes publicados · '+f;estado('Publicación confirmada. El historial se conserva al iniciar Nuevo sorteo.');pendiente=null;liberar();$('dialogoComprobantes').close();
 }catch(e){if(intentandoPublicar){pendiente=null;liberar();$('dialogoComprobantes').close();}if(!intentandoPublicar&&paths.length){try{await supa.storage.from(BUCKET).remove(paths);}catch{}}estado(e.message||'No se pudo publicar.');}finally{ocupado=false;botones();}
};
window.consultarComprobantes=async function(){if(ocupado)return;ocupado=true;botones();try{await sesion();const f=fecha(),p=await publicacion(f),box=$('estadoPublicacionComprobantes');box.replaceChildren();if(!p){box.textContent='No hay una publicación para '+f;return;}const texto=document.createElement('p');texto.textContent=f+' · '+(p.publicado?'Publicado':'Retirado')+' · Revisión '+p.revision;box.append(texto);if(p.publicado){const link=document.createElement('a');link.href=enlace(f);link.target='_blank';link.rel='noopener';link.textContent='Ver publicación';box.append(link);const b=document.createElement('button');b.className='clear';b.textContent='Retirar esta publicación';b.onclick=async()=>{if(ocupado||!confirm('¿Retirar los comprobantes públicos del '+f+'? Las compras y ganadores no se modifican.'))return;ocupado=true;b.disabled=true;try{const {data,error}=await supa.rpc('premios_pagados_retirar_v1',{p_fecha:f,p_revision:p.revision});if(error||data?.publicado!==false)throw Error(error?.message||'No se confirmó el retiro.');box.textContent='Publicación retirada. Los datos del sorteo se conservan.';estado('Retiro confirmado.');}catch(e){estado(e.message);}finally{ocupado=false;b.disabled=false;}};box.append(b);}}catch(e){estado(e.message);}finally{ocupado=false;botones();}};
const anterior=window.nuevoSorteo;window.nuevoSorteo=async function(){if(ocupado){estado('Espera a que termine la publicación de comprobantes.');return;}window.cancelarComprobantes();return anterior();};
})();
