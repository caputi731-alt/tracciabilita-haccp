'use strict';
// Elenco portate da inviare (scelte di Luca del 20/10/2026): un elenco con nome, prezzo e breve descrizione delle portate,
// preso dall'archivio, da mandare come immagine o PDF a chi lo chiede. Tutte le categorie dell'archivio.
// - Modelli: elenchi con un nome (model:true) che si riusano; "Nuovo elenco" parte da un modello (copia) o da zero.
// - Nome, descrizione e prezzo vengono dall'archivio portate; cambiati in un elenco valgono solo lì (campo `edited`),
//   gli altri seguono l'archivio anche dopo (un prezzo aggiornato nell'archivio vale anche per i modelli già fatti).
// - Allergeni: stesso interruttore e stesse regole dei menù (algNums / algState in 03-pagine.js).
// - Pagina A4 (595×842 pt), sempre chiara: immagine = un'unica pagina lunga, PDF = una o più pagine A4.
// I file in js/ sono script normali caricati in ordine da index.html: variabili e funzioni sono condivise fra tutti.

/* ---------- Dati ---------- */
const EL_W=595,EL_H=842,EL_MARGINE=56;
const EL_CAMPI=['name','desc','price'];
const elenchi=()=>state.lists||(state.lists=[]);
const getEl=id=>elenchi().find(x=>x.id===id);
const elDish=i=>i&&i.dishId?state.dishes.find(x=>x.id===i.dishId)||null:null;
const elModificato=(i,f)=>Array.isArray(i.edited)&&i.edited.includes(f);
const elArchivio=(d,f)=>f==='name'?oneLine(d.name):f==='desc'?String(d.desc||''):(d.price===undefined?'':d.price);
// valore mostrato: quello dell'archivio, salvo che sia stato cambiato in questo elenco (o la portata non ci sia più)
function elVal(i,f){const d=elDish(i);return d&&!elModificato(i,f)?elArchivio(d,f):(i[f]??'')}
// la portata come la vedono le regole degli allergeni dei menù
const elAlgItem=i=>({dishId:i.dishId,name:elVal(i,'name'),alg:i.alg});
const elNuovaVoce=d=>({dishId:d.id,name:oneLine(d.name),desc:String(d.desc||''),price:d.price===undefined?'':d.price,edited:[]});
const elPrezzo=p=>p===''||p===null||p===undefined?'':eurC(p);
function nuovoElenco(modello){
  const base=modello?clone(modello):{name:'Le nostre portate',allergens:false,notes:'',sections:allCats().map(c=>({name:c,items:[]}))};
  return{...base,id:uid(),model:false,from:modello?modello.id:null,created:Date.now(),updated:Date.now()};
}
const elTocca=e=>{e.updated=Date.now();save()};
const elPiene=e=>e.sections.filter(s=>s.items.length);

