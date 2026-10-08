'use strict';
// Pagine del menù (anteprima e stampa) e creazione dei PDF.
// I file in js/ sono script normali caricati in ordine da index.html: variabili e funzioni sono condivise fra tutti.
/* ---------- Pagine del menù ---------- */
const nl=s=>esc(s).replace(/\n/g,'<br>');
function priceLines(m,kidsCol){
  const pa=num(val(m,'priceAdult')),pk=num(val(m,'priceKid')),lab=val(m,'kidLabel')||'Bambini';
  const L=[];
  const en=LANG==='en',A=en?'Menu price per adult':'Costo del menù Adulti',P=en?'Price per person':'Costo del menù';
  if(kidsCol===undefined){if(pa!=='')L.push(`${A}: ${eurC(pa)}`);if(pk!=='')L.push(`${lab}: ${eurC(pk)}`)}
  else if(kidsCol){if(pk!=='')L.push(`${P}: ${eurC(pk)}`)}
  else if(pa!=='')L.push(`${P}: ${eurC(pa)}`);
  return L;
}
// allergeni: i numeri vengono dall'archivio portate, così una correzione vale per tutti i menù
// Dentro la suite una portata dell'archivio può essere collegata a una ricetta (d.rid): i suoi allergeni sono allora quelli
// calcolati dagli ingredienti della ricetta e nel Menù non si modificano. Vale finché nel menù il testo è quello dell'archivio:
// se lo cambi è un altro piatto e torna a valere la regola di sempre. Fuori dalla suite (SuiteRicette assente) resta tutto a mano.
const RIC=()=>window.SuiteRicette||null;
const ricettaDi=d=>{const R=RIC();return d&&d.rid&&R?R.elenco.find(r=>r.id===d.rid)||null:null};
// una ricetta senza ingredienti non dice niente ('manca'); con ingredienti dagli allergeni non verificati va controllata ('verifica')
const ricState=r=>!r.ingredienti?'manca':r.daVerificare.length?'verifica':'ok';
const ricettaItem=i=>{const d=dishOf(i);return d&&!itemChanged(i)?ricettaDi(d):null};
const algNums=i=>{const r=ricettaItem(i);if(r)return r.allergeni;if(i.alg)return i.alg;const d=i.dishId&&state.dishes.find(x=>x.id===i.dishId);return d&&d.alg||[]};
// Una portata ha gli allergeni "impostati" se ne ha almeno uno oppure se è stato scelto "Nessuno".
const dishSet=d=>!!d&&((Array.isArray(d.alg)&&d.alg.length>0)||d.algSet===true);
const itemChanged=i=>{const d=dishOf(i);return!!d&&oneLine(d.name)!==oneLine(i.name)};
// 'ok', 'manca' (mai indicati) oppure 'verifica' (testo cambiato rispetto all'archivio: quelli ereditati possono non valere più)
const algState=i=>{const r=ricettaItem(i);return r?ricState(r):Array.isArray(i.alg)?'ok':!dishSet(dishOf(i))?'manca':itemChanged(i)?'verifica':'ok'};
const shownSecs=m=>{const l=tplOf(m).layout;return(l==='evento'||l==='libretto')&&m.kids!==false?allSecs(m):m.sections};
const algTodo=m=>m.allergens?shownSecs(m).flatMap(s=>s.items).filter(i=>algState(i)!=='ok'):[];
// eliminando una portata dall'archivio, i menù che la usano si tengono i suoi allergeni
function delDish(id){
  const d=state.dishes.find(z=>z.id===id);if(!d)return;
  const r=ricettaDi(d),alg=r&&ricState(r)!=='manca'?r.allergeni:dishSet(d)?(d.alg||[]):null; // collegata a una ricetta: restano quelli della ricetta
  if(alg)state.menus.forEach(m=>allSecs(m).forEach(sec=>sec.items.forEach(i=>{if(i.dishId===id&&(!Array.isArray(i.alg)||(r&&!itemChanged(i))))i.alg=[...alg]})));
  state.dishes=state.dishes.filter(z=>z.id!==id);
}
const algChips=sh=>`<div class="algs"><button class="${sh.none?'on':''}" data-a="algNone">Nessuno</button>${ALLERGENI.map((a,i)=>`<button class="${(sh.alg||[]).includes(i+1)?'on':''}" data-a="algT" data-n="${i+1}">${i+1}. ${esc(a)}</button>`).join('')}</div>`;
const algTxt=r=>r.allergeni.length?r.allergeni.map(n=>`${n}. ${esc(ALLERGENI[n-1])}`).join(', '):'nessuno';
// riquadro della ricetta collegata (o il pulsante per crearla), nella scheda della portata
function ricInfo(rid){
  const R=RIC(),r=rid&&R.elenco.find(x=>x.id===rid);
  if(!r)return`<button class="btn wide" data-a="mkRecipe" style="margin:-4px 0 12px">${I.plus}Crea la ricetta da questa portata</button>`;
  const st=ricState(r);
  return`<div class="card ${st==='ok'?'':'warn'}" style="margin:-4px 0 12px;font-size:14px">${st==='manca'?'La ricetta <b>'+esc(r.nome)+'</b> non ha ancora ingredienti: finché non li aggiungi, sui menù questa portata risulta da controllare.'
    :st==='verifica'?`Allergeni dalla ricetta <b>${esc(r.nome)}</b>: ${algTxt(r)}. Da controllare: ${r.daVerificare.length===1?'un ingrediente ha':'alcuni ingredienti hanno'} gli allergeni non ancora verificati sull'etichetta (${esc(r.daVerificare.join(', '))}).`
    :`Allergeni dalla ricetta <b>${esc(r.nome)}</b>: ${algTxt(r)}.`}<br>Si correggono nella ricetta, non qui.
    <button class="btn" style="margin-top:8px;width:100%" data-a="openRecipe" data-id="${r.id}">${I.pen}Apri la ricetta</button></div>`;
}
const ricField=sh=>`<label class="fld"><span>Ricetta</span><select class="inp" id="dric"><option value="">Nessuna (allergeni a mano)</option>${RIC().elenco.map(r=>`<option value="${r.id}" ${r.id===sh.rid?'selected':''}>${esc(r.nome)}</option>`).join('')}</select></label><div id="ricinfo">${ricInfo(sh.rid)}</div>`;
const algOf=(m,i)=>{if(!m.allergens)return'';const n=algNums(i);return n.length?`<span class="alg">${n.join(',')}</span>`:''};
function algLegend(m,secs){
  if(!m.allergens)return'';
  const u=[...new Set(secs.flatMap(s=>s.items.flatMap(algNums)))].sort((a,b)=>a-b);
  const N=LANG==='en'?ALLERGENS_EN:ALLERGENI;
  return u.length?`<div class="alg-l">${LANG==='en'?'Allergens':'Allergeni'}: ${u.map(n=>`${n} ${N[n-1]}`).join(' · ')}</div>`:'';
}
function pageVerticale(m,t,mode){
  const secs=m.sections.filter(s=>s.items.length),showT=m.showSections!==false;
  let flow=secs.map(s=>`<div class="v-sec${showT?'':' nt'}">${showT?`<div class="v-sec-t">${esc(s.name)}</div>`:''}${s.items.map(i=>`<div class="v-it">${nl(i.name)}${algOf(m,i)}</div>`).join('')}</div>`).join('');
  if(!secs.length)flow=`<div class="v-empty">Aggiungi le portate per comporre il menù</div>`;
  const foot=[String(val(m,'drinks')).trim(),...(mode==='proposta'?priceLines(m):[])].filter(Boolean);
  const al=algLegend(m,secs);
  if(foot.length)flow+=`<div class="v-foot">${foot.map(nl).join('<br>')}${mode==='proposta'&&m.notes?`<div class="v-notes">${nl(m.notes)}</div>`:''}${al}</div>`;
  else if(mode==='proposta'&&m.notes||al)flow+=`<div class="v-foot">${mode==='proposta'&&m.notes?`<div class="v-notes">${nl(m.notes)}</div>`:''}${al}</div>`;
  return`<div class="pg pg-v" style="width:810px;height:1440px;background-color:${t.bgColor};color:${t.ink}">
    ${t.bgImage?`<div class="pg-bg" style="background-image:url('${t.bgImage}')"></div>`:''}
    ${state.settings.venue?`<div class="v-venue">${esc(state.settings.venue)}</div>`:''}
    <div class="v-title">${esc(heading(m))}</div>
    ${m.showDate!==false&&m.date?`<div class="v-date">${fmtDash(m.date)}</div>`:''}
    <div class="v-flow" style="height:${(t.limit||1240)-318}px"><div class="v-in">${flow}</div></div></div>`;
}
function eventoCol(m,secs,title,drinks,prices,notes,left,width){
  const full=secs.filter(s=>s.items.length);
  const body=full.length?full.map(s=>s.items.map(i=>`<div class="e-it">${nl(i.name)}${algOf(m,i)}</div>`).join('')).join('<div class="e-sep">~~~~~</div>'):`<div class="e-empty">Aggiungi le portate</div>`;
  const foot=[String(drinks||'').trim(),...prices].filter(Boolean).map(nl).join('<br>')+(notes?`<div class="e-notes">${nl(notes)}</div>`:'')+algLegend(m,full);
  // la colonna adulti confina con il logo Tenuta Coppa al centro: il titolo resta a sinistra del logo
  const hs=left<421&&left+width>300?`left:${(width-196)/2}px;right:${(width-196)/2}px`:'';
  return`<div class="e-col" style="left:${left}px;width:${width}px"><div class="e-h" style="${hs}">${esc(title)}</div><div class="e-body">${body}</div><div class="e-foot">${foot}</div></div>`;
}
function pageEvento(m,t,mode){
  const P=mode==='proposta',kids=m.kids!==false;
  return`<div class="pg pg-e" style="width:842px;height:595px;background-color:${t.bgColor};color:${t.ink}">
    ${t.bgImage?`<div class="pg-bg" style="background-image:url('${t.bgImage}')"></div>`:''}
    ${eventoCol(m,m.sections,heading(m),val(m,'drinks'),P?priceLines(m,false):[],P?m.notes:'',50,362)}
    ${kids?eventoCol(m,secList(m,true),val(m,'headingKids')||'Menù bambini',val(m,'drinksKids'),P?priceLines(m,true):[],'',551,220):''}</div>`;
}
function legendHTML(){
  const en=LANG==='en',N=en?ALLERGENS_EN:ALLERGENI,r=(a,b)=>N.slice(a,b).map((x,k)=>`${a+k+1}. ${x}`).join(' | ');
  return`<div class="c-legend">${en?'ALLERGEN INFORMATION (EU Reg. 1169/11)<br>Please note that our dishes may contain ingredients considered allergens.<br>For detailed information please ask our staff.<br>ALLERGEN KEY:':'INFORMATIVA ALLERGENI (Reg. UE 1169/11)<br>Si informa la clientela che i piatti possono contenere ingredienti considerati allergeni.<br>Per informazioni dettagliate rivolgersi al personale.<br>LEGENDA ALLERGENI:'}<br>${r(0,7)} |<br>${r(7,14)}</div>`;
}
function pageClassico(m,t,mode){
  const secs=m.sections.filter(s=>s.items.length),showT=m.showSections!==false,ac=t.accent||'#354469';
  let flow=secs.map(s=>`<div class="c-sec${showT?'':' nt'}">${showT?`<div class="c-sec-t" style="color:${ac}">${esc(s.name)}</div>`:''}${s.items.map(i=>`<div class="c-it">${nl(i.name)}${algOf(m,i)}</div>`).join('')}</div>`).join('');
  if(!secs.length)flow=`<div class="v-empty">Aggiungi le portate per comporre il menù</div>`;
  if(mode==='proposta'){const pl=priceLines(m);if(pl.length||m.notes)flow+=`<div class="c-offer">${pl.map(nl).join('<br>')}${m.notes?`<div class="v-notes">${nl(m.notes)}</div>`:''}</div>`}
  const dr=String(val(m,'drinks')).trim();
  return`<div class="pg pg-c" style="width:595px;height:842px;background-color:${t.bgColor};color:${t.ink}">
    ${t.bgImage?`<div class="pg-bg" style="background-image:url('${t.bgImage}')"></div>`:''}
    ${state.settings.venue?`<div class="c-venue">${esc(state.settings.venue)}</div>`:''}
    ${t.tagline?`<div class="c-tag">${esc(t.tagline)}</div>`:''}
    <div class="c-title">${esc(heading(m))}</div>
    ${t.subheading?`<div class="c-sub">${esc(t.subheading)}</div>`:''}
    <div class="c-flow" style="height:${(t.limit||698)-151}px"><div class="c-in">${flow}</div></div>
    ${dr?`<div class="c-drinks">${nl(dr)}</div>`:''}
    ${t.legend!==false?legendHTML():''}</div>`;
}
/* Libretto A5: copertina e interno su due fogli, ritagliati da A4 e legati con i laccetti sul lato sinistro */
const LIB={top:132,bottom:392,fs:14};
const dateBook=s=>s?parseD(s).toLocaleDateString(LANG==='en'?'en-GB':'it-IT',{day:'numeric',month:'long',year:'numeric'}):'';
function pageCover(m,t){
  return`<div class="pg pg-lc" style="width:595px;height:421px;background-color:${t.bgColor};color:${t.ink}">
    ${t.coverImage?`<div class="pg-bg" style="background-image:url('${t.coverImage}')"></div>`:''}
    <div class="lc-t">${esc(heading(m))}</div>
    ${m.showDate!==false&&m.date?`<div class="lc-d">${dateBook(m.date)}</div>`:''}
    ${state.settings.venue?`<div class="lc-v">${esc(state.settings.venue)}</div>`:''}</div>`;
}
function pageLibretto(m,t,mode){
  const P=mode==='proposta',showT=m.showSections!==false;
  const blk=(title,items,cls='')=>`<div class="l-sec${cls}">${title?`<div class="l-sec-t">${esc(title)}</div>`:''}${items}</div>`;
  const its=L=>L.map(i=>`<div class="l-it">${nl(i.name)}${algOf(m,i)}</div>`).join('');
  const secs=m.sections.filter(s=>s.items.length);
  const B=secs.map(s=>blk(showT?s.name:'',its(s.items)));
  const kidItems=m.kids!==false?secList(m,true).flatMap(s=>s.items):[];
  if(kidItems.length)B.push(blk(val(m,'headingKids')||'Menù bambini',its(kidItems)));
  const dr=String(val(m,'drinks')).trim();
  if(dr)B.push(blk(showT?(t.drinksTitle||''):'',`<div class="l-it">${nl(dr)}</div>`));
  if(P){const pl=priceLines(m);if(pl.length||m.notes)B.push(blk('',`${pl.map(nl).join('<br>')}${m.notes?`<div class="v-notes">${nl(m.notes)}</div>`:''}`,' l-offer'))}
  const al=algLegend(m,[...secs,{items:kidItems}]);if(al)B.push(blk('',al,' l-alg'));
  if(!B.length)B.push(`<div class="l-sec"><div class="v-empty">Aggiungi le portate per comporre il menù</div></div>`);
  return`<div class="pg pg-l" style="width:595px;height:421px;background-color:${t.bgColor};color:${t.ink}">
    ${t.bgImage?`<div class="pg-bg" style="background-image:url('${t.bgImage}')"></div>`:''}
    <div class="l-col l-a">${B.join('')}</div><div class="l-rule"></div><div class="l-col l-b"></div></div>`;
}
function pageHTML(m,t,mode,lang,part){
  if(lang!=='en')return pageHTMLit(m,t,mode,part);
  const[m2,t2]=localize(m,t);LANG='en';TPL_OV=t2;
  try{return pageHTMLit(m2,t2,mode,part)}finally{LANG='it';TPL_OV=null}
}
const pageHTMLit=(m,t,mode,part)=>t.layout==='libretto'?(part==='cover'?pageCover(m,t):pageLibretto(m,t,mode)):t.layout==='evento'?pageEvento(m,t,mode):t.layout==='classico'?pageClassico(m,t,mode):pageVerticale(m,t,mode);
// adatta il testo alla pagina; restituisce quanto è stato ridotto e se qualcosa esce comunque
function fitPage(pg){fitPageRaw(pg);
  let k=1,over=false;
  pg.querySelectorAll('.v-flow,.c-flow').forEach(f=>{const inn=f.firstElementChild;k=Math.min(k,parseFloat(inn.style.fontSize)/(pg.classList.contains('pg-c')?17:19));if(inn.offsetHeight>f.clientHeight+1)over=true});
  pg.querySelectorAll('.e-col').forEach(c=>{const b=c.querySelector('.e-body');k=Math.min(k,parseFloat(b.style.fontSize)/11.4);if(b.offsetHeight>c._avail+1)over=true});
  if(pg.classList.contains('pg-l')){const A=pg.querySelector('.l-a'),B=pg.querySelector('.l-b');k=Math.min(k,parseFloat(A.style.fontSize)/LIB.fs);if(Math.max(A.offsetHeight,B.offsetHeight)>LIB.bottom-LIB.top+1)over=true}
  return{k,over};
}
const V_GROW=1.3; // ingrandimento massimo del testo nei menù verticali corti
function fitPageRaw(pg){
  if(pg.classList.contains('pg-lc')){
    const ti=pg.querySelector('.lc-t');let fs=44;ti.style.fontSize=fs+'px';
    while(ti.scrollWidth>ti.clientWidth+1&&fs>22){fs--;ti.style.fontSize=fs+'px'}
  }else if(pg.classList.contains('pg-l')){
    // divide i blocchi fra le due colonne in modo che finiscano alla stessa altezza, poi rimpicciolisce se serve
    const A=pg.querySelector('.l-a'),B=pg.querySelector('.l-b'),blocks=[...pg.querySelectorAll('.l-sec')],avail=LIB.bottom-LIB.top;
    const lay=k=>{A.style.fontSize=B.style.fontSize=(LIB.fs*k)+'px';blocks.forEach(b=>A.appendChild(b));
      const h=blocks.map(b=>b.offsetHeight),g=.75*LIB.fs*k,n=h.length,col=(a,b)=>b>a?h.slice(a,b).reduce((x,y)=>x+y,0)+g*(b-a-1):0;
      let s=n,best=Infinity;for(let i=1;i<=n;i++){const mx=Math.max(col(0,i),col(i,n));if(mx<best-.5){best=mx;s=i}}
      blocks.slice(s).forEach(b=>B.appendChild(b));return best};
    let k=1,n=0,hh=lay(k);while(hh>avail&&k>.45&&n++<90){k*=.97;hh=lay(k)}
    const r=pg.querySelector('.l-rule');r.style.height=Math.max(40,Math.min(hh,avail))+'px';r.style.display=B.children.length?'':'none';
    if(!B.children.length){A.style.left='50%';A.style.transform='translateX(-50%)'}
  }else if(pg.classList.contains('pg-c')){
    const ti=pg.querySelector('.c-title');let fs=25;ti.style.fontSize=fs+'px';
    while(ti.scrollWidth>ti.clientWidth+1&&fs>14){fs--;ti.style.fontSize=fs+'px'}
    const f=pg.querySelector('.c-flow'),inn=f.firstElementChild;let k=1,n=0;inn.style.fontSize='17px';
    while(inn.offsetHeight>f.clientHeight&&k>.45&&n++<90){k*=.97;inn.style.fontSize=(17*k)+'px'}
  }else if(pg.classList.contains('pg-v')){
    const ti=pg.querySelector('.v-title');let fs=57;ti.style.fontSize=fs+'px';
    while(ti.scrollWidth>ti.clientWidth+1&&fs>26){fs--;ti.style.fontSize=fs+'px'}
    const f=pg.querySelector('.v-flow'),inn=f.firstElementChild,a4=pg.classList.contains('a4');
    const stringi=()=>{let k=1,n=0;inn.style.fontSize='19px';while(inn.offsetHeight>f.clientHeight&&k>.45&&n++<90){k*=.97;inn.style.fontSize=(19*k)+'px'}return k};
    inn.style.removeProperty('--sp');inn.style.removeProperty('--lh');let k=stringi();
    // Sul foglio A4 (PDF) un menù lungo stringe prima gli stacchi fra le sezioni e l'interlinea, e solo dopo
    // rimpicciolisce le scritte: così la pagina può essere ingrandita fino a riempire la larghezza del foglio.
    if(k<1&&a4){inn.style.setProperty('--sp','.8');k=stringi()}
    if(k<1&&a4){inn.style.setProperty('--sp','.6');inn.style.setProperty('--lh','1.3');k=stringi()}
    // Menù che non riempie la pagina: il testo cresce (al massimo del 30%) finché occupa lo spazio libero sopra
    // l'illustrazione. Se a spaziatura normale non arriva al massimo, gli stacchi fra le sezioni si stringono
    // di un quinto e riprova: a quel punto conta di più la grandezza delle scritte.
    if(k===1){const max=(f._pulito||f.clientHeight)*.95;let g=1;
      const cresci=()=>{while(g<V_GROW){const t=Math.min(V_GROW,g+.01);inn.style.fontSize=(19*t)+'px';if(inn.offsetHeight>max){inn.style.fontSize=(19*g)+'px';break}g=t}};
      cresci();
      if(g<V_GROW&&!inn.style.getPropertyValue('--sp')){const prima=g;inn.style.setProperty('--sp','.8');cresci();if(g<prima+.02){g=prima;inn.style.removeProperty('--sp');inn.style.fontSize=(19*g)+'px'}}}
    // Foglio A4: le portate non devono mai uscire più piccole che nella pagina di sempre (f._prima), anche quando per
    // riuscirci il testo scende fino al limite previsto dal template, accanto all'illustrazione.
    if(a4&&f._prima&&parseFloat(inn.style.fontSize)<f._prima-.05){const era=inn.style.fontSize,sp=inn.style.getPropertyValue('--sp');
      inn.style.fontSize=f._prima+'px';
      const lh=inn.style.getPropertyValue('--lh');
      if(inn.offsetHeight>f.clientHeight)inn.style.setProperty('--sp','.8');
      if(inn.offsetHeight>f.clientHeight){inn.style.setProperty('--sp','.6');inn.style.setProperty('--lh','1.3')}
      if(inn.offsetHeight>f.clientHeight){inn.style.fontSize=era;
        if(sp)inn.style.setProperty('--sp',sp);else inn.style.removeProperty('--sp');
        if(lh)inn.style.setProperty('--lh',lh);else inn.style.removeProperty('--lh')}}
  }else{
    const cols=[...pg.querySelectorAll('.e-col')];
    cols.forEach(c=>{const h=c.querySelector('.e-h');let fs=19.5;h.style.whiteSpace='nowrap';h.style.top='103px';h.style.fontSize=fs+'px';
      while(h.scrollWidth>h.clientWidth+1&&fs>15){fs--;h.style.fontSize=fs+'px'}
      if(h.scrollWidth>h.clientWidth+1){ // titolo lungo: va su due righe, che crescono verso l'alto per non toccare le portate
        h.style.whiteSpace='normal';while((h.offsetHeight>fs*1.1*2+2||h.scrollWidth>h.clientWidth+1)&&fs>11){fs--;h.style.fontSize=fs+'px'}
        h.style.top=(103+19.5*1.1-h.offsetHeight)+'px'}
      c._avail=(595-62.8-c.querySelector('.e-foot').offsetHeight-14)-141});
    let k=1,n=0;const set=()=>cols.forEach(c=>c.querySelector('.e-body').style.fontSize=(11.4*k)+'px');set();
    while(cols.some(c=>c.querySelector('.e-body').offsetHeight>c._avail)&&k>.45&&n++<90){k*=.97;set()}
  }
}
function mountPreview(hostId,m,tpl,mode,lang,part){
  const host=document.getElementById(hostId);if(!host)return;
  host.innerHTML=`<div class="pv-scale">${pageHTML(m,tpl,mode,lang,part)}</div>`;
  const sc=host.firstElementChild,pg=sc.firstElementChild,fit=fitPage(pg);
  const w=document.getElementById(hostId+'-warn');
  const small=tpl.layout==='libretto';
  if(w)w.innerHTML=small&&(fit.over||fit.k<.8)?`<div class="card warn">Il libretto è un A5: con tante portate il testo diventa ${fit.over?'troppo lungo e alcune portate escono dalla pagina':`più piccolo del ${Math.round((1-fit.k)*100)}%`}. Accorcia le descrizioni più lunghe o togli qualche portata; per un menù molto ricco scegli un template A4.</div>`
    :fit.over?`<div class="card warn">Il menù è troppo lungo: alcune portate escono dalla pagina. Togli qualche portata, unisci quelle simili o scegli un template A4.</div>`
    :fit.k<.72?`<div class="card warn">Il menù è lungo: il testo è stato rimpicciolito del ${Math.round((1-fit.k)*100)}% e in stampa potrebbe leggersi male. Valuta di togliere qualche portata o di usare un template A4.</div>`:'';
  const W=pg.offsetWidth,H=pg.offsetHeight,avail=host.clientWidth-8;
  const s=Math.min(avail/W,Math.max(380,window.innerHeight*.66)/H,1);
  sc.style.transform=`scale(${s})`;sc.style.marginLeft=((host.clientWidth-W*s)/2)+'px';host.style.height=(H*s+14)+'px';
}
function sampleMenu(t){
  const pick=c=>state.dishes.filter(d=>d.cat===c).slice(0,c==='Antipasti'?4:2).map(d=>({dishId:d.id,name:d.name}));
  return{templateId:t.id,heading:'',date:today(),showDate:true,showSections:true,kids:true,sections:state.categories.map(c=>({name:c,items:pick(c)})),
    kidsSections:KIDS_SECS.map((c,i)=>({name:c,items:state.dishes.filter(d=>d.cat===KIDS_CAT).slice(i,i+1).map(d=>({dishId:d.id,name:d.name}))}))};
}
function mountPreviews(){
  if(ui.view==='preview'){const m=getMenu(ui.editId);if(m){mountPreview('pv',m,tplOf(m),ui.pv.mode,ui.pv.lang);mountPreview('pvc',m,tplOf(m),ui.pv.mode,ui.pv.lang,'cover')}}
  if(ui.view==='tpl'){const t=getTpl(ui.tplId);if(t){const sm=sampleMenu(t);mountPreview('tplpv',sm,t,'proposta');mountPreview('tplpvc',sm,t,'proposta','it','cover')}}
}
const FONTS=['400 20px Raleway','700 20px Raleway','20px Antic','400 20px "Cormorant Garamond"','700 20px "Cormorant Garamond"','italic 500 20px "Cormorant Garamond"','20px "Great Vibes"'];
const loadFonts=()=>Promise.all(FONTS.map(f=>document.fonts.load(f).catch(()=>{}))).then(()=>document.fonts.ready);

/* ---------- PDF ---------- */
async function makeImage(m,mode){
  const canvas=await makePDF(m,mode,true);
  return await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.9));
}
async function snapPage(m,t,mode,part,scale){
  const host=$('#rh');host.innerHTML=pageHTML(m,t,mode,ui.view==='preview'?ui.pv.lang:'it',part);
  const pg=host.firstElementChild;fitPage(pg);
  const src=part==='cover'?t.coverImage:t.bgImage;
  if(src)await new Promise(r=>{const i=new Image();i.onload=i.onerror=r;i.src=src});
  try{return await html2canvas(pg,{scale,backgroundColor:t.bgColor||'#ffffff',useCORS:true,logging:false,scrollX:0,scrollY:0})}
  finally{host.innerHTML=''}
}
// libretto da mandare al cliente: PDF A5 con copertina e menù
async function makeBookletPDF(m,mode){
  const t=tplOf(m),pdf=new window.jspdf.jsPDF({orientation:'l',unit:'mm',format:'a5'});
  const c1=await snapPage(m,t,mode,'cover',3),c2=await snapPage(m,t,mode,'',3);
  pdf.addImage(c1.toDataURL('image/jpeg',0.92),'JPEG',0,0,210,148);pdf.addPage('a5','l');
  pdf.addImage(c2.toDataURL('image/jpeg',0.92),'JPEG',0,0,210,148);
  return pdf.output('blob');
}
// libretto da stampare: A4 verticale, pag. 1 due copertine, pag. 2 due menù; tacche di taglio a metà e segni dei fori a sinistra
async function makeBookletSheet(m,holes){
  if(!window.html2canvas||!window.jspdf)throw new Error('librerie non caricate. Riapri l\'app.');
  await loadFonts();
  const t=tplOf(m),pdf=new window.jspdf.jsPDF({orientation:'p',unit:'mm',format:'a4'}),H=148.5;
  const pages=[await snapPage(m,t,'tavolo','cover',4),await snapPage(m,t,'tavolo','',4)];
  pages.forEach((cv,i)=>{
    if(i)pdf.addPage('a4','p');
    const img=cv.toDataURL('image/jpeg',0.92);
    pdf.addImage(img,'JPEG',0,0,210,H);pdf.addImage(img,'JPEG',0,H,210,H);
    pdf.setLineWidth(0.2);pdf.setDrawColor(185);
    pdf.line(3,H,9,H);pdf.line(201,H,207,H); // taglio: le tacche cadono sulla linea e spariscono col taglio
    if(holes){pdf.setDrawColor(200);[0,H].forEach(oy=>[H/2-40,H/2+40].forEach(y=>{pdf.line(12-1.6,oy+y,12+1.6,oy+y);pdf.line(12,oy+y-1.6,12,oy+y+1.6)}))}
  });
  return pdf.output('blob');
}
// Menù verticale su foglio A4. Il verticale (9:16) è più stretto dell'A4: messo sul foglio a tutta altezza lascia due fasce
// vuote ai lati, e scritte e illustrazione vengono piccole rispetto alla carta. Per il PDF la pagina viene quindi ricomposta
// nelle proporzioni dell'A4: si recupera lo spazio bianco (in alto, e fra il testo e l'illustrazione) e si ingrandisce tutto
// insieme — titolo, portate, illustrazione — fino a occupare tutta la larghezza del foglio (+26%), come nell'immagine.
// Un menù lungo, per starci, stringe stacchi e interlinea; la pagina si allarga solo finché le portate restano
// almeno il 5% più grandi di prima sul foglio. L'immagine JPG non cambia.
// Restituisce l'ingrandimento applicato (1 = pagina invariata).
const A4_R=210/297,A4_SU=55; // A4_SU: quanto sale l'intestazione, che nel 9:16 ha molto bianco sopra
// riga (su 1440) da cui parte il disegno in fondo a ogni illustrazione: sopra quella riga il testo non la tocca
const ARTE_DA={'domenica-pecore':1106,'domenica-girasole':1133,'domenica-muretto':1227,'domenica-spighe':1186,'domenica-ulivo':1184};
function verticaleA4(pg,t){
  const L=LAYOUTS.verticale,lim=t.limit||1240,img=t.bgImage||'',nome=(img.match(/^assets\/(domenica-[a-z]+)\.jpg$/)||[])[1];
  if(img&&!ARTE_DA[nome])return 1; // sfondo caricato da te: non si sa dove lo si può tagliare
  const f=pg.querySelector('.v-flow'),inn=f&&f.firstElementChild;if(!inn||pg.querySelector('.v-empty'))return 1;
  fitPageRaw(pg);const prima=parseFloat(inn.style.fontSize); // grandezza delle portate nella pagina di sempre
  const arte=Math.min(lim,(ARTE_DA[nome]||lim)-10),sotto=L.h-arte+30,sMax=L.h*A4_R/L.w,bg=pg.querySelector('.pg-bg');
  let alto=null,basso=null;
  if(bg){ // l'illustrazione in due pezzi: la parte alta resta accanto al titolo, quella bassa scende in fondo al foglio
    const u=bg.style.backgroundImage.replace(/"/g,"'"),pezzo=()=>`<div style="position:absolute;width:${L.w}px;overflow:hidden"><div class="pg-bg" style="height:${L.h}px;background-image:${u}"></div></div>`;
    bg.insertAdjacentHTML('afterend',pezzo()+pezzo());alto=bg.nextElementSibling;basso=alto.nextElementSibling;bg.remove();
  }
  pg.classList.add('a4');
  pg.querySelectorAll('.v-venue,.v-title,.v-date,.v-flow').forEach(e=>{e.style.top=(parseFloat(getComputedStyle(e).top)-A4_SU)+'px'});
  const ti=pg.querySelector('.v-title'),su=parseFloat(f.style.top);
  const posa=sc=>{const H=L.h/sc,W=H*A4_R,x=(W-L.w)/2;
    pg.style.width=W+'px';pg.style.height=H+'px';
    if(alto){alto.style.cssText+=`;left:${x}px;top:0;height:${H-sotto}px`;alto.firstElementChild.style.top=-A4_SU+'px';
      basso.style.cssText+=`;left:${x}px;top:${H-sotto}px;height:${sotto}px`;basso.firstElementChild.style.top=(sotto-L.h)+'px'}
    if(ti){ti.style.left=(x+24)+'px';ti.style.right=(x+24)+'px'}
    f.style.left=(x+40)+'px';f.style.right=(x+40)+'px';f.style.height=(H-su-(L.h-lim))+'px';f._pulito=H-su-(L.h-arte);
    // va bene se sul foglio le portate escono almeno il 5% più grandi di prima (sc ingrandisce anche loro);
    // f._prima è la grandezza a cui fitPageRaw porta il testo anche scendendo accanto all'illustrazione
    f._prima=Math.min(prima*(piu||1.05)/sc,19*V_GROW);
    fitPageRaw(pg);return parseFloat(inn.style.fontSize)>=f._prima-.05&&inn.offsetHeight<=f.clientHeight};
  let piu=0;
  if(posa(sMax))return sMax;
  let lo=1,hi=sMax,ok=false;for(let i=0;i<7;i++){const mid=(lo+hi)/2;if(posa(mid)){lo=mid;ok=true}else hi=mid}
  if(ok){posa(lo);return lo}
  piu=1;posa(1);return 1; // nessun ingrandimento possibile: foglio A4 con le portate grandi come prima
}
// forPrint: risoluzione più alta (circa 290–370 dpi sul foglio) per i PDF da stampare; per WhatsApp resta quella leggera
async function makePDF(m,mode,asCanvas,forPrint){
  if(!window.html2canvas||!window.jspdf)throw new Error('librerie non caricate. Riapri l\'app.');
  await loadFonts();
  if(tplOf(m).layout==='libretto'){if(asCanvas)return snapPage(m,tplOf(m),mode,'',3);return makeBookletPDF(m,mode)}
  const t=tplOf(m),L=layoutOf(m),host=$('#rh');host.innerHTML=pageHTML(m,t,mode,ui.view==='preview'?ui.pv.lang:'it');
  const pg=host.firstElementChild,a4=!asCanvas&&L===LAYOUTS.verticale?verticaleA4(pg,t):1;fitPage(pg);
  if(t.bgImage)await new Promise(r=>{const i=new Image();i.onload=i.onerror=r;i.src=t.bgImage});
  try{
    const canvas=await html2canvas(pg,{scale:(forPrint?(L.print||L.scale):L.scale)*a4,backgroundColor:t.bgColor||'#ffffff',useCORS:true,logging:false,scrollX:0,scrollY:0});
    if(asCanvas)return canvas;
    const img=canvas.toDataURL('image/jpeg',forPrint?0.95:0.92);
    if(L===LAYOUTS.verticale){
      // Il verticale (9:16) non è un formato di carta: in una pagina di quella misura, stampando su A4 il menù
      // finisce rimpicciolito contro il bordo sinistro. Il PDF è quindi sempre un A4, con il menù a tutta altezza e centrato.
      // (se la pagina è stata ricomposta in A4, vedi verticaleA4, l'immagine occupa tutto il foglio)
      const pdf=new window.jspdf.jsPDF({orientation:'p',unit:'mm',format:'a4'}),iw=a4>1?210:297*L.w/L.h,bg=String(t.bgColor||'#ffffff').toLowerCase();
      if(bg!=='#ffffff'&&bg!=='#fff'){pdf.setFillColor(bg);pdf.rect(0,0,210,297,'F')}
      pdf.addImage(img,'JPEG',(210-iw)/2,0,iw,297);
      return pdf.output('blob');
    }
    const w=L.w*PT_MM,h=L.h*PT_MM;
    const pdf=new window.jspdf.jsPDF({orientation:w>h?'l':'p',unit:'mm',format:[w,h]});
    pdf.addImage(img,'JPEG',0,0,w,h);
    return pdf.output('blob');
  }finally{host.innerHTML=''}
}
async function doPDF(){
  const m=getMenu(ui.editId);if(!m)return;const mode=ui.pv.mode;
  busy(true,'Creo il PDF');
  try{
    const lay=tplOf(m).layout,lib=lay==='libretto'&&mode==='tavolo';
    const blob=lib?await makeBookletSheet(m,m.holes!==false):await makePDF(m,mode,false,true);
    const name=`${lib?'Libretto-da-stampare':mode==='tavolo'?'Menu-tavolo':'Proposta'}_${slug(heading(m)+' '+(m.client||''))}_${fmtDash(m.date)||'senza-data'}${ui.pv.lang==='en'?'_EN':''}.pdf`;
    ui.sheet={type:'file',blob,name,mime:'application/pdf',title:lib?'Libretto pronto da stampare':mode==='tavolo'?'Menù tavolo pronto':'Proposta pronta'};
  }catch(e){toast('PDF non creato: '+(e.message||e))}
  finally{busy(false);renderSheet()}
}
const AND=window.Android&&window.Android.saveFile?window.Android:null;
const b64=b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=()=>rej(r.error);r.readAsDataURL(b)});
const markBackup=()=>{const s=ui.sheet;if(s&&s.old)return;state.settings.lastBackup=Date.now();save()};
const backupDone=s=>{if(s&&s.backup)markBackup()};
async function shareFile(){
  const s=ui.sheet;
  if(AND){
    try{AND.saveFile(await b64(s.blob),s.name,s.mime,true);
      // dall'app non si può sapere se l'invio è andato a buon fine o è stato annullato: lo chiedo
      if(s.backup){s.step='conf';setTimeout(renderSheet,800)}
    }catch(e){toast('Condivisione non riuscita')}return}
  const file=new File([s.blob],s.name,{type:s.mime});
  try{await navigator.share({files:[file],title:s.name});backupDone(s)}catch(e){if(e.name!=='AbortError')downloadFile()}
}
async function downloadFile(){
  const s=ui.sheet;
  if(AND){try{AND.saveFile(await b64(s.blob),s.name,s.mime,false)}catch(e){toast('Apertura non riuscita')}return} // nell'app Android apre il file, non lo salva
  const u=URL.createObjectURL(s.blob),a=document.createElement('a');
  a.href=u;a.download=s.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);backupDone(s);
}
// "Salva con nome" di Android: l'app sa se il file è stato scritto davvero
let saveTok=null;
async function saveAsNative(){
  const s=ui.sheet;if(!s||!AND||!AND.saveAs)return;
  try{saveTok=uid();AND.saveAs(saveTok,await b64(s.blob),s.name,s.mime)}catch(e){saveTok=null;toast('Salvataggio non riuscito')}
}
window.onNativeSaved=(tok,ok)=>{
  if(tok!==saveTok)return;saveTok=null;
  if(!ok){toast('Non salvato: nessun file è stato scritto');return}
  const s=ui.sheet;if(s&&s.backup){markBackup();ui.sheet=null;renderSheet();render(true)}
  toast('File salvato');
};
const canShareFiles=()=>{if(AND)return true;try{return!!(navigator.canShare&&navigator.canShare({files:[new File(['x'],'x.pdf',{type:'application/pdf'})]}))}catch(e){return false}};
