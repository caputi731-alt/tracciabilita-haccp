import * as SQLite from 'expo-sqlite';

let db = null;

export async function getDb() {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('haccp.db');
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return db;
}

export async function initDatabase() {
  const d = await getDb();
  await d.execAsync(`
    CREATE TABLE IF NOT EXISTS fornitori (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ragione_sociale TEXT NOT NULL,
      partita_iva TEXT,
      indirizzo TEXT,
      telefono TEXT,
      email TEXT,
      numero_riconoscimento_ce TEXT,
      categoria TEXT,
      note TEXT,
      attivo INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS prodotti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      denominazione TEXT NOT NULL,
      categoria TEXT,
      fornitore_abituale_id INTEGER REFERENCES fornitori(id),
      unita_misura TEXT DEFAULT 'kg',
      barcode_ean TEXT,
      allergeni TEXT DEFAULT '[]',
      conservazione TEXT DEFAULT 'ambiente',
      temp_min REAL,
      temp_max REAL,
      shelf_life_giorni INTEGER,
      giorni_dopo_apertura INTEGER,
      origine TEXT,
      note TEXT,
      attivo INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS punti_controllo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      tipo TEXT DEFAULT 'frigorifero',
      temp_min REAL NOT NULL,
      temp_max REAL NOT NULL,
      posizione TEXT,
      attivo INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS lotti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prodotto_id INTEGER NOT NULL REFERENCES prodotti(id),
      fornitore_id INTEGER NOT NULL REFERENCES fornitori(id),
      numero_lotto TEXT,
      ddt_numero TEXT,
      ddt_data TEXT,
      data_ricevimento TEXT NOT NULL,
      quantita_iniziale REAL NOT NULL,
      quantita_residua REAL NOT NULL,
      unita_misura TEXT,
      data_scadenza TEXT,
      tipo_scadenza TEXT DEFAULT 'scadenza',
      temperatura_rilevata REAL,
      esito_controllo TEXT DEFAULT 'conforme',
      integrita_imballo INTEGER DEFAULT 1,
      conformita_etichettatura INTEGER DEFAULT 1,
      foto_etichetta TEXT,
      foto_ddt TEXT,
      prezzo_unitario REAL,
      stato TEXT DEFAULT 'disponibile',
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS movimenti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lotto_id INTEGER NOT NULL REFERENCES lotti(id),
      tipo TEXT NOT NULL,
      quantita REAL NOT NULL,
      data_ora TEXT NOT NULL,
      causale TEXT,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS registro_temperature (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      punto_controllo_id INTEGER NOT NULL REFERENCES punti_controllo(id),
      data_ora TEXT NOT NULL,
      temperatura REAL NOT NULL,
      esito TEXT NOT NULL,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS non_conformita (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_ora TEXT NOT NULL,
      origine TEXT,
      descrizione TEXT NOT NULL,
      lotto_id INTEGER REFERENCES lotti(id),
      azione_correttiva TEXT,
      stato TEXT DEFAULT 'aperta',
      data_chiusura TEXT
    );

    CREATE TABLE IF NOT EXISTS impostazioni (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      nome_attivita TEXT,
      indirizzo TEXT,
      responsabile TEXT,
      partita_iva TEXT
    );

    CREATE TABLE IF NOT EXISTS aree_pulizia (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      frequenza TEXT DEFAULT 'giornaliera',
      prodotto_previsto TEXT,
      procedura TEXT,
      attivo INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS registro_sanificazione (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      area_id INTEGER REFERENCES aree_pulizia(id),
      data_ora TEXT NOT NULL,
      prodotto_utilizzato TEXT,
      esito TEXT DEFAULT 'conforme',
      operatore TEXT,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS ricette (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      categoria TEXT,
      porzioni_standard REAL DEFAULT 1,
      procedura TEXT,
      allergeni_calcolati TEXT DEFAULT '[]',
      attiva INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS ricetta_ingredienti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ricetta_id INTEGER NOT NULL REFERENCES ricette(id),
      prodotto_id INTEGER NOT NULL REFERENCES prodotti(id),
      quantita REAL,
      unita_misura TEXT
    );

    CREATE TABLE IF NOT EXISTS produzioni (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ricetta_id INTEGER REFERENCES ricette(id),
      nome_ricetta TEXT,
      data_ora TEXT NOT NULL,
      quantita_prodotta REAL,
      lotto_produzione TEXT,
      data_scadenza TEXT,
      operatore TEXT,
      allergeni TEXT DEFAULT '[]',
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS produzione_lotti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produzione_id INTEGER NOT NULL REFERENCES produzioni(id),
      lotto_id INTEGER REFERENCES lotti(id),
      prodotto_id INTEGER REFERENCES prodotti(id),
      quantita_usata REAL
    );

    CREATE TABLE IF NOT EXISTS ricette (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      categoria TEXT,
      porzioni INTEGER,
      procedura TEXT,
      attiva INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS ricetta_ingredienti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ricetta_id INTEGER REFERENCES ricette(id),
      prodotto_id INTEGER REFERENCES prodotti(id),
      quantita REAL,
      unita_misura TEXT
    );

    CREATE TABLE IF NOT EXISTS produzioni (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ricetta_id INTEGER REFERENCES ricette(id),
      nome TEXT,
      data_ora TEXT NOT NULL,
      quantita_prodotta REAL,
      lotto_produzione TEXT,
      data_scadenza TEXT,
      operatore TEXT,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS produzione_lotti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produzione_id INTEGER REFERENCES produzioni(id),
      lotto_id INTEGER REFERENCES lotti(id),
      quantita_usata REAL
    );

    CREATE INDEX IF NOT EXISTS idx_lotti_scadenza ON lotti(data_scadenza);
    CREATE INDEX IF NOT EXISTS idx_lotti_stato ON lotti(stato);
    CREATE INDEX IF NOT EXISTS idx_lotti_numero ON lotti(numero_lotto);
    CREATE INDEX IF NOT EXISTS idx_temp_data ON registro_temperature(data_ora);
  `);

  // migrazione leggera: colonna produzione_id nei movimenti (installazioni esistenti)
  try {
    const cols = await d.getAllAsync('PRAGMA table_info(movimenti)');
    if (!cols.some((c) => c.name === 'produzione_id')) {
      await d.execAsync('ALTER TABLE movimenti ADD COLUMN produzione_id INTEGER');
    }
  } catch (e) {}

  return d;
}