/* ---------- Pagina ---------- */
function elBlocchi(e){
  const B=[],venue=state.settings.venue||'';
  B.push({k:'head',h:`<div class="el-blk el-head">${venue?`<div class="el-venue">${esc(venue)}</div>`:''}<div class="el-title">${nl(e.name||'Le nostre portate')}</div><div class="el-rule"></div></div>`});
  elPiene(e).forEach(s=>{
    B.push({k:'sec',h:`<div class="el-blk el-sec-t">${esc(s.name)}</div>`});
    s.items.forEach(i=>{
      const n=e.allergens?algNums(elAlgItem(i)):[],p=elPrezzo(elVal(i,'price')),ds=String(elVal(i,'desc')).trim();
      B.push({k:'it',h:`<div class="el-blk el-it"><div class="el-r"><span class="el-n">${esc(elVal(i,'name'))}${n.length?`<span class="el-alg">${n.join(',')}</span>`:''}</span>${p?`<span class="el-dots"></span><span class="el-p">${esc(p)}</span>`:''}</div>${ds?`<div class="el-d">${nl(ds)}</div>`:''}</div>`});
    });
  });
  if(!elPiene(e).length)B.push({k:'vuoto',h:`<div class="el-blk el-vuoto">Aggiungi le portate all'elenco</div>`});
  if(String(e.notes||'').trim())B.push({k:'note',h:`<div class="el-blk el-note">${nl(String(e.notes).trim())}</div>`});
  if(e.allergens){
    const u=[...new Set(elPiene(e).flatMap(s=>s.items.flatMap(i=>algNums(elAlgItem(i)))))].sort((a,b)=>a-b);
    if(u.length)B.push({k:'leg',h:`<div class="el-blk el-leg">Allergeni: ${u.map(x=>`${x} ${esc(ALLERGENI[x-1])}`).join(' · ')}</div>`});
  }
  return B;
}
const elPaginaHTML=(blocchi,alta)=>`<div class="pg el-pg" style="width:${EL_W}px;${alta?`height:${EL_H}px`:`min-height:${EL_H}px`}"><div class="el-in">${blocchi.map(b=>b.h).join('')}</div></div>`;
// divide i blocchi in pagine A4: il titolo di una sezione non resta mai da solo in fondo a una pagina
function elPagine(e){
  const B=elBlocchi(e),host=$('#rh');
  host.innerHTML=elPaginaHTML(B,false);
  const alt=[...host.querySelectorAll('.el-blk')].map(x=>x.offsetHeight);host.innerHTML='';
  const max=EL_H-2*EL_MARGINE,pagine=[[]];let usato=0;
  B.forEach((b,i)=>{
    const h=alt[i],conSeguente=b.k==='sec'&&B[i+1]?h+alt[i+1]:h;
    if(usato>0&&usato+conSeguente>max){pagine.push([]);usato=0}
    pagine[pagine.length-1].push(b);usato+=h;
  });
  return pagine;
}
async function elFoto(html,scala){
  const host=$('#rh');host.innerHTML=html;
  try{return await html2canvas(host.firstElementChild,{scale:scala,backgroundColor:'#ffffff',useCORS:true,logging:false,scrollX:0,scrollY:0})}
  finally{host.innerHTML=''}
}
const elPronto=async()=>{if(!window.html2canvas||!window.jspdf)throw new Error('librerie non caricate. Riapri l\'app.');await loadFonts()};
// immagine per WhatsApp: tutto l'elenco in una sola pagina, lunga quanto serve
async function elImmagine(e){
  await elPronto();
  const c=await elFoto(elPaginaHTML(elBlocchi(e),false),2.4);
  return await new Promise(r=>c.toBlob(r,'image/jpeg',0.9));
}
async function elPDF(e,stampa){
  await elPronto();
  const pdf=new window.jspdf.jsPDF({orientation:'p',unit:'mm',format:'a4'});
  const P=elPagine(e);
  for(let k=0;k<P.length;k++){
    const c=await elFoto(elPaginaHTML(P[k],true),stampa?4:3);
    if(k)pdf.addPage('a4','p');
    pdf.addImage(c.toDataURL('image/jpeg',stampa?0.95:0.92),'JPEG',0,0,210,297);
  }
  return pdf.output('blob');
}
const elNomeFile=e=>`Elenco-portate_${slug(e.name||'portate')}_${fmtDash(today())}`;
function elMessaggio(){
  const v=state.settings.venue||'Tenuta Coppa';
  return`Buongiorno,\ncome richiesto le invio l'elenco delle nostre portate.\nResto a disposizione per qualsiasi informazione.\nUn cordiale saluto,\n${v}`;
}
async function elWa(fmt){
  const e=getEl(ui.elId);if(!e)return;fmt=fmt||state.settings.waFmt||'img';
  const old=ui.sheet&&ui.sheet.type==='wa'?ui.sheet:null;
  busy(true,fmt==='pdf'?'Preparo il PDF':"Preparo l'immagine");
  try{
    const base=elNomeFile(e);
    const f=fmt==='pdf'?{blob:await elPDF(e),name:base+'.pdf',mime:'application/pdf'}:{blob:await elImmagine(e),name:base+'.jpg',mime:'image/jpeg'};
    ui.sheet={type:'wa',title:"Invia l'elenco",files:[f],fmt,elId:e.id,
      text:old?$('#watext').value:elMessaggio(),phone:old?$('#waphone').value:''};
  }catch(err){toast('File non creato: '+(err.message||err))}
  finally{busy(false);renderSheet()}
}
async function elFilePDF(){
  const e=getEl(ui.elId);if(!e)return;
  busy(true,'Creo il PDF');
  try{ui.sheet={type:'file',blob:await elPDF(e,true),name:elNomeFile(e)+'.pdf',mime:'application/pdf',title:'Elenco pronto'}}
  catch(err){toast('PDF non creato: '+(err.message||err))}
  finally{busy(false);renderSheet()}
}
// anteprima nell'editor: le pagine A4 come usciranno nel PDF, rimpicciolite alla larghezza dello schermo
function elMontaAnteprima(){
  const host=document.getElementById('elpv'),e=getEl(ui.elId);if(!host||!e)return;
  const P=elPagine(e),avail=host.clientWidth-8,s=Math.min(avail/EL_W,1);
  host.innerHTML=P.map((b,k)=>`<div class="el-pv-p" style="height:${EL_H*s+12}px"><div class="pv-scale" style="transform:scale(${s});margin-left:${(host.clientWidth-EL_W*s)/2}px">${elPaginaHTML(b,true)}</div></div>${P.length>1?`<p class="hint" style="text-align:center;margin:-4px 0 10px">Pagina ${k+1} di ${P.length}</p>`:''}`).join('');
}
let elPvT;const elAnteprimaPresto=()=>{clearTimeout(elPvT);elPvT=setTimeout(elMontaAnteprima,300)};

