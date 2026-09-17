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

    CREATE TABLE IF NOT EXISTS abbinamenti_articoli (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fornitore_id INTEGER NOT NULL REFERENCES fornitori(id),
      chiave TEXT NOT NULL,
      descrizione TEXT,
      prodotto_id INTEGER NOT NULL REFERENCES prodotti(id),
      UNIQUE (fornitore_id, chiave)
    );

    CREATE TABLE IF NOT EXISTS preferenze (
      chiave TEXT PRIMARY KEY,
      valore TEXT
    );

    CREATE TABLE IF NOT EXISTS registro_modifiche (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tabella TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      data_ora TEXT NOT NULL,
      campo TEXT NOT NULL,
      valore_precedente TEXT,
      valore_nuovo TEXT
    );

    CREATE TABLE IF NOT EXISTS fatture_importate (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fornitore_id INTEGER REFERENCES fornitori(id),
      numero TEXT,
      data TEXT,
      data_import TEXT NOT NULL,
      totale REAL,
      righe INTEGER
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

  // migrazione: colonne che mancavano per le differenze tra vecchie versioni dello schema
  // (prima esistevano due definizioni di ricette/produzioni e vinceva quella senza "porzioni"/"nome")
  const aggiungiSeManca = async (tabella, colonna, tipo) => {
    const cols = await d.getAllAsync(`PRAGMA table_info(${tabella})`);
    if (!cols.some((c) => c.name === colonna)) {
      await d.execAsync(`ALTER TABLE ${tabella} ADD COLUMN ${colonna} ${tipo}`);
      return true;
    }
    return false;
  };
  await aggiungiSeManca('prodotti', 'foto_etichetta', 'TEXT');
  await aggiungiSeManca('ricette', 'porzioni', 'INTEGER');
  await aggiungiSeManca('ricette', 'attiva', 'INTEGER DEFAULT 1');
  await aggiungiSeManca('produzioni', 'nome', 'TEXT');
  await aggiungiSeManca('produzioni', 'nome_ricetta', 'TEXT');
  await d.execAsync("UPDATE produzioni SET nome = nome_ricetta WHERE nome IS NULL AND nome_ricetta IS NOT NULL");
  if (await aggiungiSeManca('prodotti', 'allergeni_verificati', 'INTEGER DEFAULT 0')) {
    // i prodotti già esistenti inseriti a mano si considerano verificati; quelli nati dalle fatture no
    await d.execAsync(`UPDATE prodotti SET allergeni_verificati = 1
      WHERE id NOT IN (SELECT prodotto_id FROM abbinamenti_articoli)`);
  }

  // migrazione leggera: numero di colli ricevuti per lotto
  try {
    const colsLotti = await d.getAllAsync('PRAGMA table_info(lotti)');
    if (!colsLotti.some((c) => c.name === 'colli')) {
      await d.execAsync('ALTER TABLE lotti ADD COLUMN colli INTEGER');
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
         temp_max=?, shelf_life_giorni=?, giorni_dopo_apertura=?, origine=?, note=?,
         foto_etichetta=?, allergeni_verificati=1
         WHERE id=?`,
        [p.denominazione, p.categoria, p.fornitore_abituale_id, p.unita_misura,
         p.barcode_ean, allergeni, p.conservazione, p.temp_min, p.temp_max,
         p.shelf_life_giorni, p.giorni_dopo_apertura, p.origine, p.note, p.foto_etichetta || null, p.id]
      )
    : exec(
        `INSERT INTO prodotti (denominazione, categoria, fornitore_abituale_id,
         unita_misura, barcode_ean, allergeni, conservazione, temp_min, temp_max,
         shelf_life_giorni, giorni_dopo_apertura, origine, note, foto_etichetta, allergeni_verificati)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
        [p.denominazione, p.categoria, p.fornitore_abituale_id, p.unita_misura,
         p.barcode_ean, allergeni, p.conservazione, p.temp_min, p.temp_max,
         p.shelf_life_giorni, p.giorni_dopo_apertura, p.origine, p.note, p.foto_etichetta || null]
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

/** Stato del lotto dopo un cambio di giacenza: un lotto bloccato o annullato resta tale. */
const statoDopo = (statoAttuale, residua) =>
  (statoAttuale === 'bloccato' || statoAttuale === 'annullato'
    ? statoAttuale : residua <= 0 ? 'esaurito' : 'disponibile');

export async function registraCarico(l) {
  const res = await exec(
    `INSERT INTO lotti (prodotto_id, fornitore_id, numero_lotto, ddt_numero, ddt_data,
     data_ricevimento, quantita_iniziale, quantita_residua, unita_misura, data_scadenza,
     tipo_scadenza, temperatura_rilevata, esito_controllo, integrita_imballo,
     conformita_etichettatura, foto_etichetta, foto_ddt, prezzo_unitario, note, colli)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [l.prodotto_id, l.fornitore_id, l.numero_lotto, l.ddt_numero, l.ddt_data,
     l.data_ricevimento, l.quantita, l.quantita, l.unita_misura, l.data_scadenza,
     l.tipo_scadenza || 'scadenza', l.temperatura_rilevata, l.esito_controllo || 'conforme',
     l.integrita_imballo ? 1 : 0, l.conformita_etichettatura ? 1 : 0,
     l.foto_etichetta, l.foto_ddt, l.prezzo_unitario, l.note, l.colli || null]
  );
  const lottoId = res.lastInsertRowId;
  await exec(
    'INSERT INTO movimenti (lotto_id, tipo, quantita, data_ora, causale) VALUES (?,?,?,?,?)',
    [lottoId, 'carico', l.quantita, new Date().toISOString(), 'Ricevimento merce']
  );
  if (l.esito_controllo === 'non conforme' && !l.senza_nc) {
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
    [residua, statoDopo(lotto.stato, residua), lottoId]
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

/** Corregge una rilevazione già salvata, lasciando traccia del valore originale. */
export async function modificaTemperatura(id, nuovaTemperatura) {
  const r = await queryOne(
    `SELECT r.*, pc.nome, pc.temp_min, pc.temp_max FROM registro_temperature r
     JOIN punti_controllo pc ON pc.id = r.punto_controllo_id WHERE r.id = ?`, [id]);
  if (!r) return null;
  const conforme = nuovaTemperatura >= r.temp_min && nuovaTemperatura <= r.temp_max;
  const esito = conforme ? 'conforme' : 'non conforme';
  const adesso = new Date().toISOString();
  const traccia = `Corretto il ${adesso.slice(0, 10)}: era ${r.temperatura}°C`;
  const note = r.note ? `${r.note} | ${traccia}` : traccia;
  await exec('UPDATE registro_temperature SET temperatura = ?, esito = ?, note = ? WHERE id = ?',
    [nuovaTemperatura, esito, note, id]);

  const descrVecchia = `${r.nome}: rilevati ${r.temperatura}°C (limiti ${r.temp_min}/${r.temp_max}°C)`;
  if (r.esito !== 'conforme' && conforme) {
    // Era un errore di digitazione: chiude la non conformità aperta automaticamente
    await exec(
      `UPDATE non_conformita SET stato = 'chiusa', data_chiusura = ?,
       azione_correttiva = 'Valore digitato per errore, corretto nel registro'
       WHERE origine = 'temperatura' AND stato = 'aperta' AND descrizione = ?`,
      [adesso, descrVecchia]);
  } else if (!conforme) {
    const descrNuova = `${r.nome}: rilevati ${nuovaTemperatura}°C (limiti ${r.temp_min}/${r.temp_max}°C)`;
    if (r.esito !== 'conforme') {
      await exec(
        `UPDATE non_conformita SET descrizione = ? WHERE origine = 'temperatura'
         AND stato = 'aperta' AND descrizione = ?`, [descrNuova, descrVecchia]);
    } else {
      await exec('INSERT INTO non_conformita (data_ora, origine, descrizione) VALUES (?,?,?)',
        [adesso, 'temperatura', descrNuova]);
    }
  }
  return { conforme, nome: r.nome, temp_min: r.temp_min, temp_max: r.temp_max };
}

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

/** Tabelle locali al dispositivo, escluse dal backup (es. la cartella scelta per i backup). */
const TABELLE_LOCALI = ['preferenze'];

export async function esportaTutto() {
  const tabelle = (await elencoTabelle()).filter((t) => !TABELLE_LOCALI.includes(t));
  const dati = {};
  for (const t of tabelle) dati[t] = await query(`SELECT * FROM ${t}`);
  return { versione: 2, generato: new Date().toISOString(), tabelle: dati };
}

/**
 * Sostituisce tutti i dati con quelli del backup, in un'unica transazione.
 * Le chiavi esterne vengono sospese durante la copia (altrimenti la cancellazione
 * dei fornitori con lotti collegati fallisce) e verificate alla fine.
 * Colonne sconosciute (backup di versioni diverse) vengono ignorate.
 */
export async function importaTutto(dump) {
  if (!dump || !dump.tabelle || typeof dump.tabelle !== 'object') throw new Error('File di backup non valido.');
  const d = await getDb();
  const esistenti = (await elencoTabelle()).filter((t) => !TABELLE_LOCALI.includes(t));
  const colonne = {};
  for (const t of esistenti) {
    colonne[t] = (await d.getAllAsync(`PRAGMA table_info(${t})`)).map((c) => c.name);
  }
  await d.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await d.withTransactionAsync(async () => {
      for (const t of esistenti) await d.execAsync(`DELETE FROM ${t}`);
      for (const t of Object.keys(dump.tabelle)) {
        if (!colonne[t]) continue;
        const righe = dump.tabelle[t];
        if (!Array.isArray(righe)) continue;
        for (const row of righe) {
          const cols = Object.keys(row).filter((c) => colonne[t].includes(c));
          if (cols.length === 0) continue;
          await d.runAsync(
            `INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
            cols.map((c) => row[c])
          );
        }
      }
      const violazioni = await d.getAllAsync('PRAGMA foreign_key_check');
      if (violazioni.length) {
        throw new Error(`Backup incoerente: ${violazioni.length} collegamenti non validi (es. tabella ${violazioni[0].table}).`);
      }
    });
  } finally {
    await d.execAsync('PRAGMA foreign_keys = ON;');
  }
}

