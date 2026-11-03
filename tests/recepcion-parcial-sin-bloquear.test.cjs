'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','recibir-en-vivo.js'),'utf8');
const {cargarCapturasIndependientes}=require('../recibir-en-vivo.js');

test('cinco ganadores: una imagen falla, las otras cuatro se conservan',async()=>{
 const capturas=[101,102,103,104,105].map(n=>({cartones:[n]}));
 const guardados=[];
 const x=await cargarCapturasIndependientes(capturas,
  async c=>{if(c.cartones[0]===103)throw Error('No se pudo descargar');return{foto:true};},
  async(c,n,blob)=>{assert.equal(blob.foto,true);guardados.push(n);}
 );
 assert.deepEqual(guardados,[101,102,104,105]);
 assert.deepEqual(x.correctos,[101,102,104,105]);
 assert.deepEqual(x.faltantes.map(f=>f.carton),[103]);
});

test('varios ganadores dentro de una captura: error de uno no afecta a los demás',async()=>{
 const guardados=[];
 const x=await cargarCapturasIndependientes([{cartones:[270,271,272]}],
  async()=>({foto:true}),
  async(c,n)=>{if(n===271)throw Error('Falló IndexedDB');guardados.push(n);}
 );
 assert.deepEqual(guardados,[270,272]);
 assert.deepEqual(x.faltantes.map(f=>f.carton),[271]);
});

test('todas las capturas válidas se cargan sin dejar pendientes',async()=>{
 const x=await cargarCapturasIndependientes([{cartones:[1,2]},{cartones:[3]}],
  async c=>c,
  async()=>{}
 );
 assert.deepEqual(x.correctos,[1,2,3]);assert.deepEqual(x.faltantes,[]);
});

test('recepción parcial no bloquea otros ganadores ni marca aplicada la ronda',()=>{
 assert.match(code,/if\(resultado\.faltantes\.length\)/);
 const parcial=code.indexOf('if(resultado.faltantes.length)');
 const confirmacion=code.indexOf("await rpc('en_vivo_aplicar'",parcial);
 assert.ok(confirmacion>parcial);
 const retorno=code.indexOf('return false;',parcial);
 assert.ok(retorno>parcial&&retorno<confirmacion);
 assert.match(code,/pendientesImagenes\.set\(i/);
 assert.match(code,/\.correctos\.length/);
 assert.match(code,/Reintentar capturas de esta ronda/);
 assert.match(code,/guardarEstadoAhora\(\)/);
 assert.doesNotMatch(code,/\.subscribe\(\)/);
});