/* ---------- Schermate ---------- */
function elRiga(e){
  const n=e.sections.reduce((t,s)=>t+s.items.length,0);
  const quando=new Date(e.updated||e.created||Date.now()).toLocaleDateString('it-IT',{day:'numeric',month:'short'});
  return`<button class="drow" data-a="elOpen" data-id="${e.id}"><span>${esc(e.name||'Senza nome')}<small style="display:block;color:var(--muted);font-size:12px">${n===1?'1 portata':n+' portate'} · modificato il ${quando}</small></span>${I.right}</button>`;
}
function vElenchi(){
  const L=elenchi().slice().sort((a,b)=>(b.updated||0)-(a.updated||0)),M=L.filter(x=>x.model),A=L.filter(x=>!x.model);
  return topbar(`<button class="ib" data-a="back" aria-label="Indietro">${I.back}</button><h1>Elenco portate</h1>`)+`<main class="main">
  <p class="hint" style="margin:0 2px 14px">Nome, prezzo e breve descrizione delle portate, da inviare come immagine o PDF a chi lo chiede. Prezzi e descrizioni si scrivono nell'archivio portate.</p>
  <section class="grp"><h2>Modelli</h2>${M.length?`<div class="list">${M.map(elRiga).join('')}</div>`:`<p class="hint">Nessun modello. Apri un elenco e segna “Tienilo come modello” per riusarlo.</p>`}</section>
  <section class="grp"><h2>Elenchi su misura</h2>${A.length?`<div class="list">${A.map(elRiga).join('')}</div>`:`<p class="hint">Nessun elenco. Tocca + per crearne uno.</p>`}</section>
  <button class="btn wide" data-a="nav" data-v="dishes">${I.dish}Archivio portate (prezzi e descrizioni)</button>
  </main>`+fab('elNew','Nuovo elenco');
}
function elSezioniHTML(e){
  return e.sections.map((s,si)=>`<div class="sec"><div class="sec-h"><h3>${esc(s.name)}</h3>${!s.items.length?`<button class="ib" style="margin-left:auto" data-a="elSecDel" data-s="${si}" aria-label="Togli la sezione ${esc(s.name)}">${I.trash}</button>`:''}<button class="add" data-a="elPick" data-s="${si}">${I.plus}Aggiungi</button></div>${s.items.map((i,ii)=>{
    const p=elPrezzo(elVal(i,'price')),ds=String(elVal(i,'desc')).trim(),st=e.allergens?algState(elAlgItem(i)):'ok';
    return`<div class="it"><button class="nm" data-a="elItEdit" data-s="${si}" data-i="${ii}">${esc(elVal(i,'name'))}${p?` <b class="el-ep">${esc(p)}</b>`:` <span class="pill" style="--c:#B07A1E;margin-left:4px">senza prezzo</span>`}${st!=='ok'?` <span class="pill" style="--c:#B07A1E;margin-left:4px">allergeni?</span>`:''}${ds?`<small style="display:block;color:var(--muted);font-size:12px;font-style:italic">${esc(oneLine(ds))}</small>`:''}</button><button class="ib" data-a="elItMove" data-s="${si}" data-i="${ii}" data-d="-1" aria-label="Sposta su">${I.up}</button><button class="ib" data-a="elItMove" data-s="${si}" data-i="${ii}" data-d="1" aria-label="Sposta giù">${I.down}</button><button class="ib" data-a="elItDel" data-s="${si}" data-i="${ii}" aria-label="Togli">${I.x}</button></div>`}).join('')}</div>`).join('');
}
function vElenco(){
  const e=getEl(ui.elId);if(!e){ui.view='elenchi';return vElenchi()}
  return topbar(`<button class="ib" data-a="back" aria-label="Indietro">${I.back}</button><h1>${esc(e.name||'Elenco portate')}</h1>`)+`<main class="main">
  <section class="grp"><h2>Titolo</h2><label class="fld"><span>Titolo stampato</span><input class="inp" data-ef="name" value="${esc(e.name)}" placeholder="es. Le nostre portate"></label>
  <label class="tog"><input type="checkbox" data-ec="model" ${e.model?'checked':''}>Tienilo come modello, da riusare</label></section>
  <section class="grp"><h2>Portate</h2>${elSezioniHTML(e)}
  <button class="btn wide" style="margin:2px 0 10px" data-a="elAddSec">${I.plus}Aggiungi una sezione</button>
  <label class="tog"><input type="checkbox" data-ec="allergens" ${e.allergens?'checked':''}>Indica gli allergeni accanto alle portate</label>
  <p class="hint">Le sezioni vuote non compaiono. Tocca una portata per cambiarla solo in questo elenco; prezzi e descrizioni di sempre si scrivono nell'archivio portate.</p></section>
  <section class="grp"><h2>Note in fondo</h2><textarea class="inp" data-ef="notes" rows="2" style="min-height:70px" placeholder="es. Prezzi a porzione, coperto incluso">${esc(e.notes||'')}</textarea></section>
  <section class="grp"><h2>Anteprima</h2><div id="elpv" class="pv"></div>
  <div class="btns two"><button class="btn wa" data-a="elWa">${I.wa}Invia</button><button class="btn pri" data-a="elPdf">${I.pdf}Crea PDF</button></div></section>
  <button class="btn danger wide" style="margin-top:6px" data-a="elDel">${I.trash}Elimina questo elenco</button>
  </main>`;
}

