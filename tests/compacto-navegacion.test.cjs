const {test}=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('abrir otra ronda alinea su encabezado después de cerrar la anterior y conserva campos',()=>{
 const html=read('index.html').replace(/<script[\s\S]*?<\/script>/g,'');
 const dom=new JSDOM(html,{url:'https://test.local/',runScripts:'outside-only'}),w=dom.window;
 try{
 w.document.getElementById('rondas').innerHTML=[1,2,3].map(i=>`<div class="card"><div class="title">Ronda ${i}</div><label>Nombre</label><input id="nom${i}" value="Ronda ${i}"><label>Premio</label><input id="pre${i}" value="45000"><label>Cartones</label><input id="car${i}" value="${100+i}"><button>Generar</button><div class="msg" id="msg${i}">Anuncio</div><div id="pagosBtns${i}"></div></div>`).join('');
 w.document.getElementById('cant').value='6';const raf=[],scroll=[];w.requestAnimationFrame=fn=>raf.push(fn);w.scrollTo=args=>scroll.push(args);
 w.eval(read('compacto-pagos.js'));
 const el=id=>w.document.getElementById(id),sum=el('cp-acordeon-2').querySelector('summary');
 w.document.querySelector('.cp-nav').getBoundingClientRect=()=>({height:50});
 sum.getBoundingClientRect=()=>{assert.equal(el('cp-acordeon-1').open,false);assert.equal(el('cp-acordeon-2').open,true);return{top:400};};
 sum.click();assert.equal(scroll.length,0);while(raf.length)raf.shift()();
 assert.equal(scroll.at(-1).top,342);assert.equal(el('car2').value,'102');assert.equal(el('pre2').value,'45000');
 assert.equal(el('nom2').closest('details').open,false);assert.equal(el('msg2').closest('details').open,false);
 assert.equal(el('pre2').closest('.cp-entradas'),el('car2').closest('.cp-entradas'));
 const blocks=[...el('cp-contenedor').children];assert.ok(blocks.findIndex(n=>n.classList.contains('cp-premios'))<blocks.findIndex(n=>n.classList.contains('cp-publicacion')));
 assert.equal(el('pagCon').hidden,true);assert.equal(el('pagPozo').hidden,true);
 sum.click();assert.equal(el('cp-acordeon-2').open,false);
 }finally{w.close();}
});
