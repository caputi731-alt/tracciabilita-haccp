// Incassi e costi: calcoli (conti.js), tabelle (database.js) e codice PUK per il PIN dimenticato (pin.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { limitiMese, altroMese, nomeMese, totaleIncasso, senzaIva, riepilogoConti, euro } from '../conti.js';
import {
  initDatabase, incassiTra, salvaIncasso, speseTra, salvaSpesa, eliminaSpesa, merceTra, salvaProdotto, registraCarico, annullaCarico,
  esportaTutto, importaTutto, salvaFornitore,
} from '../database.js';
import { impostaPin, verificaPin, pukImpostato, creaPuk, verificaPuk, pukValido, pukScritto, pinDimenticato, sbloccaCosti, costiSbloccati } from '../pin.js';
import { oggiLocale, piuGiorni } from '../utile.js';

test('mesi: limiti, mese prima e dopo, nome', () => {
  assert.deepEqual(limitiMese('2026-10'), ['2026-10-01', '2026-10-31']);
  assert.deepEqual(limitiMese('2028-02'), ['2028-02-01', '2028-02-29']);
  assert.equal(altroMese('2026-01', -1), '2025-12');
  assert.equal(altroMese('2026-12', 1), '2027-01');
  assert.equal(nomeMese('2026-10'), 'ottobre 2026');
});

test('riepilogo: incassi per metodo, IVA al 10%, costi e risultato', () => {
  const r = riepilogoConti({
    incassi: [{ giorno: '2026-10-01', contanti: 300, pos: 800.5, altro: 0 }, { giorno: '2026-10-02', contanti: 0, pos: 0, altro: 0 }, { giorno: '2026-10-03', contanti: 99.5, pos: 0, altro: 1000 }],
    spese: [{ categoria: 'Personale', importo: 600 }, { categoria: 'Altre spese', importo: 120.4 }, { categoria: 'Altre spese', importo: 79.6 }],
    merce: { valore: 500, carichi: 7, senzaPrezzo: 2 },
  });
  assert.deepEqual(r.perMetodo, { contanti: 399.5, pos: 800.5, altro: 1000 });
  assert.equal(r.incassato, 2200);
  assert.deepEqual([r.netto, r.ivaCompresa], [2000, 200]);
  assert.deepEqual([r.giorni, r.mediaGiorno], [2, 1100]);              // il giorno a zero non conta
  assert.deepEqual([r.merce, r.personale, r.altreSpese, r.totaleCosti], [500, 600, 200, 1300]);
  assert.equal(r.risultato, 700);
  assert.equal(r.incidenzaMerce, 25);
  assert.deepEqual([r.carichi, r.senzaPrezzo], [7, 2]);
  const vuoto = riepilogoConti({});
  assert.deepEqual([vuoto.incassato, vuoto.risultato, vuoto.incidenzaMerce, vuoto.mediaGiorno], [0, 0, null, 0]);
  assert.equal(riepilogoConti({ spese: [{ categoria: 'Personale', importo: 50 }] }).risultato, -50);
  assert.equal(totaleIncasso({ contanti: 10.1, pos: 20.2, altro: 0.3 }), 30.6);
  assert.equal(senzaIva(110), 100);
  assert.deepEqual([euro(1234567.5), euro(0), euro(-50), euro(999.999)], ['1.234.567,50 €', '0,00 €', '−50,00 €', '1.000,00 €']);
});