/* ---------- preferenze locali del dispositivo ---------- */

export async function leggiPreferenza(chiave) {
  const r = await queryOne('SELECT valore FROM preferenze WHERE chiave = ?', [chiave]);
  return r ? r.valore : null;
}

export const salvaPreferenza = (chiave, valore) =>
  exec(`INSERT INTO preferenze (chiave, valore) VALUES (?, ?)
        ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore`, [chiave, valore]);

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
      const lotto = await d.getFirstAsync('SELECT quantita_residua, stato FROM lotti WHERE id=?', [u.lotto_id]);
      if (lotto && lotto.stato === 'bloccato') throw new Error('Un lotto usato è bloccato (richiamo): non può essere impiegato.');
      const residua = Math.max(0, (lotto?.quantita_residua || 0) - u.quantita);
      await d.runAsync('UPDATE lotti SET quantita_residua=?, stato=? WHERE id=?',
        [residua, statoDopo(lotto?.stato, residua), u.lotto_id]);
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

/* ---------- importazione fatture PDF ---------- */

/** Cerca tra le P.IVA lette in fattura un fornitore già in anagrafica. */
export async function fornitoreDaPartiteIva(partiteIva = []) {
  for (const piva of partiteIva) {
    const f = await queryOne(
      `SELECT * FROM fornitori WHERE attivo = 1
       AND REPLACE(REPLACE(UPPER(partita_iva), 'IT', ''), ' ', '') = ?`, [piva]);
    if (f) return f;
  }
  return null;
}

