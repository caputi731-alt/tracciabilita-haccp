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
  window.ReactNativeWebView={
    injectedObjectJson:()=>JSON.stringify({build:'prova-123',fontScale:1.3}),
    postMessage:(s)=>{const m=JSON.parse(s),a=leggi();let v=null;
      if(m.tipo==='kvGet')v=m.k in a?a[m.k]:null;
      else if(m.tipo==='kvKeys')v=Object.keys(a).sort();
      else if(m.tipo==='kvSetMany'){m.pairs.forEach(([k,x])=>{if(x===null)delete a[k];else a[k]=x});scrivi(a)}
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
        titolo:document.querySelector('.top h1').textContent,voci:[...document.querySelectorAll('.nav button')].map(b=>b.textContent)}}""")
    ok(asp['suite'] and asp['carattere'].startswith('Manrope') and asp['titolo'] == 'Menù', 'dentro la suite: carattere e titolo come le altre sezioni')
    ok(asp['alto'] < 80 and asp['basso'] > 300 and asp['voci'] == ['Calendario', 'Proposte', 'Stampe', 'Didattica', 'Impostazioni'],
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
    pg.evaluate("document.documentElement.classList.add('suite')")
    ok(len(con) > 300 and con == senza, f'pagine dei menù identiche a prima in tutti i template ({len(con)} elementi confrontati)')

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

    ok(not errori, 'nessun errore JavaScript nella pagina' + (': ' + '; '.join(errori[:3]) if errori else ''))
    b.close()

print()
if falliti:
    print(f'{len(falliti)} controlli falliti')
    sys.exit(1)
print('Tutti i controlli superati')
