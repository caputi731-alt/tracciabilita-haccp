import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  nomeFilePulito, scriptRisposta, scriptAvviso, scriptSalvato, leggiMessaggio, rispondiArchivio,
  destinazione, numeroWhatsApp, tipoComune,
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