/** Abbinamenti articolo fornitore → prodotto interno, come oggetto { chiave: prodotto_id }. */
export async function abbinamentiFornitore(fornitoreId) {
  const r = await query(
    `SELECT a.chiave, a.prodotto_id FROM abbinamenti_articoli a
     JOIN prodotti p ON p.id = a.prodotto_id AND p.attivo = 1
     WHERE a.fornitore_id = ?`, [fornitoreId]);
  const out = {};
  r.forEach((x) => { out[x.chiave] = x.prodotto_id; });
  return out;
}

export const fatturaGiaImportata = (fornitoreId, numero, data) =>
  queryOne('SELECT * FROM fatture_importate WHERE fornitore_id = ? AND numero = ? AND data = ?',
    [fornitoreId, numero, data]);

/**
 * Carica in magazzino le righe di una fattura, tutto in un'unica transazione.
 * Crea se serve fornitore e prodotti, e ricorda gli abbinamenti per le prossime fatture.
 */
export async function importaFattura(imp) {
  const d = await getDb();
  let caricati = 0;
  await d.withTransactionAsync(async () => {
    let fornitoreId = imp.fornitore_id;
    if (!fornitoreId) {
      const r = await exec('INSERT INTO fornitori (ragione_sociale, partita_iva) VALUES (?,?)',
        [imp.nuovo_fornitore.ragione_sociale, imp.nuovo_fornitore.partita_iva]);
      fornitoreId = r.lastInsertRowId;
    }
    const adesso = new Date().toISOString();
    for (const riga of imp.righe) {
      let prodottoId = riga.prodotto_id;
      if (!prodottoId) {
        const r = await exec(
          `INSERT INTO prodotti (denominazione, fornitore_abituale_id, unita_misura, origine, allergeni)
           VALUES (?,?,?,?,?)`,
          [riga.nuovo_prodotto, fornitoreId, riga.unita_misura, riga.origine || null, '[]']);
        prodottoId = r.lastInsertRowId;
      }
      if (riga.foto_etichetta) {
        const p = await queryOne('SELECT foto_etichetta FROM prodotti WHERE id = ?', [prodottoId]);
        if (p && !p.foto_etichetta) {
          await exec('UPDATE prodotti SET foto_etichetta = ? WHERE id = ?', [riga.foto_etichetta, prodottoId]);
        }
      }
      await exec(
        `INSERT INTO abbinamenti_articoli (fornitore_id, chiave, descrizione, prodotto_id)
         VALUES (?,?,?,?)
         ON CONFLICT(fornitore_id, chiave) DO UPDATE SET prodotto_id = excluded.prodotto_id,
           descrizione = excluded.descrizione`,
        [fornitoreId, riga.chiave, riga.descrizione, prodottoId]);
      await registraCarico({
        prodotto_id: prodottoId, fornitore_id: fornitoreId,
        numero_lotto: riga.numero_lotto, ddt_numero: imp.numero, ddt_data: imp.data,
        data_ricevimento: adesso, quantita: riga.quantita, unita_misura: riga.unita_misura, colli: riga.colli,
        data_scadenza: riga.data_scadenza || null, temperatura_rilevata: imp.temperatura,
        esito_controllo: imp.non_conforme ? 'non conforme' : 'conforme',
        integrita_imballo: imp.integrita_imballo, conformita_etichettatura: imp.conformita_etichettatura,
        prezzo_unitario: riga.prezzo_unitario, foto_ddt: null, foto_etichetta: riga.foto_etichetta || null,
        note: riga.note, senza_nc: true,
      });
      caricati++;
    }
    if (imp.non_conforme) {
      await exec('INSERT INTO non_conformita (data_ora, origine, descrizione) VALUES (?,?,?)',
        [adesso, 'ricevimento',
         `Merce non conforme al ricevimento (fattura n. ${imp.numero || '—'}): ${imp.nota_nc || 'vedi lotti caricati'}`]);
    }
    await exec(
      'INSERT INTO fatture_importate (fornitore_id, numero, data, data_import, totale, righe) VALUES (?,?,?,?,?,?)',
      [fornitoreId, imp.numero, imp.data, adesso, imp.totale, caricati]);
  });
  return caricati;
}

