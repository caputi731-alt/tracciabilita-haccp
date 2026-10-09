// Vista delle cucine: stato di ogni attrezzatura (cucine.js) e collegamenti salvati (database.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CUCINE, PULSANTI, POSTI, FREDDI, limitiProposti, statiCucine, datiScena } from '../cucine.js';
import {
  initDatabase, collegaPosto, collegamentiCucina, salvaPuntoControllo, listaPuntiControllo, registraTemperatura,
  temperatureDiOggi, listaAree, salvaArea, esportaTutto, importaTutto,
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
  // i pulsanti: "Magazzino" su pavimento libero, gli altri sopra un'attrezzatura che esiste; ogni scelta porta a una schermata
  const tutti = Object.values(CUCINE).flatMap((K) => (K.pulsanti || []).map((pu) => ({ ...pu, K })));
  assert.deepEqual(tutti.map((pu) => pu.id).sort(), Object.keys(PULSANTI).sort());
  for (const pu of tutti) {
    if (pu.su) assert.ok(pu.K.items.some((it) => it.id === pu.su), `${pu.id} non sta sulla sua attrezzatura`);
    else assert.ok(!pu.K.items.some((it) => pu.x > it.x[0] && pu.x < it.x[1] && pu.d > it.d[0] && pu.d < it.d[1]));
    assert.ok(PULSANTI[pu.id].scelte.length >= 2 && PULSANTI[pu.id].scelte.every((s) => s.titolo && s.rotta && s.icona));
  }
  assert.deepEqual(tutti.map((pu) => [pu.id, pu.su || 'pavimento', pu.K.nome]), [['magazzino', 'pavimento', 'Cucina grande'], ['produzione', 'g4', 'Cucina grande'], ['pulizie', 'g15', 'Cucina grande']]);
  assert.deepEqual(PULSANTI.magazzino.scelte.map((s) => s.rotta), ['CaricoMerce', 'Magazzino']);
  assert.deepEqual(PULSANTI.produzione.scelte.map((s) => s.rotta), ['Produzioni', 'Anagrafiche', 'Etichette']);
  assert.deepEqual(PULSANTI.pulizie.scelte.map((s) => s.rotta), ['Sanificazione', 'NonConformita']);
});

test('hanno un tag solo frigoriferi e congelatori; senza nome chiedono di darglielo', () => {
  const s = statiCucine({});
  assert.deepEqual(Object.keys(s).sort(), ['g1', 'g8', 'g9', 'p1']);
  assert.deepEqual(FREDDI.map((p) => p.id).sort(), ['g1', 'g8', 'g9', 'p1']);
  assert.ok(Object.values(s).every((x) => x.c === 'neutro' && x.nome === null && x.breve === 'dai un nome'));
  assert.deepEqual(limitiProposti('chest'), { tipo: 'congelatore', temp_min: -25, temp_max: -18 });
  assert.deepEqual(limitiProposti('fridge'), { tipo: 'frigorifero', temp_min: 0, temp_max: 4 });
});

test('frigorifero con il nome: da registrare, nei limiti, fuori limite', () => {
  const collegamenti = [{ posto: 'g9', punto_controllo_id: 1, area_id: null }];
  let s = statiCucine({ collegamenti, punti: [frigo] });
  assert.deepEqual([s.g9.c, s.g9.nome, s.g9.breve], ['fare', 'Frigo 1', 'da registrare']);
  // conta la rilevazione più recente (la prima dell'elenco)
  s = statiCucine({ collegamenti, punti: [frigo], temperatureOggi: [
    { punto_controllo_id: 1, temperatura: 3.5 }, { punto_controllo_id: 1, temperatura: 9 }] });
  assert.deepEqual([s.g9.c, s.g9.breve], ['ok', '3,5°C']);
  s = statiCucine({ collegamenti, punti: [frigo], temperatureOggi: [{ punto_controllo_id: 1, temperatura: 9 }] });
  assert.deepEqual([s.g9.c, s.g9.breve], ['crit', '9°C']);
  s = statiCucine({ collegamenti, punti: [{ ...frigo, temp_min: -25, temp_max: -18 }], temperatureOggi: [{ punto_controllo_id: 1, temperatura: -19.26 }] });
  assert.deepEqual([s.g9.c, s.g9.breve], ['ok', '−19,3°C']);
  // frigorifero tolto dall'anagrafica: torna senza nome
  assert.deepEqual([statiCucine({ collegamenti, punti: [] }).g9.c, statiCucine({ collegamenti, punti: [] }).g9.nome], ['neutro', null]);
  // un tavolo non ha tag nemmeno se un vecchio collegamento lo riguarda (le pulizie non stanno più sulla mappa)
  assert.equal(statiCucine({ collegamenti: [{ posto: 'g17', punto_controllo_id: 1, area_id: 7 }], punti: [frigo] }).g17, undefined);
});

test('alla scena arrivano solo colore, nome ed etichetta', () => {
  const d = datiScena(statiCucine({ collegamenti: [{ posto: 'g9', punto_controllo_id: 1 }], punti: [frigo] }), { scuro: true, scelto: 'g9' });
  assert.deepEqual(d.stati.g9, { c: 'fare', nome: 'Frigo 1', breve: 'da registrare' });
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
    collegamenti: await collegamentiCucina(), punti: await listaPuntiControllo(), temperatureOggi: await temperatureDiOggi(),
  });
  assert.deepEqual([(await stato()).g9.nome, (await stato()).g9.breve], ['Frigo cucina grande', 'da registrare']);
  await registraTemperatura(punto.id, 8, null);
  assert.equal((await stato()).g9.c, 'crit');
  await new Promise((r) => setTimeout(r, 5));
  await registraTemperatura(punto.id, 3, null);
  assert.deepEqual([(await stato()).g9.c, (await stato()).g9.breve], ['ok', '3°C']);
  // il nome si cambia dalla scheda: il tag lo segue
  await salvaPuntoControllo({ ...punto, nome: 'Frigo carni' });
  assert.equal((await stato()).g9.nome, 'Frigo carni');

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
