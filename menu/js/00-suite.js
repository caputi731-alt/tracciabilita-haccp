'use strict';
// Collegamento con la suite (app React Native): attivo solo quando la pagina gira dentro la suite.
// Va caricato per primo: gli altri file leggono window.Android e window.SuiteKV appena partono.
//  - window.SuiteKV: archivio dei dati nel database della suite, al posto di IndexedDB (stesse funzioni di idb)
//  - window.Android: le stesse funzioni che offriva l'app Android del Menù (PDF, condivisione, WhatsApp)
(function () {
  const RN = window.ReactNativeWebView;
  if (!RN || !RN.postMessage) {
    // Dentro l'APK il collegamento deve esserci: se manca, meglio fermarsi che salvare i dati nel posto sbagliato.
    if (/^file:\/\/\/android_asset\//.test(location.href)) {
      const no = () => Promise.reject(new Error('collegamento con la suite non disponibile'));
      window.SuiteKV = { get: no, keys: no, setMany: no, set: no };
    }
    return;
  }

  let dati = {};
  try { dati = JSON.parse(RN.injectedObjectJson() || '{}') || {}; } catch (e) { dati = {}; }

  const invia = (tipo, corpo) => RN.postMessage(JSON.stringify(Object.assign({ tipo }, corpo || {})));

  // domande alla suite: la risposta arriva con window.__suiteRisposta(id, ok, valore)
  let prossimo = 0;
  const attese = new Map();
  const chiedi = (tipo, corpo) => new Promise((res, rej) => {
    const id = ++prossimo;
    attese.set(id, { res, rej });
    invia(tipo, Object.assign({ id }, corpo || {}));
    // senza risposta entro 20 secondi l'operazione fallisce, invece di restare in sospeso per sempre
    setTimeout(() => { if (attese.delete(id)) rej(new Error('la suite non risponde')); }, 20000);
  });
  window.__suiteRisposta = (id, ok, valore) => {
    const a = attese.get(id);
    if (!a) return;
    attese.delete(id);
    if (ok) a.res(valore); else a.rej(new Error(valore || 'operazione non riuscita'));
  };

  // i valori viaggiano come testo JSON: null = chiave assente (o da cancellare)
  window.SuiteKV = {
    get: (k) => chiedi('kvGet', { k: String(k) }).then((v) => (v === null || v === undefined ? undefined : JSON.parse(v))),
    keys: () => chiedi('kvKeys'),
    setMany: (pairs) => chiedi('kvSetMany', {
      pairs: pairs.map(([k, v]) => [String(k), v === undefined ? null : JSON.stringify(v)]),
    }),
    set(k, v) { return this.setMany([[k, v]]); },
  };

  // Ricette della suite: una portata dell'archivio può collegarsi a una ricetta e prenderne gli allergeni (vedi 03-pagine.js).
  // ogni ricetta: { id, nome, categoria, ingredienti (quanti), allergeni [1..14], daVerificare [nomi di ingredienti] }
  const ridisegna = () => {
    try {
      const a = document.activeElement;
      const scrivendo = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
      if (typeof render === 'function' && typeof ui !== 'undefined' && !ui.sheet && !scrivendo && document.querySelector('#app > *')) render(true);
    } catch (e) { /* la pagina non è ancora pronta: si disegnerà da sola */ }
  };
  const imposta = (elenco) => { window.SuiteRicette.elenco = Array.isArray(elenco) ? elenco : []; ridisegna(); };
  window.SuiteRicette = {
    elenco: [],
    carica: () => chiedi('ricette').then(imposta),
    crea: (nome) => chiedi('creaRicetta', { nome }),
    apri: (id) => invia('apriRicetta', { ricetta: id }),
    // apre nella suite il fabbisogno e il costo del menù (prima scrive le ultime modifiche)
    evento: (id) => Promise.resolve(typeof flush === 'function' ? flush() : null).then(() => invia('apriEvento', { evento: id }), () => invia('apriEvento', { evento: id })),
  };
  // la suite manda l'elenco aggiornato ogni volta che si torna al Menù
  window.__suiteRicette = imposta;

  // niente autoBackup: i dati stanno nel database della suite e finiscono nel suo backup
  window.Android = {
    version: () => String(dati.build || ''),
    fontScale: () => Number(dati.fontScale) || 1,
    saveAs: (token, base64, nome, tipo) => invia('saveAs', { token, base64, nome, mime: tipo }),
    saveFile: (base64, nome, tipo, condividi) => invia('saveFile', { base64, nome, mime: tipo, condividi: !!condividi }),
    shareFiles: (json) => invia('shareFiles', { json }),
  };

  // La pagina è caricata dai file dell'app (file://), dove fetch non legge i file locali:
  // per quelli si usa XMLHttpRequest. Gli indirizzi http, data: e blob: restano a fetch.
  const fetchVero = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = (risorsa, opzioni) => {
    const u = typeof risorsa === 'string' ? risorsa : '';
    if (!u || /^(https?|data|blob):/i.test(u)) return fetchVero(risorsa, opzioni);
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest();
      x.open('GET', u);
      x.responseType = 'blob';
      // per i file locali lo stato è 0 anche quando la lettura riesce
      x.onload = () => (x.response && x.response.size ? res(new Response(x.response, { status: 200 })) : rej(new TypeError('file non trovato')));
      x.onerror = () => rej(new TypeError('file non leggibile'));
      x.send();
    });
  };

  // Aspetto: dentro la suite la pagina prende colori, carattere e forme delle altre sezioni (css/suite.css)
  document.documentElement.classList.add('suite');
  if (dati.scuro) document.documentElement.classList.add('scuro'); // tema scuro del telefono, deciso dalla suite all'avvio
  window.NELLA_SUITE = true;
  // Chiamata dopo ogni disegno della pagina (render in 09-fogli.js). Nelle schermate principali il titolo è "Menù" e
  // le sezioni stanno nelle linguette; in quelle interne (modifica, anteprima...) la suite nasconde la sua barra in basso.
  let ultima = null;
  window.suiteVista = () => {
    const nav = document.querySelector('.nav');
    const cl = document.documentElement.classList;
    cl.toggle('con-nav', !!nav);
    cl.toggle('profonda', !nav);
    if (nav) {
      const h = document.querySelector('.top h1');
      if (h) h.textContent = 'Menù';
      const on = nav.querySelector('.on');
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    if (ultima !== !nav) { ultima = !nav; invia('vista', { profonda: !nav }); }
  };

  // tasto indietro di Android: la suite chiede se l'app web lo ha gestito
  window.__suiteIndietro = () => {
    let gestito = false;
    try { gestito = !!(window.appBack && window.appBack()); } catch (e) { gestito = false; }
    invia('indietro', { gestito });
  };

  // prima di lasciare la schermata la suite fa scrivere le ultime modifiche
  window.__suiteSalva = () => {
    let p;
    try { p = typeof flush === 'function' ? flush() : Promise.resolve(false); } catch (e) { p = Promise.resolve(false); }
    Promise.resolve(p).then(() => invia('salvato'), () => invia('salvato'));
  };

  window.addEventListener('error', (e) => invia('errore', { testo: String(e.message || e.error || 'errore') }));
})();
