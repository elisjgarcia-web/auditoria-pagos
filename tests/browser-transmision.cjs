const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM?{executablePath:process.env.QA_CHROMIUM}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});let result=[];
 for(const viewport of [{width:360,height:800},{width:390,height:844},{width:768,height:1024},{width:1366,height:900}]){
  let state={video_id:null,revision:0,expira_en:null};const errors=[],requests=[];const ctx=await browser.newContext({viewport,serviceWorkers:'block'});
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'../../bingoandino75/tests/fixtures/juego-catalogo.json')));
  await ctx.addInitScript(()=>{if(location.hostname==='bingo.test')sessionStorage.setItem('bingo_juego_acceso_v1',JSON.stringify({cedula:'12345678'}));});
  await ctx.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());requests.push({url:u.href,method:req.method()});
   if(u.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:`window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'test'}}}})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:await (await fetch('/qa/state')).json()})})})}),rpc:async(n,args)=>({data:await(await fetch('/qa/state',{method:'POST',body:JSON.stringify(args)})).json()})})};`});
   if(u.pathname==='/qa/state'){
    if(req.method()==='POST'){const a=req.postDataJSON();assert.equal(a.p_revision,state.revision);state={video_id:a.p_video_id,revision:state.revision+1,expira_en:a.p_video_id?new Date(Date.now()+3600000).toISOString():null};}
    return route.fulfill({json:state});
   }
   if(u.hostname.endsWith('supabase.co')){
    if(u.pathname.endsWith('/transmision_juego'))return route.fulfill({json:[state]});
    if(u.pathname.includes('/rpc/'))return route.fulfill({json:[{id:111,estado:'aprobado',cartones:[58,719]}]});
    if(u.pathname.includes('/storage/')){const id=Number(u.pathname.match(/_(\d+)\.webp/)[1]);return route.fulfill({path:path.join(process.env.QA_CARTONES_DIR||'', 'carton-'+id+'.webp'),contentType:'image/webp'});}
   }
   if(u.hostname==='www.youtube.com')return route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><body style="margin:0;background:#16111d;color:white;display:grid;place-items:center;font:18px Arial;height:100vh"><div>▶ Transmisión de ejemplo · YouTube<br><small>Reproductor simulado para pruebas</small></div></body>'});
   if(['pagos.test','bingo.test'].includes(u.hostname)){
    const repo=u.hostname==='pagos.test'?'auditoria-pagos':'bingoandino75';let name=u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname;
    if(u.pathname.endsWith('/catalogo.json'))return route.fulfill({json:fixture});
    const file=path.join(__dirname,'../..',repo,name);if(!fs.existsSync(file))return route.fulfill({status:404,body:'Not found'});
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)]||'application/octet-stream';
    return route.fulfill({contentType:mime,path:file});
   }
   return route.abort();
  });
  const admin=await ctx.newPage();admin.on('pageerror',e=>errors.push('admin: '+e.message));await admin.goto('https://pagos.test/');await admin.locator('#transmisionEnviar').waitFor({state:'visible'});await admin.waitForFunction(()=>!document.getElementById('transmisionEnviar').disabled);
  await admin.locator('#transmisionEnlace').fill('https://www.youtube.com/live/Abcd_123-xy?si=qa');await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:'https://pagos.test'});await admin.locator('#transmisionCopiar').click();await admin.waitForFunction(()=>document.getElementById('transmisionEstado').textContent.includes('Anuncio completo copiado'));const announcement=await admin.evaluate(()=>navigator.clipboard.readText());assert.ok(announcement.includes('¡YA ESTAMOS EN VIVO, FAMILIA BINGUERA!'));assert.ok(announcement.includes('https://www.youtube.com/live/Abcd_123-xy?si=qa'));assert.ok(announcement.endsWith('🍀 ¡Mucha suerte para todos!'));await admin.locator('#transmisionEnviar').click();await admin.getByText('Transmisión enviada a Jugar con tus cartones.',{exact:false}).waitFor();
  const game=await ctx.newPage();game.on('pageerror',e=>errors.push('game: '+e.message));await game.goto('https://bingo.test/jugar/');await game.waitForFunction(()=>document.querySelectorAll('.card img[src]').length===2&&document.querySelectorAll('.cells button:not([disabled])').length>0);
  const mark=game.locator('.cells button[data-number="53"]').first();await mark.click();await game.waitForFunction(()=>document.querySelectorAll('.marked').length===2);
  const marked=await game.locator('.marked').count();await game.locator('#transmisionVer').click();await game.locator('iframe').waitFor();
  await game.screenshot({path:path.join(process.env.QA_OUTPUT||'/tmp','qa-game-'+viewport.width+'.png'),fullPage:true});
  assert.equal(await game.locator('iframe').count(),1);await game.locator('#transmisionDirecto').click();assert.equal(await game.locator('iframe').count(),1);
  await game.locator('#transmisionVer').click();assert.equal(await game.locator('iframe').count(),0);assert.equal(await game.locator('.marked').count(),marked);
  assert.equal(await game.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await admin.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await admin.bringToFront();await admin.locator('#transmisionEnlace').fill('https://youtu.be/ZyXw_123-xy');await admin.locator('#transmisionEnviar').click();await admin.waitForFunction(()=>document.getElementById('transmisionActual').textContent.includes('ZyXw_123-xy'));
  await game.bringToFront();await game.locator('#transmisionActualizar').click();await game.waitForFunction(()=>document.getElementById('transmisionComentarios').href.includes('ZyXw_123-xy'));assert.equal(await game.locator('.marked').count(),marked);
  await admin.bringToFront();admin.once('dialog',d=>d.accept());await admin.locator('#transmisionQuitar').click();await admin.waitForFunction(()=>document.getElementById('transmisionActual').textContent.includes('Sin transmisión'));
  await game.bringToFront();await game.locator('#transmisionActualizar').click();await game.waitForFunction(()=>document.getElementById('transmisionVer').disabled);assert.equal(await game.locator('.marked').count(),marked);
  await admin.screenshot({path:path.join(process.env.QA_OUTPUT||'/tmp','qa-pagos-'+viewport.width+'.png'),fullPage:false});
  assert.deepEqual(errors,[]);assert.ok(!requests.some(r=>r.method!=='GET'&&r.url.includes('supabase.co')&&!r.url.includes('rpc_consultar_cartones')));
  result.push({viewport,passed:true,consoleErrors:errors.length,marksRetained:marked});await ctx.close();
 }
 await browser.close();fs.writeFileSync(path.join(process.env.QA_OUTPUT||'/tmp','browser-qa-result.json'),JSON.stringify({simulatedYouTube:true,simulatedSupabase:true,result},null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exit(1)});
