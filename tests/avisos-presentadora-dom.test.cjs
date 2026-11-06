const {test}=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8'),flush=()=>new Promise(r=>setImmediate(r));
test('new capture notifies without downloading/importing; duplicate, prior day and reset captures do not alert again',async()=>{
 const d=new JSDOM(read('index.html'),{url:'https://local.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;const notifications=[],channels=[],calls=[];let rows=[],cut={};
 try{
 const el=id=>w.document.getElementById(id);el('fechaSorteo').value='05/11/2026';
 w.eval("var SLOT_APPROVED_SOURCE='88';");
 w.Notification=function(title,options){notifications.push({title,options});};w.Notification.permission='granted';
 w.supa={auth:{getSession:async()=>({data:{session:{user:{id:'u'}}}})},rpc:async(name)=>{calls.push(name);if(name==='en_vivo_cortes')return {data:{source:'88',revisiones:cut}};return{data:{pagos:true,source:'88',jornada:{fecha:'2026-11-05'},envios:rows}};},channel:()=>{const c={on(kind,filter,event){this.event=event;assert.equal(filter.event,'INSERT');assert.equal(filter.filter,'source=eq.88');return this;},subscribe(status){this.status=status;return this;}};channels.push(c);return c;},removeChannel(){},storage:{from:()=>{assert.fail('No images downloaded for notifications');}}};
 w.eval(read('rondas-en-vivo-comun.js'));w.eval(read('avisos-presentadora.js'));w.eval(read('recibir-en-vivo.js'));
 assert.equal(channels.length,0);await el('envivoAvisos').onclick();const c=channels[0];c.status('SUBSCRIBED');await flush();assert.equal(notifications.length,0);
 const row={id:'new-1',ronda:2,revision:1,fecha:'2026-11-05',source:'88',aplicado:false,capturas:[{cartones:[75]}]};rows=[row];c.event({new:row});await flush();
 assert.equal(notifications.length,1);assert.match(notifications[0].options.body,/Ronda 2.*75/);assert.equal(el('envivoAvisoNuevo').hidden,false);assert.equal(el('envivoLista').children.length,0);
 c.event({new:row});await flush();assert.equal(notifications.length,1);
 c.event({new:{...row,id:'old-day',fecha:'2026-11-04'}});await flush();assert.equal(notifications.length,1);
 cut={'2':2};rows=[{...row,id:'archived',revision:2}];c.event({new:rows[0]});await flush();assert.equal(notifications.length,1);
 assert.ok(!calls.some(x=>/aplicar|configurar/.test(x)));
 }finally{w.close();}
});
