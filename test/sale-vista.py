#!/usr/bin/env python3
"""Prova della vista 3D delle sale (sale/index.html) in un browser, come la vedrà la WebView dell'APK.

Con una finta suite al posto di React Native controlla che la sala parta, che mostri tavolate e sedie giuste
(una sedia per ogni persona prenotata, o per ogni posto se la tavolata è libera) e che il tocco su una tavolata arrivi alla suite.

    pip install playwright && playwright install chromium
    python3 test/sale-vista.py [cartella per le immagini]
"""
import json, os, subprocess, sys
from playwright.sync_api import sync_playwright

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGINA = 'file://' + os.path.join(RADICE, 'sale', 'index.html')
IMMAGINI = sys.argv[1] if len(sys.argv) > 1 else None

# i dati veri, come li prepara la suite (sale.js)
PREPARA = """
import { SALE, datiScenaSala, datiScenaSale, disponi, metti, pianoVuoto } from './sale.js';
const t = (id, persone, nome = '', ora = '', len = null) => ({ id, nome, persone: String(persone || ''), ora, note: '', len, p: null });
let piano = pianoVuoto(SALE.stalla);
[[0, t('a', 10, 'Battesimo Rossi', '13:00')], [0, t('b', 8)], [0, t('c', 8, 'Bianchi', '', 1.8)], [1, t('d', 14)], [1, t('e', 2)], [1, t('f', 6)]].forEach(([f, x]) => { piano = metti(SALE.stalla, piano, f, x); });
let altra = pianoVuoto(SALE.panoramica);
[[0, t('g', 6)], [1, t('h', 0, '', '', 0.9)], [4, t('i', 4)]].forEach(([f, x]) => { altra = metti(SALE.panoramica, altra, f, x); });
console.log(JSON.stringify({ stalla: datiScenaSala(SALE.stalla, piano), panoramica: datiScenaSala(SALE.panoramica, altra, { scuro: true, scelto: 'h' }),
  insieme: datiScenaSale([[SALE.stalla, piano], [SALE.panoramica, altra]]),
  sedie: datiScenaSala(SALE.stalla, piano).tavolate.reduce((s, x) => s + x.sedie.a + x.sedie.b + x.sedie.teste, 0),
  persone: disponi(SALE.stalla, piano).tavolate.reduce((s, x) => s + x.numeroPersone, 0) }));
"""
DATI = json.loads(subprocess.run(['node', '--input-type=module', '-e', PREPARA], cwd=RADICE, capture_output=True, text=True, check=True).stdout)

FINTA = "window.__ricevuti=[];window.ReactNativeWebView={postMessage:(s)=>window.__ricevuti.push(JSON.parse(s))};"
falliti = []


def ok(cond, msg):
    print(('OK   ' if cond else 'FAIL ') + msg, flush=True)
    if not cond:
        falliti.append(msg)


