import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtDataOra } from './theme';
import {
  Campo, Chips, Bottone, conferma, ModaleModifica, useAvviso, VistaModale, useErrori, Vuoto, Icona,
} from './UI';
import {
  listaAree, salvaArea, eliminaArea,
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
  const [reg, setReg] = useState(null); // area su cui registrare la pulizia, oppure { multi: true, aree }
  const [selezione, setSelezione] = useState(null); // null = modalità normale; array di id in selezione multipla
  const [inModifica, setInModifica] = useState(null);
  const { avviso, mostra } = useAvviso();
  const { errori, segnala, azzera, riepilogo } = useErrori();

  const ricarica = useCallback(() => {
    listaAree().then(setAree);
    sanificazioniOggi().then(setOggi);
    sanificazioniRecenti().then(setRecenti);
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
    const elenco = reg.multi ? reg.aree : [reg];
    const ids = [];
    for (const a of elenco) {
      ids.push(await registraSanificazione({
        area_id: a.id,
        prodotto_utilizzato: reg.multi ? (prodotto || a.prodotto_previsto || '') : prodotto,
        operatore, note, esito: 'conforme',
      }));
    }
    setReg(null);
    setSelezione(null);
    ricarica();
    mostra(elenco.length > 1 ? `Salvate ${elenco.length} pulizie ✓` : `Salvato ✓ Pulizia: ${elenco[0].nome}`, {
      testo: 'Annulla',
      onPress: async () => {
        for (const id of ids) await annullaSanificazione(id);
        ricarica();
        mostra(ids.length > 1 ? 'Pulizie annullate' : 'Pulizia annullata');
      },
    });
  };

  const toccaArea = (a) => {
    if (!selezione) return apriReg(a);
    setSelezione((sel) => (sel.includes(a.id) ? sel.filter((x) => x !== a.id) : [...sel, a.id]));
  };
  const registraSelezione = () => {
    const scelte = aree.filter((a) => selezione.includes(a.id));
    if (!scelte.length) return;
    setReg({ multi: true, aree: scelte, nome: `${scelte.length} aree` });
    setProdotto('');
    setOperatore('');
    setNote('');
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
          <Vuoto icona="spray-bottle" titolo="Nessuna area da pulire"
            testo="Aggiungi le aree della cucina (piani di lavoro, frigoriferi, pavimenti…) col pulsante in basso." />
        )}

        {aree.length > 1 && (
          selezione ? (
            <View style={[S.card, { backgroundColor: COLORS.azioneSoft || COLORS.primarySoft }]}>
              <Text style={{ fontWeight: '800', fontSize: 16, color: COLORS.text }}>
                Tocca le aree pulite ({selezione.length} scelte)
              </Text>
              <View style={[S.chipWrap, { marginTop: 8 }]}>
                <TouchableOpacity style={S.chip}
                  onPress={() => setSelezione(aree.filter((a) => !fattaOggi(a.id)).map((a) => a.id))}>
                  <Text style={S.chipText}>Tutte quelle da fare</Text>
                </TouchableOpacity>
              </View>
              <Bottone testo={`Registra ${selezione.length} pulizie`} icona="check-all" onPress={registraSelezione} />
              <Bottone testo="Annulla selezione" ghost onPress={() => setSelezione(null)} />
            </View>
          ) : (
            <Bottone testo="Registra più aree insieme" icona="checkbox-multiple-marked-outline" ghost
              onPress={() => setSelezione([])} />
          )
        )}

        {aree.map((a) => {
          const fatta = fattaOggi(a.id);
          return (
            <TouchableOpacity key={a.id} style={[S.card, fatta && {
              borderLeftWidth: 4, borderLeftColor: COLORS.ok,
            }, selezione && selezione.includes(a.id) && {
              borderWidth: 2, borderColor: COLORS.azione || COLORS.primary,
            }]} onPress={() => toccaArea(a)} onLongPress={() => !selezione && setFormArea({ ...a })}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {!!selezione && (
                  <Icona nome={selezione.includes(a.id) ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    colore={COLORS.azione || COLORS.primary} size={26} style={{ marginRight: 10 }} />
                )}
                <Text style={{ fontSize: 16, fontWeight: '700', flex: 1 }}>{a.nome}</Text>
              </View>
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
                    {r.prodotto_utilizzato || ''}  <Text style={{ color: COLORS.azione, fontWeight: '700' }}>✎</Text>
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
            <Text style={[S.muted, { marginBottom: 12 }]}>
              {reg.multi ? reg.aree.map((a) => a.nome).join(', ') : reg.nome}
            </Text>
            <View style={S.card}>
              <Campo label="Prodotto utilizzato" value={prodotto} onChange={setProdotto}
                placeholder={reg.multi ? 'se vuoto: quello previsto per ogni area' : undefined} />
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