/* ---------- Fogli dal basso ---------- */
function elPickHTML(){
  const e=getEl(ui.elId),s=e&&e.sections[ui.sheet.s];if(!s)return'';
  const q=norm(ui.elQ),tutte=ui.elAll||!allCats().includes(s.name);
  const L=state.dishes.filter(x=>(tutte||x.cat===s.name)&&(!q||norm(x.name).includes(q))).sort((a,b)=>a.name.localeCompare(b.name,'it'));
  if(!L.length)return`<p class="empty">${q?'Nessuna portata trovata. Scrivila qui sotto per aggiungerla.':'Nessuna portata in questa categoria. Aggiungila qui sotto.'}</p>`;
  return L.map(x=>{const on=s.items.some(i=>i.dishId===x.id),p=elPrezzo(x.price);return`<button class="pk${on?' on':''}" data-a="elPickT" data-id="${x.id}"><span>${esc(oneLine(x.name))}<small>${[x.cat!==s.name?x.cat:'',p||'senza prezzo'].filter(Boolean).map(esc).join(' · ')}</small></span><i>${on?I.check:I.plus}</i></button>`}).join('');
}
window.elSheetHTML=(sh,head)=>{
  const e=getEl(ui.elId);
  if(sh.type==='elNew'){
    const M=elenchi().filter(x=>x.model).sort((a,b)=>(a.name||'').localeCompare(b.name||'','it'));
    return head('Nuovo elenco')+(M.length?`<p class="hint" style="margin:0 2px 8px">Parti da un modello: le modifiche resteranno solo nel nuovo elenco.</p><div class="list" style="margin-bottom:12px">${M.map(x=>`<button class="drow" data-a="elFrom" data-id="${x.id}"><span>${esc(x.name)}</span>${I.plus}</button>`).join('')}</div>`:'')+
      `<button class="btn ${M.length?'':'pri '}wide" data-a="elFrom">${I.plus}Da zero</button>`;
  }
  if(!e)return head('Elenco')+'';
  if(sh.type==='elPick'){
    const s=e.sections[sh.s];
    return head(s.name)+`<input class="inp" type="search" placeholder="Cerca portata" data-in="elQ" value="${esc(ui.elQ)}">
    <label class="tog"><input type="checkbox" data-elall="1" ${ui.elAll?'checked':''}>Mostra le portate di tutte le categorie</label>
    ${allCats().includes(s.name)?`<button class="btn wide" style="margin-bottom:10px" data-a="elPickAll">${I.plus}Aggiungi tutte quelle di ${esc(s.name)}</button>`:''}
    <div id="elpk">${elPickHTML()}</div>
    <div class="pk-new"><input class="inp" id="elpknew" placeholder="Nuova portata" enterkeyhint="done"><button class="btn" data-a="elPickNew">Aggiungi</button></div>
    <button class="btn pri wide" data-a="closeSheet">Fatto</button>`;
  }
  if(sh.type==='elItem'){
    const i=e.sections[sh.s].items[sh.i],d=elDish(i),r=elAlgItem(i),n=algNums(r),st=algState(r);
    return head('Portata in questo elenco')+`
    <label class="fld"><span>Nome</span><textarea class="inp" id="elin" rows="2" style="min-height:70px">${esc(elVal(i,'name'))}</textarea></label>
    <label class="fld"><span>Breve descrizione</span><textarea class="inp" id="elid" rows="2" style="min-height:70px" placeholder="Facoltativa">${esc(elVal(i,'desc'))}</textarea></label>
    <label class="fld"><span>Prezzo (€)</span><input class="inp" id="elip" inputmode="decimal" value="${esc(String(elVal(i,'price')).replace('.',','))}" placeholder="es. 12"></label>
    <p class="hint" style="margin:-6px 2px 12px">${d?"Le modifiche valgono solo per questo elenco: l'archivio resta com'è.":"Questa portata non è più nell'archivio: resta com'è scritta qui."}</p>
    <p class="hint" style="margin:0 2px 12px">Allergeni: ${st==='manca'?'non ancora indicati':n.length?n.map(x=>`${x}. ${esc(ALLERGENI[x-1])}`).join(', '):'nessuno'}${st==='verifica'?' (da controllare: il nome è cambiato)':''}. Si impostano nell'archivio portate.</p>
    <button class="btn pri wide" data-a="elItSave">Salva</button>`;
  }
  if(sh.type==='elAddSec'){
    const have=new Set(e.sections.map(x=>x.name)),miss=allCats().filter(c=>!have.has(c));
    return head('Aggiungi una sezione')+(miss.length?`<div class="list" style="margin-bottom:12px">${miss.map(c=>`<button class="drow" data-a="elSecPick" data-v="${esc(c)}"><span>${esc(c)}</span>${I.plus}</button>`).join('')}</div>`:'')+`
    <div class="pk-new"><input class="inp" id="elsecnew" placeholder="${miss.length?'Oppure un altro nome':'es. Contorni'}" enterkeyhint="done" autocomplete="off"><button class="btn" data-a="elSecNew">Aggiungi</button></div>`;
  }
  return'';
};

