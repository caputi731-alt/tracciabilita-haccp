// Vista delle cucine: stato di ogni attrezzatura (cucine.js) e collegamenti salvati (database.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CUCINE, POSTI, statiCucine, datiScena } from '../cucine.js';
import {
  initDatabase, collegaPosto, collegamentiCucina, salvaPuntoControllo, listaPuntiControllo, registraTemperatura,
  temperatureDiOggi, areeConStato, listaAree, salvaArea, registraSanificazione, esportaTutto, importaTutto,
} from '../database.js';

const frigo = { id: 1, nome: 'Frigo 1', temp_min: 0, temp_max: 4 };

test('la pianta: id unici, misure dentro la stanza, niente attrezzature sovrapposte', () => {
  const ids = POSTI.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 19);
  for (const k of Object.keys(CUCINE)) {
    const K = CUCINE[k];
    for (const it of K.items) {
      assert.ok(it.x[0] >= 0 && it.x[1] <= K.L && it.x[0] < it.x[1], `${it.id} fuori in larghezza`);
      assert.ok(it.d[0] >= 0 && it.d[1] <= K.D && it.d[0] < it.d[1], `${it.id} fuori in profondità`);
      assert.ok(it.nome && it.type && it.face);
    }
    K.items.forEach((a, i) => K.items.slice(i + 1).forEach((b) => {
      const sopra = a.x[0] < b.x[1] - 1e-9 && b.x[0] < a.x[1] - 1e-9 && a.d[0] < b.d[1] - 1e-9 && b.d[0] < a.d[1] - 1e-9;
      assert.ok(!sopra, `${a.id} e ${b.id} si sovrappongono`);
    }));
  }
  // il punto "Magazzino" sta su pavimento libero
  const m = CUCINE.grande.magazzino;
  assert.ok(!CUCINE.grande.items.some((it) => m.x > it.x[0] && m.x < it.x[1] && m.d > it.d[0] && m.d < it.d[1]));
});

test('senza collegamenti ogni attrezzatura è neutra e senza etichetta', () => {
  const s = statiCucine({});
  assert.equal(Object.keys(s).length, POSTI.length);
  assert.ok(Object.values(s).every((x) => x.c === 'neutro' && x.breve === null));
});

test('frigorifero collegato: da registrare, nei limiti, fuori limite', () => {
  const collegamenti = [{ posto: 'g9', punto_controllo_id: 1, area_id: null }];
  let s = statiCucine({ collegamenti, punti: [frigo] });
  assert.deepEqual([s.g9.c, s.g9.breve], ['fare', 'da registrare']);
  // conta la rilevazione più recente (la prima dell'elenco)
  s = statiCucine({ collegamenti, punti: [frigo], temperatureOggi: [
    { punto_controllo_id: 1, temperatura: 3.5 }, { punto_controllo_id: 1, temperatura: 9 }] });
  assert.deepEqual([s.g9.c, s.g9.breve], ['ok', '3,5°C']);
  s = statiCucine({ collegamenti, punti: [frigo], temperatureOggi: [{ punto_controllo_id: 1, temperatura: 9 }] });
  assert.deepEqual([s.g9.c, s.g9.breve], ['crit', '9°C']);
  s = statiCucine({ collegamenti, punti: [{ ...frigo, temp_min: -25, temp_max: -18 }], temperatureOggi: [{ punto_controllo_id: 1, temperatura: -19.26 }] });
  assert.deepEqual([s.g9.c, s.g9.breve], ['ok', '−19,3°C']);
  // frigorifero tolto dall'anagrafica: il collegamento non vale più
  assert.equal(statiCucine({ collegamenti, punti: [] }).g9.c, 'neutro');
});

