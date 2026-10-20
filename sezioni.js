/**
 * Elenco di tutte le sezioni della suite, per la schermata "Altro": gruppi, ricerca per parola e preferiti.
 * Modulo puro (provato in test/sezioni.test.mjs).
 *
 * Ogni voce ha un id fisso (è la chiave dei preferiti salvati: non cambiarlo) e una destinazione:
 * - `rotta` (+ `parametri`): una schermata dello Stack (App.js);
 * - `sezione` (+ `parte`): una sezione della barra in basso (PrincipaleScreen.js: 'oggi', 'sale', 'gestione').
 * `parole` sono i sinonimi semplici con cui si può cercarla ("frigo", "pulizie", "listino"...).
 * Le voci con `gruppo: null` non compaiono nei gruppi (sono già nella barra in basso) ma si trovano con la ricerca
 * e si possono mettere fra i preferiti.
 */

export const GRUPPI_SEZIONI = ['Registri HACCP', 'Cucina', 'Archivio e documenti'];

export const SEZIONI_SUITE = [
  // Registri HACCP
  { id: 'temperature', titolo: 'Temperature', desc: 'Registro giornaliero', icona: 'thermometer', gruppo: 'Registri HACCP',
    rotta: 'Temperature', parole: ['frigo', 'frigorifero', 'frigoriferi', 'congelatore', 'cella', 'gradi', 'freddo'] },
  { id: 'sanificazione', titolo: 'Sanificazione', desc: 'Pulizie per area e registro', icona: 'spray-bottle', gruppo: 'Registri HACCP',
    rotta: 'Sanificazione', parole: ['pulizie', 'pulizia', 'pulire', 'detergente', 'igiene'] },
  { id: 'nonconformita', titolo: 'Non conformità', desc: 'Apri, gestisci e chiudi', icona: 'alert-outline', gruppo: 'Registri HACCP',
    rotta: 'NonConformita', parole: ['problema', 'problemi', 'anomalia', 'errore', 'segnalazione'] },
  { id: 'giro', titolo: 'Giro di controllo', desc: 'Quello che manca oggi, un passo alla volta', icona: 'clipboard-check-outline',
    gruppo: 'Registri HACCP', rotta: 'Giro', parole: ['controlli', 'oggi', 'verifica', 'checklist'] },
  // Cucina
  { id: 'magazzino', titolo: 'Magazzino', desc: 'Giacenze, scarichi e rintracciabilità dei lotti', icona: 'package-variant-closed',
    gruppo: 'Cucina', rotta: 'Magazzino', parole: ['lotti', 'lotto', 'giacenze', 'scarico', 'scadenze', 'rintracciabilita', 'richiamo', 'dispensa'] },
  { id: 'carico', titolo: 'Carico merce', desc: 'Da fattura PDF o a mano', icona: 'truck-delivery-outline', gruppo: 'Cucina',
    rotta: 'CaricoMerce', parole: ['fattura', 'fatture', 'consegna', 'ricevimento', 'merce', 'arrivo', 'fornitura'] },
  { id: 'eventi', titolo: 'Eventi', desc: 'Fabbisogno e costo dei menù in calendario', icona: 'calendar-star', gruppo: 'Cucina',
    rotta: 'Eventi', parole: ['fabbisogno', 'costo', 'margine', 'banchetto', 'cerimonia', 'spesa', 'allergeni'] },
  { id: 'produzioni', titolo: 'Produzioni', desc: 'Prepara un piatto e collega i lotti', icona: 'pot-steam-outline', gruppo: 'Cucina',
    rotta: 'Produzioni', parole: ['preparazione', 'preparare', 'cucinare', 'produzione'] },
  { id: 'etichette', titolo: 'Etichette', desc: 'Apertura, congelamento, produzione', icona: 'tag-outline', gruppo: 'Cucina',
    rotta: 'Etichette', parole: ['stampa', 'stampare', 'congelamento', 'apertura', 'adesivi'] },
  // Archivio e documenti
  { id: 'anagrafiche', titolo: 'Anagrafiche', desc: 'Prodotti, fornitori, ricette, frigoriferi', icona: 'book-open-variant',
    gruppo: 'Archivio e documenti', rotta: 'Anagrafiche', parole: ['archivio', 'elenco'] },
  { id: 'documenti', titolo: 'Documenti e dati', desc: 'Registri PDF, dati attività e backup', icona: 'folder-outline',
    gruppo: 'Archivio e documenti', rotta: 'Documenti', parole: ['asl', 'pdf', 'registri', 'stampa', 'controllo'] },

  // Solo ricerca e preferiti: schermate interne e sezioni della barra in basso
  { id: 'prodotti', titolo: 'Prodotti', desc: 'Anagrafiche → Prodotti', icona: 'food-apple-outline', gruppo: null,
    rotta: 'Anagrafiche', parametri: { scheda: 'Prodotti' }, parole: ['ingredienti', 'articoli', 'allergeni'] },
  { id: 'fornitori', titolo: 'Fornitori', desc: 'Anagrafiche → Fornitori', icona: 'truck-outline', gruppo: null,
    rotta: 'Anagrafiche', parametri: { scheda: 'Fornitori' }, parole: ['fornitore', 'grossista', 'contatti'] },
  { id: 'ricette', titolo: 'Ricette', desc: 'Anagrafiche → Ricette', icona: 'chef-hat', gruppo: null,
    rotta: 'Anagrafiche', parametri: { scheda: 'Ricette' }, parole: ['ricetta', 'ingredienti', 'allergeni', 'piatti', 'dosi'] },
  { id: 'frigoriferi', titolo: 'Frigoriferi', desc: 'Anagrafiche → Frigoriferi e limiti', icona: 'fridge-outline', gruppo: null,
    rotta: 'Anagrafiche', parametri: { scheda: 'Frigoriferi' }, parole: ['frigo', 'congelatore', 'cella', 'limiti', 'punti di controllo'] },
  { id: 'registri', titolo: 'Registri PDF', desc: 'Documenti → Registri per l\'ASL', icona: 'file-document-outline', gruppo: null,
    rotta: 'Documenti', parametri: { scheda: 'Registri PDF' }, parole: ['asl', 'pdf', 'stampa', 'ispezione', 'report'] },
  { id: 'backup', titolo: 'Backup e dati', desc: 'Documenti → Backup, ripristino e PIN', icona: 'cloud-upload-outline', gruppo: null,
    rotta: 'Documenti', parametri: { scheda: 'Backup e dati' }, parole: ['copia', 'ripristino', 'pin', 'puk', 'salvataggio', 'drive'] },
  { id: 'cucina', titolo: 'Cucina', desc: 'Mappa delle cucine e controlli di oggi', icona: 'silverware-fork-knife', gruppo: null,
    sezione: 'oggi', parole: ['home', 'mappa', 'oggi', 'cucine', '3d'] },
  { id: 'sala', titolo: 'Sala', desc: 'Tavolate e prenotazioni delle due sale', icona: 'table-furniture', gruppo: null,
    sezione: 'sale', parole: ['tavoli', 'tavolate', 'prenotazioni', 'family wall', 'camerieri', 'panoramica', 'antica stalla', 'coperti'] },
  { id: 'menu', titolo: 'Menù', desc: 'Calendario, proposte, stampe e invio', icona: 'book-open-page-variant-outline', gruppo: null,
    sezione: 'gestione', parte: 'Menù', parole: ['menu', 'proposta', 'proposte', 'portate', 'calendario', 'whatsapp', 'piatti'] },
  { id: 'incassi', titolo: 'Incassi e costi', desc: 'Gestione → Incassi (serve il PIN)', icona: 'cash-register', gruppo: null,
    sezione: 'gestione', parte: 'Incassi', parole: ['soldi', 'cassa', 'costi', 'spese', 'pos', 'contanti', 'risultato', 'iva'] },
];

