import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtDataOra } from './theme';
import { Campo, Chips, Bottone, conferma } from './UI';
import {
  listaAree, salvaArea, eliminaArea,
  registraSanificazione, sanificazioniOggi, sanificazioniRecenti,
} from './database';

const FREQUENZE = ['giornaliera', 'settimanale', 'mensile', 'a fine servizio'];
const AREA_VUOTA = { nome: '', frequenza: 'giornaliera', prodotto_previsto: '', procedura: '' };

export default function SanificazioneScreen() {
  const [aree, setAree] = useState([]);
  const [oggi, setOggi] = useState([]);
  const [recenti, setRecenti] = useState([]);
  const [formArea, setFormArea] = useState(null);
  const [reg, setReg] = useState(null); // area su cui registrare la pulizia

  const ricarica = useCallback(() => {
    listaAree().then(setAree);
    sanificazioniOggi().then(setOggi);
    sanificazioniRecenti().then(setRecenti);
  }, []);
  useFocusEffect(ricarica);

  /* --- gestione aree --- */
  const setA = (k) => (v) => setFormArea((f) => ({ ...f, [k]: v }));
  const salvaLArea = async () => {
    if (!formArea.nome.trim()) return Alert.alert('Dato mancante', 'Dai un nome all\'area.');
    await salvaArea(formArea);
    setFormArea(null);
    ricarica();
  };
  const elimina = (a) =>
    conferma('Eliminare l\'area?', `${a.nome} non comparirà più. Le registrazioni passate restano.`,
      async () => { await eliminaArea(a.id); ricarica(); });

  /* --- registrazione pulizia --- */
  const [prodotto, setProdotto] = useState('');
  const [operatore, setOperatore] = useState('');
  const [note, setNote] = useState('');
  const apriReg = (a) => {
    setReg(a);
    setProdotto(a.prodotto_previsto || '');
    setOperatore('');
    setNote('');
  };
  const salvaReg = async () => {
    await registraSanificazione({
      area_id: reg.id, prodotto_utilizzato: prodotto, operatore, note, esito: 'conforme',
    });
    setReg(null);
    ricarica();
  };

  const fattaOggi = (areaId) => oggi.find((o) => o.area_id === areaId);

  return (
    <View style={S.screen}>
      <ScrollView contentContainerStyle={S.content}>
        <Text style={S.h1}>Sanificazione</Text>
        <Text style={[S.muted, { marginBottom: 12 }]}>
          Registra le pulizie delle tue aree. Tocca un'area per segnare la pulizia fatta.
        </Text>

        {aree.length === 0 && (
          <Text style={S.empty}>Nessuna area. Aggiungine una col pulsante in basso.</Text>
        )}

        {aree.map((a) => {
          const fatta = fattaOggi(a.id);
          return (
            <TouchableOpacity key={a.id} style={[S.card, fatta && {
              borderLeftWidth: 4, borderLeftColor: COLORS.ok,
            }]} onPress={() => apriReg(a)} onLongPress={() => setFormArea({ ...a })}>
              <Text style={{ fontSize: 16, fontWeight: '700' }}>{a.nome}</Text>
              <Text style={S.muted}>Frequenza: {a.frequenza}{a.prodotto_previsto ? ` · ${a.prodotto_previsto}` : ''}</Text>
              {fatta ? (
                <Text style={{ color: COLORS.ok, fontWeight: '600', marginTop: 4 }}>
                  Pulita oggi alle {fmtDataOra(fatta.data_ora).split(' ').pop()}
                </Text>
              ) : (
                <Text style={{ color: COLORS.warning, fontWeight: '600', marginTop: 4 }}>
                  Da fare — tocca per registrare
                </Text>
              )}
            </TouchableOpacity>
          );
        })}

        {aree.length > 0 && (
          <Text style={[S.muted, { textAlign: 'center', marginTop: 4 }]}>
            Tocca per registrare · tieni premuto per modificare l'area
          </Text>
        )}

        {recenti.length > 0 && (
          <>
            <Text style={[S.h2, { marginTop: 20 }]}>Ultime registrazioni</Text>
            <View style={S.card}>
              {recenti.map((r) => (
                <View key={r.id} style={[S.row, { paddingVertical: 6 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600' }}>{r.nome || 'Area eliminata'}</Text>
                    <Text style={S.muted}>
                      {fmtDataOra(r.data_ora)}{r.operatore ? ` · ${r.operatore}` : ''}
                    </Text>
                  </View>
                  <Text style={S.muted}>{r.prodotto_utilizzato || ''}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View style={{ padding: 16, paddingTop: 0 }}>
        <Bottone testo="+ Nuova area di pulizia" onPress={() => setFormArea({ ...AREA_VUOTA })} />
      </View>

      {/* Modale gestione area */}
      <Modal visible={!!formArea} animationType="slide" onRequestClose={() => setFormArea(null)}>
        {formArea && (
          <ScrollView style={S.screen} contentContainerStyle={[S.content, { paddingTop: 50 }]}>
            <Text style={S.h1}>{formArea.id ? 'Modifica area' : 'Nuova area'}</Text>
            <Campo label="Nome area *" value={formArea.nome} onChange={setA('nome')}
              placeholder="es. Piano di lavoro, Cappa, Bagno" />
            <Chips label="Frequenza" opzioni={FREQUENZE} valore={formArea.frequenza}
              onChange={setA('frequenza')} />
            <Campo label="Prodotto previsto" value={formArea.prodotto_previsto}
              onChange={setA('prodotto_previsto')} placeholder="es. sgrassatore, sanificante" />
            <Campo label="Procedura" value={formArea.procedura} onChange={setA('procedura')} multiline />
            <Bottone testo="Salva" onPress={salvaLArea} />
            {formArea.id && (
              <Bottone testo="Elimina area" ghost colore={COLORS.danger}
                onPress={() => { const a = formArea; setFormArea(null); elimina(a); }} />
            )}
            <Bottone testo="Annulla" ghost onPress={() => setFormArea(null)} />
          </ScrollView>
        )}
      </Modal>

      {/* Modale registrazione pulizia */}
      <Modal visible={!!reg} animationType="slide" onRequestClose={() => setReg(null)}>
        {reg && (
          <ScrollView style={S.screen} contentContainerStyle={[S.content, { paddingTop: 50 }]}>
            <Text style={S.h1}>Registra pulizia</Text>
            <Text style={[S.muted, { marginBottom: 12 }]}>{reg.nome}</Text>
            <View style={S.card}>
              <Campo label="Prodotto utilizzato" value={prodotto} onChange={setProdotto} />
              <Campo label="Operatore" value={operatore} onChange={setOperatore} />
              <Campo label="Note" value={note} onChange={setNote} multiline />
              <Bottone testo="Conferma pulizia" onPress={salvaReg} />
              <Bottone testo="Annulla" ghost onPress={() => setReg(null)} />
            </View>
          </ScrollView>
        )}
      </Modal>
    </View>
  );
}