/* ---------- helper generici ---------- */

export async function query(sql, params = []) {
  const d = await getDb();
  return d.getAllAsync(sql, params);
}

export async function queryOne(sql, params = []) {
  const d = await getDb();
  return d.getFirstAsync(sql, params);
}

export async function exec(sql, params = []) {
  const d = await getDb();
  return d.runAsync(sql, params);
}

/* ---------- fornitori ---------- */

export const listaFornitori = () =>
  query('SELECT * FROM fornitori WHERE attivo = 1 ORDER BY ragione_sociale');

export const salvaFornitore = (f) =>
  f.id
    ? exec(
        `UPDATE fornitori SET ragione_sociale=?, partita_iva=?, indirizzo=?, telefono=?,
         email=?, numero_riconoscimento_ce=?, categoria=?, note=? WHERE id=?`,
        [f.ragione_sociale, f.partita_iva, f.indirizzo, f.telefono, f.email,
         f.numero_riconoscimento_ce, f.categoria, f.note, f.id]
      )
    : exec(
        `INSERT INTO fornitori (ragione_sociale, partita_iva, indirizzo, telefono,
         email, numero_riconoscimento_ce, categoria, note) VALUES (?,?,?,?,?,?,?,?)`,
        [f.ragione_sociale, f.partita_iva, f.indirizzo, f.telefono, f.email,
         f.numero_riconoscimento_ce, f.categoria, f.note]
      );

export const eliminaFornitore = (id) =>
  exec('UPDATE fornitori SET attivo = 0 WHERE id = ?', [id]);

/* ---------- prodotti ---------- */

export const listaProdotti = () =>
  query(`SELECT p.*, f.ragione_sociale AS fornitore
         FROM prodotti p LEFT JOIN fornitori f ON f.id = p.fornitore_abituale_id
         WHERE p.attivo = 1 ORDER BY p.denominazione`);

export const prodottoDaBarcode = (barcode) =>
  queryOne('SELECT * FROM prodotti WHERE barcode_ean = ? AND attivo = 1', [barcode]);