const PER_ID = Object.fromEntries(SEZIONI_SUITE.map((s) => [s.id, s]));

/** Minuscole, senza accenti e senza spazi doppi: "Non conformità" e "non conformita" si equivalgono. */
export function semplifica(testo) {
  return String(testo || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Punteggio di una voce per le parole cercate: 0 = non c'entra. Ogni parola deve trovarsi da qualche parte. */
function punteggio(voce, parole) {
  const titolo = semplifica(voce.titolo);
  const resto = [voce.desc, ...(voce.parole || [])].map(semplifica);
  let tot = 0;
  for (const p of parole) {
    if (titolo.split(' ').some((w) => w.startsWith(p))) tot += 3;
    else if (titolo.includes(p)) tot += 2;
    else if (resto.some((r) => r.split(' ').some((w) => w.startsWith(p)) || r.includes(p))) tot += 1;
    else return 0;
  }
  return tot;
}

/** Voci che corrispondono al testo cercato, le più pertinenti prima. Testo vuoto = nessun risultato. */
export function cercaSezioni(testo, elenco = SEZIONI_SUITE) {
  const parole = semplifica(testo).split(' ').filter(Boolean);
  if (!parole.length) return [];
  return elenco
    .map((v, i) => ({ v, i, p: punteggio(v, parole) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .map((x) => x.v);
}

/** Legge i preferiti salvati (testo JSON con gli id): ignora id sconosciuti e doppi, non si rompe mai. */
export function leggiPreferiti(testo) {
  let lista = [];
  try { lista = JSON.parse(testo || '[]'); } catch (e) { lista = []; }
  if (!Array.isArray(lista)) return [];
  return [...new Set(lista.filter((id) => typeof id === 'string' && PER_ID[id]))];
}

/** Aggiunge o toglie una voce dai preferiti; le nuove vanno in fondo. */
export function cambiaPreferito(lista, id) {
  if (!PER_ID[id]) return lista;
  return lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];
}

/** Le voci preferite, nell'ordine in cui sono state scelte. */
export const vociPreferite = (lista) => lista.map((id) => PER_ID[id]).filter(Boolean);

/** Le voci di un gruppo, nell'ordine dell'elenco. */
export const vociDelGruppo = (gruppo) => SEZIONI_SUITE.filter((s) => s.gruppo === gruppo);
