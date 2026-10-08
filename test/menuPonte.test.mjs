import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  nomeFilePulito, scriptRisposta, scriptAvviso, scriptSalvato, leggiMessaggio, rispondiArchivio,
  destinazione, numeroWhatsApp, tipoComune, prossimoMenu,
} from '../menuPonte.js';

test('nomi di file puliti', () => {
  assert.equal(nomeFilePulito('Proposta menù_Rossi 2026.pdf'), 'Proposta_men_Rossi_2026.pdf');
  assert.equal(nomeFilePulito('../../etc/passwd'), 'etc_passwd');
  assert.equal(nomeFilePulito(''), 'file');
});

test('gli script di risposta consegnano il valore così com\'è, anche con caratteri insidiosi', () => {
  const ricevuti = [];
  const pagina = { window: { __suiteRisposta: (id, ok, v) => ricevuti.push([id, ok, v]) } };
  const insidioso = 'riga1\nriga2 "virgolette" \\     </script> \'apice\' ${x} `';
  vm.runInNewContext(scriptRisposta(7, true, insidioso), pagina);
  vm.runInNewContext(scriptRisposta(8, false, 'errore'), pagina);
  vm.runInNewContext(scriptRisposta(9, true, ['a', 'b']), pagina);
  vm.runInNewContext(scriptRisposta(10, true, null), pagina);
  // i valori nascono in un altro contesto di esecuzione: si confrontano come testo
  assert.equal(JSON.stringify(ricevuti), JSON.stringify([[7, true, insidioso], [8, false, 'errore'], [9, true, ['a', 'b']], [10, true, null]]));
  assert.equal(ricevuti[0][2], insidioso);
  assert.ok(!scriptRisposta(1, true, '</script>').includes('</script>'));
});

test('avvisi ed esito del salvataggio', () => {
  const visti = [];
  const pagina = { toast: (t) => visti.push(t), window: { onNativeSaved: (tok, ok) => visti.push([tok, ok]) } };
  vm.runInNewContext(scriptAvviso('Messaggio "copiato"'), pagina);
  vm.runInNewContext(scriptSalvato("ab-12');alert(1)//", true), pagina);
  assert.deepEqual(visti, ['Messaggio "copiato"', ['ab12alert1', true]]);
});

test('messaggi della pagina', () => {
  assert.deepEqual(leggiMessaggio('{"tipo":"kvKeys","id":1}'), { tipo: 'kvKeys', id: 1 });
  assert.equal(leggiMessaggio('non json'), null);
  assert.equal(leggiMessaggio('{"altro":1}'), null);
  assert.equal(leggiMessaggio('null'), null);
});

test('domande sull\'archivio', async () => {
  const dati = new Map();
  const archivio = {
    leggi: async (k) => (dati.has(k) ? dati.get(k) : null),
    chiavi: async () => [...dati.keys()],
    scrivi: async (coppie) => { if (!Array.isArray(coppie)) throw new Error('Dati del menù non validi.'); coppie.forEach(([k, v]) => (v === null ? dati.delete(k) : dati.set(k, v))); },
  };
  const risposte = [];
  const pagina = { window: { __suiteRisposta: (id, ok, v) => risposte.push([id, ok, v]) } };
  const chiedi = async (m) => vm.runInNewContext(await rispondiArchivio(m, archivio), pagina);
  await chiedi({ tipo: 'kvGet', id: 1, k: 'state' });
  await chiedi({ tipo: 'kvSetMany', id: 2, pairs: [['state', '{"v":3}'], ['blob:x', '"dati"']] });
  await chiedi({ tipo: 'kvGet', id: 3, k: 'state' });
  await chiedi({ tipo: 'kvKeys', id: 4 });
  await chiedi({ tipo: 'kvSetMany', id: 5, pairs: 'sbagliato' });
  assert.equal(JSON.stringify(risposte), JSON.stringify([
    [1, true, null], [2, true, null], [3, true, '{"v":3}'], [4, true, ['state', 'blob:x']], [5, false, 'Dati del menù non validi.'],
  ]));
  assert.equal(await rispondiArchivio({ tipo: 'shareFiles' }, archivio), null);
});

test('dove vanno gli indirizzi chiesti dalla pagina', () => {
  assert.equal(destinazione('file:///android_asset/menu/index.html'), 'pagina');
  assert.equal(destinazione('file:///android_asset/menu/index.html#x'), 'pagina');
  assert.equal(destinazione('https://api.whatsapp.com/send?phone=39333'), 'fuori');
  assert.equal(destinazione('https://wa.me/39333?text=ciao'), 'fuori');
  assert.equal(destinazione('tel:+39333'), 'fuori');
  assert.equal(destinazione('file:///data/data/altro'), 'niente');
  assert.equal(destinazione('javascript:alert(1)'), 'niente');
  assert.equal(destinazione('blob:null/123'), 'niente');
});

test('numero di WhatsApp e tipo dei file', () => {
  assert.equal(numeroWhatsApp('+39 333 123 4567'), '393331234567');
  assert.equal(numeroWhatsApp('123'), '');
  assert.equal(tipoComune([{ mime: 'application/pdf' }, { mime: 'application/pdf' }]), 'application/pdf');
  assert.equal(tipoComune([{ mime: 'application/pdf' }, { mime: 'image/jpeg' }]), '*/*');
});

