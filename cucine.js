/**
 * Le due cucine di Tenuta Coppa: disposizione delle attrezzature (dallo schizzo di Luca) e stato di ognuna.
 * Solo dati e calcolo, senza telefono (provato in test/cucine.test.mjs). La scena 3D è la pagina cucine/index.html,
 * mostrata da CucineVista.js; riceve da qui disposizione e stati.
 *
 * Coordinate in metri: x da sinistra, d = profondità dal fronte. `ox` è dove sta la cucina nella scena.
 * Ogni attrezzatura ("posto") ha un id fisso: è la chiave con cui la tabella cucina_posti collega frigoriferi e
 * congelatori al loro punto di controllo. Se cambia un id, i collegamenti salvati si perdono.
 */
export const CUCINE = {
  grande: { nome: 'Cucina grande', L: 12, D: 4.2, ox: -8.5,
    items: [
      { id: 'g15', n: '15', type: 'table', x: [0, 0.6], d: [0, 1.3], face: 'right', nome: "Mobile d'angolo" },
      { id: 'g14', n: '14', type: 'table', x: [0, 0.7], d: [1.5, 2.8], face: 'right', nome: 'Mobile a parete' },
      { id: 'g1', n: '1', type: 'vetrina', x: [1.4, 2.0], d: [0, 0.7], face: 'up', nome: 'Frigo vetrina' },
      { id: 'g13', n: '13', type: 'table', x: [2.0, 3.65], d: [0, 0.7], face: 'up', nome: 'Tavolo armadiato' },
      { id: 'g17', n: '17', type: 'table', x: [3.65, 6.95], d: [0, 0.7], face: 'up', nome: 'Tavolo armadiato lungo' },
      { id: 'g4', n: '4', type: 'range', x: [6.95, 8.9], d: [0, 0.7], face: 'up', nome: 'Quattro fuochi' },
      { id: 'g5', n: '5', type: 'griddle', x: [8.9, 9.9], d: [0, 0.7], face: 'up', nome: 'Piastra' },
      { id: 'g67', n: '6/7', type: 'tower', x: [9.9, 11.0], d: [0, 0.7], face: 'up', nome: 'Forno e abbattitore' },
      { id: 'g11a', n: '11', type: 'table', x: [1.5, 5.2], d: [1.7, 2.5], face: 'down', nome: 'Isola lunga' },
      { id: 'g10a', n: '10', type: 'table', x: [6.5, 9.8], d: [1.7, 2.5], face: 'down', nome: 'Isola' },
      { id: 'g11b', n: '11', type: 'table', x: [1.4, 5.3], d: [3.5, 4.2], face: 'down', nome: 'Tavolo lungo a parete' },
      { id: 'g10b', n: '10', type: 'table', x: [6.7, 9.9], d: [3.5, 4.2], face: 'down', nome: 'Tavolo a parete' },
      { id: 'g8', n: '8', type: 'chest', x: [11.25, 12], d: [2.05, 2.85], face: 'left', nome: 'Congelatore a pozzetto' },
      { id: 'g9', n: '9', type: 'fridge', x: [11.2, 12], d: [2.9, 4.2], face: 'left', nome: 'Frigo a due ante' },
    ],
    doors: [{ wall: 'front', a0: 0.6, a1: 1.4, hinge: 'a0' }, { wall: 'front', a0: 11.1, a1: 12.0, hinge: 'a1' }, { wall: 'back', a0: 5.45, a1: 6.45, hinge: 'a0' }],
    pulsanti: [{ id: 'magazzino', testo: 'Magazzino', x: 5.95, d: 3.75 }, { id: 'produzione', testo: 'Produzione', su: 'g4' }],
  },
  piccola: { nome: 'Cucina piccola', L: 4, D: 4, ox: 4.7,
    items: [
      { id: 'p2', n: '2', type: 'table', x: [0, 0.9], d: [1.6, 3.1], face: 'right', nome: 'Tavolo armadiato' },
      { id: 'p1', n: '1', type: 'fridge', x: [0, 0.9], d: [3.1, 4.0], face: 'right', nome: 'Frigo' },
      { id: 'p78', n: '7/8', type: 'sinkdw', x: [1.7, 4.0], d: [0, 0.8], face: 'up', nome: 'Lavandino e lavastoviglie' },
      { id: 'p5', n: '5', type: 'sink', x: [3.1, 4.0], d: [1.7, 2.8], face: 'left', nome: 'Lavandino doppia vasca' },
      { id: 'p46', n: '4/6', type: 'range', x: [3.1, 4.0], d: [2.8, 4.0], face: 'left', oven: true, nome: 'Fuochi con forno' },
    ],
    doors: [{ wall: 'left', a0: 0.7, a1: 1.5, hinge: 'a0' }, { wall: 'right', a0: 0.9, a1: 1.6, hinge: 'a0' }],
    pulsanti: [{ id: 'pulizie', testo: 'Pulizie', su: 'p78' }],
  },
};

