#!/usr/bin/env python3
"""Prova della vista 3D delle cucine (cucine/index.html) in un browser, come la vedrà la WebView dell'APK.

Con una finta suite al posto di React Native controlla che la scena parta, che mostri tutte le attrezzature e le
etichette giuste, e che i tocchi arrivino alla suite: un'attrezzatura apre la sua scheda, i tre pulsanti la loro scelta; tavoli, lavandini e pavimento non rispondono.

    pip install playwright && playwright install chromium
    python3 test/cucine-vista.py [cartella per le immagini]
"""
import json, os, subprocess, sys
from playwright.sync_api import sync_playwright

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGINA = 'file://' + os.path.join(RADICE, 'cucine', 'index.html')
IMMAGINI = sys.argv[1] if len(sys.argv) > 1 else None

# i dati veri, come li prepara la suite (cucine.js)
PREPARA = """
import { statiCucine, datiScena } from './cucine.js';
const frigo = (id, nome) => ({ id, nome, temp_min: 0, temp_max: 4 });
const base = { collegamenti: [{ posto: 'g9', punto_controllo_id: 1 }, { posto: 'p1', punto_controllo_id: 2 }, { posto: 'g1', punto_controllo_id: 3 }],
  punti: [frigo(1, 'Frigo carni'), frigo(2, 'Frigo verdure della cucina piccola'), frigo(3, 'Bibite')] };
const prima = statiCucine({ ...base, temperatureOggi: [{ punto_controllo_id: 1, temperatura: 3.5 }, { punto_controllo_id: 2, temperatura: 9 }] });
const dopo = statiCucine({ ...base, temperatureOggi: [{ punto_controllo_id: 1, temperatura: 3.5 }, { punto_controllo_id: 2, temperatura: 2 }] });
console.log(JSON.stringify({ prima: datiScena(prima), dopo: datiScena(dopo, { scuro: true, scelto: 'p1' }) }));
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
    for nome, largo, alto in (('telefono', 412, 560), ('largo', 900, 500)):
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
        # la scena è ferma quando l'inquadratura ha finito di muoversi
        ferma = lambda: (pg.wait_for_timeout(150), pg.wait_for_function("window.__ferma()", timeout=20000))
        pg.evaluate("d=>window.__cucine(d)", DATI['prima'])
        pg.wait_for_timeout(600); ferma()
        s = pg.evaluate("window.__scena()")
        ok(s['posti'] == 19, f"{nome}: 19 attrezzature in scena ({s['posti']})")
        ok(sorted(s['etichette']) == sorted(['g9:Frigo carni|3,5°C', 'p1:Frigo verdure della cucina piccola|9°C', 'g1:Bibite|da registrare', 'g8:dai un nome']), f"{nome}: ogni frigorifero e congelatore ha il suo tag {s['etichette']}")
        ok(ricevuti() == [], f'{nome}: nessun messaggio prima di un tocco')
        # i tag non si coprono fra loro: ognuno si può toccare al suo centro
        liberi = 0
        for pid in ('g9', 'p1', 'g1', 'g8'):
            x, y = pg.evaluate("id=>window.__schermoTag(id)", pid)
            pg.evaluate("([x,y])=>window.__tocca(x,y)", [x, y])
            if ricevuti()[-1] == {'tipo': 'posto', 'id': pid}: liberi += 1
            else: print('     tag coperto:', pid, ricevuti()[-1])
        ok(liberi == 4, f'{nome}: i quattro tag sono tutti visibili e toccabili ({liberi}/4)')
        pg.evaluate("window.__cucine(Object.assign({}, window.__ultimi, {scelto: null})); window.__ricevuti.length = 1")
        if IMMAGINI:
            pg.screenshot(path=os.path.join(IMMAGINI, f'cucine-{nome}-chiaro.png'))

        # la scena è disegnata davvero: nell'immagine ci sono molti colori diversi
        colori = pg.evaluate("window.__colori()")
        ok(colori > 12, f'{nome}: la scena è disegnata ({colori} colori)')

        # un tocco vero su un'attrezzatura (frigo della cucina grande) e sulle altre con il tocco di prova
        x, y = pg.evaluate("window.__schermo('g9')")
        pg.mouse.click(x, y)
        pg.wait_for_timeout(200)
        r = ricevuti()
        ok(r and r[-1] == {'tipo': 'posto', 'id': 'g9'}, f'{nome}: toccare il frigo apre la sua scheda {r[-1:]}')
        ok(pg.evaluate("window.__scena().scelto") == 'g9', f'{nome}: il frigo toccato resta evidenziato')
        # il congelatore senza nome apre la sua scheda; tavoli, fuochi e lavandini aprono il Magazzino
        x, y = pg.evaluate("window.__schermo('g8')")
        pg.evaluate("([x,y])=>window.__tocca(x,y)", [x, y])
        ok(ricevuti()[-1] == {'tipo': 'posto', 'id': 'g8'}, f'{nome}: il congelatore senza nome apre la sua scheda')
        n = len(ricevuti())
        for pid in ('g10b', 'g67'):
            x, y = pg.evaluate("id=>window.__schermo(id)", pid)
            pg.evaluate("([x,y])=>window.__tocca(x,y)", [x, y])
        ok(len(ricevuti()) == n, f'{nome}: tavoli e forno toccati non aprono niente {ricevuti()[n:]}')
        ok(pg.evaluate("window.__scena().scelto") == 'g8', f'{nome}: un tavolo toccato non viene evidenziato')
        pg.click('#v-piccola'); ferma()
        x, y = pg.evaluate("window.__schermoTag('p1')")
        pg.mouse.click(x, y)
        pg.wait_for_timeout(200)
        ok(ricevuti()[-1] == {'tipo': 'posto', 'id': 'p1'}, f'{nome}: toccare il tag del frigo della cucina piccola apre la sua scheda')
        x, y = pg.evaluate("window.__schermo('p78')")
        pg.evaluate("([x,y])=>window.__tocca(x,y)", [x, y])
        x, y = pg.evaluate("window.__schermoPavimento('piccola', 2, 2)")
        pg.evaluate("([x,y])=>window.__tocca(x,y)", [x, y])
        ok(ricevuti()[-1] == {'tipo': 'posto', 'id': 'p1'}, f'{nome}: lavandino e pavimento della cucina piccola non aprono niente')
        pg.click('#v-tutte'); ferma()
        dentro = pg.evaluate("['g15','g9','p46','p78'].every(id=>{const [x,y]=window.__schermo(id);return x>0&&x<innerWidth&&y>0&&y<innerHeight})")
        ok(dentro, f'{nome}: con "Tutte" le due cucine stanno intere nel riquadro')

        # i tre pulsanti: Magazzino al centro della cucina grande, Produzione sui fuochi, Pulizie sul lavandino a una vasca nell'angolo
        pg.wait_for_timeout(500); ferma()   # l'inquadratura "Tutte" deve essere arrivata: Pulizie sta in un angolo
        for pul, cuc in (('magazzino', 'grande'), ('produzione', 'grande'), ('pulizie', 'grande')):
            x, y = pg.evaluate("id=>window.__schermoPulsante(id)", pul)
            ok(0 < x < largo and 0 < y < alto, f"{nome}: il pulsante {pul} è dentro lo schermo ({x:.0f},{y:.0f})")
            pg.mouse.click(x, y)
            pg.wait_for_timeout(200)
            ok(ricevuti()[-1] == {'tipo': 'pulsante', 'id': pul, 'cucina': cuc}, f'{nome}: toccare il pulsante {pul} avvisa la suite {ricevuti()[-1:]}')
        # trascinare ruota la scena e non conta come tocco
        n = len(ricevuti())
        pg.mouse.move(largo / 2, alto / 2); pg.mouse.down(); pg.mouse.move(largo / 2 + 80, alto / 2 + 10, steps=6); pg.mouse.up()
        pg.wait_for_timeout(300)
        ok(len(ricevuti()) == n, f'{nome}: trascinare non apre niente')

        # nuovi stati dalla suite: le etichette cambiano, il tema scuro e la scelta arrivano
        pg.evaluate("d=>window.__cucine(d)", DATI['dopo'])
        ferma()
        s = pg.evaluate("window.__scena()")
        ok('p1:Frigo verdure della cucina piccola|2°C' in s['etichette'] and len(s['etichette']) == 4, f"{nome}: i tag seguono i nuovi stati {s['etichette']}")
        ok(s['scelto'] == 'p1' and pg.evaluate("document.documentElement.classList.contains('scuro')"), f'{nome}: scelta e tema scuro applicati')
        pg.click('#v-piccola'); ferma()
        ok(pg.get_attribute('#v-piccola', 'aria-pressed') == 'true', f'{nome}: il pulsante "Piccola" inquadra la cucina piccola')
        if IMMAGINI:
            pg.screenshot(path=os.path.join(IMMAGINI, f'cucine-{nome}-scuro.png'))
        ok(errori == [], f'{nome}: nessun errore nella pagina {errori[:2]}')
        c.close()
    b.close()

print('\nTUTTO OK' if not falliti else f'\n{len(falliti)} PROVE FALLITE')
sys.exit(1 if falliti else 0)
