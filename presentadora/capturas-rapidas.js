(function(root){
'use strict';
async function recuperar(remote,local,{validar,descargar,recibida=()=>{},concurrencia=3}){
 const cards=remote.capturas.map(c=>{
  validar(c.ruta);
  const previa=local?.cards?.find(x=>x.ruta===c.ruta&&x.blob?.size>0&&x.uploaded);
  return{blob:previa?.blob||null,ruta:c.ruta,numeros:c.cartones.join(', '),msg:previa?'Captura enviada a pagos.':'Recuperando imagen…',uploaded:true};
 });
 if(cards.some(c=>c.blob))recibida(null,-1,cards);
 let cursor=0;
 async function worker(){
  while(cursor<cards.length){const i=cursor++,card=cards[i];if(card.blob)continue;
   try{const blob=await descargar(card.ruta);if(!blob||!blob.size||blob.size>8388608)throw Error('No se pudo recuperar una captura enviada.');
    card.blob=blob;card.msg='Captura enviada a pagos.';
   }catch{card.msg='No se pudo recuperar esta imagen. Pulsa de nuevo la ronda para reintentar.';}
   recibida(card,i,cards);
  }
 }
 await Promise.all(Array.from({length:Math.min(concurrencia,cards.length)},worker));return cards;
}
root.CapturasRapidas={recuperar};if(typeof module==='object')module.exports=root.CapturasRapidas;
})(typeof window==='object'?window:globalThis);