export const salvaProdotto = (p) => {
  const allergeni = JSON.stringify(p.allergeni || []);
  return p.id
    ? exec(
        `UPDATE prodotti SET denominazione=?, categoria=?, fornitore_abituale_id=?,
         unita_misura=?, barcode_ean=?, allergeni=?, conservazione=?, temp_min=?,
         temp_max=?, shelf_life_giorni=?, giorni_dopo_apertura=?, origine=?, note=?
         WHERE id=?`,
        [p.denominazione, p.categoria, p.fornitore_abituale_id, p.unita_misura,
         p.barcode_ean, allergeni, p.conservazione, p.temp_min, p.temp_max,
         p.shelf_life_giorni, p.giorni_dopo_apertura, p.origine, p.note, p.id]
      )
    : exec(
        `INSERT INTO prodotti (denominazione, categoria, fornitore_abituale_id,
         unita_misura, barcode_ean, allergeni, conservazione, temp_min, temp_max,
         shelf_life_giorni, giorni_dopo_apertura, origine, note)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [p.denominazione, p.categoria, p.fornitore_abituale_id, p.unita_misura,
         p.barcode_ean, allergeni, p.conservazione, p.temp_min, p.temp_max,
         p.shelf_life_giorni, p.giorni_dopo_apertura, p.origine, p.note]
      );
};

export const eliminaProdotto = (id) =>
  exec('UPDATE prodotti SET attivo = 0 WHERE id = ?', [id]);

/* ---------- punti di controllo ---------- */

export const listaPuntiControllo = () =>
  query('SELECT * FROM punti_controllo WHERE attivo = 1 ORDER BY nome');

export const salvaPuntoControllo = (p) =>
  p.id
    ? exec('UPDATE punti_controllo SET nome=?, tipo=?, temp_min=?, temp_max=?, posizione=? WHERE id=?',
        [p.nome, p.tipo, p.temp_min, p.temp_max, p.posizione, p.id])
    : exec('INSERT INTO punti_controllo (nome, tipo, temp_min, temp_max, posizione) VALUES (?,?,?,?,?)',
        [p.nome, p.tipo, p.temp_min, p.temp_max, p.posizione]);

export const eliminaPuntoControllo = (id) =>
  exec('UPDATE punti_controllo SET attivo = 0 WHERE id = ?', [id]);

/* ---------- lotti e movimenti ---------- */

export async function registraCarico(l) {
  const res = await exec(
    `INSERT INTO lotti (prodotto_id, fornitore_id, numero_lotto, ddt_numero, ddt_data,
     data_ricevimento, quantita_iniziale, quantita_residua, unita_misura, data_scadenza,
     tipo_scadenza, temperatura_rilevata, esito_controllo, integrita_imballo,
     conformita_etichettatura, foto_etichetta, foto_ddt, prezzo_unitario, note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [l.prodotto_id, l.fornitore_id, l.numero_lotto, l.ddt_numero, l.ddt_data,
     l.data_ricevimento, l.quantita, l.quantita, l.unita_misura, l.data_scadenza,
     l.tipo_scadenza || 'scadenza', l.temperatura_rilevata, l.esito_controllo || 'conforme',
     l.integrita_imballo ? 1 : 0, l.conformita_etichettatura ? 1 : 0,
     l.foto_etichetta, l.foto_ddt, l.prezzo_unitario, l.note]
  );
  const lottoId = res.lastInsertRowId;
  await exec(
    'INSERT INTO movimenti (lotto_id, tipo, quantita, data_ora, causale) VALUES (?,?,?,?,?)',
    [lottoId, 'carico', l.quantita, new Date().toISOString(), 'Ricevimento merce']
  );
  if (l.esito_controllo === 'non conforme') {
    await exec(
      `INSERT INTO non_conformita (data_ora, origine, descrizione, lotto_id)
       VALUES (?,?,?,?)`,
      [new Date().toISOString(), 'ricevimento',
       `Merce non conforme al ricevimento: ${l.note || 'vedi scheda lotto'}`, lottoId]
    );
  }
  return lottoId;
}

export const listaLotti = (filtro = '') =>
  query(
    `SELECT l.*, p.denominazione AS prodotto, f.ragione_sociale AS fornitore
     FROM lotti l
     JOIN prodotti p ON p.id = l.prodotto_id
     JOIN fornitori f ON f.id = l.fornitore_id
     WHERE l.stato = 'disponibile'
       AND (? = '' OR p.denominazione LIKE ? OR l.numero_lotto LIKE ?)
     ORDER BY l.data_scadenza IS NULL, l.data_scadenza ASC`,
    [filtro, `%${filtro}%`, `%${filtro}%`]
  );

export async function registraScarico(lottoId, quantita, causale) {
  const lotto = await queryOne('SELECT * FROM lotti WHERE id = ?', [lottoId]);
  if (!lotto) throw new Error('Lotto non trovato');
  const residua = Math.max(0, lotto.quantita_residua - quantita);
  await exec(
    'UPDATE lotti SET quantita_residua = ?, stato = ? WHERE id = ?',
    [residua, residua <= 0 ? 'esaurito' : 'disponibile', lottoId]
  );
  await exec(
    'INSERT INTO movimenti (lotto_id, tipo, quantita, data_ora, causale) VALUES (?,?,?,?,?)',
    [lottoId, causale === 'scarto' ? 'scarto' : 'scarico', quantita,
     new Date().toISOString(), causale]
  );
}

export const lottiInScadenza = (giorni = 3) => {
  const limite = new Date(Date.now() + giorni * 86400000).toISOString().slice(0, 10);
  return query(
    `SELECT l.*, p.denominazione AS prodotto
     FROM lotti l JOIN prodotti p ON p.id = l.prodotto_id
     WHERE l.stato = 'disponibile' AND l.data_scadenza IS NOT NULL
       AND l.data_scadenza <= ?
     ORDER BY l.data_scadenza ASC`, [limite]);
};

/* ---------- temperature ---------- */

export async function registraTemperatura(puntoId, temperatura, note) {
  const punto = await queryOne('SELECT * FROM punti_controllo WHERE id = ?', [puntoId]);
  const conforme = temperatura >= punto.temp_min && temperatura <= punto.temp_max;
  await exec(
    'INSERT INTO registro_temperature (punto_controllo_id, data_ora, temperatura, esito, note) VALUES (?,?,?,?,?)',
    [puntoId, new Date().toISOString(), temperatura, conforme ? 'conforme' : 'non conforme', note]
  );
  if (!conforme) {
    await exec(
      'INSERT INTO non_conformita (data_ora, origine, descrizione) VALUES (?,?,?)',
      [new Date().toISOString(), 'temperatura',
       `${punto.nome}: rilevati ${temperatura}°C (limiti ${punto.temp_min}/${punto.temp_max}°C)`]
    );
  }
  return conforme;
}

export const temperatureDiOggi = () => {
  const oggi = new Date().toISOString().slice(0, 10);
  return query(
    `SELECT r.*, pc.nome FROM registro_temperature r
     JOIN punti_controllo pc ON pc.id = r.punto_controllo_id
     WHERE substr(r.data_ora, 1, 10) = ? ORDER BY r.data_ora DESC`, [oggi]);
};

export const nonConformitaAperte = () =>
  query("SELECT * FROM non_conformita WHERE stato = 'aperta' ORDER BY data_ora DESC");

export const chiudiNonConformita = (id, azione) =>
  exec("UPDATE non_conformita SET stato='chiusa', azione_correttiva=?, data_chiusura=? WHERE id=?",
    [azione, new Date().toISOString(), id]);

/* ---------- backup / export ---------- */

async function elencoTabelle() {
  const r = await query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'android_%'"
  );
  return r.map((x) => x.name);
}

