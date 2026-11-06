const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../push-presentadora.js'),'utf8');
function setup({supported=true,existing=false}={}){
 const calls=[];let created=0,unsubscribed=0;
 const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test',toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:'x',auth:'a'}}),unsubscribe:async()=>{unsubscribed++;}};
 const pushManager={getSubscription:async()=>existing?sub:null,subscribe:async options=>{created++;assert.equal(options.userVisibleOnly,true);return sub;}};
 const root={isSecureContext:true,PushManager:supported?function(){}:undefined,Notification:{permission:'granted'}};
 const c={window:root,navigator:{serviceWorker:{register:async()=>({pushManager}),ready:Promise.resolve()}},atob:s=>Buffer.from(s,'base64').toString('binary'),Uint8Array};
 vm.createContext(c);vm.runInContext(script,c);
 const client={auth:{getSession:async()=>({data:{session:{}}})},rpc:async(name,args)=>{calls.push({name,args});return{data:name==='pagos_push_clave'?{publicKey:Buffer.alloc(65,1).toString('base64url')}:{activo:true}};}};
 return{api:root.PagosPush,client,calls,get created(){return created;},get unsubscribed(){return unsubscribed;}};
}
test('activation registers once, saves server subscription, test push targets device and logout unsubscribes',async()=>{
 const f=setup();assert.equal(f.calls.length,0);assert.equal(await f.api.activar(f.client),true);assert.equal(f.created,1);assert.equal(f.api.activo,true);assert.equal(f.calls.at(-1).name,'pagos_push_guardar');await f.api.probar(f.client);assert.equal(f.calls.at(-1).name,'pagos_push_probar');await f.api.desactivar(f.client);assert.equal(f.api.activo,false);assert.equal(f.unsubscribed,1);
});
test('restore reuses an existing subscription without requesting permission or creating one',async()=>{const f=setup({existing:true});assert.equal(await f.api.restaurar(f.client),true);assert.equal(f.created,0);});
test('restore does not opt in a new device; unsupported browser receives a clear error',async()=>{const f=setup();assert.equal(await f.api.restaurar(f.client),false);assert.equal(f.calls.length,0);assert.equal(f.created,0);const bad=setup({supported:false});await assert.rejects(bad.api.activar(bad.client),/no admite/);});
