'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../rondas-en-vivo-comun.js');
const R=require('../recibir-en-vivo.js');
const file=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const receptor=file('recibir-en-vivo.js');
const presentadora=file('presentadora/app.js');
const comprobantes=file('comprobantes-pagos.js');

const latestBody=receptor.slice(receptor.indexOf('function ultimosVigentes('),receptor.indexOf('async function contextoVigente('));
const latest=new Function('C','data',latestBody+'return ultimosVigentes(data);');
const fila=(r,revision,carton)=>({
 id:'r'+r+'v'+revision,fecha:'2026-11-03',source:'117700',ronda:r,
 revision,aplicado:false,capturas:[{cartones:[carton]}]
});

test('cinco rondas se pueden traer en cualquier orden y cada una mantiene su cartón',()=>{
 const filas=[...Array.from({length:5},(_,i)=>fila(i+1,1,101+i)),fila(4,2,272)];
 const vigentes=latest(C,{envios:filas,cortes:{'4':1}});
 assert.equal(vigentes.length,5);
 assert.deepEqual([5,2,4,1,3].map(r=>C.numeros(vigentes.find(e=>e.ronda===r))[0]),[105,102,272,101,103]);
});

test('una fecha o sorteo distinto se bloquea',()=>{
 const e=fila(4,2,272);
 assert.equal(R.plan(e,{fecha:'2026-11-04',source:'117700',car:'',aprobados:()=>true}).tipo,'bloqueado');
 assert.equal(R.plan(e,{fecha:'2026-11-03',source:'117701',car:'',aprobados:()=>true}).tipo,'bloqueado');
 assert.equal(R.plan(e,{fecha:e.fecha,source:e.source,car:'',aprobados:()=>true}).tipo,'llenar');
 assert.throws(()=>C.numeros({capturas:[{cartones:[272]},{cartones:[272]}]}));
});

test('capturas siguen siendo manuales y sin sondeos aunque haya avisos en tiempo real',()=>{
 assert.doesNotMatch(receptor,/setInterval\(/);
 assert.doesNotMatch(receptor,/Promise\.resolve\(\)\.then\(refrescar\)/);
 assert.doesNotMatch(receptor,/setTimeout\(\(\)=>aplicar\(auto/);
 assert.match(receptor,/\$\('envivoActualizar'\)\.onclick=refrescar/);
});

test('después de reiniciar, borradores viejos tienen otra clave',()=>{
 const begin=presentadora.indexOf('function claveEpocaLocal(');
 const end=presentadora.indexOf('async function save()',begin);
 assert.ok(begin>=0&&end>begin);
 const make=new Function('db',
  "const user={id:'user'},selected=4;const config={fecha:'2026-11-03',source:'117700',maestroId:null};"+
  "const localStorage={getItem:k=>db.get(k)||null};"+presentadora.slice(begin,end)+
  "return {key,epoca:()=>claveEpocaLocal(config.fecha,config.source),master:id=>config.maestroId=id};");
 const db=new Map(),x=make(db);
 const anterior=x.key();
 db.set(x.epoca(),'reinicio-manual-1');
 const manual=x.key();
 x.master('reinicio-maestro-2');
 const maestro=x.key();
 assert.notEqual(anterior,manual);
 assert.notEqual(manual,maestro);
});

test('si falla persistir una captura recibida, no se confirma ni se reemplaza el resultado anterior',async()=>{
 const begin=comprobantes.indexOf('async function cargarResultado(s,file,{desdePresentadora=false}={}){');
 const end=comprobantes.indexOf(' async function pegar(s,input,tipo=',begin);
 assert.ok(begin>=0&&end>begin);
 const alerts=[],state={fallar:true,guardados:0};
 const make=new Function('state','alerts',
  "const persistir=async()=>{if(state.fallar)throw Error('sin espacio');state.guardados++;};"+
  "const imagenBlob=async()=>({width:1000,height:1000});"+
  "const blobCanvas=async()=>({type:'image/png',size:100});"+
  "const document={createElement:()=>({getContext:()=>({drawImage:()=>{}})})};"+
  "const actualizar=()=>{};const avisoResultado=(s,msg)=>alerts.push(msg);"+
  "const confirm=()=>true;"+comprobantes.slice(begin,end)+"return cargarResultado;");
 const fn=make(state,alerts),old={previous:true},oldBlob={previous:true};
 const s={restauracion:Promise.resolve(),resultBusy:false,cancelled:false,
 resultRevision:0,resultado:old,resultBlob:oldBlob,carton:'272',nombre:'Prueba'};
 assert.equal(await fn(s,{type:'image/jpeg',size:500},{desdePresentadora:true}),false);
 assert.equal(s.resultado,old);
 assert.equal(s.resultBlob,oldBlob);
 assert.match(alerts.join(' '),/No se guardó/);
 state.fallar=false;
 assert.equal(await fn(s,{type:'image/jpeg',size:500},{desdePresentadora:true}),true);
 assert.equal(state.guardados,1);
});
