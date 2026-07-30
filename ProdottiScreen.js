import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Alert, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, ALLERGENI, CATEGORIE_PRODOTTO, CONSERVAZIONE, UNITA } from './theme';
import { Campo, Chips, Selettore, Scanner, Bottone, conferma } from './UI';
import {
  listaProdotti, salvaProdotto, eliminaProdotto, listaFornitori,
} from './database';

const VUOTO = {
  denominazione: '', categoria: '', fornitore_abituale_id: null, unita_misura: 'kg',
  barcode_ean: '', allergeni: [], conservazione: 'ambiente', temp_min: null,
  temp_max: null, shelf_life_giorni: null, giorni_dopo_apertura: null, origine: '', note: '',
};

export default function ProdottiScreen() {
  const [prodotti, setProdotti] = useState([]);
  const [fornitori, setFornitori] = useState([]);
  const [form, setForm] = useState(null);
  const [scanner, setScanner] = useState(false);
  const [cerca, setCerca] = useState('');

  const ricarica = useCallback(() => {
    listaProdotti().then(setProdotti);
    listaFornitori().then(setFornitori);
  }, []);
  useFocusEffect(ricarica);

  const apri = (p) =>
    setForm(p ? { ...p, allergeni: JSON.parse(p.allergeni || '[]') } : { ...VUOTO });

  const salva = async () => {
    if (!form.denominazione.trim()) {
      return Alert.alert('Dato mancante', 'La denominazione è obbligatoria.');
    }
    await salvaProdotto(form);
    setForm(null);
    ricarica();
  };

  const elimina = (p) =>
    conferma('Eliminare il prodotto?', `${p.denominazione} sarà rimosso dal catalogo.`,
      async () => { await eliminaProdotto(p.id); ricarica(); });

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setNum = (k) => (v) => setForm((f) => ({ ...f, [k]: v === '' ? null : Number(v) }));

  const filtrati = prodotti.filter((p) =>
    p.denominazione.toLowerCase().includes(cerca.toLowerCase()));

  return (
    <View style={S.screen}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <TextInput style={S.input} placeholder="Cerca prodotto…" value={cerca}
          onChangeText={setCerca} placeholderTextColor="#9CA3AF" />
      </View>

      <ScrollView contentContainerStyle={S.content}>
        {filtrati.length === 0 && (
          <Text style={S.empty}>
            Nessun prodotto. Il catalogo si costruisce man mano che ricevi la merce.
          </Text>
        )}
        {filtrati.map((p) => {
          const all = JSON.parse(p.allergeni || '[]');
          return (
            <TouchableOpacity key={p.id} style={S.card} onPress={() => apri(p)}
              onLongPress={() => elimina(p)}>
              <Text style={{ fontSize: 16, fontWeight: '700' }}>{p.denominazione}</Text>
              <Text style={S.muted}>
                {[p.categoria, p.fornitore, p.conservazione].filter(Boolean).join(' · ')}
              </Text>
              {all.length > 0 && (
                <Text style={{ color: COLORS.warning, fontSize: 13, marginTop: 4 }}>
                  Allergeni: {all.join(', ')}
                </Text>
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
          <ScrollView style={S.screen} contentContainerStyle={[S.content, { paddingTop: 50 }]}>
            <Text style={S.h1}>{form.id ? 'Modifica prodotto' : 'Nuovo prodotto'}</Text>

            <Campo label="Denominazione *" value={form.denominazione} onChange={set('denominazione')} />
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
                <Campo label="Temperatura minima (°C)" value={form.temp_min}
                  onChange={setNum('temp_min')} keyboardType="numbers-and-punctuation" />
                <Campo label="Temperatura massima (°C)" value={form.temp_max}
                  onChange={setNum('temp_max')} keyboardType="numbers-and-punctuation" />
              </>
            )}

            <Campo label="Durata (giorni dalla ricezione)" value={form.shelf_life_giorni}
              onChange={setNum('shelf_life_giorni')} keyboardType="numeric" />
            <Campo label="Giorni di consumo dopo apertura" value={form.giorni_dopo_apertura}
              onChange={setNum('giorni_dopo_apertura')} keyboardType="numeric"
              placeholder="usato per l'etichetta di apertura" />
            <Campo label="Origine / provenienza" value={form.origine} onChange={set('origine')} />

            <Chips label="Allergeni contenuti (Reg. UE 1169/2011)" opzioni={ALLERGENI}
              valore={form.allergeni} onChange={set('allergeni')} multiplo />

            <Campo label="Note" value={form.note} onChange={set('note')} multiline />

            <Bottone testo="Salva" onPress={salva} />
            <Bottone testo="Annulla" ghost onPress={() => setForm(null)} />
          </ScrollView>
        )}
      </Modal>

      <Scanner visibile={scanner} onChiudi={() => setScanner(false)}
        onLetto={(code) => { setForm((f) => ({ ...f, barcode_ean: code })); setScanner(false); }} />
    </View>
  );
}
