const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const modulePath='../supabase/functions/presentadora-push/handler.mjs';
const id='20000000-0000-4000-8000-000000000001',token='a'.repeat(64),hash=crypto.createHash('sha256').update(token).digest('hex');
const req=(t=token)=>new Request('https://edge.test',{method:'POST',headers:{'x-push-signature':t,'x-push-time':String(Math.floor(Date.now()/1000))},body:JSON.stringify({id})});
test('unauthorized webhook cannot read subscriptions or send notifications',async()=>{const {createHandler}=await import(modulePath);const h=createHandler({hookHash:hash,rpc:()=>assert.fail('unauthorized DB read'),send:()=>assert.fail()});assert.equal((await h(req('invalid'))).status,401);});
test('delivery marks successes, expires gone endpoints, retries transient failures and rejects SSRF',async()=>{
 const {createHandler}=await import(modulePath);const calls=[],sent=[];const destinos=['good','gone','retry','bad'].map(n=>({id:n,endpoint:n==='bad'?'https://127.0.0.1/internal':'https://fcm.googleapis.com/fcm/send/'+n,keys:{}}));
 const h=createHandler({hookHash:hash,rpc:async(name,args)=>{calls.push({name,args});if(name==='push_servidor_autorizar')return{id,payload:{type:'presentadora',ronda:2,cartones:[75]},destinos,vapid:{}};return true;},send:async(sub,payload)=>{sent.push(sub.endpoint);assert.equal(JSON.parse(payload).id,id);if(sub.endpoint.endsWith('gone'))throw{statusCode:410};if(sub.endpoint.endsWith('retry'))throw{statusCode:503};}});
 assert.equal((await h(req())).status,200);assert.equal(sent.length,3);const result=calls.at(-1).args;assert.deepEqual(result.p_enviados,['good']);assert.deepEqual(new Set(result.p_caducados),new Set(['gone','bad']));assert.equal(result.p_reintentar,true);
});