/* ---------- correzione dei record già salvati ---------- */

/** Campi correggibili per ogni registro, con l'etichetta usata nella traccia. */
const CAMPI_CORREGGIBILI = {
  registro_sanificazione: { prodotto_utilizzato: 'prodotto', operatore: 'operatore', note: null },
  non_conformita: { descrizione: 'descrizione', azione_correttiva: 'azione correttiva' },
  produzioni: {
    quantita_prodotta: 'quantità', lotto_produzione: 'lotto', data_scadenza: 'scadenza',
    operatore: 'operatore', note: null,
  },
  lotti: {
    numero_lotto: 'lotto', data_scadenza: 'scadenza', quantita_iniziale: 'quantità ricevuta',
    colli: 'colli', ddt_numero: 'n. documento', ddt_data: 'data documento',
    temperatura_rilevata: 'temperatura', prezzo_unitario: 'prezzo', note: null,
  },
};

const pari = (a, b) => (a === null || a === undefined || a === '' ? null : String(a))
  === (b === null || b === undefined || b === '' ? null : String(b));
const oggiIt = () => new Date().toLocaleDateString('it-IT');
const perTraccia = (v) => (v === null || v === undefined || v === '' ? 'vuoto' : String(v));

/**
 * Corregge un record lasciando traccia: ogni campo cambiato va in registro_modifiche
 * e, dove il registro ha le note, compare anche lì ("Corretto il … : lotto era X").
 * Restituisce il numero di campi modificati.
 */
