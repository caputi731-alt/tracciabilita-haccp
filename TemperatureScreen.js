import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, Alert, TouchableOpacity, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtDataOra } from './theme';
import {
  Bottone, useAvviso, Campo, useErrori, Vuoto, Icona,
} from './UI';
import {
  listaPuntiControllo, registraTemperatura, temperatureDiOggi, query, modificaTemperatura, annullaTemperatura,
} from './database';

export default function TemperatureScreen({ navigation }) {
  const [punti, setPunti] = useState([]);
  const [valori, setValori] = useState({});
  const [oggi, setOggi] = useState([]);
  const [storico, setStorico] = useState([]);
  const [inModifica, setInModifica] = useState(null);
  const [nuovoValore, setNuovoValore] = useState('');
  const [sequenza, setSequenza] = useState(null); // { coda: [punti], i, valore, fatte, fuori }
  const { avviso, mostra } = useAvviso();
  const { errori, segnala, azzera } = useErrori();

  const ricarica = useCallback(() => {
    (async () => {
      setPunti(await listaPuntiControllo());
      setOggi(await temperatureDiOggi());
      setStorico(await query(
        `SELECT r.*, pc.nome FROM registro_temperature r
         JOIN punti_controllo pc ON pc.id = r.punto_controllo_id
         ORDER BY r.data_ora DESC LIMIT 30`));
    })();
  }, []);
  useFocusEffect(ricarica);

  /* --- tutte le rilevazioni in sequenza: un numero, Avanti --- */
  const avviaSequenza = () => {
    const coda = punti.filter((p) => !fattoOggi(p.id));
    if (coda.length) setSequenza({ coda, i: 0, valore: '', fatte: 0, fuori: [], errore: null });
  };
  const avantiSequenza = async (salta = false) => {
    const sq = sequenza;
    const punto = sq.coda[sq.i];
    let { fatte, fuori } = sq;
    if (!salta) {
      const numero = Number(String(sq.valore).replace(',', '.').trim());
      if (sq.valore === '' || Number.isNaN(numero)) {
        return setSequenza({ ...sq, errore: 'Inserisci la temperatura, oppure tocca Salta' });
      }
      const r = await registraTemperatura(punto.id, numero, null);
      fatte += 1;
      if (!r.conforme) fuori = [...fuori, `${punto.nome} ${String(numero).replace('.', ',')}°C`];
    }
    if (sq.i + 1 < sq.coda.length) {
      setSequenza({ ...sq, i: sq.i + 1, valore: '', fatte, fuori, errore: null });
    } else {
      setSequenza(null);
      ricarica();
      if (fuori.length) {
        Alert.alert('Temperature fuori limite',
          `${fuori.join(', ')}.\n\nÈ stata aperta una non conformità per ciascuna: annota l'azione correttiva.`);
      } else {
        mostra(`Salvate ${fatte} temperature ✓`);
      }
    }
  };

  const registra = async (punto) => {
    const v = valori[punto.id];
    const numero = Number(String(v ?? '').replace(',', '.'));
    if (v === undefined || v === '' || Number.isNaN(numero)) {
      return Alert.alert('Valore mancante', `Inserisci la temperatura di ${punto.nome}.`);
    }
    const { conforme, id, ncId } = await registraTemperatura(punto.id, numero, null);
    setValori((s) => ({ ...s, [punto.id]: '' }));
    ricarica();
    if (conforme) {
      mostra(`Salvato ✓ ${punto.nome}: ${String(numero).replace('.', ',')}°C`, {
        testo: 'Annulla',
        onPress: async () => { await annullaTemperatura(id, ncId); ricarica(); mostra('Rilevazione annullata'); },
      });
    }
    if (!conforme) {
      Alert.alert(
        'Temperatura fuori limite',
        `${punto.nome}: ${v}°C, fuori dall'intervallo ${punto.temp_min}/${punto.temp_max}°C.\n\n` +
        "È stata aperta una non conformità: interviene subito e annota l'azione correttiva."
      );
    }
  };

  const apriModifica = (r) => {
    setInModifica(r);
    setNuovoValore(String(r.temperatura));
  };

  const salvaModifica = async () => {
    azzera();
    const v = nuovoValore.replace(',', '.').trim();
    if (v === '' || Number.isNaN(Number(v))) return segnala('valore', 'Inserisci una temperatura in numeri, es. 3,5');
    const esito = await modificaTemperatura(inModifica.id, Number(v));
    setInModifica(null);
    ricarica();
    if (esito && !esito.conforme) {
      Alert.alert('Temperatura fuori limite',
        `${esito.nome}: ${v}°C, fuori dall'intervallo ${esito.temp_min}/${esito.temp_max}°C.\n\n` +
        'La non conformità è aperta: annota l\'azione correttiva.');
    } else {
      mostra('Rilevazione corretta ✓ Il valore originale resta nel registro');
    }
  };

  const fattoOggi = (id) => oggi.find((o) => o.punto_controllo_id === id);

  return (
    <View style={S.screen}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={S.content}>
      <Text style={S.h1}>Registro temperature</Text>
      <Text style={[S.muted, { marginBottom: 16 }]}>Rilevazione giornaliera</Text>

      {punti.length === 0 && (
        <Vuoto icona="fridge-outline" titolo="Nessun frigorifero configurato"
          testo="Aggiungi frigoriferi e congelatori con i loro limiti di temperatura: poi le registrazioni si fanno da qui."
          azione="Configura i frigoriferi"
          onAzione={() => navigation.navigate('Anagrafiche', { scheda: 'Frigoriferi' })} />
      )}

      {punti.filter((p) => !fattoOggi(p.id)).length > 1 && (
        <Bottone testo={`Registra tutti in sequenza (${punti.filter((p) => !fattoOggi(p.id)).length})`}
          icona="playlist-check" onPress={avviaSequenza} />
      )}

      {punti.map((p) => {
        const fatto = fattoOggi(p.id);
        return (
          <View key={p.id} style={[S.card, fatto && {
            borderLeftWidth: 4,
            borderLeftColor: fatto.esito === 'conforme' ? COLORS.ok : COLORS.danger,
          }]}>
            <Text style={{ fontSize: 16, fontWeight: '700' }}>{p.nome}</Text>
            <Text style={S.muted}>Limiti {p.temp_min}°C / {p.temp_max}°C</Text>

            {fatto ? (
              <TouchableOpacity onPress={() => apriModifica({ ...fatto, nome: p.nome })}>
              <Text style={{
                marginTop: 8, fontSize: 16, fontWeight: '700',
                color: fatto.esito === 'conforme' ? COLORS.ok : COLORS.danger,
              }}>
                Rilevato oggi: {fatto.temperatura}°C ({fatto.esito})
              </Text>
              <Text style={{ color: COLORS.azione, fontWeight: '700', marginTop: 4 }}>✎ Modifica</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 }}>
                <TextInput
                  style={[S.input, { flex: 1 }]}
                  placeholder="°C"
                  keyboardType="numbers-and-punctuation"
                  value={valori[p.id] ?? ''}
                  onChangeText={(v) => setValori((s) => ({ ...s, [p.id]: v }))}
                  placeholderTextColor="#9CA3AF"
                />
                <View style={{ width: 130 }}>
                  <Bottone testo="Registra" onPress={() => registra(p)} />
                </View>
              </View>
            )}
          </View>
        );
      })}

      {storico.length > 0 && (
        <>
          <Text style={[S.h2, { marginTop: 20 }]}>Ultime rilevazioni</Text>
          <View style={S.card}>
            {storico.map((r) => (
              <TouchableOpacity key={r.id} onPress={() => apriModifica(r)}
                style={[S.row, { paddingVertical: 7 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600' }}>{r.nome}</Text>
                  <Text style={S.muted}>{fmtDataOra(r.data_ora)}</Text>
                  {!!r.note && <Text style={[S.muted, { fontStyle: 'italic' }]}>{r.note}</Text>}
                </View>
                <Text style={{
                  fontWeight: '700',
                  color: r.esito === 'conforme' ? COLORS.ok : COLORS.danger,
                }}>
                  {r.temperatura}°C  <Text style={{ color: COLORS.azione }}>✎</Text>
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <Modal visible={!!inModifica} transparent animationType="fade"
        onRequestClose={() => setInModifica(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
          <View style={S.card}>
            <Text style={S.h2}>Correggi rilevazione</Text>
            {inModifica && (
              <Text style={[S.muted, { marginBottom: 10 }]}>
                {inModifica.nome} · {fmtDataOra(inModifica.data_ora)}
              </Text>
            )}
            <Campo label="Temperatura (°C)" keyboardType="numbers-and-punctuation"
              value={nuovoValore} onChange={setNuovoValore} errore={errori.valore}
              autoFocus selectTextOnFocus />
            <View style={{ marginTop: 12 }}>
              <Bottone testo="Salva correzione" onPress={salvaModifica} />
              <Bottone testo="Annulla" ghost onPress={() => { azzera(); setInModifica(null); }} />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
    {sequenza && (() => {
        const punto = sequenza.coda[sequenza.i];
        return (
          <Modal visible transparent animationType="fade" onRequestClose={() => { setSequenza(null); ricarica(); }}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 18 }}>
              <View style={S.card}>
                <Text style={S.muted}>{sequenza.i + 1} di {sequenza.coda.length}</Text>
                <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 2 }}>{punto.nome}</Text>
                <Text style={S.muted}>Limiti {punto.temp_min}°C / {punto.temp_max}°C</Text>
                <TextInput
                  key={punto.id}
                  style={[S.input, { fontSize: 32, textAlign: 'center', paddingVertical: 14, marginTop: 14 },
                    sequenza.errore && S.inputErrore]}
                  keyboardType="numbers-and-punctuation" autoFocus value={sequenza.valore}
                  onChangeText={(v) => setSequenza((sq) => ({ ...sq, valore: v, errore: null }))}
                  onSubmitEditing={() => avantiSequenza(false)} returnKeyType="next" placeholder="°C"
                />
                {(() => {
                  const n = Number(String(sequenza.valore).replace(',', '.'));
                  if (sequenza.valore === '' || Number.isNaN(n)) return null;
                  if (n < punto.temp_min || n > punto.temp_max) {
                    return <Text style={S.testoErrore}>Fuori dai limiti: verrà aperta una non conformità</Text>;
                  }
                  return <Text style={{ color: COLORS.ok, fontWeight: '700', marginTop: 5 }}>Nei limiti ✓</Text>;
                })()}
                {!!sequenza.errore && <Text style={S.testoErrore}>{sequenza.errore}</Text>}
                <Bottone testo={sequenza.i + 1 < sequenza.coda.length ? 'Salva e avanti' : 'Salva e termina'}
                  icona="check" onPress={() => avantiSequenza(false)} />
                <Bottone testo="Salta questo" ghost onPress={() => avantiSequenza(true)} />
                <Bottone testo="Interrompi" ghost onPress={() => { setSequenza(null); ricarica(); }} />
              </View>
            </View>
          </Modal>
        );
      })()}
      {avviso}
    </View>
  );
}
