import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS } from './theme';
import { Campo, Bottone, conferma } from './UI';
import { listaFornitori, salvaFornitore, eliminaFornitore } from './database';

const VUOTO = {
  ragione_sociale: '', partita_iva: '', indirizzo: '', telefono: '',
  email: '', numero_riconoscimento_ce: '', categoria: '', note: '',
};

export default function FornitoriScreen() {
  const [fornitori, setFornitori] = useState([]);
  const [form, setForm] = useState(null);

  const ricarica = useCallback(() => {
    listaFornitori().then(setFornitori);
  }, []);
  useFocusEffect(ricarica);

  const salva = async () => {
    if (!form.ragione_sociale.trim()) {
      return Alert.alert('Dato mancante', 'La ragione sociale è obbligatoria.');
    }
    await salvaFornitore(form);
    setForm(null);
    ricarica();
  };

  const elimina = (f) =>
    conferma('Eliminare il fornitore?',
      `${f.ragione_sociale} non comparirà più negli elenchi. I lotti già registrati restano tracciati.`,
      async () => { await eliminaFornitore(f.id); ricarica(); });

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <View style={S.screen}>
      <ScrollView contentContainerStyle={S.content}>
        {fornitori.length === 0 && (
          <Text style={S.empty}>Nessun fornitore. Aggiungine uno con il pulsante in basso.</Text>
        )}
        {fornitori.map((f) => (
          <TouchableOpacity key={f.id} style={S.card} onLongPress={() => elimina(f)}
            onPress={() => setForm({ ...f })}>
            <Text style={{ fontSize: 16, fontWeight: '700' }}>{f.ragione_sociale}</Text>
            {!!f.categoria && <Text style={S.muted}>{f.categoria}</Text>}
            {!!f.partita_iva && <Text style={S.muted}>P.IVA {f.partita_iva}</Text>}
            {!!f.telefono && <Text style={S.muted}>{f.telefono}</Text>}
          </TouchableOpacity>
        ))}
        {fornitori.length > 0 && (
          <Text style={[S.muted, { textAlign: 'center', marginTop: 8 }]}>
            Tocca per modificare · tieni premuto per eliminare
          </Text>
        )}
      </ScrollView>

      <View style={{ padding: 16, paddingTop: 0 }}>
        <Bottone testo="+ Nuovo fornitore" onPress={() => setForm({ ...VUOTO })} />
      </View>

      <Modal visible={!!form} animationType="slide" onRequestClose={() => setForm(null)}>
        {form && (
          <ScrollView style={S.screen} contentContainerStyle={[S.content, { paddingTop: 50 }]}>
            <Text style={S.h1}>{form.id ? 'Modifica fornitore' : 'Nuovo fornitore'}</Text>
            <Campo label="Ragione sociale *" value={form.ragione_sociale} onChange={set('ragione_sociale')} />
            <Campo label="Categoria merceologica" value={form.categoria} onChange={set('categoria')}
              placeholder="es. Ortofrutta, Carni" />
            <Campo label="Partita IVA" value={form.partita_iva} onChange={set('partita_iva')}
              keyboardType="numeric" />
            <Campo label="Numero riconoscimento CE" value={form.numero_riconoscimento_ce}
              onChange={set('numero_riconoscimento_ce')} placeholder="per prodotti di origine animale" />
            <Campo label="Indirizzo" value={form.indirizzo} onChange={set('indirizzo')} />
            <Campo label="Telefono" value={form.telefono} onChange={set('telefono')} keyboardType="phone-pad" />
            <Campo label="Email" value={form.email} onChange={set('email')} keyboardType="email-address"
              autoCapitalize="none" />
            <Campo label="Note" value={form.note} onChange={set('note')} multiline />
            <Bottone testo="Salva" onPress={salva} />
            <Bottone testo="Annulla" ghost onPress={() => setForm(null)} />
          </ScrollView>
        )}
      </Modal>
    </View>
  );
}
