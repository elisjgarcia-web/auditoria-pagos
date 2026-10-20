'use strict';
(function(){
let pendiente=null,ocupado=false;
const el=id=>document.getElementById(id);
function formulario(){
 return {fecha:el('fechaSorteo').value,rondas:Array.from({length:Number(el('cant').value)},(_,i)=>({cartones:el(`car${i+1}`).value,premio:el(`pre${i+1}`).value})),consolacion:{cartones:el('cartonesCon').value,premio:el('premioCon').value},pozo:{cartones:el('cartonPozo').value,premio:el('premioPozo').value}};
}
function preparar(){return ResultadosPublicos.preparar(formulario(),c=>estadoCarton(String(c))==='OK')}
function estado(t){el('publicarEstado').textContent=t}
window.vistaPreviaGanadores=async function(){
 if(ocupado)return;
 try{
  pendiente=null;el('confirmarPublicacion').disabled=true;
  const {data:{session},error}=await supa.auth.getSession();if(error||!session)throw Error('Primero verifica tu acceso a Supabase.');
  pendiente=preparar();const nombres={};pendiente.grupos.forEach(g=>g.ganadores.forEach(w=>{nombres[w.carton]=buscar(String(w.carton))?.nombre||''}));ResultadosPublicos.mostrar(el('vistaPublicacion'),{...pendiente,nombres});
  el('dialogoPublicacion').showModal();el('confirmarPublicacion').disabled=false;estado('Vista previa lista. Revisa la fecha, todos los cartones y sus premios.');
 }catch(e){estado(e.message)}
};
window.confirmarGanadores=async function(){
 if(ocupado||!pendiente)return;
 ocupado=true;el('confirmarPublicacion').disabled=true;
 try{
  if(JSON.stringify(preparar())!==JSON.stringify(pendiente))throw Error('Los resultados cambiaron. Cierra y genera otra vista previa.');
  const {data,error}=await supa.rpc('publicar_resultados_v1',{p_resultado:pendiente});
  if(error)throw Error('No se pudo publicar. Verifica conexión, autorización y configuración de Supabase. '+error.message);
  if(!data||data.fecha!==pendiente.fecha)throw Error('No se recibió confirmación. Consulta el historial antes de volver a intentar.');
  estado('Publicado y confirmado para '+data.fecha+'. Nuevo sorteo conserva este resultado.');
  pendiente=null;el('dialogoPublicacion').close();await historialGanadores();
 }catch(e){estado(e.message)}finally{ocupado=false;el('confirmarPublicacion').disabled=!pendiente}
};
window.verFechaPublicada=async function(fecha){
 try{
  const f=ResultadosPublicos.fechaISO(fecha||el('buscarFechaPublicada').value);
  const {data,error}=await supa.from('resultados_publicos_con_nombres').select('resultado').eq('fecha',f).single();
  if(error)throw Error('No se encontró una publicación o no se pudo consultar esa fecha.');
  ResultadosPublicos.mostrar(el('resultadoHistorico'),data.resultado);
 }catch(e){estado(e.message)}
};
window.historialGanadores=async function(){
 const box=el('historialPublicaciones');box.replaceChildren();
 const {data,error}=await supa.from('resultados_publicos_con_nombres').select('fecha,publicado_en').order('fecha',{ascending:false}).limit(100);
 if(error){box.textContent='No se pudo consultar el historial. '+error.message;return}
 if(!data.length){box.textContent='Aún no hay resultados publicados.';return}
 data.forEach(r=>{const b=document.createElement('button');b.className='sec';b.textContent=r.fecha;b.onclick=()=>verFechaPublicada(r.fecha);box.appendChild(b)});
};
// El borrado local jamás llama una operación de borrado remoto.
const anteriorNuevo=nuevoSorteo;
window.nuevoSorteo=async function(){
 if(ocupado){estado('Espera a que termine la publicación antes de iniciar otro sorteo.');return}
 pendiente=null;el('confirmarPublicacion').disabled=true;el('dialogoPublicacion').close();
 if(el('car1')?.value.trim()&&!confirm('Antes de borrar el trabajo local, verifica el historial publicado o descarga una copia del sorteo. Los resultados publicados en Supabase se conservan. ¿Continuar?'))return;
 return anteriorNuevo();
};
})();
