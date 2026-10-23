#!/usr/bin/env python3
"""Prova dell'app web del Menù dentro la suite (tappa 1).

Apre menu/index.html da file, come farà la WebView dell'APK, con una finta suite al posto di React Native:
controlla che la pagina parta, che l'archivio passi dal ponte (e non da IndexedDB), che i dati tornino
dopo un riavvio e che PDF, immagine e invio arrivino alla suite con file veri.

A mano (non gira ancora su GitHub):
    pip install playwright && playwright install chromium
    python3 test/menu-suite.py
"""
import base64, json, os, sys
from playwright.sync_api import sync_playwright

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGINA = 'file://' + os.path.join(RADICE, 'menu', 'index.html')

# finta suite al posto di React Native: risponde alle domande sull'archivio e tiene da parte gli altri messaggi.
# L'archivio (nella suite: tabella menu_dati) sta in sessionStorage, così sopravvive al ricaricamento della pagina.
FINTA = """(()=>{
  const leggi=()=>JSON.parse(sessionStorage.getItem('__archivio')||'{}'),scrivi=a=>sessionStorage.setItem('__archivio',JSON.stringify(a));
  window.__ricevuti=[];
  window.__ricette=[{id:1,nome:'Orecchiette alle cime di rapa',categoria:'',ingredienti:3,allergeni:[1,4],daVerificare:[]},
    {id:2,nome:'Ricetta vuota',categoria:'',ingredienti:0,allergeni:[],daVerificare:[]},
    {id:3,nome:'Con farina da fattura',categoria:'',ingredienti:2,allergeni:[1],daVerificare:['Farina 00']}];
  // prenotazioni della suite per il calendario: oggi una confermata e una da confermare (nomi inventati)
  window.__prenotazioni=(()=>{const d=new Date(),p=n=>String(n).padStart(2,'0'),t=`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
    return[{data:t,servizio:'Pranzo',nome:'Rossi',persone:8,min:8,max:8,sala:'Antica stalla',daConfermare:false,id:'t-rossi'},
      {data:t,servizio:'Pranzo',nome:'Sardo',persone:16,min:13,max:16,sala:'Panoramica',daConfermare:true,uid:'fw-sardo'}]})();
  window.__disdette=[];
  window.ReactNativeWebView={
    injectedObjectJson:()=>JSON.stringify({build:'prova-123',fontScale:1.3}),
    postMessage:(s)=>{const m=JSON.parse(s),a=leggi();let v=null;
      if(m.tipo==='kvGet')v=m.k in a?a[m.k]:null;
      else if(m.tipo==='kvKeys')v=Object.keys(a).sort();
      else if(m.tipo==='kvSetMany'){m.pairs.forEach(([k,x])=>{if(x===null)delete a[k];else a[k]=x});scrivi(a)}
      else if(m.tipo==='ricette')v=window.__ricette;
      else if(m.tipo==='prenotazioni')v=window.__prenotazioni;
      else if(m.tipo==='disdiciPrenotazione'){window.__ricevuti.push(m);const i=window.__prenotazioni.findIndex(p=>(m.uid&&p.uid===m.uid)||(m.tavolata&&p.id===m.tavolata));
        const p=window.__prenotazioni.splice(i,1)[0];window.__disdette.push(p);v={nome:p.nome,disdetta:window.__disdette.length,sala:null,elenco:window.__prenotazioni}}
      else if(m.tipo==='annullaDisdetta'){window.__ricevuti.push(m);const p=window.__disdette[m.disdetta-1];window.__prenotazioni.push(p);v={nome:p.nome,disdetta:null,sala:p.uid?null:'stalla',elenco:window.__prenotazioni}}
      else if(m.tipo==='creaRicetta'){const id=100+window.__ricette.length;window.__ricette.push({id,nome:m.nome,categoria:'',ingredienti:0,allergeni:[],daVerificare:[]});window.__ricevuti.push(m);v=id}
      else{window.__ricevuti.push(m);return}
      setTimeout(()=>window.__suiteRisposta(m.id,true,v),0)}};
})();"""

falliti = []


def ok(cond, msg):
    print(('OK   ' if cond else 'FAIL ') + msg, flush=True)
    if not cond:
        falliti.append(msg)