test('database: incassi per giorno, spese, merce dalle fatture caricate', async () => {
  await initDatabase();
  const oggi = oggiLocale(), ieri = piuGiorni(oggi, -1);
  await salvaIncasso({ giorno: ieri, contanti: 100, pos: 250.555, altro: '', note: ' battesimo ' });
  await salvaIncasso({ giorno: oggi, contanti: 10, pos: 0, altro: 0 });
  await salvaIncasso({ giorno: oggi, contanti: 40, pos: 60, altro: 5 });          // lo stesso giorno si sostituisce
  let righe = await incassiTra(ieri, oggi);
  assert.deepEqual(righe.map((r) => [r.giorno, r.contanti, r.pos, r.altro, r.note]), [[oggi, 40, 60, 5, ''], [ieri, 100, 250.56, 0, 'battesimo']]);
  await salvaIncasso({ giorno: oggi, contanti: 0, pos: 0, altro: 0, note: '' });  // tutto a zero: il giorno si toglie
  assert.equal((await incassiTra(ieri, oggi)).length, 1);
  await assert.rejects(() => salvaIncasso({ giorno: piuGiorni(oggi, 1), contanti: 5 }), /futuri/);
  await assert.rejects(() => salvaIncasso({ giorno: oggi, contanti: -5 }));
  await assert.rejects(() => salvaIncasso({ giorno: oggi, contanti: 'abc' }));
  await assert.rejects(() => salvaIncasso({ giorno: '8/10/2026', contanti: 5 }));

  await salvaSpesa({ giorno: oggi, categoria: 'Personale', descrizione: 'Stipendi', importo: 1500 });
  const r = await salvaSpesa({ giorno: oggi, categoria: 'Altre spese', descrizione: 'Luce', importo: 210.5 });
  await salvaSpesa({ id: r.lastInsertRowId, giorno: ieri, categoria: 'Altre spese', descrizione: 'Luce e gas', importo: 300 });
  await assert.rejects(() => salvaSpesa({ giorno: oggi, categoria: 'Merce', importo: 5 }));
  await assert.rejects(() => salvaSpesa({ giorno: oggi, categoria: 'Personale', importo: 0 }));
  let spese = await speseTra(ieri, oggi);
  assert.deepEqual(spese.map((s) => [s.giorno, s.categoria, s.descrizione, s.importo]), [[oggi, 'Personale', 'Stipendi', 1500], [ieri, 'Altre spese', 'Luce e gas', 300]]);
  await eliminaSpesa(spese[1].id);
  assert.equal((await speseTra(ieri, oggi)).length, 1);

  // merce: quantità × prezzo dei carichi del periodo; senza prezzo si conta a parte, annullato non conta
  const prima = await merceTra(oggi, oggi);
  const prodotto = (await salvaProdotto({ denominazione: 'Farina per i conti', categoria: 'Secco/Dispensa', unita_misura: 'kg' })).lastInsertRowId;
  const fornitore = (await salvaFornitore({ ragione_sociale: 'Fornitore dei conti' })).lastInsertRowId;
  const carico = (quantita, prezzo) => registraCarico({ prodotto_id: prodotto, fornitore_id: fornitore, numero_lotto: `C${quantita}`, quantita, unita_misura: 'kg', data_ricevimento: new Date().toISOString(), prezzo_unitario: prezzo });
  await carico(10, 1.25);
  await carico(4, null);
  const daAnnullare = await carico(100, 9);
  await annullaCarico(daAnnullare, 'errore');
  const dopo = await merceTra(oggi, oggi);
  assert.equal(Math.round((dopo.valore - prima.valore) * 100) / 100, 12.5);
  assert.deepEqual([dopo.carichi - prima.carichi, dopo.senzaPrezzo - prima.senzaPrezzo], [2, 1]);
  assert.equal((await merceTra(piuGiorni(oggi, -40), piuGiorni(oggi, -30))).carichi, 0);

  // incassi e spese entrano nel backup; un backup precedente non li cancella
  const dump = await esportaTutto();
  assert.equal(dump.tabelle.incassi.length, 1);
  const vecchio = JSON.parse(JSON.stringify(dump));
  delete vecchio.tabelle.incassi; delete vecchio.tabelle.spese;
  await importaTutto(vecchio);
  assert.equal((await incassiTra(ieri, oggi)).length, 1);
  assert.equal((await speseTra(ieri, oggi)).length, 1);
});

test('PUK: dieci cifre, serve per scegliere un nuovo PIN quando quello vecchio è dimenticato', async () => {
  await initDatabase();
  assert.equal(await pukImpostato(), false);
  await impostaPin('135790');
  // finché il PUK non esiste, il PIN dimenticato si cambia come prima
  await pinDimenticato('246813');
  assert.ok(await verificaPin('246813'));

  const puk = await creaPuk();
  assert.match(puk, /^[0-9]{10}$/);
  assert.equal(pukScritto(puk), `${puk.slice(0, 5)}-${puk.slice(5)}`);
  assert.ok(pukValido(pukScritto(puk)) && pukValido(` ${puk} `) && !pukValido('12345') && !pukValido('12345abcde'));
  assert.equal(await pukImpostato(), true);
  assert.ok(await verificaPuk(puk));
  assert.ok(await verificaPuk(pukScritto(puk)));
  const sbagliato = String((Number(puk) + 1) % 1e10).padStart(10, '0');
  assert.equal(await verificaPuk(sbagliato), false);

  // ora senza il PUK giusto il PIN non si cambia più
  await assert.rejects(() => pinDimenticato('111222'), (e) => e.pukErrato === true);
  await assert.rejects(() => pinDimenticato('111222', sbagliato), (e) => e.pukErrato === true);
  assert.ok(await verificaPin('246813'));
  await sbloccaCosti('246813');
  assert.ok(costiSbloccati());
  await pinDimenticato('975310', pukScritto(puk));
  assert.ok(await verificaPin('975310') && !(await verificaPin('246813')));
  assert.ok(!costiSbloccati(), 'dopo il cambio i costi tornano chiusi');

  // un PUK nuovo sostituisce il vecchio; due PUK non sono uguali
  const altro = await creaPuk();
  assert.notEqual(altro, puk);
  assert.ok(await verificaPuk(altro) && !(await verificaPuk(puk)));
});