export async function esportaTutto() {
  const tabelle = await elencoTabelle();
  const dati = {};
  for (const t of tabelle) dati[t] = await query(`SELECT * FROM ${t}`);
  return { versione: 1, generato: new Date().toISOString(), tabelle: dati };
}

export async function importaTutto(dump) {
  if (!dump || !dump.tabelle) throw new Error('File di backup non valido.');
  const d = await getDb();
  await d.withTransactionAsync(async () => {
    for (const t of Object.keys(dump.tabelle)) {
      const righe = dump.tabelle[t];
      if (!Array.isArray(righe)) continue;
      await d.execAsync(`DELETE FROM ${t}`);
      for (const row of righe) {
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        const ph = cols.map(() => '?').join(',');
        await d.runAsync(
          `INSERT INTO ${t} (${cols.join(',')}) VALUES (${ph})`,
          cols.map((c) => row[c])
        );
      }
    }
  });
}

export function toCsv(righe) {
  if (!righe || righe.length === 0) return '';
  const cols = Object.keys(righe[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  return [cols.join(';'), ...righe.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\n');
}

export async function csvTabella(nome) {
  const righe = await query(`SELECT * FROM ${nome}`);
  return toCsv(righe);
}

export async function csvRegistroCarichi() {
  const righe = await query(
    `SELECT l.data_ricevimento, p.denominazione AS prodotto, f.ragione_sociale AS fornitore,
            l.numero_lotto, l.ddt_numero, l.quantita_iniziale, l.quantita_residua,
            l.unita_misura, l.data_scadenza, l.esito_controllo, l.prezzo_unitario
     FROM lotti l
     JOIN prodotti p ON p.id = l.prodotto_id
     JOIN fornitori f ON f.id = l.fornitore_id
     ORDER BY l.data_ricevimento DESC`
  );
  return toCsv(righe);
}

/* ---------- rintracciabilità e report (Blocco B) ---------- */

export const cercaLotti = (filtro = '') =>
  query(
    `SELECT l.*, p.denominazione AS prodotto, p.allergeni,
            f.ragione_sociale AS fornitore, f.partita_iva AS fornitore_piva,
            f.numero_riconoscimento_ce
     FROM lotti l
     JOIN prodotti p ON p.id = l.prodotto_id
     JOIN fornitori f ON f.id = l.fornitore_id
     WHERE (? = '' OR p.denominazione LIKE ? OR l.numero_lotto LIKE ? OR f.ragione_sociale LIKE ?)
     ORDER BY l.data_ricevimento DESC`,
    [filtro, `%${filtro}%`, `%${filtro}%`, `%${filtro}%`]
  );

export const movimentiDiLotto = (id) =>
  query('SELECT * FROM movimenti WHERE lotto_id = ? ORDER BY data_ora', [id]);

export const temperatureTra = (da, a) =>
  query(
    `SELECT r.*, pc.nome, pc.temp_min, pc.temp_max
     FROM registro_temperature r
     JOIN punti_controllo pc ON pc.id = r.punto_controllo_id
     WHERE substr(r.data_ora, 1, 10) BETWEEN ? AND ?
     ORDER BY r.data_ora`,
    [da, a]
  );

export const carichiTra = (da, a) =>
  query(
    `SELECT l.*, p.denominazione AS prodotto, f.ragione_sociale AS fornitore
     FROM lotti l
     JOIN prodotti p ON p.id = l.prodotto_id
     JOIN fornitori f ON f.id = l.fornitore_id
     WHERE substr(l.data_ricevimento, 1, 10) BETWEEN ? AND ?
     ORDER BY l.data_ricevimento`,
    [da, a]
  );

export const tutteNonConformita = () =>
  query('SELECT * FROM non_conformita ORDER BY data_ora DESC');

export async function getImpostazioni() {
  return (await queryOne('SELECT * FROM impostazioni WHERE id = 1')) || {};
}

export async function salvaImpostazioni(i) {
  await exec(
    `INSERT INTO impostazioni (id, nome_attivita, indirizzo, responsabile, partita_iva)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       nome_attivita = excluded.nome_attivita,
       indirizzo = excluded.indirizzo,
       responsabile = excluded.responsabile,
       partita_iva = excluded.partita_iva`,
    [i.nome_attivita, i.indirizzo, i.responsabile, i.partita_iva]
  );
}

/* ---------- sanificazione (Blocco C) ---------- */

export const listaAree = () =>
  query('SELECT * FROM aree_pulizia WHERE attivo = 1 ORDER BY nome');

export const salvaArea = (a) =>
  a.id
    ? exec('UPDATE aree_pulizia SET nome=?, frequenza=?, prodotto_previsto=?, procedura=? WHERE id=?',
        [a.nome, a.frequenza, a.prodotto_previsto, a.procedura, a.id])
    : exec('INSERT INTO aree_pulizia (nome, frequenza, prodotto_previsto, procedura) VALUES (?,?,?,?)',
        [a.nome, a.frequenza, a.prodotto_previsto, a.procedura]);

export const eliminaArea = (id) =>
  exec('UPDATE aree_pulizia SET attivo = 0 WHERE id = ?', [id]);

export async function registraSanificazione(s) {
  await exec(
    `INSERT INTO registro_sanificazione (area_id, data_ora, prodotto_utilizzato, esito, operatore, note)
     VALUES (?,?,?,?,?,?)`,
    [s.area_id, new Date().toISOString(), s.prodotto_utilizzato, s.esito || 'conforme', s.operatore, s.note]
  );
}

export const sanificazioniOggi = () => {
  const oggi = new Date().toISOString().slice(0, 10);
  return query(
    `SELECT r.*, a.nome FROM registro_sanificazione r
     LEFT JOIN aree_pulizia a ON a.id = r.area_id
     WHERE substr(r.data_ora, 1, 10) = ? ORDER BY r.data_ora DESC`, [oggi]);
};

export const sanificazioniRecenti = (limite = 40) =>
  query(
    `SELECT r.*, a.nome FROM registro_sanificazione r
     LEFT JOIN aree_pulizia a ON a.id = r.area_id
     ORDER BY r.data_ora DESC LIMIT ?`, [limite]);

export const sanificazioniTra = (da, a) =>
  query(
    `SELECT r.*, ar.nome FROM registro_sanificazione r
     LEFT JOIN aree_pulizia ar ON ar.id = r.area_id
     WHERE substr(r.data_ora, 1, 10) BETWEEN ? AND ?
     ORDER BY r.data_ora`, [da, a]);

/* ---------- non conformità: apertura manuale ---------- */

export async function aggiungiNonConformita(nc) {
  await exec(
    `INSERT INTO non_conformita (data_ora, origine, descrizione, azione_correttiva, stato)
     VALUES (?,?,?,?,?)`,
    [new Date().toISOString(), nc.origine || 'altro', nc.descrizione,
     nc.azione_correttiva || null, nc.azione_correttiva ? 'chiusa' : 'aperta']
  );
}

/* ---------- ricette e produzioni (Blocco D) ---------- */

export const listaRicette = () =>
  query('SELECT * FROM ricette WHERE attiva = 1 ORDER BY nome');

export const ingredientiRicetta = (ricettaId) =>
  query(
    `SELECT ri.*, p.denominazione AS prodotto, p.allergeni, p.unita_misura AS um_prodotto
     FROM ricetta_ingredienti ri
     JOIN prodotti p ON p.id = ri.prodotto_id
     WHERE ri.ricetta_id = ?`, [ricettaId]);

async function allergeniDaProdotti(prodottiIds) {
  if (prodottiIds.length === 0) return [];
  const set = new Set();
  for (const id of prodottiIds) {
    const p = await queryOne('SELECT allergeni FROM prodotti WHERE id = ?', [id]);
    if (p && p.allergeni) {
      try { JSON.parse(p.allergeni).forEach((a) => set.add(a)); } catch (e) {}
    }
  }
  return [...set];
}

export async function salvaRicetta(r, ingredienti) {
  const d = await getDb();
  const allergeni = await allergeniDaProdotti(ingredienti.map((i) => i.prodotto_id));
  let ricettaId = r.id;
  await d.withTransactionAsync(async () => {
    if (ricettaId) {
      await d.runAsync(
        'UPDATE ricette SET nome=?, categoria=?, porzioni_standard=?, procedura=?, allergeni_calcolati=? WHERE id=?',
        [r.nome, r.categoria, r.porzioni_standard || 1, r.procedura, JSON.stringify(allergeni), ricettaId]
      );
      await d.runAsync('DELETE FROM ricetta_ingredienti WHERE ricetta_id = ?', [ricettaId]);
    } else {
      const res = await d.runAsync(
        'INSERT INTO ricette (nome, categoria, porzioni_standard, procedura, allergeni_calcolati) VALUES (?,?,?,?,?)',
        [r.nome, r.categoria, r.porzioni_standard || 1, r.procedura, JSON.stringify(allergeni)]
      );
      ricettaId = res.lastInsertRowId;
    }
    for (const ing of ingredienti) {
      await d.runAsync(
        'INSERT INTO ricetta_ingredienti (ricetta_id, prodotto_id, quantita, unita_misura) VALUES (?,?,?,?)',
        [ricettaId, ing.prodotto_id, ing.quantita, ing.unita_misura]
      );
    }
  });
  return ricettaId;
}

export const eliminaRicetta = (id) =>
  exec('UPDATE ricette SET attiva = 0 WHERE id = ?', [id]);

/* lotti disponibili per un prodotto, in ordine FIFO (scadenza più vicina) */
export const lottiPerProdotto = (prodottoId) =>
  query(
    `SELECT l.*, f.ragione_sociale AS fornitore FROM lotti l
     JOIN fornitori f ON f.id = l.fornitore_id
     WHERE l.prodotto_id = ? AND l.stato = 'disponibile' AND l.quantita_residua > 0
     ORDER BY l.data_scadenza IS NULL, l.data_scadenza ASC`, [prodottoId]);

const lottoProdAuto = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `PR${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

/**
 * Registra una produzione.
 * prod: { ricetta_id, nome_ricetta, quantita_prodotta, data_scadenza, operatore, note, allergeni }
 * righe: [ { lotto_id, prodotto_id, quantita_usata } ]
 */
export async function registraProduzione(prod, righe) {
  const d = await getDb();
  const lotto = prod.lotto_produzione || lottoProdAuto();
  let produzioneId;
  await d.withTransactionAsync(async () => {
    const res = await d.runAsync(
      `INSERT INTO produzioni (ricetta_id, nome_ricetta, data_ora, quantita_prodotta,
        lotto_produzione, data_scadenza, operatore, allergeni, note)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [prod.ricetta_id || null, prod.nome_ricetta, new Date().toISOString(),
       prod.quantita_prodotta || null, lotto, prod.data_scadenza || null,
       prod.operatore || null, JSON.stringify(prod.allergeni || []), prod.note || null]
    );
    produzioneId = res.lastInsertRowId;

    for (const r of righe) {
      if (!r.lotto_id || !r.quantita_usata) continue;
      await d.runAsync(
        'INSERT INTO produzione_lotti (produzione_id, lotto_id, prodotto_id, quantita_usata) VALUES (?,?,?,?)',
        [produzioneId, r.lotto_id, r.prodotto_id, r.quantita_usata]
      );
      // scarico dal magazzino
      const l = await d.getFirstAsync('SELECT * FROM lotti WHERE id = ?', [r.lotto_id]);
      if (l) {
        const residua = Math.max(0, l.quantita_residua - r.quantita_usata);
        await d.runAsync('UPDATE lotti SET quantita_residua=?, stato=? WHERE id=?',
          [residua, residua <= 0 ? 'esaurito' : 'disponibile', r.lotto_id]);
        await d.runAsync(
          'INSERT INTO movimenti (lotto_id, tipo, quantita, data_ora, causale, produzione_id) VALUES (?,?,?,?,?,?)',
          [r.lotto_id, 'scarico', r.quantita_usata, new Date().toISOString(),
           `Produzione ${lotto}`, produzioneId]
        ).catch(async () => {
          // se la colonna produzione_id non esiste in vecchie installazioni, inserisci senza
          await d.runAsync(
            'INSERT INTO movimenti (lotto_id, tipo, quantita, data_ora, causale) VALUES (?,?,?,?,?)',
            [r.lotto_id, 'scarico', r.quantita_usata, new Date().toISOString(), `Produzione ${lotto}`]
          );
        });
      }
    }
  });
  return { id: produzioneId, lotto_produzione: lotto };
}

