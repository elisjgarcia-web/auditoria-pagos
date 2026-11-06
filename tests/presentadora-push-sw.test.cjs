const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('closed-app worker shows push without a page and notification click opens payments',async()=>{
 const handlers={},shown=[],opened=[];const scope='https://app.test/auditoria-pagos/';
 const self={registration:{scope,showNotification:async(title,options)=>shown.push({title,options})},addEventListener:(n,f)=>handlers[n]=f,clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'),{self,URL});
 let pending;handlers.push({data:{json:()=>({id:'e1',type:'presentadora',ronda:3,cartones:[75,76,'bad',-1],envioId:'e1'})},waitUntil:p=>pending=p});await pending;
 assert.equal(shown.length,1);assert.match(shown[0].options.body,/ronda 3.*75, 76/);assert.ok(!shown[0].options.body.includes('bad'));
 handlers.notificationclick({notification:{close(){}},waitUntil:p=>pending=p});await pending;assert.deepEqual(opened,[scope]);
 handlers.push({data:{json:()=>({id:'test',type:'test'})},waitUntil:p=>pending=p});await pending;assert.match(shown[1].title,/Prueba/);
});

test('notification click focuses Payments instead of a Presenter tab on the same host',async()=>{
 const handlers={},focused=[];const scope='https://app.test/auditoria-pagos/';
 const self={registration:{scope},addEventListener:(n,f)=>handlers[n]=f,clients:{matchAll:async()=>[{url:scope+'presentadora/',focus:async()=>focused.push('presentadora')},{url:scope+'index.html',focus:async()=>focused.push('pagos')}],openWindow:()=>assert.fail('Payments already open')}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'),{self,URL});let pending;handlers.notificationclick({notification:{close(){}},waitUntil:p=>pending=p});await pending;assert.deepEqual(focused,['pagos']);
});
