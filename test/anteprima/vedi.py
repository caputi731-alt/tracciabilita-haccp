#!/usr/bin/env python3
"""Anteprima delle schermate dell'app nel browser, per guardarle senza telefono.

Preparazione (i pacchetti servono solo qui e non vanno salvati in package.json):
    npm install --no-save react-native-web@~0.19.13 react-dom@18.3.1 @expo/metro-runtime@~4.0.1 sql.js@1.12.0
    npx expo export --platform web --output-dir dist-web
Uso:
    python3 test/anteprima/vedi.py dist-web <cartella immagini> [passo ...]
Ogni passo è "nome:testo da toccare>altro testo" (vuoto = solo la Home); "=Testo" tocca l'ultimo elemento con quel testo esatto.
I dati di prova sono in seme.sql; con VUOTO=1 il database parte vuoto. La vista 3D delle cucine si vede (pagina vera in un iframe). Limiti: il modulo Menù (WebView), la fotocamera
e i file del telefono nel browser non ci sono; l'aspetto su Android può differire in piccoli dettagli.
"""
import sys, os, threading, functools, http.server, json
from playwright.sync_api import sync_playwright
import shutil
dist, out = sys.argv[1], sys.argv[2]
RADICE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# la vista delle cucine (cucine/index.html) e i caratteri che usa, dove li cerca la finta WebView
for cartella, cosa in (('cucine', ''), ('menu', 'vendor/fonts')):
    shutil.copytree(os.path.join(RADICE, cartella, cosa), os.path.join(dist, 'asset', cartella, cosa), dirs_exist_ok=True)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        p = self.translate_path(self.path)
        if not os.path.exists(p) or os.path.isdir(p) and not os.path.exists(os.path.join(p, 'index.html')): self.path = '/index.html'
        return super().do_GET()
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=dist))
threading.Thread(target=srv.serve_forever, daemon=True).start()
U = f'http://127.0.0.1:{srv.server_address[1]}/'
SEME = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seme.sql'), encoding='utf-8').read() if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seme.sql')) else ''
with sync_playwright() as p:
    b = p.chromium.launch()
    for schema in (os.environ.get('SCHEMI', 'light').split(',')):
        c = b.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2, color_scheme=schema)
        pg = c.new_page(); err = []
        if SEME and not os.environ.get('VUOTO'): pg.add_init_script('window.__SEME=' + json.dumps(SEME))
        pg.on('pageerror', lambda e: err.append(str(e))); pg.on('console', lambda m: err.append(m.text) if m.type == 'error' else None)
        for passo in (sys.argv[3:] or ['home:']):
            nome, azione = passo.split(':', 1)
            pg.goto(U); pg.wait_for_timeout(2600)
            for t in [x for x in azione.split('>') if x]:
                try: (pg.get_by_text(t[1:], exact=True).last if t.startswith('=') else pg.get_by_text(t, exact=False).first).click(timeout=4000)
                except Exception as e: err.append(f'tocco "{t}": {str(e)[:80]}')
                pg.wait_for_timeout(900)
            pg.screenshot(path=f'{out}/{nome}-{schema}.png')
        print(schema, 'errori:', err[:4])
        c.close()
    b.close()
