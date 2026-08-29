import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, CATEGORIE_PRODOTTO, UNITA } from './theme';
import { Campo, Chips, Selettore, Bottone, conferma } from './UI';
import {
  listaRicette, getRicetta, salvaRicetta, eliminaRicetta, listaProdotti,
} from './database';

const VUOTA = { nome: '', categoria: '', porzioni: '', procedura: '', ingredienti: [] };

export default function RicetteScreen() {
  const [ricette, setRicette] = useState([]);
  const [prodotti, setProdotti] = useState([]);
  const [form, setForm] = useState(null);

  const ricarica = useCallback(() => {
    listaRicette().then(setRicette);
    listaProdotti().then(setProdotti);
  }, []);
  useFocusEffect(ricarica);

  const apri = async (r) => {
    if (r) {
      const piena = await getRicetta(r.id);
      setForm({
        ...piena,
        porzioni: piena.porzioni != null ? String(piena.porzioni) : '',
        ingredienti: piena.ingredienti.map((i) => ({
          prodotto_id: i.prodotto_id, quantita: String(i.quantita ?? ''), unita_misura: i.unita_misura || '',
        })),
      });
    } else {
      setForm({ ...VUOTA, ingredienti: [] });
    }
  };

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const addIng = () =>
    setForm((f) => ({ ...f, ingredienti: [...f.ingredienti, { prodotto_id: null, quantita: '', unita_misura: 'kg' }] }));
  const setIng = (idx, k, v) =>
    setForm((f) => ({
      ...f,
      ingredienti: f.ingredienti.map((ing, i) => (i === idx ? { ...ing, [k]: v } : ing)),
    }));
  const rmIng = (idx) =>
    setForm((f) => ({ ...f, ingredienti: f.ingredienti.filter((_, i) => i !== idx) }));

  // allergeni calcolati in tempo reale dagli ingredienti scelti
  const allergeniCalcolati = () => {
    if (!form) return [];
    const set0 = new Set();
    form.ingredienti.forEach((ing) => {
      const p = prodotti.find((x) => x.id === ing.prodotto_id);
      if (!p) return;
      try { JSON.parse(p.allergeni || '[]').forEach((a) => set0.add(a)); } catch (e) {}
    });
    return [...set0];
  };

  const salva = async () => {
    if (!form.nome.trim()) return Alert.alert('Dato mancante', 'Dai un nome alla ricetta.');
    await salvaRicetta({
      ...form,
      porzioni: form.porzioni === '' ? null : Number(form.porzioni),
      ingredienti: form.ingredienti
        .filter((i) => i.prodotto_id)
        .map((i) => ({ ...i, quantita: i.quantita === '' ? 0 : Number(i.quantita) })),
    });
    setForm(null);
    ricarica();
  };

  const elimina = (r) =>
    conferma('Eliminare la ricetta?', `${r.nome} sarà rimossa. Le produzioni già registrate restano.`,
      async () => { await eliminaRicetta(r.id); ricarica(); });

  const nomeProdotto = (id) => prodotti.find((p) => p.id === id)?.denominazione || 'Scegli prodotto';

  return (
    <View style={S.screen}>
      <ScrollView contentContainerStyle={S.content}>
        <Text style={S.h1}>Ricette</Text>
        <Text style={[S.muted, { marginBottom: 12 }]}>
          Gli allergeni della ricetta si calcolano da soli dagli ingredienti del catalogo.
        </Text>

        {ricette.length === 0 && <Text style={S.empty}>Nessuna ricetta. Creane una qui sotto.</Text>}
        {ricette.map((r) => (
          <TouchableOpacity key={r.id} style={S.card} onPress={() => apri(r)} onLongPress={() => elimina(r)}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{r.nome}</Text>
            <Text style={S.muted}>{[r.categoria, r.porzioni ? `${r.porzioni} porzioni` : ''].filter(Boolean).join(' · ')}</Text>
          </TouchableOpacity>
        ))}
        {ricette.length > 0 && (
          <Text style={[S.muted, { textAlign: 'center', marginTop: 4 }]}>
            Tocca per modificare · tieni premuto per eliminare
          </Text>
        )}
      </ScrollView>

      <View style={{ padding: 16, paddingTop: 0 }}>
        <Bottone testo="+ Nuova ricetta" onPress={() => apri(null)} />
      </View>

      <Modal visible={!!form} animationType="slide" onRequestClose={() => setForm(null)}>
        {form && (
          <ScrollView style={S.screen} contentContainerStyle={[S.content, { paddingTop: 50 }]}>
            <Text style={S.h1}>{form.id ? 'Modifica ricetta' : 'Nuova ricetta'}</Text>
            <Campo label="Nome *" value={form.nome} onChange={set('nome')} />
            <Chips label="Categoria" opzioni={CATEGORIE_PRODOTTO} valore={form.categoria} onChange={set('categoria')} />
            <Campo label="Porzioni" value={form.porzioni} onChange={set('porzioni')} keyboardType="numeric" />

            <Text style={[S.h2, { marginTop: 18 }]}>Ingredienti</Text>
            {form.ingredienti.map((ing, idx) => (
              <View key={idx} style={S.card}>
                <Selettore label={`Ingrediente ${idx + 1}`} elementi={prodotti} valore={ing.prodotto_id}
                  etichetta={(x) => x.denominazione} onChange={(v) => setIng(idx, 'prodotto_id', v)}
                  placeholder="Scegli dal catalogo" />
                <View style={[S.row, { marginTop: 6 }]}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Campo label="Quantità" value={ing.quantita}
                      onChange={(v) => setIng(idx, 'quantita', v)} keyboardType="numeric" />
                  </View>
                </View>
                <Chips label="Unità" opzioni={UNITA} valore={ing.unita_misura}
                  onChange={(v) => setIng(idx, 'unita_misura', v)} />
                <Bottone testo="Rimuovi ingrediente" ghost colore={COLORS.danger} onPress={() => rmIng(idx)} />
              </View>
            ))}
            <Bottone testo="+ Aggiungi ingrediente" ghost onPress={addIng} />

            <View style={[S.card, { marginTop: 14, backgroundColor: COLORS.primarySoft, borderColor: COLORS.primarySoft }]}>
              <Text style={{ fontWeight: '800', color: COLORS.primaryDark }}>Allergeni calcolati</Text>
              <Text style={{ color: COLORS.primaryDark, marginTop: 4 }}>
                {allergeniCalcolati().length ? allergeniCalcolati().join(', ') : 'Nessuno (dai prodotti scelti)'}
              </Text>
            </View>

            <Campo label="Procedura" value={form.procedura} onChange={set('procedura')} multiline />

            <Bottone testo="Salva ricetta" onPress={salva} />
            <Bottone testo="Annulla" ghost onPress={() => setForm(null)} />
          </ScrollView>
        )}
      </Modal>
    </View>
  );
}
