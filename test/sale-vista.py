#!/usr/bin/env python3
"""Prova della vista 3D delle sale (sale/index.html) in un browser, come la vedrà la WebView dell'APK.

Con una finta suite al posto di React Native controlla che la sala parta, che mostri tavolate e sedie giuste
(una sedia per ogni posto stimato) e che il tocco su una tavolata arrivi alla suite.

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
import { SALE, datiScenaSala, disponi } from './sale.js';
const t = (id, persone, nome = '', ora = '', len = null) => ({ id, nome, persone: String(persone || ''), ora, note: '', len });
const piano = { file: [[t('a', 10, 'Battesimo Rossi', '13:00'), t('b', 8), t('c', 8, 'Bianchi', '', 1.8)], [t('d', 14), t('e', 2), t('f', 6)]] };
const altra = { file: [[t('g', 6)], [t('h', 0, '', '', 0.9)]] };
console.log(JSON.stringify({ stalla: datiScenaSala(SALE.stalla, piano), panoramica: datiScenaSala(SALE.panoramica, altra, { scuro: true, scelto: 'h' }),
  posti: disponi(SALE.stalla, piano).tavolate.reduce((s, x) => s + x.posti, 0) }));
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
        ok(s['sedie'] == DATI['posti'], f"{nome}: una sedia per ogni posto stimato ({s['sedie']} sedie, {DATI['posti']} posti)")
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
        ok(s['tavolate'] == 2 and s['sedie'] == 9 and s['scelto'] == 'h' and s['sala'].startswith('panoramica'), f'{nome}: la sala panoramica sostituisce la prima {s}')
        ok(pg.evaluate("window.__colori()") > 12, f'{nome}: la sala panoramica (a L) è disegnata')
        ok(pg.evaluate("document.documentElement.classList.contains('scuro')"), f'{nome}: tema scuro applicato')
        if IMMAGINI:
            pg.screenshot(path=os.path.join(IMMAGINI, f'sale-{nome}-panoramica.png'))
        ok(errori == [], f'{nome}: nessun errore nella pagina {errori[:2]}')
        c.close()
    b.close()

print('\nTUTTO OK' if not falliti else f'\n{len(falliti)} PROVE FALLITE')
sys.exit(1 if falliti else 0)
