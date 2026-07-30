import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtData, giorniAllaScadenza } from './theme';
import { Campo, Bottone, Chips } from './UI';
import { listaLotti, registraScarico, query } from './database';

export default function MagazzinoScreen() {
  const [lotti, setLotti] = useState([]);
  const [cerca, setCerca] = useState('');
  const [sel, setSel] = useState(null);
  const [qta, setQta] = useState('');
  const [causale, setCausale] = useState('consumo');
  const [storico, setStorico] = useState([]);

  const ricarica = useCallback(() => { listaLotti(cerca).then(setLotti); }, [cerca]);
  useFocusEffect(ricarica);
  React.useEffect(() => { ricarica(); }, [cerca]);

  const apri = async (l) => {
    setSel(l);
    setQta('');
    setCausale('consumo');
    setStorico(await query(
      'SELECT * FROM movimenti WHERE lotto_id = ? ORDER BY data_ora DESC', [l.id]));
  };

  const scarica = async () => {
    const n = Number(qta);
    if (!n || n <= 0) return Alert.alert('Quantità non valida', 'Inserisci un numero maggiore di zero.');
    if (n > sel.quantita_residua) {
      return Alert.alert('Quantità eccessiva',
        `In magazzino ci sono ${sel.quantita_residua} ${sel.unita_misura}.`);
    }
    await registraScarico(sel.id, n, causale);
    setSel(null);
    ricarica();
  };

  const colore = (l) => {
    const g = giorniAllaScadenza(l.data_scadenza);
    if (g === null) return COLORS.border;
    if (g < 0) return COLORS.danger;
    if (g <= 3) return COLORS.warning;
    return COLORS.ok;
  };

  return (
    <View style={S.screen}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <TextInput style={S.input} placeholder="Cerca prodotto o lotto…" value={cerca}
          onChangeText={setCerca} placeholderTextColor="#9CA3AF" />
      </View>

      <ScrollView contentContainerStyle={S.content}>
        {lotti.length === 0 && (
          <Text style={S.empty}>Nessun lotto in magazzino.</Text>
        )}
        {lotti.map((l) => {
          const g = giorniAllaScadenza(l.data_scadenza);
          return (
            <TouchableOpacity key={l.id} onPress={() => apri(l)}
              style={[S.card, { borderLeftWidth: 4, borderLeftColor: colore(l) }]}>
              <Text style={{ fontSize: 16, fontWeight: '700' }}>{l.prodotto}</Text>
              <Text style={S.muted}>
                {l.quantita_residua} {l.unita_misura} · lotto {l.numero_lotto || '—'}
              </Text>
              <Text style={S.muted}>{l.fornitore} · DDT {l.ddt_numero || '—'}</Text>
              <Text style={{ marginTop: 4, color: colore(l), fontWeight: '600' }}>
                Scadenza {fmtData(l.data_scadenza)}
                {g !== null && (g < 0 ? ' — SCADUTO' : g <= 3 ? ` — fra ${g}g` : '')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={!!sel} animationType="slide" onRequestClose={() => setSel(null)}>
        {sel && (
          <ScrollView style={S.screen} contentContainerStyle={[S.content, { paddingTop: 50 }]}>
            <Text style={S.h1}>{sel.prodotto}</Text>
            <View style={S.card}>
              <Text style={S.muted}>Fornitore: {sel.fornitore}</Text>
              <Text style={S.muted}>Lotto: {sel.numero_lotto || '—'}</Text>
              <Text style={S.muted}>DDT {sel.ddt_numero || '—'} del {fmtData(sel.ddt_data)}</Text>
              <Text style={S.muted}>Ricevuto il {fmtData(sel.data_ricevimento)}</Text>
              <Text style={S.muted}>Scadenza: {fmtData(sel.data_scadenza)}</Text>
              <Text style={S.muted}>
                Temperatura al ricevimento: {sel.temperatura_rilevata ?? '—'}°C
              </Text>
              <Text style={{ marginTop: 8, fontSize: 18, fontWeight: '700' }}>
                Giacenza: {sel.quantita_residua} {sel.unita_misura}
              </Text>
            </View>

            <Text style={S.h2}>Registra uscita</Text>
            <View style={S.card}>
              <Campo label="Quantità" value={qta} onChange={setQta} keyboardType="numeric" />
              <Chips label="Causale" opzioni={['consumo', 'scarto', 'reso']}
                valore={causale} onChange={setCausale} />
              <Bottone testo="Registra" onPress={scarica}
                colore={causale === 'consumo' ? undefined : COLORS.danger} />
            </View>

            <Text style={S.h2}>Movimenti</Text>
            <View style={S.card}>
              {storico.map((m) => (
                <View key={m.id} style={[S.row, { paddingVertical: 6 }]}>
                  <Text style={{ fontSize: 14 }}>
                    {m.tipo} · {m.causale || ''}
                  </Text>
                  <Text style={S.muted}>{m.quantita} {sel.unita_misura}</Text>
                </View>
              ))}
            </View>

            <Bottone testo="Chiudi" ghost onPress={() => setSel(null)} />
          </ScrollView>
        )}
      </Modal>
    </View>
  );
}