export async function correggiRecord(tabella, id, cambi) {
  const ammessi = CAMPI_CORREGGIBILI[tabella];
  if (!ammessi) throw new Error(`Registro non correggibile: ${tabella}`);
  const d = await getDb();
  let modificati = 0;
  await d.withTransactionAsync(async () => {
    const vecchio = await queryOne(`SELECT * FROM ${tabella} WHERE id = ?`, [id]);
    if (!vecchio) throw new Error('Registrazione non trovata');
    const set = [];
    const valori = [];
    const tracce = [];
    const adesso = new Date().toISOString();
    for (const campo of Object.keys(cambi)) {
      if (!(campo in ammessi) || pari(vecchio[campo], cambi[campo])) continue;
      modificati++;
      if (campo !== 'note') {
        set.push(`${campo} = ?`);
        valori.push(cambi[campo]);
      }
      await exec(
        `INSERT INTO registro_modifiche (tabella, record_id, data_ora, campo, valore_precedente, valore_nuovo)
         VALUES (?,?,?,?,?,?)`,
        [tabella, id, adesso, campo, vecchio[campo] === null ? null : String(vecchio[campo]),
         cambi[campo] === null ? null : String(cambi[campo])]);
      if (ammessi[campo]) tracce.push(`${ammessi[campo]} era ${perTraccia(vecchio[campo])}`);
    }
    if (modificati === 0) return;

    if (tabella === 'lotti' && 'quantita_iniziale' in cambi && !pari(vecchio.quantita_iniziale, cambi.quantita_iniziale)) {
      const nuova = Number(cambi.quantita_iniziale);
      if (!(nuova > 0)) throw new Error('La quantità ricevuta deve essere maggiore di zero.');
      const uscite = vecchio.quantita_iniziale - vecchio.quantita_residua;
      if (nuova < uscite) {
        throw new Error(`Da questo lotto sono già usciti ${uscite} ${vecchio.unita_misura || ''}: la quantità ricevuta non può essere inferiore.`);
      }
      const residua = Math.round((nuova - uscite) * 1000) / 1000;
      set.push('quantita_residua = ?', 'stato = ?');
      valori.push(residua, statoDopo(vecchio.stato, residua));
      await exec("UPDATE movimenti SET quantita = ? WHERE lotto_id = ? AND tipo = 'carico'", [nuova, id]);
    }

    if ('note' in ammessi) {
      let note = 'note' in cambi ? cambi.note : vecchio.note;
      if (tracce.length) {
        const traccia = `Corretto il ${oggiIt()}: ${tracce.join(', ')}`;
        note = note ? `${note} | ${traccia}` : traccia;
      }
      if (!pari(note, vecchio.note)) { set.push('note = ?'); valori.push(note); }
    }
    if (set.length === 0) return;
    await exec(`UPDATE ${tabella} SET ${set.join(', ')} WHERE id = ?`, [...valori, id]);
  });
  return modificati;
}