export const listaProduzioni = () =>
  query('SELECT * FROM produzioni ORDER BY data_ora DESC');

export const lottiDiProduzione = (produzioneId) =>
  query(
    `SELECT pl.*, p.denominazione AS prodotto, l.numero_lotto, f.ragione_sociale AS fornitore
     FROM produzione_lotti pl
     LEFT JOIN prodotti p ON p.id = pl.prodotto_id
     LEFT JOIN lotti l ON l.id = pl.lotto_id
     LEFT JOIN fornitori f ON f.id = l.fornitore_id
     WHERE pl.produzione_id = ?`, [produzioneId]);

/* a valle: quali produzioni hanno usato un certo lotto */
export const produzioniCheUsano = (lottoId) =>
  query(
    `SELECT pr.*, pl.quantita_usata FROM produzione_lotti pl
     JOIN produzioni pr ON pr.id = pl.produzione_id
     WHERE pl.lotto_id = ? ORDER BY pr.data_ora DESC`, [lottoId]);

/* ---------- ricette e produzioni (Blocco D) ---------- */

export const listaRicette = () =>
  query('SELECT * FROM ricette WHERE attiva = 1 ORDER BY nome');

export async function getRicetta(id) {
  const r = await queryOne('SELECT * FROM ricette WHERE id = ?', [id]);
  if (!r) return null;
  r.ingredienti = await query(
    `SELECT ri.*, p.denominazione AS prodotto, p.allergeni, p.unita_misura AS um_prodotto
     FROM ricetta_ingredienti ri JOIN prodotti p ON p.id = ri.prodotto_id
     WHERE ri.ricetta_id = ?`, [id]);
  return r;
}