with sync_playwright() as p:
    # nell'APK la WebView concede ai file dell'app di leggersi fra loro: qui lo stesso permesso si dà così
    b = p.chromium.launch(args=['--allow-file-access-from-files'])
    c = b.new_context(viewport={'width': 400, 'height': 800})
    errori = []
    c.add_init_script(FINTA)
    pg = c.new_page()
    pg.on('pageerror', lambda e: errori.append(str(e)))
    pg.on('dialog', lambda d: d.accept())

    class Archivio:
        def leggi(self):
            return json.loads(pg.evaluate("sessionStorage.getItem('__archivio')||'{}'"))
        def __getitem__(self, k):
            return self.leggi()[k]
        def __contains__(self, k):
            return k in self.leggi()
        def __iter__(self):
            return iter(self.leggi())

    class Ricevuti:
        def lista(self):
            return pg.evaluate('window.__ricevuti')
        def clear(self):
            pg.evaluate('()=>{window.__ricevuti=[]}')
        def __iter__(self):
            return iter(self.lista())
        def __bool__(self):
            return bool(self.lista())
        def __getitem__(self, i):
            return self.lista()[i]

    archivio, ricevuti = Archivio(), Ricevuti()

    def avvia():
        pg.goto(PAGINA)
        pg.wait_for_selector('.nav', timeout=20000)
        pg.wait_for_timeout(900)

    # ---------- avvio da file e archivio attraverso il ponte ----------
    avvia()
    ok(pg.evaluate('location.protocol') == 'file:', 'pagina aperta dai file, come nella WebView')
    ok(pg.evaluate('idb===window.SuiteKV'), "l'archivio usato è quello della suite")
    ok(pg.evaluate('!!(AND&&AND.saveFile&&AND.shareFiles&&AND.saveAs)') and pg.evaluate('!window.Android.autoBackup'),
       'funzioni del telefono disponibili (senza la copia automatica, che ora è il backup della suite)')
    ok(pg.evaluate('window.Android.version()') == 'prova-123' and pg.evaluate('window.Android.fontScale()') == 1.3,
       'numero di build e dimensione del testo arrivano dalla suite')
    ok('state' in archivio and json.loads(archivio['state'])['v'] == 3, 'primo avvio: lo stato è stato scritto nel database della suite')
    ok(pg.evaluate("indexedDB.databases?indexedDB.databases().then(d=>d.length):0") == 0, 'IndexedDB non viene usato')

    # ---------- dati: menù, immagine grande, riavvio ----------
    grande = 'data:image/png;base64,' + 'A' * 20000
    pg.evaluate("""g=>{const t={...state.templates[0],id:'tpl-mio',name:'Mio',builtIn:false,bgImage:g};state.templates.push(t);
      state.menus=[{id:'m1',templateId:'tpl-pasqua',date:'2026-10-17',client:'Rossi',phone:'333 1234567',status:'bozza',guests:60,priceAdult:45,showSections:true,
        sections:[{name:'Antipasti',items:[{name:'Tagliere di salumi e formaggi'}]},{name:'Primi',items:[{name:'Orecchiette alle cime di rapa'}]}],kidsSections:[]}];save()}""", grande)
    pg.wait_for_timeout(700)
    st = json.loads(archivio['state'])
    mio = [t for t in st['templates'] if t['id'] == 'tpl-mio'][0]
    blob = [k for k in archivio if k.startswith('blob:')]
    ok(len(st['menus']) == 1 and mio['bgImage'].startswith('idb:') and len(blob) == 1 and json.loads(archivio[blob[0]]) == grande,
       'menù salvato; immagine grande in una chiave separata')
    avvia()
    ok(pg.evaluate("state.menus.length") == 1 and pg.evaluate("state.menus[0].client") == 'Rossi'
       and pg.evaluate("state.templates.find(t=>t.id==='tpl-mio').bgImage") == grande, 'dopo il riavvio i dati tornano uguali')

    # ---------- salvataggio prima di uscire e tasto indietro ----------
    ricevuti.clear()
    pg.evaluate("()=>{state.menus[0].client='Bianchi';save();window.__suiteSalva()}")
    pg.wait_for_timeout(300)
    ok(any(m['tipo'] == 'salvato' for m in ricevuti) and json.loads(archivio['state'])['menus'][0]['client'] == 'Bianchi',
       'uscendo dalla schermata le ultime modifiche vengono scritte subito')
    ricevuti.clear()
    pg.evaluate('window.__suiteIndietro()')
    pg.wait_for_timeout(200)
    ok(ricevuti and ricevuti[-1] == {'tipo': 'indietro', 'gestito': False}, 'tasto indietro dalla schermata iniziale: la suite può chiudere il Menù')

    # ---------- file locali letti con fetch (brochure della fattoria didattica) ----------
    n = pg.evaluate("fetch('assets/didattica/brochure.pdf').then(r=>r.blob()).then(b=>b.size)")
    ok(n == os.path.getsize(os.path.join(RADICE, 'menu', 'assets', 'didattica', 'brochure.pdf')), 'i file locali si leggono anche da file')

    # ---------- PDF e immagine: creati nella pagina, consegnati alla suite ----------
    pg.wait_for_function('window.html2canvas&&window.jspdf', timeout=20000)
    for modo in ('tavolo', 'proposta'):
        testa = pg.evaluate("""async modo=>{const b=await makePDF(getMenu('m1'),modo);
          return [b.size,new TextDecoder('latin1').decode(await b.slice(0,5).arrayBuffer())]}""", modo)
        ok(testa[0] > 50000 and testa[1] == '%PDF-', f'PDF "{modo}" creato dalla pagina aperta da file ({testa[0] // 1024} KB)')
    # il fondo illustrato deve esserci davvero nell'immagine: se i file locali "sporcassero" il disegno, uscirebbe vuota o darebbe errore
    img = pg.evaluate("makeImage(getMenu('m1'),'tavolo').then(b=>b.size)")
    ok(img > 30000, f'immagine del menù creata ({img // 1024} KB)')

    # ---------- menù verticale: nel PDF occupa il foglio A4, l'immagine resta 9:16 ----------
    SEZ = """n=>Array.from({length:n},(_,i)=>({name:'Sezione '+(i+1),items:Array.from({length:n>3?4:2},(_,j)=>({name:'Portata di prova numero '+(j+1)}))}))"""
    A4V = """async n=>{const m={...getMenu('m1'),templateId:'tpl-pecore',sections:(%s)(n)},t=tplOf(m),h=document.getElementById('rh');
      h.innerHTML=pageHTML(m,t,'tavolo','it');let p=h.firstElementChild;fitPage(p);const prima=parseFloat(p.querySelector('.v-in').style.fontSize);
      h.innerHTML=pageHTML(m,t,'tavolo','it');p=h.firstElementChild;const sc=verticaleA4(p,t),r=fitPage(p),dopo=parseFloat(p.querySelector('.v-in').style.fontSize)*sc;h.innerHTML='';
      const x=new TextDecoder('latin1').decode(await (await makePDF(m,'tavolo',false,true)).arrayBuffer());
      const b=x.match(/\\/MediaBox\\s*\\[([^\\]]+)\\]/)[1].trim().split(/\\s+/).map(Number),c=x.match(/([\\d.]+) 0 0 ([\\d.]+) ([\\d.]+) ([\\d.]+) cm/).slice(1).map(Number);
      const cv=await makePDF(m,'tavolo',true);return{prima,dopo,sc,over:r.over,foglio:[b[2],b[3]],img:[c[0],c[1],c[2]],jpg:[cv.width,cv.height]}}""" % SEZ
    corto, lungo = pg.evaluate(A4V, 3), pg.evaluate(A4V, 5)
    for nome, r in (('corto', corto), ('lungo', lungo)):
        a4 = abs(r['foglio'][0] - 595.28) < 0.5 and abs(r['foglio'][1] - 841.89) < 0.5
        ok(a4 and abs(r['img'][0] - 595.28) < 0.5 and abs(r['img'][1] - 841.89) < 0.5 and r['img'][2] < 0.5 and not r['over'],
           f"menù verticale {nome}: il PDF è un A4 e il menù lo occupa tutto, senza fasce ai lati")
        ok(r['jpg'] == [1620, 2880], f"menù verticale {nome}: l'immagine JPG resta nel formato 9:16 di sempre")
    # il foglio ricomposto è largo quanto l'immagine 9:16 (ingrandimento 1,257 = niente spazio in più ai lati)
    # e le portate escono comunque più grandi di prima
    for nome, r in (('corto', corto), ('lungo', lungo)):
        ok(abs(r['sc'] - 1.257) < 0.005 and r['dopo'] > r['prima'] * 1.045,
           f"menù {nome}: pagina larga come l'immagine e portate più grandi di prima (+{round((r['dopo'] / r['prima'] - 1) * 100)}%)")
    mio = pg.evaluate("""async()=>{const t={...getTpl('tpl-pecore'),id:'tpl-foto',builtIn:false,bgImage:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='};
      state.templates.push(t);const m={...getMenu('m1'),templateId:'tpl-foto'},h=document.getElementById('rh');h.innerHTML=pageHTML(m,t,'tavolo','it');
      const sc=verticaleA4(h.firstElementChild,t);h.innerHTML='';state.templates.pop();return sc}""")
    ok(mio == 1, 'template con uno sfondo caricato da te: la pagina resta quella di sempre')

    # ---------- aspetto della suite: linguette in alto, barra della suite nascosta nelle schermate interne ----------
    pg.evaluate("ui.view='cal';render()")
    asp = pg.evaluate("""()=>{const n=document.querySelector('.nav').getBoundingClientRect(),c=getComputedStyle(document.body);
      return{suite:document.documentElement.classList.contains('suite'),alto:n.top,basso:innerHeight-n.bottom,carattere:c.fontFamily,
        titolo:getComputedStyle(document.querySelector('.top')).display,voci:[...document.querySelectorAll('.nav button')].map(b=>b.textContent)}}""")
    ok(asp['suite'] and asp['carattere'].startswith('Inter') and asp['titolo'] == 'none',
       'dentro la suite: carattere della suite, e nelle schermate principali niente titolo "Menù" doppio (restano le linguette)')
    ok(asp['alto'] < 10 and asp['basso'] > 300 and asp['voci'] == ['Calendario', 'Proposte', 'Stampe', 'Didattica', 'Impostazioni'],
       'le sezioni del Menù sono linguette in alto (in basso resta solo la barra della suite)')
    pg.evaluate("window.__ricevuti.length=0;openEditor('m1')")
    dentro = pg.evaluate("window.__ricevuti.filter(m=>m.tipo==='vista').map(m=>m.profonda)")
    pg.evaluate("window.__ricevuti.length=0;window.appBack()")
    fuori = pg.evaluate("window.__ricevuti.filter(m=>m.tipo==='vista').map(m=>m.profonda)")
    ok(dentro == [True] and fuori == [False], 'modifica di un menù: la suite viene avvisata di nascondere e poi rimostrare la barra in basso')
    # le pagine dei menù (quello che si stampa e si invia) non devono cambiare di una virgola con il nuovo aspetto
    STILI = """()=>{const out=[],h=document.getElementById('rh');
      for(const t of state.templates)for(const mode of ['tavolo','proposta']){const m={...getMenu('m1'),templateId:t.id};h.innerHTML=pageHTML(m,tplOf(m),mode,'it');
        h.querySelectorAll('.pg,.pg *').forEach(e=>{const c=getComputedStyle(e);out.push([e.className,c.fontFamily,c.fontWeight,c.fontSize,c.lineHeight,c.color].join('|'))})}
      h.innerHTML='';return out}"""
    con = pg.evaluate(STILI)
    pg.evaluate("document.documentElement.classList.remove('suite')")
    senza = pg.evaluate(STILI)
    pg.evaluate("document.documentElement.classList.add('suite','scuro')")
    scuro = pg.evaluate(STILI)
    fondo = pg.evaluate("getComputedStyle(document.body).backgroundColor")
    pg.evaluate("document.documentElement.classList.remove('scuro')")
    ok(fondo == 'rgb(15, 18, 21)' and scuro == senza, 'tema scuro: cambia il contorno, le pagine dei menù restano su carta chiara e identiche')
    ok(len(con) > 300 and con == senza, f'pagine dei menù identiche a prima in tutti i template ({len(con)} elementi confrontati)')

    # ---------- portate collegate alle ricette della suite: gli allergeni vengono dalla ricetta ----------
    pg.evaluate("""()=>{state.dishes.push({id:'d-or',name:'Orecchiette alle cime di rapa',cat:state.categories[1],alg:[9],algSet:true},{id:'d-vu',name:'Piatto senza ingredienti',cat:state.categories[1]});
      const m=getMenu('m1');m.allergens=true;m.sections[1].items=[{dishId:'d-or',name:'Orecchiette alle cime di rapa'},{dishId:'d-vu',name:'Piatto senza ingredienti'}];save();
      ui.view='dishes';render()}""")
    pg.wait_for_function("window.SuiteRicette.elenco.length===3")
    prima_alg = pg.evaluate("algNums(getMenu('m1').sections[1].items[0])")
    pg.click("[data-a=editDish][data-id=d-or]")
    pg.select_option('#dric', '1')
    nascosti = pg.evaluate("[document.getElementById('algman').hidden,document.getElementById('ricinfo').textContent]")
    pg.click('[data-a=saveDish]')
    r = pg.evaluate("""()=>{const it=getMenu('m1').sections[1].items[0],t=tplOf(getMenu('m1'));
      return{rid:state.dishes.find(d=>d.id==='d-or').rid,alg:algNums(it),st:algState(it),pagina:pageHTML(getMenu('m1'),t,'tavolo','it').includes('<span class="alg">1,4</span>')}}""")
    ok(prima_alg == [9] and nascosti[0] is True and '1. Cereali con glutine, 4. Pesce' in nascosti[1],
       'scheda della portata: scelta la ricetta, i suoi allergeni prendono il posto di quelli a mano')
    ok(r == {'rid': 1, 'alg': [1, 4], 'st': 'ok', 'pagina': True}, 'portata collegata: sul menù escono gli allergeni della ricetta')
    stati = pg.evaluate("""()=>{const d=state.dishes.find(x=>x.id==='d-vu'),it=getMenu('m1').sections[1].items[1],o={};
      d.rid=2;o.vuota=[algState(it),algTodo(getMenu('m1')).includes(it)];d.rid=3;o.dubbia=[algState(it),algNums(it)];
      d.rid=99;o.sparita=[algState(it),algNums(it)];delete d.rid;
      const a=getMenu('m1').sections[1].items[0];a.name='Orecchiette senza glutine';o.cambiata=[algState(a),algNums(a)];a.name='Orecchiette alle cime di rapa';return o}""")
    ok(stati['vuota'] == ['manca', True] and stati['dubbia'] == ['verifica', [1]],
       'ricetta senza ingredienti o con ingredienti non verificati: la portata resta da controllare')
    ok(stati['sparita'] == ['manca', []] and stati['cambiata'] == ['verifica', [9]],
       'ricetta eliminata o testo cambiato nel menù: tornano le regole di sempre, con avviso')
    pg.evaluate("window.__suiteRicette(window.__ricette.map(r=>r.id===1?{...r,allergeni:[1,4,7]}:r))")
    ok(pg.evaluate("algNums(getMenu('m1').sections[1].items[0])") == [1, 4, 7], 'ricetta modificata nella suite: gli allergeni del menù si aggiornano')
    pg.evaluate("window.__ricevuti.length=0;ui.view='dishes';render()")
    pg.click("[data-a=editDish][data-id=d-vu]")
    pg.click('[data-a=mkRecipe]')
    pg.wait_for_function("window.__ricevuti.some(m=>m.tipo==='apriRicetta')")
    nuova = pg.evaluate("""()=>({crea:window.__ricevuti.find(m=>m.tipo==='creaRicetta').nome,apri:window.__ricevuti.find(m=>m.tipo==='apriRicetta').ricetta,
      rid:state.dishes.find(d=>d.id==='d-vu').rid,st:algState(getMenu('m1').sections[1].items[1]),foglio:!!ui.sheet})""")
    ok(nuova == {'crea': 'Piatto senza ingredienti', 'apri': 103, 'rid': 103, 'st': 'manca', 'foglio': False},
       '"Crea la ricetta da questa portata": ricetta creata nella suite, collegata e aperta per gli ingredienti')
    elim = pg.evaluate("""()=>{delDish('d-or');const it=getMenu('m1').sections[1].items[0];return[it.alg,algState(it)]}""")
    ok(elim == [[1, 4], 'ok'], "portata eliminata dall'archivio: i menù si tengono gli allergeni della ricetta")
    pg.evaluate("window.__ricevuti.length=0;openEditor('m1')")
    pg.click('[data-a=evento]')
    pg.wait_for_function("window.__ricevuti.some(m=>m.tipo==='apriEvento')")
    ok(pg.evaluate("window.__ricevuti.find(m=>m.tipo==='apriEvento').evento") == 'm1', '"Fabbisogno e costo" dal menù: la suite apre l\'evento giusto')
    anno = pg.evaluate("[ANNO_SC,DID_MSG.includes('anno scolastico '+ANNO_SC),normalize({v:3,settings:{didMsg:DID_MSG_ANNO('2025/2026')}}).settings.didMsg,normalize({v:3,settings:{didMsg:'mio testo 2025/2026'}}).settings.didMsg]")
    ok(anno[1] and anno[2] is None and anno[3] == 'mio testo 2025/2026', f"fattoria didattica: l'anno scolastico del messaggio si aggiorna da solo ({anno[0]}), un testo personalizzato resta")

    # ---------- prenotazioni della suite nel calendario ----------
    pg.evaluate("ui.view='cal';ui.selDate=today();const n=new Date();ui.cal={y:n.getFullYear(),m:n.getMonth()};render()")
    pg.wait_for_timeout(400)
    cal = pg.evaluate("""()=>{const c=document.querySelector('.day.today .cop');return{cop:c&&c.textContent,da:c&&c.classList.contains('da'),
      righe:document.querySelectorAll('.prow').length,tot:(document.querySelector('.pren-tot')||{}).textContent||'',
      testo:[...document.querySelectorAll('.prow')].map(r=>r.textContent)}}""")
    ok(cal['cop'] == '24' and cal['da'], f"calendario: coperti del giorno (16 contati per 13/16) in terracotta se qualcuna è da confermare ({cal['cop']})")
    ok(cal['righe'] == 2 and 'Pranzo · 24 coperti' in cal['tot'] and '1 da confermare' in cal['tot']
       and 'Rossi · 8 pers.' in cal['testo'][0] and 'Sardo · 13–16 pers.' in cal['testo'][1]
       and 'Conferma' in cal['testo'][1] and all('Disdici' in t for t in cal['testo']),
       'giorno scelto: elenco delle prenotazioni con persone, sala, "Conferma" per quelle da confermare e "Disdici"')
    ordine = pg.evaluate("[...document.querySelectorAll('.main .dh')].map(h=>h.textContent)")
    leg = pg.evaluate("document.querySelector('.leg-cop').textContent")
    ok(ordine[1:] == ['Prenotazioni', 'Menù'] and pg.evaluate("!!document.querySelector('.vuoto-riga')") and leg == '24 coperti nel mese, di cui 16 da confermare',
       f'prenotazioni sopra i menù, giorno senza menù in una riga, legenda con i numeri veri del mese ({leg})')
    ricevuti.clear()
    pg.click('.prow >> nth=0 >> .pr-apri')
    pg.click('.prow >> nth=1 >> .pr-apri')
    pg.wait_for_timeout(200)
    oggi = pg.evaluate('today()')
    ok(any(m == {'tipo': 'apriSala', 'data': oggi, 'servizio': 'Pranzo'} for m in ricevuti)
       and any(m == {'tipo': 'apriSala', 'data': oggi, 'servizio': 'Pranzo', 'uid': 'fw-sardo'} for m in ricevuti),
       'tocco su una prenotazione: la Sala si apre su quel giorno, quella da confermare con la sua scheda di conferma')
    ricevuti.clear()
    pg.click('.prow >> nth=0 >> .pr-dis')
    pg.wait_for_timeout(300)
    dis = pg.evaluate("[document.querySelectorAll('.prow').length,(document.querySelector('.toast')||{}).textContent||'']")
    ok(any(m.get('tipo') == 'disdiciPrenotazione' and m.get('tavolata') == 't-rossi' and m.get('data') == oggi for m in ricevuti)
       and dis[0] == 1 and dis[1].startswith('Rossi disdetta') and 'Annulla' in dis[1], f'"Disdici" dal calendario: la suite la disdice e il calendario si aggiorna, con "Annulla" ({dis})')
    pg.click('.toast [data-toast]')
    pg.wait_for_timeout(300)
    ok(any(m.get('tipo') == 'annullaDisdetta' and m.get('disdetta') == 1 for m in ricevuti) and pg.evaluate("document.querySelectorAll('.prow').length") == 2,
       '"Annulla" nell\'avviso: la prenotazione torna')
    pg.click('.prow.da .pr-dis')
    pg.wait_for_timeout(300)
    ok(any(m.get('tipo') == 'disdiciPrenotazione' and m.get('uid') == 'fw-sardo' for m in ricevuti), '"Disdici" su una da confermare: la suite riceve la riga di Family Wall')
    pg.evaluate("window.__suitePrenotazioni([])")
    pg.wait_for_timeout(300)
    ok(pg.evaluate("document.querySelectorAll('.prow').length") == 0 and pg.evaluate("document.querySelector('.day.today .cop').textContent") == '',
       'elenco aggiornato dalla suite: il calendario si ridisegna')

    ricevuti.clear()
    pg.evaluate("""async()=>{const m=getMenu('m1');const f=[await waFile(m,'proposta','pdf'),await waFile(m,'proposta','jpg')];
      await sendFiles(f,menuMsg(m,'proposta'),m.phone,true)}""")
    pg.wait_for_timeout(300)
    inv = [m for m in ricevuti if m['tipo'] == 'shareFiles']
    ok(len(inv) == 1, 'invio su WhatsApp: una richiesta alla suite')
    if inv:
        j = json.loads(inv[0]['json'])
        pdf = base64.b64decode(j['files'][0]['data'])
        jpg = base64.b64decode(j['files'][1]['data'])
        ok(pdf[:5] == b'%PDF-' and jpg[:2] == b'\xff\xd8' and j['files'][0]['name'].endswith('.pdf') and j['files'][0]['mime'] == 'application/pdf',
           'i file arrivano interi (PDF e JPG veri)')
        ok(j['whatsapp'] is True and j['phone'] == '393331234567' and 'Bianchi' in j['text'] and '45' in j['text'],
           'numero del cliente, messaggio e prezzo arrivano alla suite')

    ricevuti.clear()
    pg.evaluate("()=>{ui.sheet={blob:new Blob(['{}'],{type:'application/json'}),name:'backup-menu_prova.json',mime:'application/json',backup:true};return saveAsNative()}")
    pg.wait_for_timeout(300)
    sa = [m for m in ricevuti if m['tipo'] == 'saveAs']
    ok(len(sa) == 1 and sa[0]['nome'] == 'backup-menu_prova.json' and sa[0]['mime'] == 'application/json' and base64.b64decode(sa[0]['base64']) == b'{}',
       '"Salva con nome": richiesta alla suite con nome, tipo e contenuto')
    if sa:
        pg.evaluate("t=>window.onNativeSaved(t,true)", sa[0]['token'])
        pg.wait_for_timeout(600)
        ok(bool(json.loads(archivio['state'])['settings'].get('lastBackup')), 'backup segnato come fatto solo dopo la conferma della suite')

    # ---------- elenco portate da inviare (12-elenco.js) ----------
    pg.evaluate("""()=>{const P=state.dishes.filter(d=>d.cat==='Primi Piatti');P.forEach((d,i)=>{d.price=10+i;d.desc='Descrizione di prova '+i});
      P[0].alg=[1,7];P[0].algSet=true;delete P[0].rid;ui.sheet=null;renderSheet();ui.view='list';render()}""")
    pg.click('[data-a=elenchi]'); pg.wait_for_timeout(300)
    pg.click('[data-a=elNew]'); pg.wait_for_timeout(300)
    pg.click('.sheet [data-a=elFrom]'); pg.wait_for_timeout(300)
    el = pg.evaluate("()=>{const e=getEl(ui.elId);return{vista:ui.view,sezioni:e.sections.map(s=>s.name),tutte:allCats()}}")
    ok(el['vista'] == 'elenco' and el['sezioni'] == el['tutte'], "elenco da zero: tutte le categorie dell'archivio, vuote")
    i = el['sezioni'].index('Primi Piatti')
    pg.click(f'[data-a=elPick][data-s="{i}"]'); pg.wait_for_timeout(300)
    pg.click('[data-a=elPickAll]'); pg.wait_for_timeout(300)
    pg.click('.sheet [data-a=closeSheet].btn'); pg.wait_for_timeout(300)
    n_primi = pg.evaluate("state.dishes.filter(d=>d.cat==='Primi Piatti').length")
    ok(pg.evaluate(f"getEl(ui.elId).sections[{i}].items.length") == n_primi, '"Aggiungi tutte": entrano tutti i primi')
    pg.click(f'[data-a=elItEdit][data-s="{i}"][data-i="0"]'); pg.wait_for_timeout(300)
    pg.fill('#elip', '15,50'); pg.click('[data-a=elItSave]'); pg.wait_for_timeout(300)
    loc = pg.evaluate(f"()=>{{const it=getEl(ui.elId).sections[{i}].items[0];return[it.edited,elVal(it,'price'),elDish(it).price,elVal(it,'desc')]}}")
    ok(loc[0] == ['price'] and loc[1] == 15.5 and loc[2] == 10 and loc[3] == 'Descrizione di prova 0',
       "prezzo cambiato nell'elenco: vale solo lì, l'archivio resta com'è")
    pg.evaluate("()=>{state.dishes.filter(d=>d.cat==='Primi Piatti')[1].price=99;save()}")
    ok(pg.evaluate(f"elVal(getEl(ui.elId).sections[{i}].items[1],'price')") == 99, "un prezzo aggiornato nell'archivio vale anche negli elenchi già fatti")
    pg.check('[data-ec=allergens]'); pg.wait_for_timeout(300)
    pagina = pg.evaluate("elPaginaHTML(elBlocchi(getEl(ui.elId)),false)")
    ok('€15,50' in pagina and 'Allergeni: 1 Cereali con glutine · 7 Latte/Lattosio' in pagina and 'Antipasti' not in pagina,
       'pagina: prezzi, legenda degli allergeni, niente sezioni vuote')
    lungo = pg.evaluate("""async()=>{const e=getEl(ui.elId),s=e.sections.find(x=>x.name==='Primi Piatti');
      for(let k=0;k<40;k++)s.items.push({dishId:null,name:'Portata lunga di prova '+k,desc:'Descrizione su due righe per riempire la pagina',price:12,edited:[]});
      const P=elPagine(e),pdf=await elPDF(e),t=new TextDecoder('latin1').decode(await pdf.arrayBuffer()),img=await elImmagine(e);
      s.items.splice(-40);return{pagine:P.length,nel:(t.match(/\\/Type \\/Page[^s]/g)||[]).length,testa:t.slice(0,5),img:img.size,
        sezSola:P.some(p=>p.length&&p[p.length-1].k==='sec')}}""")
    ok(lungo['testa'] == '%PDF-' and lungo['pagine'] >= 2 and lungo['nel'] == lungo['pagine'] and not lungo['sezSola'] and lungo['img'] > 30000,
       f"elenco lungo: PDF di {lungo['pagine']} pagine A4, mai un titolo di sezione da solo in fondo, immagine creata")
    pg.click('[data-a=elWa]'); pg.wait_for_selector('#watext', timeout=20000)
    ok('elenco delle nostre portate' in pg.input_value('#watext') and pg.evaluate("ui.sheet.files[0].name.startsWith('Elenco-portate_')"),
       "invio dell'elenco: messaggio pronto e file con il nome giusto")
    pg.evaluate("()=>{ui.sheet=null;renderSheet()}")
    pg.check('[data-ec=model]'); pg.wait_for_timeout(700)
    pg.evaluate('window.__suiteSalva()'); pg.wait_for_timeout(300)
    salvato = json.loads(archivio['state'])
    ok(len(salvato.get('lists', [])) == 1 and salvato['lists'][0]['model'] is True,
       'elenco salvato nel database della suite (e nel backup)')
    avvia()
    ok(pg.evaluate('state.lists.length') == 1 and pg.evaluate('state.lists[0].model') is True, "dopo il riavvio l'elenco c'è ancora, come modello")

    ok(not errori, 'nessun errore JavaScript nella pagina' + (': ' + '; '.join(errori[:3]) if errori else ''))
    b.close()

print()
if falliti:
    print(f'{len(falliti)} controlli falliti')
    sys.exit(1)
print('Tutti i controlli superati')
