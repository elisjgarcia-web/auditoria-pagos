(function(root){
'use strict';
function crear({rpc,ahora=()=>Date.now()}){
 const cache=new Map(),pendientes=new Map();
 async function consultar(contexto,numeros){
  const ctx={fecha:contexto.fecha,source:String(contexto.source),maestroId:contexto.maestroId||null};
  const ns=[...numeros];
  if(!ns.length||ns.length>100||new Set(ns).size!==ns.length||ns.some(n=>!Number.isInteger(n)||n<1||n>9999))throw Error('Revisa los números de cartón.');
  const key=JSON.stringify([ctx.fecha,ctx.source,ctx.maestroId,ns]),guardado=cache.get(key);
  if(guardado&&ahora()-guardado.fecha<30000)return guardado.datos;
  if(pendientes.has(key))return pendientes.get(key);
  const promesa=(async()=>{
   const data=await rpc('en_vivo_identificar_cartones',{p_fecha:ctx.fecha,p_source:ctx.source,p_cartones:ns});
   if(data?.fecha!==ctx.fecha||String(data?.source)!==ctx.source||!Array.isArray(data?.ganadores)||data.ganadores.length!==ns.length)
    throw Error('No se pudo confirmar el sorteo de estos cartones.');
   const datos=data.ganadores.map((g,i)=>{
    if(g.carton!==ns[i]||!['aprobado','no_encontrado','ambiguo'].includes(g.estado))throw Error('Respuesta de cartones no válida.');
    return{carton:g.carton,estado:g.estado,nombre:typeof g.nombre==='string'?g.nombre.trim():''};
   });
   if(cache.size>=100)cache.clear();cache.set(key,{fecha:ahora(),datos});return datos;
  })();
  pendientes.set(key,promesa);
  try{return await promesa;}finally{pendientes.delete(key);}
 }
 return{consultar};
}
root.PresentadoraGanadores={crear};
if(typeof module==='object')module.exports=root.PresentadoraGanadores;
})(typeof window==='object'?window:globalThis);