/** Storico delle correzioni di un record. */
export const correzioniRecord = (tabella, id) =>
  query('SELECT * FROM registro_modifiche WHERE tabella = ? AND record_id = ? ORDER BY data_ora DESC',
    [tabella, id]);

/** Corregge la quantità di un'uscita (scarico/scarto/reso) ricalcolando la giacenza del lotto. */
export async function correggiUscita(movimentoId, nuovaQuantita) {
  const d = await getDb();
  await d.withTransactionAsync(async () => {
    const m = await queryOne('SELECT * FROM movimenti WHERE id = ?', [movimentoId]);
    if (!m || m.tipo === 'carico') throw new Error('Movimento non correggibile');
    if (!(nuovaQuantita > 0)) throw new Error('La quantità deve essere maggiore di zero.');
    const lotto = await queryOne('SELECT * FROM lotti WHERE id = ?', [m.lotto_id]);
    const residua = Math.round((lotto.quantita_residua + m.quantita - nuovaQuantita) * 1000) / 1000;
    if (residua < 0) {
      throw new Error(`Nel lotto restano ${lotto.quantita_residua + m.quantita} ${lotto.unita_misura || ''}: non puoi scaricarne di più.`);
    }
    const traccia = `Corretto il ${oggiIt()}: era ${m.quantita}`;
    await exec('UPDATE movimenti SET quantita = ?, note = ? WHERE id = ?',
      [nuovaQuantita, m.note ? `${m.note} | ${traccia}` : traccia, movimentoId]);
    await exec('UPDATE lotti SET quantita_residua = ?, stato = ? WHERE id = ?',
      [residua, statoDopo(lotto.stato, residua), lotto.id]);
    await exec(
      `INSERT INTO registro_modifiche (tabella, record_id, data_ora, campo, valore_precedente, valore_nuovo)
       VALUES ('movimenti', ?, ?, 'quantita', ?, ?)`,
      [movimentoId, new Date().toISOString(), String(m.quantita), String(nuovaQuantita)]);
  });
}

/** Annulla un carico registrato per errore, solo se dal lotto non è ancora uscito nulla. */
export async function annullaCarico(lottoId, motivo) {
  const d = await getDb();
  await d.withTransactionAsync(async () => {
    const usi = await queryOne(
      `SELECT COUNT(*) AS n FROM movimenti WHERE lotto_id = ? AND tipo <> 'carico'`, [lottoId]);
    const prod = await queryOne('SELECT COUNT(*) AS n FROM produzione_lotti WHERE lotto_id = ?', [lottoId]);
    if ((usi && usi.n) || (prod && prod.n)) {
      throw new Error('Da questo lotto sono già uscite quantità: correggi le uscite invece di annullare il carico.');
    }
    const l = await queryOne('SELECT * FROM lotti WHERE id = ?', [lottoId]);
    const traccia = `Carico annullato il ${oggiIt()}${motivo ? `: ${motivo}` : ''}`;
    await exec("UPDATE lotti SET stato = 'annullato', quantita_residua = 0, note = ? WHERE id = ?",
      [l.note ? `${l.note} | ${traccia}` : traccia, lottoId]);
    await exec(
      `INSERT INTO registro_modifiche (tabella, record_id, data_ora, campo, valore_precedente, valore_nuovo)
       VALUES ('lotti', ?, ?, 'stato', ?, 'annullato')`, [lottoId, new Date().toISOString(), l.stato]);
  });
}

/** Aggiunge o sostituisce una foto (etichetta o documento) di un lotto, lasciando traccia. */
export async function impostaFotoLotto(lottoId, campo, uri) {
  if (!['foto_etichetta', 'foto_ddt'].includes(campo)) throw new Error('Campo foto non valido');
  const l = await queryOne(`SELECT ${campo} AS foto FROM lotti WHERE id = ?`, [lottoId]);
  if (!l) throw new Error('Lotto non trovato');
  await exec(`UPDATE lotti SET ${campo} = ? WHERE id = ?`, [uri, lottoId]);
  await exec(
    `INSERT INTO registro_modifiche (tabella, record_id, data_ora, campo, valore_precedente, valore_nuovo)
     VALUES ('lotti', ?, ?, ?, ?, ?)`, [lottoId, new Date().toISOString(), campo, l.foto, uri]);
}

