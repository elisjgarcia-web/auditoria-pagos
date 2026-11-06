const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function endpointValido(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&!u.hash&&(/^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)$/.test(u.hostname)||/^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname));}catch{return false;}}
export function createHandler({rpc,send,now=()=>Date.now()}){
 return async req=>{
  if(req.method!=='POST')return new Response(null,{status:405});
  const signature=req.headers.get('x-push-signature')||'',time=req.headers.get('x-push-time')||'';
  if(!/^[a-f0-9]{64}$/.test(signature)||!/^\d{10}$/.test(time)||Math.abs(now()/1000-Number(time))>90)return new Response(null,{status:401});
  try{
   const raw=await req.text();if(raw.length>200)return new Response(null,{status:413});
   const {id}=JSON.parse(raw);if(!UUID.test(id||''))return new Response(null,{status:400});
   const job=await rpc('push_servidor_autorizar',{p_id:id,p_tiempo:time,p_firma:signature});
   if(!job)return Response.json({ok:true,omitido:true});
   const enviados=[],caducados=[];let reintentar=false;
   const payload=JSON.stringify({...job.payload,id:job.id});
   await Promise.all(job.destinos.map(async sub=>{
    if(!endpointValido(sub.endpoint)){caducados.push(sub.id);return;}
    try{await send({endpoint:sub.endpoint,keys:sub.keys},payload,job.vapid);enviados.push(sub.id);}
    catch(e){if([404,410].includes(e?.statusCode))caducados.push(sub.id);else reintentar=true;}
   }));
   await rpc('push_servidor_finalizar',{p_id:id,p_enviados:enviados,p_caducados:caducados,p_reintentar:reintentar});
   return Response.json({ok:true,enviados:enviados.length,reintentar});
  }catch{return Response.json({ok:false},{status:503});}
 };
}