export async function salvaRicetta(r) {
  const d = await getDb();
  let id = r.id;
  await d.withTransactionAsync(async () => {
    if (id) {
      await d.runAsync('UPDATE ricette SET nome=?, categoria=?, porzioni=?, procedura=? WHERE id=?',
        [r.nome, r.categoria, r.porzioni, r.procedura, id]);
      await d.runAsync('DELETE FROM ricetta_ingredienti WHERE ricetta_id=?', [id]);
    } else {
      const res = await d.runAsync('INSERT INTO ricette (nome, categoria, porzioni, procedura) VALUES (?,?,?,?)',
        [r.nome, r.categoria, r.porzioni, r.procedura]);
      id = res.lastInsertRowId;
    }
    for (const ing of (r.ingredienti || [])) {
      if (!ing.prodotto_id) continue;
      await d.runAsync(
        'INSERT INTO ricetta_ingredienti (ricetta_id, prodotto_id, quantita, unita_misura) VALUES (?,?,?,?)',
        [id, ing.prodotto_id, ing.quantita || 0, ing.unita_misura || '']);
    }
  });
  return id;
}

export const eliminaRicetta = (id) =>
  exec('UPDATE ricette SET attiva = 0 WHERE id = ?', [id]);

export async function allergeniRicetta(ricettaId) {
  const ing = await query(
    `SELECT p.allergeni FROM ricetta_ingredienti ri
     JOIN prodotti p ON p.id = ri.prodotto_id WHERE ri.ricetta_id = ?`, [ricettaId]);
  const set = new Set();
  ing.forEach((r) => {
    try { JSON.parse(r.allergeni || '[]').forEach((a) => set.add(a)); } catch (e) {}
  });
  return [...set];
}