/** Tutte le foto archiviate (lotti e schede prodotto), per backup e recupero. */
export const fotoDeiLotti = () =>
  query(`SELECT id, 'foto_etichetta' AS campo, foto_etichetta AS uri FROM lotti WHERE foto_etichetta IS NOT NULL
         UNION ALL
         SELECT id, 'foto_ddt' AS campo, foto_ddt AS uri FROM lotti WHERE foto_ddt IS NOT NULL
         UNION ALL
         SELECT id, 'foto_prodotto' AS campo, foto_etichetta AS uri FROM prodotti WHERE foto_etichetta IS NOT NULL`);

export async function aggiornaIndirizzoFoto(vecchio, nuovo) {
  await exec('UPDATE lotti SET foto_etichetta = ? WHERE foto_etichetta = ?', [nuovo, vecchio]);
  await exec('UPDATE lotti SET foto_ddt = ? WHERE foto_ddt = ?', [nuovo, vecchio]);
  await exec('UPDATE prodotti SET foto_etichetta = ? WHERE foto_etichetta = ?', [nuovo, vecchio]);
}

/* ---------- allergeni ---------- */

const leggiAllergeni = (json) => { try { return JSON.parse(json || '[]'); } catch (e) { return []; } };

/** Prodotti creati dalle fatture a cui mancano ancora allergeni/conservazione verificati. */
export const prodottiDaCompletare = () =>
  query(`SELECT * FROM prodotti WHERE attivo = 1 AND COALESCE(allergeni_verificati, 0) = 0 ORDER BY denominazione`);

/**
 * Tabella allergeni dei piatti (Reg. UE 1169/2011): per ogni ricetta attiva
 * gli allergeni presenti, con l'ingrediente da cui derivano, e gli ingredienti non ancora verificati.
 */
export async function tabellaAllergeni() {
  const ricette = await query('SELECT * FROM ricette WHERE COALESCE(attiva, 1) = 1 ORDER BY categoria, nome');
  const out = [];
  for (const r of ricette) {
    const ing = await query(
      `SELECT p.id, p.denominazione, p.allergeni, COALESCE(p.allergeni_verificati, 0) AS verificato
       FROM ricetta_ingredienti ri JOIN prodotti p ON p.id = ri.prodotto_id WHERE ri.ricetta_id = ?`, [r.id]);
    const fonti = {};
    for (const i of ing) {
      for (const a of leggiAllergeni(i.allergeni)) (fonti[a] = fonti[a] || []).push(i.denominazione);
    }
    out.push({
      id: r.id, nome: r.nome, categoria: r.categoria, fonti,
      allergeni: Object.keys(fonti),
      daVerificare: ing.filter((i) => !i.verificato).map((i) => i.denominazione),
      senzaIngredienti: ing.length === 0,
    });
  }
  return out;
}

/* ---------- blocco e richiamo lotti ---------- */

/** Blocca un lotto (richiamo o sospetto): esce dal magazzino utilizzabile e apre una non conformità. */
export async function bloccaLotto(lottoId, motivo) {
  if (!motivo || !String(motivo).trim()) throw new Error('Indica il motivo del blocco.');
  const d = await getDb();
  await d.withTransactionAsync(async () => {
    const l = await queryOne(
      `SELECT l.*, p.denominazione AS prodotto FROM lotti l JOIN prodotti p ON p.id = l.prodotto_id WHERE l.id = ?`, [lottoId]);
    if (!l) throw new Error('Lotto non trovato');
    if (l.stato === 'bloccato') throw new Error('Il lotto è già bloccato.');
    if (l.stato === 'annullato') throw new Error('Il carico di questo lotto è stato annullato.');
    const adesso = new Date().toISOString();
    const traccia = `Bloccato il ${new Date().toLocaleDateString('it-IT')}: ${motivo}`;
    await exec("UPDATE lotti SET stato = 'bloccato', note = ? WHERE id = ?",
      [l.note ? `${l.note} | ${traccia}` : traccia, lottoId]);
    await exec(
      `INSERT INTO registro_modifiche (tabella, record_id, data_ora, campo, valore_precedente, valore_nuovo)
       VALUES ('lotti', ?, ?, 'stato', ?, 'bloccato')`, [lottoId, adesso, l.stato]);
    await exec('INSERT INTO non_conformita (data_ora, origine, descrizione, lotto_id) VALUES (?,?,?,?)',
      [adesso, 'richiamo', `Lotto bloccato: ${l.prodotto}, lotto ${l.numero_lotto || l.id}. Motivo: ${motivo}`, lottoId]);
  });
}

