const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const recepcion=fs.readFileSync(path.join(__dirname,'..','recibir-en-vivo.js'),'utf8');
const pos=recepcion.indexOf('function ultimosVigentes(data){');
const end=recepcion.indexOf('async function contextoVigente',pos);
assert.ok(pos>=0&&end>pos,'Debe conservarse el filtro de cortes.');
const C={ultimos:rows=>{
 const map=new Map();
 for(const row of rows)if(!map.has(row.ronda)||map.get(row.ronda).revision<row.revision)map.set(row.ronda,row);
 return [...map.values()];
}};
const vigentes=new Function('C',recepcion.slice(pos,end)+';return ultimosVigentes;')(C);
test('640 de pruebas queda archivado, 272 de la misma ronda es vigente',()=>{
 const rows=[{ronda:4,revision:1,carton:640},{ronda:4,revision:2,carton:272}];
 assert.deepEqual(vigentes({envios:rows,cortes:{4:1}}).map(x=>x.carton),[272]);
 assert.deepEqual(vigentes({envios:[rows[0]],cortes:{4:1}}),[]);
});
test('El corte no afecta a otras rondas',()=>{
 const rows=[{ronda:4,revision:1,carton:640},{ronda:3,revision:1,carton:800}];
 assert.deepEqual(vigentes({envios:rows,cortes:{4:1}}).map(x=>x.carton),[800]);
});
test('Sin corte, el último envío sigue disponible',()=>{
 const rows=[{ronda:4,revision:1,carton:640},{ronda:4,revision:2,carton:272}];
 assert.deepEqual(vigentes({envios:rows,cortes:{}}).map(x=>x.carton),[272]);
});