test('pulizia collegata, da sola e insieme alla temperatura', () => {
  const daFare = { id: 7, nome: 'Banchi', daFare: true };
  const fatta = { id: 7, nome: 'Banchi', daFare: false };
  let s = statiCucine({ collegamenti: [{ posto: 'g17', area_id: 7 }], aree: [daFare] });
  assert.deepEqual([s.g17.c, s.g17.breve], ['fare', 'da pulire']);
  s = statiCucine({ collegamenti: [{ posto: 'g17', area_id: 7 }], aree: [fatta] });
  assert.deepEqual([s.g17.c, s.g17.breve], ['ok', null]);
  const tutti = [{ posto: 'g9', punto_controllo_id: 1, area_id: 7 }];
  s = statiCucine({ collegamenti: tutti, punti: [frigo], aree: [daFare], temperatureOggi: [{ punto_controllo_id: 1, temperatura: 3 }] });
  assert.deepEqual([s.g9.c, s.g9.breve], ['fare', '3°C · da pulire']);
  s = statiCucine({ collegamenti: tutti, punti: [frigo], aree: [daFare] });
  assert.deepEqual([s.g9.c, s.g9.breve], ['fare', 'da registrare']);
  // la temperatura fuori limite resta la cosa più importante
  s = statiCucine({ collegamenti: tutti, punti: [frigo], aree: [daFare], temperatureOggi: [{ punto_controllo_id: 1, temperatura: 12 }] });
  assert.deepEqual([s.g9.c, s.g9.breve], ['crit', '12°C']);
});

test('alla scena arrivano solo colore ed etichetta', () => {
  const d = datiScena(statiCucine({ collegamenti: [{ posto: 'g9', punto_controllo_id: 1 }], punti: [frigo] }), { scuro: true, scelto: 'g9' });
  assert.deepEqual(d.stati.g9, { c: 'fare', breve: 'da registrare' });
  assert.equal(d.scuro, true);
  assert.equal(d.scelto, 'g9');
  assert.equal(d.cucine, CUCINE);
  assert.doesNotThrow(() => JSON.stringify(d));
});

test('database: collegare, cambiare e togliere un collegamento; i dati veri danno lo stato giusto', async () => {
  await initDatabase();
  await salvaPuntoControllo({ nome: 'Frigo cucina grande', temp_min: 0, temp_max: 4 });
  const punto = (await listaPuntiControllo()).find((p) => p.nome === 'Frigo cucina grande');
  await salvaArea({ nome: 'Banchi cucina grande', frequenza: 'giornaliera', prodotto_previsto: '', procedura: '' });
  const area = (await listaAree()).find((a) => a.nome === 'Banchi cucina grande');
  assert.ok(punto && area);

  await collegaPosto('g9', { punto_controllo_id: punto.id });
  await collegaPosto('g9', { punto_controllo_id: punto.id, area_id: area.id });
  await collegaPosto('g17', { area_id: area.id });
  let c = await collegamentiCucina();
  assert.equal(c.length, 2);
  assert.deepEqual({ ...c.find((x) => x.posto === 'g9') }, { posto: 'g9', punto_controllo_id: punto.id, area_id: area.id });
  await assert.rejects(() => collegaPosto('', { area_id: area.id }));

  const stato = async () => statiCucine({
    collegamenti: await collegamentiCucina(), punti: await listaPuntiControllo(), temperatureOggi: await temperatureDiOggi(), aree: await areeConStato(),
  });
  assert.equal((await stato()).g9.breve, 'da registrare');
  await registraTemperatura(punto.id, 8, null);
  assert.equal((await stato()).g9.c, 'crit');
  await new Promise((r) => setTimeout(r, 5));
  await registraTemperatura(punto.id, 3, null);
  assert.deepEqual([(await stato()).g9.c, (await stato()).g9.breve], ['fare', '3°C · da pulire']);
  await registraSanificazione({ area_id: area.id, prodotto_utilizzato: '', operatore: '', note: '' });
  const s = await stato();
  assert.deepEqual([s.g9.c, s.g9.breve, s.g17.c], ['ok', '3°C', 'ok']);

  // i collegamenti entrano nel backup; un backup precedente alla vista non li cancella
  const dump = await esportaTutto();
  assert.equal(dump.tabelle.cucina_posti.length, 2);
  const vecchio = JSON.parse(JSON.stringify(dump));
  delete vecchio.tabelle.cucina_posti;
  await importaTutto(vecchio);
  assert.equal((await collegamentiCucina()).length, 2);
  await collegaPosto('g17', {});
  await importaTutto(dump);
  assert.equal((await collegamentiCucina()).length, 2);

  await collegaPosto('g9', {});
  await collegaPosto('g17', {});
  assert.equal((await collegamentiCucina()).length, 0);
});
