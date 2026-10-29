(function(root){
'use strict';
function preparar(form,validar){
 const n=Number(form.cantidad);
 if(![5,6].includes(n)||form.rondas.length!==n)throw Error('Cantidad de rondas inválida.');
 const rondas=[];
 form.rondas.forEach((raw,i)=>{
  if(!String(raw).trim())return;
  const cartones=root.ResultadosPublicos.cartones(String(raw));
  cartones.forEach(c=>{if(!validar(c))throw Error('Revisa el cartón '+c+': debe tener un dueño aprobado único.');});
  rondas.push({orden:i+1,tipo:i===n-1?'final':'ronda',cartones});
 });
 if(!rondas.length)throw Error('Primero registra los cartones ganadores de las rondas.');
 return {fecha:root.ResultadosPublicos.fechaISO(form.fecha),rondas};
}
root.RondasRuleta={preparar};
if(typeof module!=='undefined')module.exports=root.RondasRuleta;
if(typeof document==='undefined')return;
const el=id=>document.getElementById(id);
let busy=false,queued=false,scheduled=false;
function estado(text){el('ruletaEstado').textContent=text;document.querySelectorAll('[data-ruleta-auto]').forEach(node=>node.textContent=text);}
function programarEnvio(){if(scheduled)return;scheduled=true;Promise.resolve().then(()=>{scheduled=false;window.enviarRondasRuleta();});}
document.addEventListener('ronda-anuncio-generado',programarEnvio);
function formulario(){return {fecha:el('fechaSorteo').value,cantidad:Number(el('cant').value),rondas:Array.from({length:Number(el('cant').value)},(_,i)=>el('car'+(i+1)).value)};}
function mostrar(data){
 estado(data.sent?'✅ '+data.people+' personas excluidas de consolación · Enviado el '+new Date(data.sentAt).toLocaleString('es-VE',{timeZone:'America/Caracas'}):'⚠️ No se han enviado los ganadores de las rondas. La ruleta permite girar.');
 el('ruletaLista').replaceChildren();
 for(const w of data.winners||[]){const p=document.createElement('p');p.textContent=w.name+' · Cartón '+w.ticket+' · '+(w.type==='final'?'Lleno final':'Ronda '+w.round);el('ruletaLista').appendChild(p);}
}
window.enviarRondasRuleta=async function(){
 if(busy){queued=true;return;}busy=true;el('enviarRondasRuleta').disabled=true;
 try{
  if(!SLOT_APPROVED_SOURCE)throw Error('Carga los aprobados actuales de Supabase antes de enviar.');
  const {data:{session},error:authError}=await supa.auth.getSession();if(authError||!session)throw Error('Primero verifica tu acceso a Supabase.');
  const listo=preparar(formulario(),c=>estadoCarton(String(c))==='OK');
  estado('Actualizando ganadores de las rondas en la ruleta…');
  const {data,error}=await supa.rpc('slot_enviar_rondas',{p_source:SLOT_APPROVED_SOURCE,p_fecha:listo.fecha,p_rondas:listo.rondas});
  if(error)throw Error(error.message||'No se pudo enviar.');
  mostrar(data);
  if(JSON.stringify(preparar(formulario(),c=>estadoCarton(String(c))==='OK'))!==JSON.stringify(listo))estado(el('ruletaEstado').textContent+' ⚠️ Cambiaste las rondas durante el envío. Vuelve a generar el anuncio o pulsa Enviar / actualizar.');
 }catch(e){estado('⚠️ No se actualizó la ruleta: '+e.message+' Tu anuncio sigue disponible. Pulsa Enviar / actualizar para reintentar.');}
 finally{busy=false;el('enviarRondasRuleta').disabled=false;if(queued){queued=false;programarEnvio();}}
};
window.consultarRondasRuleta=async function(){try{const {data,error}=await supa.rpc('slot_estado_rondas');if(error)throw error;mostrar(data);}catch{el('ruletaEstado').textContent='⚠️ No se pudo consultar el envío. Revisa la conexión.';}};
function cambiado(e){if(e.target.id==='fechaSorteo'||e.target.id==='cant'||/^car[1-6]$/.test(e.target.id))el('ruletaEstado').textContent='⚠️ Rondas modificadas. Pulsa Enviar / actualizar para aplicar la lista actual.';}
document.addEventListener('input',cambiado);document.addEventListener('change',cambiado);
})(typeof window!=='undefined'?window:globalThis);