/* ---------- Azioni ---------- */
function elApri(id){ui.elId=id;ui.view='elenco';ui.sheet=null;renderSheet();render()}
function elAggiungiSezione(e,name){
  if(e.sections.some(x=>norm(x.name)===norm(name))){toast("Questa sezione è già nell'elenco");return false}
  const C=allCats(),ord=C.indexOf(name);let pos=e.sections.length;
  if(ord>=0){const j=e.sections.findIndex(x=>{const k=C.indexOf(x.name);return k<0||k>ord});if(j>=0)pos=j}
  e.sections.splice(pos,0,{name,items:[]});elTocca(e);return true;
}
function elDopoModifica(){render(true);if(ui.sheet&&ui.sheet.type==='elPick'){const l=$('#elpk');if(l)l.innerHTML=elPickHTML()}}
document.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-a]');if(!b)return;
  const a=b.dataset.a,d=b.dataset;if(!a.startsWith('el'))return;
  const e=getEl(ui.elId),sec=e&&d.s!==undefined?e.sections[+d.s]:null;
  switch(a){
    case 'elenchi':leaveEdit();ui.view='elenchi';render();break;
    case 'elOpen':elApri(d.id);break;
    case 'elNew':ui.sheet={type:'elNew'};renderSheet();break;
    case 'elFrom':{const n=nuovoElenco(d.id?getEl(d.id):null);elenchi().push(n);save();elApri(n.id);break}
    case 'elDel':ask({title:'Eliminare questo elenco?',text:e.name||'',ok:'Elimina',danger:true}).then(ok=>{
      if(!ok)return;const L=elenchi(),k=L.indexOf(e);L.splice(k,1);save();ui.view='elenchi';render();
      toast('Elenco eliminato',{label:'Annulla',fn:()=>{L.splice(Math.min(k,L.length),0,e);save();if(ui.view==='elenchi')render(true)}})});break;
    case 'elPick':ui.sheet={type:'elPick',s:+d.s};ui.elQ='';ui.elAll=false;renderSheet();break;
    case 'elPickT':{
      const s=e.sections[ui.sheet.s],x=state.dishes.find(z=>z.id===d.id);if(!x)break;
      const k=s.items.findIndex(z=>z.dishId===x.id);if(k>=0)s.items.splice(k,1);else s.items.push(elNuovaVoce(x));
      elTocca(e);elDopoModifica();break}
    case 'elPickAll':{
      const s=e.sections[ui.sheet.s],L=state.dishes.filter(x=>x.cat===s.name&&!s.items.some(i=>i.dishId===x.id)).sort((p,q)=>p.name.localeCompare(q.name,'it'));
      L.forEach(x=>s.items.push(elNuovaVoce(x)));elTocca(e);elDopoModifica();toast(L.length?`${L.length===1?'Aggiunta 1 portata':'Aggiunte '+L.length+' portate'}`:'Ci sono già tutte');break}
    case 'elPickNew':{
      const inp=$('#elpknew'),name=inp.value.trim();if(!name)break;
      const s=e.sections[ui.sheet.s],cat=allCats().includes(s.name)?s.name:state.categories[0];
      let x=state.dishes.find(z=>norm(z.name)===norm(name)&&z.cat===cat);
      if(!x){x={id:uid(),name,cat};state.dishes.push(x)}
      if(!s.items.some(z=>z.dishId===x.id))s.items.push(elNuovaVoce(x));
      inp.value='';elTocca(e);elDopoModifica();toast("Portata aggiunta all'elenco e all'archivio");break}
    case 'elItEdit':ui.sheet={type:'elItem',s:+d.s,i:+d.i};renderSheet();break;
    case 'elItSave':{
      const sh=ui.sheet,i=e.sections[sh.s].items[sh.i],dd=elDish(i),pr=$('#elip').value.trim();
      const nuovi={name:$('#elin').value.trim(),desc:$('#elid').value.trim(),price:pr===''?'':num(pr)};
      if(!nuovi.name){toast('Scrivi il nome della portata');break}
      if(pr!==''&&!(num(pr)>=0)){toast('Il prezzo non è un numero');break}
      i.edited=EL_CAMPI.filter(f=>!dd||String(elArchivio(dd,f))!==String(nuovi[f]));
      EL_CAMPI.forEach(f=>{i[f]=nuovi[f]});
      elTocca(e);ui.sheet=null;renderSheet();render(true);toast('Salvato');break}
    case 'elItMove':{const L=sec.items,k=+d.i,j=k+Number(d.d);if(j<0||j>=L.length)break;[L[k],L[j]]=[L[j],L[k]];elTocca(e);render(true);break}
    case 'elItDel':{const L=sec.items,k=+d.i,[tolta]=L.splice(k,1);elTocca(e);render(true);
      toast("Portata tolta dall'elenco",{label:'Annulla',fn:()=>{L.splice(Math.min(k,L.length),0,tolta);elTocca(e);if(ui.view==='elenco')render(true)}});break}
    case 'elSecDel':{const k=+d.s;if(!sec||sec.items.length)break;e.sections.splice(k,1);elTocca(e);render(true);break}
    case 'elAddSec':ui.sheet={type:'elAddSec'};renderSheet();break;
    case 'elSecPick':case 'elSecNew':{
      const name=(a==='elSecPick'?d.v:$('#elsecnew').value).trim();if(!name)break;
      if(elAggiungiSezione(e,name)){ui.sheet=null;renderSheet();render(true)}break}
    case 'elWa':elWa();break;
    case 'elPdf':elFilePDF();break;
  }
});
document.addEventListener('input',ev=>{
  const el=ev.target,d=el.dataset;
  if(d.ef){const e=getEl(ui.elId);if(!e)return;e[d.ef]=el.value;elTocca(e);
    if(d.ef==='name'){const h=$('.top h1');if(h)h.textContent=el.value||'Elenco portate'}
    elAnteprimaPresto()}
  else if(d.in==='elQ'){ui.elQ=el.value;const l=$('#elpk');if(l)l.innerHTML=elPickHTML()}
});
document.addEventListener('change',ev=>{
  const el=ev.target,d=el.dataset;
  if(d.ec){const e=getEl(ui.elId);if(!e)return;e[d.ec]=el.checked;elTocca(e);render(true)}
  else if(d.elall){ui.elAll=el.checked;const l=$('#elpk');if(l)l.innerHTML=elPickHTML()}
});
document.addEventListener('keydown',ev=>{
  if(ev.key!=='Enter')return;
  const map={elpknew:'elPickNew',elsecnew:'elSecNew'};
  if(map[ev.target.id]){ev.preventDefault();$(`[data-a="${map[ev.target.id]}"]`).click()}
});