/** Tutte le attrezzature, ognuna con la sua cucina: [{ id, n, nome, type, cucina, nomeCucina }]. */
export const POSTI = Object.keys(CUCINE).flatMap((k) => CUCINE[k].items.map((it) => ({
  id: it.id, n: it.n, nome: it.nome, type: it.type, cucina: k, nomeCucina: CUCINE[k].nome,
})));

/**
 * I tre pulsanti della mappa (scelta di Luca del 9/10/2026) e le schermate fra cui fanno scegliere: "Magazzino" al centro
 * della cucina grande, "Produzione" sui quattro fuochi, "Pulizie" sul lavandino a una vasca della cucina piccola.
 */
export const PULSANTI = {
  magazzino: { titolo: 'Magazzino', scelte: [
    { titolo: 'Carica nuova merce', nota: 'Da fattura PDF o a mano', icona: 'truck-delivery-outline', rotta: 'CaricoMerce' },
    { titolo: 'Guarda il magazzino', nota: 'Giacenze, lotti e scadenze', icona: 'warehouse', rotta: 'Magazzino' },
  ] },
  produzione: { titolo: 'Produzione', scelte: [
    { titolo: 'Produzione', nota: 'Registra un preparato', icona: 'chef-hat', rotta: 'Produzioni' },
    { titolo: 'Ricette', nota: 'Ingredienti e allergeni', icona: 'book-open-variant', rotta: 'Anagrafiche', parametri: { scheda: 'Ricette' } },
    { titolo: 'Etichette', nota: 'Stampa per i contenitori', icona: 'label-outline', rotta: 'Etichette' },
  ] },
  pulizie: { titolo: 'Pulizie', scelte: [
    { titolo: 'Sanificazione', nota: 'Registra le pulizie', icona: 'spray-bottle', rotta: 'Sanificazione' },
    { titolo: 'Non conformità', nota: 'Segnala o chiudi un problema', icona: 'alert-circle-outline', rotta: 'NonConformita' },
  ] },
};
/** Toccando un'attrezzatura senza tag vale il pulsante della sua famiglia; tavoli e pavimento valgono "magazzino". */
export const TOCCHI = { range: 'produzione', griddle: 'produzione', sink: 'pulizie', sinkdw: 'pulizie' };

/** Frigoriferi e congelatori: sono le sole attrezzature con un tag e una scheda. */
export const TIPI_FREDDO = ['fridge', 'vetrina', 'chest'];
export const FREDDI = POSTI.filter((p) => TIPI_FREDDO.includes(p.type));

/** Tipo e limiti proposti quando Luca dà il nome a un frigorifero dalla mappa (poi li può correggere). */
export const limitiProposti = (type) => (type === 'chest'
  ? { tipo: 'congelatore', temp_min: -25, temp_max: -18 }
  : { tipo: 'frigorifero', temp_min: 0, temp_max: 4 });

const gradi = (n) => `${String(Math.round(Number(n) * 10) / 10).replace('.', ',').replace('-', '−')}°C`;

/**
 * Stato di ogni frigorifero e congelatore della mappa, per il tag e per la scheda.
 *  - collegamenti: righe di cucina_posti [{ posto, punto_controllo_id }]
 *  - punti: frigoriferi attivi; temperatureOggi: rilevazioni di oggi (la più recente per prima)
 * → { [posto]: { c, nome, breve, punto, ultima } } con c = 'crit' (temperatura fuori limite), 'fare' (manca la temperatura
 *   di oggi), 'ok' (nei limiti) oppure 'neutro' (non ha ancora un nome). `nome` è quello scritto da Luca (null finché manca),
 *   `breve` la seconda riga del tag.
 */
export function statiCucine({ collegamenti = [], punti = [], temperatureOggi = [] }) {
  const perPosto = new Map(collegamenti.map((c) => [c.posto, c]));
  const out = {};
  for (const p of FREDDI) {
    const c = perPosto.get(p.id) || {};
    const punto = c.punto_controllo_id ? punti.find((x) => x.id === c.punto_controllo_id) || null : null;
    const ultima = punto ? temperatureOggi.find((t) => t.punto_controllo_id === punto.id) || null : null;
    let stato = 'neutro';
    let breve = 'dai un nome';
    if (punto && ultima) {
      stato = ultima.temperatura < punto.temp_min || ultima.temperatura > punto.temp_max ? 'crit' : 'ok';
      breve = gradi(ultima.temperatura);
    } else if (punto) {
      stato = 'fare';
      breve = 'da registrare';
    }
    out[p.id] = { c: stato, nome: punto ? punto.nome : null, breve, punto, ultima };
  }
  return out;
}

/** Quello che serve alla pagina 3D: disposizione, tag di ogni frigorifero, tema. */
export function datiScena(stati, { scuro = false, scelto = null } = {}) {
  const leggeri = {};
  Object.keys(stati).forEach((id) => { leggeri[id] = { c: stati[id].c, nome: stati[id].nome, breve: stati[id].breve }; });
  return { cucine: CUCINE, stati: leggeri, tocchi: TOCCHI, scuro: !!scuro, scelto };
}