with sync_playwright() as p:
    b = p.chromium.launch(args=['--allow-file-access-from-files', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for nome, largo, alto in (('telefono', 412, 400), ('largo', 900, 500)):
        c = b.new_context(viewport={'width': largo, 'height': alto}, device_scale_factor=2)
        c.add_init_script(FINTA)
        pg = c.new_page()
        errori = []
        pg.on('pageerror', lambda e: errori.append(str(e)))
        pg.goto(PAGINA)
        pg.wait_for_function("window.__ricevuti.length>0", timeout=15000)
        primo = pg.evaluate("window.__ricevuti[0].tipo")
        ok(primo == 'pronta', f'{nome}: la pagina parte e avvisa la suite ({primo})')
        if primo != 'pronta':
            c.close()
            continue
        ricevuti = lambda: pg.evaluate("window.__ricevuti.slice(1)")
        ferma = lambda: (pg.wait_for_timeout(150), pg.wait_for_function("window.__ferma()", timeout=20000))
        pg.evaluate("d=>window.__sala(d)", DATI['stalla'])
        pg.wait_for_timeout(600); ferma()
        s = pg.evaluate("window.__scena()")
        ok(s['tavolate'] == 6, f"{nome}: sei tavolate nella sala antica stalla ({s['tavolate']})")
        ok(s['sedie'] == DATI['sedie'] == DATI['persone'], f"{nome}: una sedia per ogni persona prenotata ({s['sedie']} sedie, {DATI['persone']} persone)")
        ok(pg.evaluate("window.__colori()") > 12, f'{nome}: la sala è disegnata')
        dentro = pg.evaluate("""()=>window.__ultimi.sala.contorno.every(([x,y])=>{const [a,b]=window.__schermoPunto(x,y);return a>0&&a<innerWidth&&b>0&&b<innerHeight})""")
        ok(dentro, f'{nome}: la sala sta intera nel riquadro')
        ok(ricevuti() == [], f'{nome}: nessun messaggio prima di un tocco')
        if IMMAGINI:
            pg.screenshot(path=os.path.join(IMMAGINI, f'sale-{nome}-stalla.png'))

        x, y = pg.evaluate("window.__schermoTavolata('d')")
        pg.mouse.click(x, y)
        pg.wait_for_timeout(200)
        ok(ricevuti()[-1:] == [{'tipo': 'tavolata', 'id': 'd'}], f'{nome}: toccare una tavolata la apre {ricevuti()[-1:]}')
        ok(pg.evaluate("window.__scena().scelto") == 'd', f'{nome}: la tavolata toccata resta evidenziata')
        n = len(ricevuti())
        pg.mouse.move(largo / 2, alto / 2); pg.mouse.down(); pg.mouse.move(largo / 2 + 80, alto / 2 + 10, steps=6); pg.mouse.up()
        pg.wait_for_timeout(300)
        ok(len(ricevuti()) == n, f'{nome}: trascinare la sala non apre niente')

        # dall'alto la sala è una pianta: tutte le tavolate restano toccabili
        pg.click('#z-alto'); ferma()
        tocchi = 0
        for tid in 'abcdef':
            x, y = pg.evaluate("id=>window.__schermoTag(id)", tid)   # i tag non si coprono: ognuno si tocca al suo centro
            pg.evaluate("([x,y])=>window.__tocca(x,y)", [x, y])
            if ricevuti()[-1] == {'tipo': 'tavolata', 'id': tid}: tocchi += 1
        ok(tocchi == 6, f"{nome}: dall'alto ogni tavolata risponde al tocco ({tocchi}/6)")
        if IMMAGINI:
            pg.screenshot(path=os.path.join(IMMAGINI, f'sale-{nome}-alto.png'))

        # cambio di sala: si ricostruisce tutto, con il tema scuro e la tavolata scelta
        pg.evaluate("d=>window.__sala(d)", DATI['panoramica'])
        pg.wait_for_timeout(400); ferma()
        s = pg.evaluate("window.__scena()")
        ok(s['tavolate'] == 3 and s['sedie'] == 13 and s['scelto'] == 'h' and s['sala'].startswith('panoramica'), f'{nome}: la sala panoramica sostituisce la prima {s}')
        ok(pg.evaluate("window.__colori()") > 12, f'{nome}: la sala panoramica (a L) è disegnata')
        ok(pg.evaluate("document.documentElement.classList.contains('scuro')"), f'{nome}: tema scuro applicato')
        if IMMAGINI:
            pg.screenshot(path=os.path.join(IMMAGINI, f'sale-{nome}-panoramica.png'))

        # le due sale insieme, dall'alto: stanno tutte e due nel riquadro e ogni prenotazione si tocca
        pg.evaluate("d=>window.__sala(d)", DATI['insieme'])
        pg.wait_for_timeout(400); ferma()
        s = pg.evaluate("window.__scena()")
        ok(s['tavolate'] == 9 and '+' in s['sala'], f"{nome}: le due sale insieme con tutte le prenotazioni ({s['tavolate']})")
        dentro = pg.evaluate("""()=>window.__ultimi.sale.every(q=>q.sala.contorno.every(([x,y])=>{const [a,b]=window.__schermoPunto(x,y,q.sala.id);return a>0&&a<innerWidth&&b>0&&b<innerHeight}))""")
        ok(dentro, f'{nome}: le due sale stanno intere nel riquadro')
        if IMMAGINI:
            pg.screenshot(path=os.path.join(IMMAGINI, f'sale-{nome}-insieme.png'))

        # tenere premuta una prenotazione e trascinarla nell'altra sala: la suite riceve dove è stata lasciata, sulla fila più vicina
        n = len(ricevuti())
        x, y = pg.evaluate("window.__schermoTavolata('g')")
        ax, ay = pg.evaluate("window.__schermoPunto(11, 4.9, 'stalla')")
        pg.mouse.move(x, y); pg.mouse.down(); pg.wait_for_timeout(450)
        pg.mouse.move((x + ax) / 2, (y + ay) / 2, steps=4); pg.mouse.move(ax, ay, steps=4); pg.wait_for_timeout(150); pg.mouse.up()
        pg.wait_for_timeout(250)
        r = ricevuti()[n:]
        ok(len(r) == 1 and r[0]['tipo'] == 'sposta' and r[0]['id'] == 'g' and r[0]['sala'] == 'stalla' and abs(r[0]['y'] - 4.75) < 0.01 and abs(r[0]['x'] - 11) < 0.6,
           f'{nome}: trascinare una prenotazione nella fila B della stalla {r}')
        # un tocco breve resta un tocco, e trascinare sul pavimento continua a ruotare senza spostare niente
        n = len(ricevuti())
        x, y = pg.evaluate("window.__schermoTag('d')")
        pg.mouse.click(x, y); pg.wait_for_timeout(450)
        ok(ricevuti()[n:] == [{'tipo': 'tavolata', 'id': 'd'}], f'{nome}: un tocco breve apre la prenotazione {ricevuti()[n:]}')
        ok(errori == [], f'{nome}: nessun errore nella pagina {errori[:2]}')
        c.close()
    b.close()

print('\nTUTTO OK' if not falliti else f'\n{len(falliti)} PROVE FALLITE')
sys.exit(1 if falliti else 0)