/** Sblocca un lotto dopo la verifica: torna disponibile (o esaurito se non ne resta). */
export async function sbloccaLotto(lottoId, esito) {
  if (!esito || !String(esito).trim()) throw new Error('Indica l\'esito della verifica.');
  const d = await getDb();
  await d.withTransactionAsync(async () => {
    const l = await queryOne('SELECT * FROM lotti WHERE id = ?', [lottoId]);
    if (!l || l.stato !== 'bloccato') throw new Error('Il lotto non è bloccato.');
    const nuovo = l.quantita_residua > 0 ? 'disponibile' : 'esaurito';
    const traccia = `Sbloccato il ${new Date().toLocaleDateString('it-IT')}: ${esito}`;
    await exec('UPDATE lotti SET stato = ?, note = ? WHERE id = ?',
      [nuovo, l.note ? `${l.note} | ${traccia}` : traccia, lottoId]);
    await exec(
      `INSERT INTO registro_modifiche (tabella, record_id, data_ora, campo, valore_precedente, valore_nuovo)
       VALUES ('lotti', ?, ?, 'stato', 'bloccato', ?)`, [lottoId, new Date().toISOString(), nuovo]);
  });
}

export const lottiBloccati = () =>
  query(`SELECT l.*, p.denominazione AS prodotto, f.ragione_sociale AS fornitore
         FROM lotti l JOIN prodotti p ON p.id = l.prodotto_id JOIN fornitori f ON f.id = l.fornitore_id
         WHERE l.stato = 'bloccato' ORDER BY p.denominazione`);

/**
 * Cosa coinvolge un richiamo: i piatti in cui il lotto è stato usato e gli altri carichi
 * dello stesso prodotto con lo stesso numero di lotto (stessa partita arrivata più volte).
 */
export async function impattoLotto(lottoId) {
  const l = await queryOne('SELECT * FROM lotti WHERE id = ?', [lottoId]);
  if (!l) return null;
  const piatti = await query(
    `SELECT pr.id, pr.nome, pr.data_ora, pr.lotto_produzione, pr.data_scadenza, pl.quantita_usata
     FROM produzione_lotti pl JOIN produzioni pr ON pr.id = pl.produzione_id
     WHERE pl.lotto_id = ? ORDER BY pr.data_ora DESC`, [lottoId]);
  const stessaPartita = l.numero_lotto
    ? await query(
      `SELECT l.*, f.ragione_sociale AS fornitore FROM lotti l JOIN fornitori f ON f.id = l.fornitore_id
       WHERE l.prodotto_id = ? AND l.numero_lotto = ? AND l.id <> ? AND l.stato <> 'annullato'`,
      [l.prodotto_id, l.numero_lotto, lottoId])
    : [];
  const usato = Math.round((l.quantita_iniziale - l.quantita_residua) * 1000) / 1000;
  return { lotto: l, piatti, stessaPartita, usato };
}

/**
 * Foto dell'etichetta sulla scheda del prodotto.
 * Con soloSeMancante = true (ricevimento e import fattura) non sovrascrive una foto già scelta.
 */
export async function impostaFotoProdotto(prodottoId, uri, soloSeMancante = false) {
  if (!prodottoId || !uri) return false;
  const p = await queryOne('SELECT foto_etichetta FROM prodotti WHERE id = ?', [prodottoId]);
  if (!p || (soloSeMancante && p.foto_etichetta)) return false;
  await exec('UPDATE prodotti SET foto_etichetta = ? WHERE id = ?', [uri, prodottoId]);
  return true;
}

