const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','ruleta-consolacion-pagos.js'),'utf8');
const from=src.indexOf('function fechaCaracas('),to=src.indexOf('async function revisar(',from);
assert.ok(from>0&&to>from,'El módulo debe conservar los validadores puros');
const util=new Function('const d={};const $=()=>null;'+src.slice(from,to)+'\nreturn {fechaCaracas,interpretar,listaCash};')();
test('consolación bolívares con separador de miles',()=>assert.deepEqual(util.interpretar('8.887bs','consolation',0),{clase:'dinero',monto:8887,unidad:'Bs'}));
test('USD se convierte a Bs con tasa configurada',()=>assert.deepEqual(util.interpretar('10 USD','consolation',900),{clase:'dinero',monto:9000,unidad:'USD'}));
test('USD sin tasa no se prepara',()=>assert.equal(util.interpretar('10 USD','consolation',0).clase,'pendiente'));
test('cartón gratis nunca entra como dinero',()=>assert.equal(util.interpretar('1 cartón gratis','other',900).clase,'regalo'));
test('no inferir importes sin moneda',()=>assert.equal(util.interpretar('10','consolation',900).clase,'pendiente'));
test('solo ganadores de la fecha de Caracas; ignora dibujos repetidos',()=>{
 const rows=[
  {drawId:'a',ticket:'767',prize:'8.887bs',prizeType:'consolation',createdAt:'2026-11-01T12:00:00.000Z'},
  {drawId:'a',ticket:'767',prize:'8.887bs',prizeType:'consolation',createdAt:'2026-11-01T12:00:00.000Z'},
  {drawId:'b',ticket:'65',prize:'1 cartón gratis',prizeType:'other',createdAt:'2026-11-01T12:00:00.000Z'},
  {drawId:'c',ticket:'68',prize:'8.887bs',prizeType:'consolation',createdAt:'2026-10-31T12:00:00.000Z'}
 ];
 const out=util.listaCash(rows,'2026-11-01',0);
 assert.deepEqual(out.cash.map(x=>x.carton),['767']);
 assert.equal(out.regalos.length,1);
 assert.equal(out.pendientes.length,0);
});
