import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtData, fmtDataOra } from './theme';
import { Campo, Selettore, Bottone } from './UI';
import {
  listaRicette, getRicetta, listaProduzioni, getProduzione,
  lottiDisponibiliProdotto, registraProduzione,
} from './database';

const oggiISO = () => new Date().toISOString().slice(0, 10);
const lottoAuto = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `P${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

export default function ProduzioniScreen() {
  const [ricette, setRicette] = useState([]);
  const [produzioni, setProduzioni] = useState([]);
  const [nuova, setNuova] = useState(false);
  const [dettaglio, setDettaglio] = useState(null);

  // form nuova produzione
  const [ricettaId, setRicettaId] = useState(null);
  const [nome, setNome] = useState('');
  const [quantita, setQuantita] = useState('');
  const [scadenza, setScadenza] = useState('');
  const [operatore, setOperatore] = useState('');
  const [lotto, setLotto] = useState('');
  const [righe, setRighe] = useState([]); // { prodotto_id, prodotto, um, lotti[], lotto_id, quantita }

  const ricarica = useCallback(() => {
    listaRicette().then(setRicette);
    listaProduzioni().then(setProduzioni);
  }, []);
  useFocusEffect(ricarica);

  const apriNuova = () => {
    setRicettaId(null); setNome(''); setQuantita(''); setScadenza('');
    setOperatore(''); setLotto(lottoAuto()); setRighe([]);
    setNuova(true);
  };

  const scegliRicetta = async (id) => {
    setRicettaId(id);
    const r = await getRicetta(id);
    if (!r) return;
    setNome(r.nome);
    const nuoveRighe = [];
    for (const ing of r.ingredienti) {
      const lotti = await lottiDisponibiliProdotto(ing.prodotto_id);
      nuoveRighe.push({
        prodotto_id: ing.prodotto_id,
        prodotto: ing.prodotto,
        um: ing.unita_misura || ing.um_prodotto || '',
        lotti,
        lotto_id: lotti[0]?.id ?? null,   // FIFO: primo per scadenza
        quantita: ing.quantita != null ? String(ing.quantita) : '',
      });
    }
    setRighe(nuoveRighe);
  };

  const setRiga = (idx, k, v) =>
    setRighe((rs) => rs.map((r, i) => (i === idx ? { ...r, [k]: v } : r)));

  const salva = async () => {
    if (!nome.trim()) return Alert.alert('Dato mancante', 'Serve il nome del piatto.');
    const usi = righe
      .filter((r) => r.lotto_id && r.quantita !== '')
      .map((r) => ({ lotto_id: r.lotto_id, quantita: Number(r.quantita) }));
    try {
      await registraProduzione({
        ricetta_id: ricettaId, nome,
        quantita_prodotta: quantita === '' ? null : Number(quantita),
        lotto_produzione: lotto, data_scadenza: scadenza || null, operatore,
      }, usi);
      setNuova(false);
      ricarica();
      Alert.alert('Produzione registrata',
        'I lotti usati sono stati scaricati dal magazzino e collegati a questo piatto.');
    } catch (e) {
      Alert.alert('Errore', String(e?.message || e));
    }
  };

  const apriDettaglio = async (pr) => setDettaglio(await getProduzione(pr.id));

  return (
    <View style={S.screen}>
      <ScrollView contentContainerStyle={S.content}>
        <Text style={S.h1}>Produzioni</Text>
        <Text style={[S.muted, { marginBottom: 12 }]}>
          Registra un piatto preparato: scegli la ricetta, indica i lotti usati e l'app li
          scarica dal magazzino, creando il legame lotto → piatto.
        </Text>

        {produzioni.length === 0 && <Text style={S.empty}>Nessuna produzione registrata.</Text>}
        {produzioni.map((pr) => (
          <TouchableOpacity key={pr.id} style={S.card} onPress={() => apriDettaglio(pr)}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{pr.nome}</Text>
            <Text style={S.muted}>{fmtDataOra(pr.data_ora)} · lotto {pr.lotto_produzione || '—'}</Text>
            {!!pr.data_scadenza && <Text style={S.muted}>Scadenza: {fmtData(pr.data_scadenza)}</Text>}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={{ padding: 16, paddingTop: 0 }}>
        <Bottone testo="+ Nuova produzione" onPress={apriNuova} />
      </View>

      {/* Nuova produzione */}
      <Modal visible={nuova} animationType="slide" onRequestClose={() => setNuova(false)}>
        <ScrollView style={S.screen} contentContainerStyle={[S.content, { paddingTop: 50 }]}>
          <Text style={S.h1}>Nuova produzione</Text>

          <View style={S.card}>
            <Selettore label="Ricetta" elementi={ricette} valore={ricettaId}
              etichetta={(x) => x.nome} onChange={scegliRicetta}
              placeholder="Scegli una ricetta" />
            <Campo label="Nome del piatto" value={nome} onChange={setNome} />
            <Campo label="Quantità prodotta" value={quantita} onChange={setQuantita} keyboardType="numeric" />
            <Campo label="Scadenza interna" value={scadenza} onChange={setScadenza} placeholder="AAAA-MM-GG" />
            <Campo label="Operatore" value={operatore} onChange={setOperatore} />
            <Campo label="Lotto produzione" value={lotto} onChange={setLotto} />
          </View>

          <Text style={S.h2}>Lotti utilizzati</Text>
          {righe.length === 0 ? (
            <Text style={S.muted}>Scegli una ricetta per vedere gli ingredienti, oppure registra senza lotti.</Text>
          ) : righe.map((r, idx) => (
            <View key={idx} style={S.card}>
              <Text style={{ fontWeight: '700', color: COLORS.text }}>{r.prodotto}</Text>
              {r.lotti.length === 0 ? (
                <Text style={{ color: COLORS.danger, marginTop: 6 }}>
                  Nessun lotto disponibile a magazzino per questo ingrediente.
                </Text>
              ) : (
                <>
                  <Selettore label="Lotto (proposto: scadenza più vicina)" elementi={r.lotti}
                    valore={r.lotto_id}
                    etichetta={(l) => `Lotto ${l.numero_lotto || l.id} · scad. ${fmtData(l.data_scadenza)} · ${l.quantita_residua} ${l.unita_misura}`}
                    onChange={(v) => setRiga(idx, 'lotto_id', v)} />
                  <Campo label={`Quantità usata (${r.um})`} value={r.quantita}
                    onChange={(v) => setRiga(idx, 'quantita', v)} keyboardType="numeric" />
                </>
              )}
            </View>
          ))}

          <Bottone testo="Registra produzione" onPress={salva} />
          <Bottone testo="Annulla" ghost onPress={() => setNuova(false)} />
        </ScrollView>
      </Modal>

      {/* Dettaglio produzione */}
      <Modal visible={!!dettaglio} animationType="slide" onRequestClose={() => setDettaglio(null)}>
        {dettaglio && (
          <ScrollView style={S.screen} contentContainerStyle={[S.content, { paddingTop: 50 }]}>
            <Text style={S.h1}>{dettaglio.nome}</Text>
            <View style={S.card}>
              <Text style={S.muted}>Ricetta: {dettaglio.ricetta || '—'}</Text>
              <Text style={S.muted}>Prodotta il {fmtDataOra(dettaglio.data_ora)}</Text>
              <Text style={S.muted}>Quantità: {dettaglio.quantita_prodotta ?? '—'}</Text>
              <Text style={S.muted}>Lotto: {dettaglio.lotto_produzione || '—'}</Text>
              <Text style={S.muted}>Scadenza: {fmtData(dettaglio.data_scadenza)}</Text>
              <Text style={S.muted}>Operatore: {dettaglio.operatore || '—'}</Text>
            </View>

            <Text style={S.h2}>Lotti impiegati</Text>
            <View style={S.card}>
              {dettaglio.lotti.length === 0 ? (
                <Text style={S.muted}>Nessun lotto collegato.</Text>
              ) : dettaglio.lotti.map((l, i) => (
                <View key={i} style={[S.row, { paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600', color: COLORS.text }}>{l.prodotto}</Text>
                    <Text style={S.muted}>Lotto {l.numero_lotto || l.lotto_id} · {l.fornitore}</Text>
                  </View>
                  <Text style={S.muted}>{l.quantita_usata}</Text>
                </View>
              ))}
            </View>

            <Bottone testo="Chiudi" ghost onPress={() => setDettaglio(null)} />
          </ScrollView>
        )}
      </Modal>
    </View>
  );
}
