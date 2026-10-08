#!/usr/bin/env python3
"""Prova della vista 3D delle cucine (cucine/index.html) in un browser, come la vedrà la WebView dell'APK.

Con una finta suite al posto di React Native controlla che la scena parta, che mostri tutte le attrezzature e le
etichette giuste, e che i tocchi arrivino alla suite: un'attrezzatura apre la sua scheda, il pavimento il Magazzino.

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
const base = { collegamenti: [{ posto: 'g9', punto_controllo_id: 1 }, { posto: 'p1', punto_controllo_id: 2 }, { posto: 'g17', area_id: 5 }, { posto: 'g1', punto_controllo_id: 3 }],
  punti: [frigo(1, 'A'), frigo(2, 'B'), frigo(3, 'C')], aree: [{ id: 5, nome: 'Banchi', daFare: true }] };
const prima = statiCucine({ ...base, temperatureOggi: [{ punto_controllo_id: 1, temperatura: 3.5 }, { punto_controllo_id: 2, temperatura: 9 }] });
const dopo = statiCucine({ ...base, aree: [{ id: 5, nome: 'Banchi', daFare: false }], temperatureOggi: [{ punto_controllo_id: 1, temperatura: 3.5 }, { punto_controllo_id: 2, temperatura: 2 }] });
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
    for nome, largo, alto in (('telefono', 380, 330), ('largo', 900, 500)):
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
        ok(sorted(s['etichette']) == sorted(['g9:3,5°C', 'p1:9°C', 'g17:da pulire', 'g1:da registrare']), f"{nome}: etichette giuste {s['etichette']}")
        ok(ricevuti() == [], f'{nome}: nessun messaggio prima di un tocco')
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
        tocchi = 0
        for pid in ('g17', 'g10a', 'g1', 'p1', 'p78'):
            if pid == 'p1':   # la cucina piccola da vicino: in un riquadro stretto il suo frigo sta in parte dietro quello grande
                pg.click('#v-piccola'); ferma()
            x, y = pg.evaluate("id=>window.__schermo(id)", pid)
            pg.evaluate("([x,y])=>window.__tocca(x,y)", [x, y])
            if ricevuti()[-1] == {'tipo': 'posto', 'id': pid}: tocchi += 1
            else: print('     non risponde:', pid, ricevuti()[-1])
        ok(tocchi == 5, f'{nome}: ogni attrezzatura risponde al tocco ({tocchi}/5)')

        x, y = pg.evaluate("window.__schermoPavimento('piccola', 2, 2)")
        pg.evaluate("([x,y])=>window.__tocca(x,y)", [x, y])
        ok(ricevuti()[-1] == {'tipo': 'pavimento', 'cucina': 'piccola'}, f'{nome}: il pavimento della cucina piccola risponde')
        pg.click('#v-tutte'); ferma()
        dentro = pg.evaluate("['g15','g9','p46','p78'].every(id=>{const [x,y]=window.__schermo(id);return x>0&&x<innerWidth&&y>0&&y<innerHeight})")
        ok(dentro, f'{nome}: con "Tutte" le due cucine stanno intere nel riquadro')

        # il pulsante "Magazzino" al centro della cucina grande e il pavimento libero
        x, y = pg.evaluate("window.__schermoMagazzino()")
        pg.mouse.click(x, y)
        pg.wait_for_timeout(200)
        ok(ricevuti()[-1] == {'tipo': 'pavimento', 'cucina': 'grande'}, f'{nome}: toccare "Magazzino" al centro avvisa la suite {ricevuti()[-1:]}')
        # trascinare ruota la scena e non conta come tocco
        n = len(ricevuti())
        pg.mouse.move(largo / 2, alto / 2); pg.mouse.down(); pg.mouse.move(largo / 2 + 80, alto / 2 + 10, steps=6); pg.mouse.up()
        pg.wait_for_timeout(300)
        ok(len(ricevuti()) == n, f'{nome}: trascinare non apre niente')

        # nuovi stati dalla suite: le etichette cambiano, il tema scuro e la scelta arrivano
        pg.evaluate("d=>window.__cucine(d)", DATI['dopo'])
        ferma()
        s = pg.evaluate("window.__scena()")
        ok(sorted(s['etichette']) == sorted(['g9:3,5°C', 'p1:2°C', 'g1:da registrare']), f"{nome}: le etichette seguono i nuovi stati {s['etichette']}")
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