export const lottiDisponibiliProdotto = (prodottoId) =>
  query(
    `SELECT l.*, p.denominazione AS prodotto FROM lotti l
     JOIN prodotti p ON p.id = l.prodotto_id
     WHERE l.prodotto_id = ? AND l.stato = 'disponibile' AND l.quantita_residua > 0
     ORDER BY l.data_scadenza IS NULL, l.data_scadenza ASC`, [prodottoId]);

export async function registraProduzione(p, usi) {
  const d = await getDb();
  let prodId;
  await d.withTransactionAsync(async () => {
    const res = await d.runAsync(
      `INSERT INTO produzioni (ricetta_id, nome, data_ora, quantita_prodotta, lotto_produzione, data_scadenza, operatore, note)
       VALUES (?,?,?,?,?,?,?,?)`,
      [p.ricetta_id, p.nome, new Date().toISOString(), p.quantita_prodotta,
       p.lotto_produzione, p.data_scadenza, p.operatore, p.note]);
    prodId = res.lastInsertRowId;
    for (const u of (usi || [])) {
      if (!u.lotto_id || !u.quantita) continue;
      await d.runAsync(
        'INSERT INTO produzione_lotti (produzione_id, lotto_id, quantita_usata) VALUES (?,?,?)',
        [prodId, u.lotto_id, u.quantita]);
      const lotto = await d.getFirstAsync('SELECT quantita_residua FROM lotti WHERE id=?', [u.lotto_id]);
      const residua = Math.max(0, (lotto?.quantita_residua || 0) - u.quantita);
      await d.runAsync('UPDATE lotti SET quantita_residua=?, stato=? WHERE id=?',
        [residua, residua <= 0 ? 'esaurito' : 'disponibile', u.lotto_id]);
      await d.runAsync(
        'INSERT INTO movimenti (lotto_id, tipo, quantita, data_ora, causale) VALUES (?,?,?,?,?)',
        [u.lotto_id, 'scarico', u.quantita, new Date().toISOString(), `Produzione: ${p.nome || ''}`]);
    }
  });
  return prodId;
}

