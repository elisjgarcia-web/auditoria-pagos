/* Vista de trabajo compacta: organiza sin eliminar campos ni cambiar datos del sorteo. */
(function(root){
'use strict';
if(!root.document)return;
const d=root.document,$=id=>d.getElementById(id);
const el=(tag,cls,text)=>{const n=d.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
let abierto=1,preparacion=null,publicacion=null,herramientas=null,premios=null;
function openSection(section,target){
 if(!section)return;
 section.open=true;
 const node=target||section;
 node.scrollIntoView({behavior:'smooth',block:'start'});
}
function details(title,cls){
 const n=el('details',cls),s=el('summary',null,title);n.append(s);return n;
}
function navButton(label,action){
 const b=el('button','cp-nav-btn',label);b.type='button';b.onclick=action;return b;
}
function obtenerNombre(i){return String($('nom'+i)?.value||('Ronda '+i)).trim()||('Ronda '+i);}
function etiquetaRonda(i){
 const n=$('cp-etiqueta-'+i);if(!n)return;
 const premio=String($('pre'+i)?.value||'').trim();
 const cartones=String($('car'+i)?.value||'').trim();
 const titulo=obtenerNombre(i);
 const left=$('cp-nombre-'+i),right=$('cp-datos-'+i);
 if(left)left.textContent=titulo;
 if(right)right.textContent=[premio?premio+' Bs':'Premio pendiente',cartones?'Cartón '+cartones:'Sin ganador'].join(' · ');
}
function campo(input){
 if(!input)return null;
 const wrap=el('div','cp-campo');
 const label=input.previousElementSibling;
 if(label?.tagName==='LABEL')wrap.append(label);
 wrap.append(input);
 return wrap;
}
function abrirRonda(i,scroll=false){
 const target=$('cp-acordeon-'+i);if(!target)return;
 d.querySelectorAll('#rondas .cp-acordeon').forEach(node=>{node.open=node===target;});
 abierto=i;
 if(scroll)target.scrollIntoView({behavior:'smooth',block:'start'});
}
function reconstruirRondas(){
 const presentes=Array.from(d.querySelectorAll('#rondas > .card'));
 if(!presentes.length)return;
 for(const card of presentes){
  if(card.querySelector(':scope > .cp-acordeon'))continue;
  const i=presentes.indexOf(card)+1;
  card.classList.add('cp-ronda');
  const original=Array.from(card.childNodes);
  const acc=details('','cp-acordeon');acc.id='cp-acordeon-'+i;acc.dataset.ronda=String(i);
  const sum=acc.querySelector('summary');sum.className='cp-ronda-resumen';
  const nombre=el('span','cp-ronda-nombre');nombre.id='cp-nombre-'+i;
  const meta=el('span','cp-ronda-meta');meta.id='cp-datos-'+i;
  const icon=el('span','cp-ronda-chevron','⌄');
  const text=el('span','cp-ronda-texto');text.append(nombre,meta);
  sum.append(text,icon);
  const body=el('div','cp-cuerpo');body.append(...original);
  const fields=el('div','cp-entradas');
  const pre=campo($('pre'+i)),car=campo($('car'+i));
  if(pre)fields.append(pre);if(car)fields.append(car);
  body.insertBefore(fields,body.firstChild);
  const nom=campo($('nom'+i));
  if(nom){const edit=details('✎ Cambiar nombre de la ronda','cp-nombre-editar');edit.append(nom);body.insertBefore(edit,fields.nextSibling);}
  acc.append(body);card.replaceChildren(acc);
  acc.addEventListener('toggle',()=>{if(!acc.open)return;abierto=i;d.querySelectorAll('#rondas .cp-acordeon').forEach(node=>{if(node!==acc)node.open=false;});});
  etiquetaRonda(i);
 }
 if(!d.querySelector('#cp-acordeon-'+abierto))abierto=1;
 abrirRonda(abierto);
 root.EnVivoRecepcion?.actualizarRondas?.();
 actualizarNavegacion();
}
function actualizarNavegacion(){
 const nav=$('cp-rondas-nav');if(!nav)return;
 nav.replaceChildren();
 const n=Number($('cant')?.value)||6;
 for(let i=1;i<=n;i++)nav.append(navButton(i===n?'Final':'R'+i,()=>abrirRonda(i,true)));
}
function ordenar(){
 if($('cp-contenedor'))return;
 const first=$('syncStatus')||$('saveStatus'),anchor=$('saveStatus')||first;
 if(!anchor)return;
 d.body.classList.add('cp-modo');
 const host=el('main','cp-contenedor');host.id='cp-contenedor';
 anchor.insertAdjacentElement('afterend',host);
 const nav=el('nav','cp-nav');nav.setAttribute('aria-label','Navegación rápida de pagos');
 nav.append(
  navButton('⚙️ Preparar',()=>openSection(preparacion)),
  navButton('🎟️ Rondas',()=>abrirRonda(abierto,true)),
  navButton('🏆 Cierre',()=>openSection(publicacion)),
  navButton('☰ Más',()=>openSection(herramientas))
 );
 host.append(nav);
 preparacion=details('⚙️ Datos del sorteo y compradores aprobados','cp-bloque cp-preparacion');preparacion.open=true;
 publicacion=details('🏆 Cierre, resumen y publicación','cp-bloque cp-publicacion');
 premios=details('🎁 Pozo, consolación y Top','cp-bloque cp-premios');
 herramientas=details('☰ Otras herramientas y configuración','cp-bloque cp-herramientas');
 const approved=$('supaAuth')?.closest('.card'),config=$('fechaSorteo')?.closest('.card');
 if(approved)preparacion.append(approved);
 if(config)preparacion.append(config);
 host.append(preparacion);
 const title=el('div','cp-rondas-titulo');
 title.append(el('h2',null,'🎟️ Rondas del sorteo'));
 const n=el('div','cp-rondas-nav');n.id='cp-rondas-nav';title.append(n);
 host.append(title);
 const rounds=$('rondas');if(rounds)host.append(rounds);
 host.append(publicacion,premios,herramientas);
 const selection=[
  [publicacion,['res','publicarEstado','publicarComprobantesTitulo','compartirRondasCard']],
  [premios,['premioPozo','premioCon','topCard']],
  [herramientas,['transmisionTitulo','envivoTitulo','ruletaTitulo','supaAuthNever','buscarCartonInput','canvasImg','estadoInformePDF','importarRespaldoArchivo']]
 ];
 for(const [dest,ids] of selection){
  for(const id of ids){const base=$(id);const card=base?.closest('.card');if(card&&card.parentElement!==dest)dest.append(card);}
 }
 // Los avisos generales se mantienen, pero ya no obligan a subir hasta arriba.
 const status=$('syncStatus');if(status)host.prepend(status);
 const save=$('saveStatus');if(save)host.prepend(save);
 d.addEventListener('input',e=>{
  if(e.target?.id&&/^(nom|pre|car)\d+$/.test(e.target.id)){
   const i=Number(e.target.id.match(/\d+$/)[0]);etiquetaRonda(i);
  }
 });
 d.addEventListener('change',e=>{
  if(e.target?.id==='cant')actualizarNavegacion();
 });
 d.addEventListener('pagos-aprobados-cargados',()=>{preparacion.open=false;});
 root.pagosRestauracionLista?.then(()=>{for(let i=1;i<=(Number($('cant')?.value)||6);i++)etiquetaRonda(i);});
 reconstruirRondas();
}
root.PagosCompacto=Object.freeze({reconstruirRondas,abrirRonda,etiquetaRonda,abrirPreparacion:()=>openSection(preparacion)});
ordenar();
})(typeof window!=='undefined'?window:globalThis);
