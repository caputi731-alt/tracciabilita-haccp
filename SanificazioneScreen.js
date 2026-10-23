/**
 * Sanificazione (proposta A del 20/10/2026, fase 5: pulizie a un tocco). Ogni area ha un cerchio: un tocco salva la pulizia
 * con il prodotto previsto dell'area e nessun operatore (scelta di Luca), con "Annulla" per 10 minuti (anche toccando di nuovo
 * il cerchio verde). Toccando il nome si apre la registrazione con prodotto, operatore e note; la matita modifica l'area.
 * Testi e stato di ogni riga: pulizie.js.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtDataOra, oggiLocale } from './theme';
import { rigaPulizia, riepilogoPulizie } from './pulizie';
import RiquadroPromemoria from './RiquadroPromemoria';
import { aggiornaPromemoria } from './notifiche';
import {
  Campo, Chips, Bottone, conferma, ModaleModifica, useAvviso, VistaModale, useErrori, Vuoto, Icona, Sezione } from './UI';
import {
  areeConStato, salvaArea, eliminaArea,
  registraSanificazione, annullaSanificazione, sanificazioniOggi, sanificazioniRecenti, correggiRecord,
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
  const [reg, setReg] = useState(null); // area su cui registrare la pulizia con prodotto, operatore e note
  const [inModifica, setInModifica] = useState(null);
  const { avviso, mostra } = useAvviso();
  const { errori, segnala, azzera, riepilogo } = useErrori();

  const ricarica = useCallback(() => {
    Promise.all([areeConStato(), sanificazioniOggi(), sanificazioniRecenti()])
      .then(([a, o, r]) => { setAree(a); setOggi(o); setRecenti(r); })
      .catch((e) => Alert.alert('Lettura non riuscita', String(e?.message || e)));
  }, []);
  useFocusEffect(ricarica);

  /* --- gestione aree --- */
  const setA = (k) => (v) => setFormArea((f) => ({ ...f, [k]: v }));
  const salvaLArea = async () => {
    azzera();
    if (!formArea.nome.trim()) return segnala('nome', 'Dai un nome all\'area');
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
    const elenco = [reg];
    const ids = [await registraSanificazione({ area_id: reg.id, prodotto_utilizzato: prodotto, operatore, note, esito: 'conforme' })];
    setReg(null);
    ricarica();
    aggiornaPromemoria(); // se oggi non resta niente da pulire, il promemoria di oggi non arriva
    mostra(elenco.length > 1 ? `Salvate ${elenco.length} pulizie ✓` : `Salvato ✓ Pulizia: ${elenco[0].nome}`, {
      testo: 'Annulla',
      onPress: async () => {
        for (const id of ids) await annullaSanificazione(id);
        ricarica();
        mostra(ids.length > 1 ? 'Pulizie annullate' : 'Pulizia annullata');
      },
    });
  };

  /* --- un tocco: pulizia fatta, con il prodotto previsto e nessun operatore --- */
  const segna = async (elenco) => {
    const ids = [];
    for (const a of elenco) {
      ids.push(await registraSanificazione({
        area_id: a.id, prodotto_utilizzato: a.prodotto_previsto || '', operatore: '', note: '', esito: 'conforme',
      }));
    }
    ricarica();
    aggiornaPromemoria(); // se oggi non resta niente da pulire, il promemoria di oggi non arriva
    mostra(elenco.length > 1 ? `${elenco.length} pulizie segnate come fatte` : `${elenco[0].nome} segnata come fatta`, {
      testo: 'Annulla',
      onPress: async () => {
        try {
          for (const id of ids) await annullaSanificazione(id);
          mostra(ids.length > 1 ? 'Pulizie annullate' : 'Pulizia annullata');
        } catch (e) { Alert.alert('Non annullata', String(e?.message || e)); }
        ricarica(); aggiornaPromemoria();
      },
    });
  };
  const annullaFatta = async (a, fatta) => {
    try {
      await annullaSanificazione(fatta.id);
      mostra(`${a.nome}: pulizia annullata`);
    } catch (e) { Alert.alert('Non annullata', String(e?.message || e)); }
    ricarica(); aggiornaPromemoria();
  };
  const toccaCerchio = (a, fatta, riga) => {
    if (!fatta) return segna([a]);
    if (riga.annullabile) return annullaFatta(a, fatta);
    return mostra(`Già pulita oggi alle ${fmtDataOra(fatta.data_ora).split(' ').pop()}`, { testo: 'Registra ancora', onPress: () => segna([a]) });
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
  const giorno = oggiLocale();
  const righe = aree.map((a) => ({ a, fatta: fattaOggi(a.id) || null }))
    .map((x) => ({ ...x, riga: rigaPulizia(x.a, x.fatta, giorno) }));
  const daFare = righe.filter((x) => x.riga.stato === 'fare');

  return (
    <View style={S.screen}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={S.content}>
        <Text style={S.h1}>Pulizie di oggi</Text>
        <Text style={[S.muted, { marginBottom: 12 }]}>
          {aree.length ? `${riepilogoPulizie(righe.map((x) => x.riga))} · tocca il cerchio quando è fatta` : 'Registra le pulizie delle tue aree.'}
        </Text>

        {aree.length === 0 && (
          <Vuoto icona="spray-bottle" titolo="Nessuna area da pulire"
            testo="Aggiungi le aree della cucina (piani di lavoro, frigoriferi, pavimenti…) col pulsante in basso." />
        )}

        {aree.length > 0 && (
          <Sezione piatta titolo="Aree" icona="spray-bottle" memoria="pulizie_aree" apertaDiPartenza
            riassunto={riepilogoPulizie(righe.map((x) => x.riga))}>
          <View style={[S.card, { padding: 0, overflow: 'hidden' }]}>
            {righe.map(({ a, fatta, riga }, n) => {
              const fatto = riga.stato === 'fatta';
              const fare = riga.stato === 'fare';
              return (
                <View key={a.id} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12, paddingRight: 4, paddingVertical: 10, minHeight: 72,
                  borderTopWidth: n ? 1 : 0, borderTopColor: COLORS.border, backgroundColor: fare ? COLORS.warningSoft : COLORS.card,
                }}>
                  <TouchableOpacity onPress={() => toccaCerchio(a, fatta, riga)} activeOpacity={0.7}
                    accessibilityRole="checkbox" accessibilityState={{ checked: fatto }}
                    accessibilityLabel={fatto ? `${a.nome}: fatta${riga.annullabile ? '. Tocca per annullare' : ''}` : `Segna fatta: ${a.nome}`}
                    style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{
                      width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: fatto ? COLORS.azione : COLORS.card,
                      borderWidth: fatto ? 0 : 2, borderStyle: fare || fatto ? 'solid' : 'dashed',
                      borderColor: fare ? COLORS.terra : COLORS.bordoCampo,
                    }}>
                      {fatto && <Icona nome="check-bold" size={22} colore={COLORS.suAzione} />}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => apriReg(a)} activeOpacity={0.7} style={{ flex: 1, minHeight: 48, justifyContent: 'center' }}
                    accessibilityRole="button" accessibilityLabel={`${a.nome}. ${riga.testo}. Tocca per aggiungere prodotto, operatore o note`}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: riga.stato === 'aposto' ? COLORS.muted : COLORS.text }}>{a.nome}</Text>
                    <Text style={{ fontSize: 13, fontWeight: fare ? '600' : '400', color: fare ? COLORS.warning : COLORS.muted }}>{riga.testo}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setFormArea({ ...a })} accessibilityRole="button"
                    accessibilityLabel={`Modifica l'area ${a.nome}`}
                    style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                    <Icona nome="pencil-outline" colore={COLORS.muted} size={20} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
          </Sezione>
        )}

        {daFare.length > 1 && (
          <Bottone testo={`Segna fatte tutte le ${daFare.length} da fare`} icona="check-all" ghost onPress={() => segna(daFare.map((x) => x.a))} />
        )}

        {aree.length > 0 && (
          <Text style={[S.muted, { fontSize: 13, textAlign: 'center', marginTop: 10 }]}>
            Tocca il nome per aggiungere prodotto, operatore o note · tocca un'ultima registrazione per correggerla
          </Text>
        )}

        {recenti.length > 0 && (
          <Sezione titolo="Ultime registrazioni" icona="history" memoria="pulizie_ultime"
            riassunto={`${recenti.length} registrazioni · tocca per correggere`}>
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
                    {r.prodotto_utilizzato || ''}  <Text style={{ color: COLORS.azione, fontWeight: '700' }}>✎</Text>
                  </Text>
                </TouchableOpacity>
              ))}
          </Sezione>
        )}
        {aree.length > 0 && <RiquadroPromemoria tipo="pulizie" />}
      </ScrollView>

      <View style={{ padding: 16, paddingTop: 0 }}>
        <Bottone testo="+ Nuova area di pulizia" onPress={() => setFormArea({ ...AREA_VUOTA })} />
      </View>

      {/* Modale gestione area */}
      <Modal visible={!!formArea} animationType="slide" onRequestClose={() => setFormArea(null)}>
        {formArea && (
          <VistaModale>
            <Text style={S.h1}>{formArea.id ? 'Modifica area' : 'Nuova area'}</Text>
            <Campo label="Nome area *" value={formArea.nome} onChange={setA('nome')} errore={errori.nome}
              placeholder="es. Piano di lavoro, Cappa, Bagno" />
            <Chips label="Frequenza" opzioni={FREQUENZE} valore={formArea.frequenza}
              onChange={setA('frequenza')} />
            <Campo label="Prodotto previsto" value={formArea.prodotto_previsto}
              onChange={setA('prodotto_previsto')} placeholder="es. sgrassatore, sanificante" />
            <Campo label="Procedura" value={formArea.procedura} onChange={setA('procedura')} multiline />
            {riepilogo}
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