export const listaProduzioni = () =>
  query(
    `SELECT pr.*, r.nome AS ricetta FROM produzioni pr
     LEFT JOIN ricette r ON r.id = pr.ricetta_id
     ORDER BY pr.data_ora DESC`);

export async function getProduzione(id) {
  const pr = await queryOne(
    `SELECT pr.*, r.nome AS ricetta FROM produzioni pr
     LEFT JOIN ricette r ON r.id = pr.ricetta_id WHERE pr.id = ?`, [id]);
  if (!pr) return null;
  pr.lotti = await query(
    `SELECT pl.quantita_usata, l.numero_lotto, l.id AS lotto_id,
            p.denominazione AS prodotto, f.ragione_sociale AS fornitore
     FROM produzione_lotti pl
     JOIN lotti l ON l.id = pl.lotto_id
     JOIN prodotti p ON p.id = l.prodotto_id
     JOIN fornitori f ON f.id = l.fornitore_id
     WHERE pl.produzione_id = ?`, [id]);
  return pr;
}

export const produzioniDaLotto = (lottoId) =>
  query(
    `SELECT pr.*, pl.quantita_usata FROM produzione_lotti pl
     JOIN produzioni pr ON pr.id = pl.produzione_id
     WHERE pl.lotto_id = ? ORDER BY pr.data_ora DESC`, [lottoId]);