test('prossimo menù in calendario', () => {
  const stato = JSON.stringify({
    templates: [{ id: 't1', heading: 'Menù di domenica' }],
    menus: [
      { id: 'a', templateId: 't1', date: '2026-10-01', client: 'Passato' },
      { id: 'b', templateId: 't1', date: '2026-10-25', client: 'Verdi', guests: 30, status: 'bozza' },
      { id: 'c', templateId: 't1', date: '2026-10-17', client: 'Rossi', status: 'rifiutata' },
      { id: 'd', templateId: 't1', date: '2026-10-17', client: 'Bianchi', heading: ' Battesimo ', guests: '50', guestsKids: 10, status: 'confermata' },
      { id: 'e', templateId: 't1', date: '', client: 'Senza data' },
    ],
  });
  assert.deepEqual(prossimoMenu(stato, '2026-10-08'), { data: '2026-10-17', titolo: 'Battesimo', cliente: 'Bianchi', ospiti: 60, stato: 'confermata' });
  assert.deepEqual(prossimoMenu(stato, '2026-10-18'), { data: '2026-10-25', titolo: 'Menù di domenica', cliente: 'Verdi', ospiti: 30, stato: 'bozza' });
  assert.equal(prossimoMenu(stato, '2026-11-01'), null);
  assert.equal(prossimoMenu(null, '2026-10-08'), null);
  assert.equal(prossimoMenu('non json', '2026-10-08'), null);
});

test('domande sulle ricette: elenco e creazione, errori compresi', async () => {
  const { rispondiRicette, scriptRicette } = await import('../menuPonte.js');
  const visti = [];
  const pagina = { window: { __suiteRisposta: (id, ok, v) => visti.push([id, ok, v]), __suiteRicette: (l) => visti.push(['elenco', l.length]) } };
  const ricette = { elenco: async () => [{ id: 1, nome: 'Ragù "della nonna"' }], crea: async (nome) => { if (!nome) throw new Error('Scrivi il nome'); return 7; } };
  vm.runInNewContext(await rispondiRicette({ tipo: 'ricette', id: 1 }, ricette), pagina);
  vm.runInNewContext(await rispondiRicette({ tipo: 'creaRicetta', id: 2, nome: 'Ragù' }, ricette), pagina);
  vm.runInNewContext(await rispondiRicette({ tipo: 'creaRicetta', id: 3 }, ricette), pagina);
  vm.runInNewContext(scriptRicette([{ id: 1 }, { id: 2 }]), pagina);
  assert.equal(JSON.stringify(visti), JSON.stringify([[1, true, [{ id: 1, nome: 'Ragù "della nonna"' }]], [2, true, 7], [3, false, 'Scrivi il nome'], ['elenco', 2]]));
  assert.equal(await rispondiRicette({ tipo: 'kvGet', id: 4 }, ricette), null);
});

test('eventi del Menù per il resto della suite: portate con la ricetta collegata', async () => {
  const { eventiMenu } = await import('../menuPonte.js');
  const stato = JSON.stringify({
    dishes: [{ id: 'a', name: 'Orecchiette\nalle cime di rapa', rid: 5 }, { id: 'b', name: 'Agnello' }],
    templates: [{ id: 't', heading: 'Menù di domenica' }],
    menus: [
      { id: 'm2', date: '2026-11-01', templateId: 't', client: ' Bianchi ', guests: '40', guestsKids: 5, status: 'confermata',
        sections: [{ name: 'Primi', items: [{ dishId: 'a', name: 'Orecchiette alle cime di rapa' }, { dishId: 'a', name: 'Orecchiette al pomodoro' }, { name: 'Fuori archivio' }] }],
        kidsSections: [{ name: 'Bimbi', items: [{ dishId: 'b', name: 'Agnello' }] }] },
      { id: 'm1', date: '2026-10-17', time: '13:00', heading: 'Battesimo', sections: [] },
      { id: 'senza-data', date: '' },
    ],
  });
  const e = eventiMenu(stato);
  assert.deepEqual(e.map((x) => x.id), ['m1', 'm2']);
  assert.deepEqual(e[0], { id: 'm1', data: '2026-10-17', ora: '13:00', stato: 'bozza', titolo: 'Battesimo', cliente: '', ospiti: 0, bambini: 0, portate: [] });
  assert.equal(e[1].titolo, 'Menù di domenica');
  assert.deepEqual([e[1].cliente, e[1].ospiti, e[1].bambini], ['Bianchi', 40, 5]);
  assert.deepEqual(e[1].portate.map((p) => [p.nome, p.sezione, p.bambini, p.portataId, p.ricettaId]), [
    ['Orecchiette alle cime di rapa', 'Primi', false, 'a', 5],
    ['Orecchiette al pomodoro', 'Primi', false, 'a', null], // testo cambiato nel menù: non segue più la ricetta
    ['Fuori archivio', 'Primi', false, null, null],
    ['Agnello', 'Bimbi', true, 'b', null],
  ]);
  assert.deepEqual(eventiMenu('non è json'), []);
  assert.deepEqual(eventiMenu(null), []);
});
