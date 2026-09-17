import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtDataOra } from './theme';
import {
  Campo, Chips, Bottone, conferma, ModaleModifica, useAvviso, VistaModale,
} from './UI';
import {
  listaAree, salvaArea, eliminaArea,
  registraSanificazione, sanificazioniOggi, sanificazioniRecenti, correggiRecord,
} from './database';

const CAMPI_PULIZIA = [
  { chiave: 'prodotto_utilizzato', label: 'Prodotto utilizzato', tipo: 'testo' },
  { chiave: 'operatore', label: 'Operatore', tipo: 'testo' },
  { chiave: 'note', label: 'Note', tipo: 'multiline' },
];

const FREQUENZE = ['giornaliera', 'settimanale', 'mensile', 'a fine servizio'];
const AREA_VUOTA = { nome: '', frequenza: 'giornaliera', prodotto_previsto: '', procedura: '' };

export default function SanificazioneScreen() {
  const [aree, setAree] = useState([]);
  const [oggi, setOggi] = useState([]);
  const [recenti, setRecenti] = useState([]);
  const [formArea, setFormArea] = useState(null);
  const [reg, setReg] = useState(null); // area su cui registrare la pulizia
  const [inModifica, setInModifica] = useState(null);
  const { avviso, mostra } = useAvviso();

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
    mostra(`Salvato ✓ Pulizia: ${reg.nome}`);
  };

  const salvaCorrezione = async (cambi) => {
    try {
      const n = await correggiRecord('registro_sanificazione', inModifica.id, cambi);
      setInModifica(null);
      ricarica();
      mostra(n ? 'Registrazione corretta ✓' : 'Nessuna modifica');
    } catch (e) {
      Alert.alert('Correzione non salvata', String(e?.message || e));
    }
  };

  const fattaOggi = (areaId) => oggi.find((o) => o.area_id === areaId);

  return (
    <View style={S.screen}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={S.content}>
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
            Tocca per registrare · tieni premuto per modificare l'area · tocca un'ultima registrazione per correggerla
          </Text>
        )}

        {recenti.length > 0 && (
          <>
            <Text style={[S.h2, { marginTop: 20 }]}>Ultime registrazioni</Text>
            <View style={S.card}>
              {recenti.map((r) => (
                <TouchableOpacity key={r.id} onPress={() => setInModifica(r)}
                  style={[S.row, { paddingVertical: 8 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600' }}>{r.nome || 'Area eliminata'}</Text>
                    <Text style={S.muted}>
                      {fmtDataOra(r.data_ora)}{r.operatore ? ` · ${r.operatore}` : ''}
                    </Text>
                    {!!r.note && <Text style={[S.muted, { fontStyle: 'italic' }]}>{r.note}</Text>}
                  </View>
                  <Text style={S.muted}>
                    {r.prodotto_utilizzato || ''}  <Text style={{ color: COLORS.primary, fontWeight: '700' }}>✎</Text>
                  </Text>
                </TouchableOpacity>
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
          <VistaModale>
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
          </VistaModale>
        )}
      </Modal>

      <ModaleModifica visibile={!!inModifica} titolo="Correggi pulizia"
        sottotitolo={inModifica ? `${inModifica.nome || 'Area eliminata'} · ${fmtDataOra(inModifica.data_ora)}` : ''}
        campi={CAMPI_PULIZIA} record={inModifica} onSalva={salvaCorrezione}
        onChiudi={() => setInModifica(null)} />
      {avviso}

      {/* Modale registrazione pulizia */}
      <Modal visible={!!reg} animationType="slide" onRequestClose={() => setReg(null)}>
        {reg && (
          <VistaModale>
            <Text style={S.h1}>Registra pulizia</Text>
            <Text style={[S.muted, { marginBottom: 12 }]}>{reg.nome}</Text>
            <View style={S.card}>
              <Campo label="Prodotto utilizzato" value={prodotto} onChange={setProdotto} />
              <Campo label="Operatore" value={operatore} onChange={setOperatore} />
              <Campo label="Note" value={note} onChange={setNote} multiline />
              <Bottone testo="Conferma pulizia" onPress={salvaReg} />
              <Bottone testo="Annulla" ghost onPress={() => setReg(null)} />
            </View>
          </VistaModale>
        )}
      </Modal>
    </View>
  );
}
