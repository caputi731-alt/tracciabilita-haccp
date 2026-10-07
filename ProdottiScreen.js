import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Alert, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, ALLERGENI, CATEGORIE_PRODOTTO, CONSERVAZIONE, UNITA, aNumero, numeroPerCampo } from './theme';
import {
  Campo, Chips, Selettore, Scanner, Bottone, conferma, useFoto, AnteprimaFoto, VistaModale, useErrori, Icona, Vuoto, Caricamento,
} from './UI';
import {
  listaProdotti, salvaProdotto, eliminaProdotto, listaFornitori, leggiAllergeni,
} from './database';

const VUOTO = {
  denominazione: '', categoria: '', fornitore_abituale_id: null, unita_misura: 'kg',
  barcode_ean: '', allergeni: [], conservazione: 'ambiente', temp_min: null,
  temp_max: null, shelf_life_giorni: null, giorni_dopo_apertura: null, origine: '', note: '',
  foto_etichetta: null,
};

export default function ProdottiScreen() {
  const [prodotti, setProdotti] = useState([]);
  const [caricato, setCaricato] = useState(false);
  const [fornitori, setFornitori] = useState([]);
  const [form, setForm] = useState(null);
  const [scanner, setScanner] = useState(false);
  const [cerca, setCerca] = useState('');
  const [soloDaCompletare, setSoloDaCompletare] = useState(false);
  const { chiediFoto, fotocamera } = useFoto();

  const ricarica = useCallback(() => {
    listaProdotti().then((r) => { setProdotti(r); setCaricato(true); });
    listaFornitori().then(setFornitori);
  }, []);
  useFocusEffect(ricarica);

  const { errori, segnala, azzera, riepilogo } = useErrori();

  const NUMERICI = ['temp_min', 'temp_max', 'shelf_life_giorni', 'giorni_dopo_apertura'];
  const apri = (p) => {
    azzera();
    if (!p) return setForm({ ...VUOTO });
    const f = { ...p, allergeni: leggiAllergeni(p.allergeni) };
    NUMERICI.forEach((k) => { f[k] = numeroPerCampo(p[k]); }); // nei campi restano testi: si convertono al salvataggio
    return setForm(f);
  };

  const salva = async () => {
    azzera();
    let ok = true;
    if (!form.denominazione.trim()) ok = segnala('denominazione', 'La denominazione è obbligatoria');
    const numeri = {};
    for (const k of NUMERICI) {
      const testo = String(form[k] ?? '').trim();
      numeri[k] = testo === '' ? null : aNumero(testo);
      if (testo !== '' && numeri[k] === null) ok = segnala(k, 'Inserisci un numero, es. -18 oppure 4,5');
    }
    for (const k of ['shelf_life_giorni', 'giorni_dopo_apertura']) {
      if (numeri[k] !== null && (!Number.isInteger(numeri[k]) || numeri[k] < 0)) ok = segnala(k, 'Numero intero di giorni');
    }
    if (numeri.temp_min !== null && numeri.temp_max !== null && numeri.temp_min > numeri.temp_max) {
      ok = segnala('temp_max', 'La massima deve essere superiore alla minima');
    }
    if (!ok) return;
    const doppio = prodotti.find((p) => p.id !== form.id
      && p.denominazione.trim().toLowerCase() === form.denominazione.trim().toLowerCase());
    if (doppio) return segnala('denominazione', 'Esiste già un prodotto con questo nome');
    await salvaProdotto({ ...form, ...numeri, denominazione: form.denominazione.trim() });
    setForm(null);
    ricarica();
  };

  const elimina = (p) =>
    conferma('Eliminare il prodotto?', `${p.denominazione} sarà rimosso dal catalogo.`,
      async () => { await eliminaProdotto(p.id); ricarica(); });

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setNum = set;

  const daCompletare = prodotti.filter((p) => !p.allergeni_verificati).length;
  const filtrati = prodotti.filter((p) =>
    p.denominazione.toLowerCase().includes(cerca.toLowerCase())
    && (!soloDaCompletare || !p.allergeni_verificati));

  return (
    <View style={S.screen}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <TextInput style={S.input} placeholder="Cerca prodotto…" value={cerca} accessibilityLabel="Cerca prodotto"
          onChangeText={setCerca} placeholderTextColor={COLORS.segnaposto} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={S.content}>
        {daCompletare > 0 && (
          <TouchableOpacity onPress={() => setSoloDaCompletare((v) => !v)} activeOpacity={0.7}
            style={[S.card, { backgroundColor: COLORS.warningSoft, borderColor: COLORS.warning }]}>
            <Text style={{ color: COLORS.warning, fontWeight: '800', fontSize: 15 }}>
              {soloDaCompletare ? '✓ ' : ''}{daCompletare} prodott{daCompletare > 1 ? 'i' : 'o'} con allergeni da verificare
            </Text>
            <Text style={S.muted}>
              {soloDaCompletare ? 'Tocca per vedere tutti i prodotti' : 'Tocca per vedere solo questi. Aprili, controlla allergeni e conservazione e salva.'}
            </Text>
          </TouchableOpacity>
        )}
        {!caricato && <Caricamento />}
        {caricato && filtrati.length === 0 && (
          <Vuoto icona="food-apple-outline" titolo={cerca ? 'Nessun prodotto trovato' : 'Catalogo vuoto'}
            testo={cerca ? 'Prova con un\'altra parola.' : 'I prodotti si creano da soli importando una fattura, oppure aggiungili col pulsante in basso.'} />
        )}
        {filtrati.map((p) => {
          const all = leggiAllergeni(p.allergeni);
          return (
            <TouchableOpacity key={p.id} style={S.card} onPress={() => apri(p)} accessibilityRole="button">
              <View style={S.row}>
                <Text style={{ fontSize: 16, fontWeight: '700', flex: 1 }}>{p.denominazione}</Text>
                {!!p.foto_etichetta && <Icona nome="camera" size={20} colore={COLORS.muted} />}
              </View>
              <Text style={S.muted}>
                {[p.categoria, p.fornitore, p.conservazione].filter(Boolean).join(' · ')}
              </Text>
              {!p.allergeni_verificati ? (
                <Text style={{ color: COLORS.warning, fontSize: 13, marginTop: 4, fontWeight: '700' }}>
                  ⚠ Allergeni da verificare{all.length ? ` (indicati: ${all.join(', ')})` : ''}
                </Text>
              ) : all.length > 0 ? (
                <Text style={{ color: COLORS.warning, fontSize: 13, marginTop: 4 }}>
                  Allergeni: {all.join(', ')}
                </Text>
              ) : (
                <Text style={[S.muted, { marginTop: 4 }]}>Nessun allergene</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={{ padding: 16, paddingTop: 0 }}>
        <Bottone testo="+ Nuovo prodotto" onPress={() => apri(null)} />
      </View>

      <Modal visible={!!form} animationType="slide" onRequestClose={() => setForm(null)}>
        {form && (
          <VistaModale>
            <Text style={S.h1}>{form.id ? 'Modifica prodotto' : 'Nuovo prodotto'}</Text>

            <Campo label="Denominazione *" value={form.denominazione} onChange={set('denominazione')}
              errore={errori.denominazione} />
            <Chips label="Categoria" opzioni={CATEGORIE_PRODOTTO} valore={form.categoria}
              onChange={set('categoria')} />

            <Selettore label="Fornitore abituale" elementi={fornitori}
              valore={form.fornitore_abituale_id}
              etichetta={(f) => f.ragione_sociale}
              onChange={set('fornitore_abituale_id')} />

            <Chips label="Unità di misura" opzioni={UNITA} valore={form.unita_misura}
              onChange={set('unita_misura')} />

            <Campo label="Codice a barre" value={form.barcode_ean} onChange={set('barcode_ean')} />
            <Bottone testo="Scansiona codice" ghost onPress={() => setScanner(true)} />

            <Chips label="Conservazione" opzioni={CONSERVAZIONE} valore={form.conservazione}
              onChange={set('conservazione')} />

            {form.conservazione !== 'ambiente' && (
              <>
                <Campo label="Temperatura minima (°C)" value={form.temp_min} errore={errori.temp_min}
                  onChange={setNum('temp_min')} keyboardType="numbers-and-punctuation" placeholder="es. -18 oppure 0" />
                <Campo label="Temperatura massima (°C)" value={form.temp_max} errore={errori.temp_max}
                  onChange={setNum('temp_max')} keyboardType="numbers-and-punctuation" placeholder="es. 4" />
                <Text style={[S.muted, { marginTop: 4 }]}>
                  Se al ricevimento la temperatura è fuori da questi limiti, l'app apre una non conformità.
                </Text>
              </>
            )}

            <Campo label="Durata (giorni dalla ricezione)" value={form.shelf_life_giorni} errore={errori.shelf_life_giorni}
              onChange={setNum('shelf_life_giorni')} keyboardType="number-pad" />
            <Campo label="Giorni di consumo dopo apertura" value={form.giorni_dopo_apertura} errore={errori.giorni_dopo_apertura}
              onChange={setNum('giorni_dopo_apertura')} keyboardType="number-pad"
              placeholder="usato per l'etichetta di apertura" />
            <Campo label="Origine / provenienza" value={form.origine} onChange={set('origine')} />

            <Chips label="Allergeni contenuti (Reg. UE 1169/2011)" opzioni={ALLERGENI}
              valore={form.allergeni} onChange={set('allergeni')} multiplo />
            <Text style={[S.muted, { marginTop: 6 }]}>
              Controlla l'etichetta: salvando confermi che gli allergeni indicati sono verificati
              (anche se non ce ne sono).
            </Text>

            <AnteprimaFoto uri={form.foto_etichetta} titolo="Foto dell'etichetta" altezza={220} />
            <Bottone icona="camera" testo={form.foto_etichetta ? "Sostituisci foto dell'etichetta" : "Fotografa l'etichetta"}
              ghost onPress={() => chiediFoto('etichetta', set('foto_etichetta'))} />
            {!!form.foto_etichetta && (
              <Bottone testo="Rimuovi foto" ghost colore={COLORS.danger}
                onPress={() => set('foto_etichetta')(null)} />
            )}

            <Campo label="Note" value={form.note} onChange={set('note')} multiline />

            {riepilogo}
            <Bottone testo="Salva" onPress={salva} />
            {!!form.id && (
              <Bottone testo="Elimina prodotto" ghost colore={COLORS.danger}
                onPress={() => { const x = form; setForm(null); elimina(x); }} />
            )}
            <Bottone testo="Annulla" ghost onPress={() => setForm(null)} />
          </VistaModale>
        )}
      </Modal>

      {fotocamera}

      <Scanner visibile={scanner} onChiudi={() => setScanner(false)}
        onLetto={(code) => { setForm((f) => ({ ...f, barcode_ean: code })); setScanner(false); }} />
    </View>
  );
}
