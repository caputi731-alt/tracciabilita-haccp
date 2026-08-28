import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtDataOra } from './theme';
import { Campo, Chips, Bottone } from './UI';
import { tutteNonConformita, chiudiNonConformita, aggiungiNonConformita } from './database';

const ORIGINI = ['temperatura', 'ricevimento', 'sanificazione', 'infestanti', 'altro'];

export default function NonConformitaScreen() {
  const [lista, setLista] = useState([]);
  const [sel, setSel] = useState(null);       // NC da chiudere
  const [azione, setAzione] = useState('');
  const [nuova, setNuova] = useState(null);    // form nuova NC

  const ricarica = useCallback(() => { tutteNonConformita().then(setLista); }, []);
  useFocusEffect(ricarica);

  const aperte = lista.filter((n) => n.stato === 'aperta');
  const chiuse = lista.filter((n) => n.stato !== 'aperta');

  const chiudi = async () => {
    if (!azione.trim()) return Alert.alert('Azione mancante', 'Descrivi l\'azione correttiva.');
    await chiudiNonConformita(sel.id, azione);
    setSel(null); setAzione('');
    ricarica();
  };

  const setN = (k) => (v) => setNuova((f) => ({ ...f, [k]: v }));
  const salvaNuova = async () => {
    if (!nuova.descrizione?.trim()) return Alert.alert('Dato mancante', 'Descrivi la non conformità.');
    await aggiungiNonConformita(nuova);
    setNuova(null);
    ricarica();
  };

  const Card = ({ n }) => (
    <TouchableOpacity
      style={[S.card, { borderLeftWidth: 4, borderLeftColor: n.stato === 'aperta' ? COLORS.danger : COLORS.ok }]}
      onPress={() => n.stato === 'aperta' && setSel(n)}
    >
      <View style={S.row}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: n.stato === 'aperta' ? COLORS.danger : COLORS.ok }}>
          {n.stato === 'aperta' ? 'APERTA' : 'CHIUSA'}
        </Text>
        <Text style={S.muted}>{fmtDataOra(n.data_ora)}</Text>
      </View>
      <Text style={{ fontSize: 15, marginTop: 4 }}>{n.descrizione}</Text>
      <Text style={[S.muted, { marginTop: 2 }]}>Origine: {n.origine}</Text>
      {!!n.azione_correttiva && (
        <Text style={[S.muted, { marginTop: 4 }]}>Azione: {n.azione_correttiva}</Text>
      )}
      {n.stato === 'aperta' && (
        <Text style={{ color: COLORS.primary, fontWeight: '600', marginTop: 6 }}>
          Tocca per chiudere con azione correttiva
        </Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={S.screen}>
      <ScrollView contentContainerStyle={S.content}>
        <Text style={S.h1}>Non conformità</Text>

        <Text style={[S.h2, { marginTop: 8 }]}>Aperte ({aperte.length})</Text>
        {aperte.length === 0 ? (
          <Text style={S.muted}>Nessuna non conformità aperta. Bene così.</Text>
        ) : aperte.map((n) => <Card key={n.id} n={n} />)}

        {chiuse.length > 0 && (
          <>
            <Text style={[S.h2, { marginTop: 20 }]}>Chiuse ({chiuse.length})</Text>
            {chiuse.map((n) => <Card key={n.id} n={n} />)}
          </>
        )}
      </ScrollView>

      <View style={{ padding: 16, paddingTop: 0 }}>
        <Bottone testo="+ Registra non conformità"
          onPress={() => setNuova({ origine: 'altro', descrizione: '', azione_correttiva: '' })} />
      </View>

      {/* Chiusura */}
      <Modal visible={!!sel} animationType="slide" onRequestClose={() => setSel(null)}>
        {sel && (
          <ScrollView style={S.screen} contentContainerStyle={[S.content, { paddingTop: 50 }]}>
            <Text style={S.h1}>Chiudi non conformità</Text>
            <View style={S.card}>
              <Text style={{ fontSize: 15 }}>{sel.descrizione}</Text>
              <Text style={[S.muted, { marginTop: 4 }]}>Origine: {sel.origine}</Text>
              <Text style={[S.muted, { marginTop: 2 }]}>Aperta il {fmtDataOra(sel.data_ora)}</Text>
            </View>
            <Campo label="Azione correttiva adottata *" value={azione} onChange={setAzione} multiline
              placeholder="Cosa hai fatto per risolvere e prevenire" />
            <Bottone testo="Chiudi la non conformità" onPress={chiudi} />
            <Bottone testo="Annulla" ghost onPress={() => { setSel(null); setAzione(''); }} />
          </ScrollView>
        )}
      </Modal>

      {/* Nuova */}
      <Modal visible={!!nuova} animationType="slide" onRequestClose={() => setNuova(null)}>
        {nuova && (
          <ScrollView style={S.screen} contentContainerStyle={[S.content, { paddingTop: 50 }]}>
            <Text style={S.h1}>Nuova non conformità</Text>
            <View style={S.card}>
              <Chips label="Origine" opzioni={ORIGINI} valore={nuova.origine} onChange={setN('origine')} />
              <Campo label="Descrizione *" value={nuova.descrizione} onChange={setN('descrizione')} multiline
                placeholder="Cosa è successo" />
              <Campo label="Azione correttiva (se già risolta)" value={nuova.azione_correttiva}
                onChange={setN('azione_correttiva')} multiline
                placeholder="Lascia vuoto per tenerla aperta" />
              <Bottone testo="Salva" onPress={salvaNuova} />
              <Bottone testo="Annulla" ghost onPress={() => setNuova(null)} />
            </View>
          </ScrollView>
        )}
      </Modal>
    </View>
  );
}
