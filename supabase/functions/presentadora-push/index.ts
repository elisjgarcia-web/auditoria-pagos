import webpush from 'npm:web-push@3.6.7';
import {createHandler} from './handler.mjs';
const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function rpc(name:string,args:unknown){
 const r=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(args)});
 if(!r.ok)throw Error('RPC failed');return r.json();
}
Deno.serve(createHandler({rpc,send:async(sub:any,payload:string,vapid:any)=>{
 const request=webpush.generateRequestDetails(sub,payload,{vapidDetails:vapid,TTL:900,urgency:'high',contentEncoding:'aes128gcm'});
 const r=await fetch(request.endpoint,{method:request.method,headers:request.headers,body:request.body,redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Object.assign(new Error('Push service unavailable'),{statusCode:r.status});
}}));
