import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, Alert, TouchableOpacity, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  S, COLORS, fmtData, fmtDataOra, aNumero, numeroPerCampo, oggiLocale, giornoDi,
} from './theme';
import {
  Bottone, useAvviso, Campo, useErrori, Vuoto, Icona, CampoData,
} from './UI';
import {
  listaPuntiControllo, registraTemperatura, temperatureDelGiorno, situazioneTemperature, query,
  modificaTemperatura, annullaTemperatura,
} from './database';
import { aggiornaPromemoria } from './notifiche';
import RiquadroPromemoria from './RiquadroPromemoria';

const GIORNI_BREVI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const nomeGiorno = (iso) => {
  const [a, m, g] = iso.split('-').map(Number);
  return `${GIORNI_BREVI[new Date(a, m - 1, g, 12).getDay()]} ${g}`;
};
const ora = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const gradi = (n) => `${numeroPerCampo(n)}°C`;

export default function TemperatureScreen({ navigation, route }) {
  const [giorno, setGiorno] = useState(route?.params?.giorno || oggiLocale());
  const [punti, setPunti] = useState([]);
  const [valori, setValori] = useState({});
  const [delGiorno, setDelGiorno] = useState([]);
  const [settimana, setSettimana] = useState([]);
  const [storico, setStorico] = useState([]);
  const [inModifica, setInModifica] = useState(null);
  const [nuovoValore, setNuovoValore] = useState('');
  const [sequenza, setSequenza] = useState(null); // { coda: [punti], i, valore, fatte, fuori }
  const { avviso, mostra } = useAvviso();
  const { errori, segnala, azzera } = useErrori();

  const oggi = oggiLocale();
  const passato = giorno < oggi;

  const carica = useCallback(async (g) => {
    try {
      const [p, d, s, st] = await Promise.all([
        listaPuntiControllo(), temperatureDelGiorno(g), situazioneTemperature(7),
        query(
          `SELECT r.*, pc.nome FROM registro_temperature r
           JOIN punti_controllo pc ON pc.id = r.punto_controllo_id
           ORDER BY r.data_ora DESC, r.id DESC LIMIT 30`),
      ]);
      setPunti(p); setDelGiorno(d); setSettimana(s); setStorico(st);
      return { punti: p, delGiorno: d };
    } catch (e) {
      Alert.alert('Lettura non riuscita', String(e?.message || e));
      return { punti: [], delGiorno: [] };
    }
  }, []);
  const ricarica = useCallback(() => carica(giorno), [carica, giorno]);
  useFocusEffect(useCallback(() => { ricarica(); }, [ricarica]));

  const rilevazioni = (puntoId) => delGiorno.filter((o) => o.punto_controllo_id === puntoId);
  const daFare = punti.filter((p) => rilevazioni(p.id).length === 0);

  /** Dopo ogni registrazione: elenco aggiornato e promemoria riprogrammati (oggi non serve più se è tutto fatto). */
  const dopoSalvataggio = async () => { await ricarica(); aggiornaPromemoria(); };

  /* --- apertura dalla notifica: parte subito la sequenza dei frigoriferi mancanti --- */
  const richiesta = route?.params?.daNotifica;
  React.useEffect(() => {
    if (!richiesta) return;
    (async () => {
      const g = oggiLocale();
      setGiorno(g);
      const dati = await carica(g);
      const coda = dati.punti.filter((p) => !dati.delGiorno.some((o) => o.punto_controllo_id === p.id));
      if (coda.length) setSequenza({ coda, i: 0, valore: '', fatte: 0, fuori: [], errore: null });
      else if (dati.punti.length) mostra('Temperature di oggi già registrate ✓');
    })();
  }, [richiesta]);

  /* --- tutte le rilevazioni in sequenza: un numero, Avanti --- */
  const avviaSequenza = () => {
    if (daFare.length) setSequenza({ coda: daFare, i: 0, valore: '', fatte: 0, fuori: [], errore: null });
  };
  const avantiSequenza = async (salta = false) => {
    const sq = sequenza;
    const punto = sq.coda[sq.i];
    let { fatte, fuori } = sq;
    if (!salta) {
      const numero = aNumero(sq.valore);
      if (numero === null) {
        return setSequenza({ ...sq, errore: 'Inserisci la temperatura (es. 3,5), oppure tocca Salta' });
      }
      const r = await registraTemperatura(punto.id, numero, null, passato ? giorno : null);
      fatte += 1;
      if (!r.conforme) fuori = [...fuori, `${punto.nome} ${gradi(numero)}`];
    }
    if (sq.i + 1 < sq.coda.length) {
      setSequenza({ ...sq, i: sq.i + 1, valore: '', fatte, fuori, errore: null });
    } else {
      setSequenza(null);
      await dopoSalvataggio();
      if (fuori.length) {
        Alert.alert('Temperature fuori limite',
          `${fuori.join(', ')}.\n\nÈ stata aperta una non conformità per ciascuna: annota l'azione correttiva.`);
      } else if (fatte) {
        mostra(`Salvate ${fatte} temperature ✓`);
      }
    }
  };

  const registra = async (punto) => {
    const numero = aNumero(valori[punto.id]);
    if (numero === null) {
      return Alert.alert('Valore mancante', `Inserisci la temperatura di ${punto.nome} in numeri, per esempio 3,5.`);
    }
    const { conforme, id, ncId } = await registraTemperatura(punto.id, numero, null, passato ? giorno : null);
    setValori((s) => ({ ...s, [punto.id]: '' }));
    await dopoSalvataggio();
    if (conforme) {
      mostra(`Salvato ✓ ${punto.nome}: ${gradi(numero)}`, {
        testo: 'Annulla',
        onPress: async () => { await annullaTemperatura(id, ncId); await dopoSalvataggio(); mostra('Rilevazione annullata'); },
      });
    } else {
      Alert.alert(
        'Temperatura fuori limite',
        `${punto.nome}: ${gradi(numero)}, fuori dall'intervallo ${punto.temp_min}/${punto.temp_max}°C.\n\n`
        + "È stata aperta una non conformità: intervieni subito e annota l'azione correttiva."
      );
    }
  };

  const apriModifica = (r) => {
    azzera();
    setInModifica(r);
    setNuovoValore(numeroPerCampo(r.temperatura));
  };

  const salvaModifica = async () => {
    azzera();
    const v = aNumero(nuovoValore);
    if (v === null) return segnala('valore', 'Inserisci una temperatura in numeri, es. 3,5');
    const esito = await modificaTemperatura(inModifica.id, v);
    setInModifica(null);
    await dopoSalvataggio();
    if (esito && !esito.conforme) {
      Alert.alert('Temperatura fuori limite',
        `${esito.nome}: ${gradi(v)}, fuori dall'intervallo ${esito.temp_min}/${esito.temp_max}°C.\n\n`
        + 'La non conformità è aperta: annota l\'azione correttiva.');
    } else {
      mostra('Rilevazione corretta ✓ Il valore originale resta nel registro');
    }
  };

  const scegliGiorno = (g) => { setGiorno(g); setValori({}); carica(g); };

  return (
    <View style={S.screen}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={S.content} keyboardShouldPersistTaps="handled">
        <Text style={S.h1}>Registro temperature</Text>
        <Text style={[S.muted, { marginBottom: 10 }]}>
          Puoi registrare più volte al giorno e recuperare i giorni saltati.
        </Text>

        {/* ultimi 7 giorni: si vede subito dove manca qualcosa, un tocco per andarci */}
        {punti.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            {settimana.map((g) => {
              const scelto = g.giorno === giorno;
              const colore = g.fuori ? COLORS.danger : g.completo ? COLORS.ok : COLORS.warning;
              const stato = g.fuori ? 'con valori fuori limite' : g.completo ? 'completo' : g.fatti ? 'incompleto' : 'da registrare';
              return (
                <TouchableOpacity key={g.giorno} onPress={() => scegliGiorno(g.giorno)} activeOpacity={0.75}
                  accessibilityRole="button" accessibilityState={{ selected: scelto }}
                  accessibilityLabel={`${g.giorno === oggi ? 'Oggi' : fmtData(g.giorno)}, ${stato}`}
                  style={{
                    minWidth: 62, minHeight: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                    paddingHorizontal: 8, backgroundColor: scelto ? COLORS.azione : '#fff',
                    borderWidth: 1, borderColor: scelto ? COLORS.azione : COLORS.bordoCampo,
                  }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: scelto ? '#fff' : COLORS.muted }}>
                    {g.giorno === oggi ? 'oggi' : nomeGiorno(g.giorno)}
                  </Text>
                  <Icona size={22} colore={scelto ? '#fff' : colore}
                    nome={g.fuori ? 'alert-circle' : g.completo ? 'check-circle' : g.fatti ? 'circle-half-full' : 'circle-outline'} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
        {punti.length > 0 && (
          <CampoData label="Giorno" value={giorno} facoltativo={false} massimo={oggi}
            onChange={(iso) => scegliGiorno(iso || oggi)} />
        )}

        {passato && (
          <View style={[S.card, { backgroundColor: COLORS.warningSoft, borderColor: COLORS.warning, marginTop: 12 }]}>
            <Text style={{ color: COLORS.warning, fontWeight: '800', fontSize: 15 }}>
              Stai registrando per il {fmtData(giorno)}
            </Text>
            <Text style={S.muted}>
              Nel registro le rilevazioni risulteranno annotate come inserite in ritardo, con la data di oggi.
            </Text>
            <Bottone testo="Torna a oggi" ghost onPress={() => scegliGiorno(oggi)} />
          </View>
        )}

        {punti.length === 0 && (
          <Vuoto icona="fridge-outline" titolo="Nessun frigorifero configurato"
            testo="Aggiungi frigoriferi e congelatori con i loro limiti di temperatura: poi le registrazioni si fanno da qui."
            azione="Configura i frigoriferi"
            onAzione={() => navigation.navigate('Anagrafiche', { scheda: 'Frigoriferi' })} />
        )}

        {daFare.length > 1 && (
          <Bottone testo={`Registra tutti in sequenza (${daFare.length})`} icona="playlist-check" onPress={avviaSequenza} />
        )}

        <View style={{ marginTop: 12 }}>
          {punti.map((p) => {
            const fatte = rilevazioni(p.id);
            const fuori = fatte.some((f) => f.esito !== 'conforme');
            return (
              <View key={p.id} style={[S.card, fatte.length > 0 && {
                borderWidth: 1.5, borderColor: fuori ? COLORS.danger : COLORS.ok,
              }]}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{p.nome}</Text>
                <Text style={S.muted}>Limiti {p.temp_min}°C / {p.temp_max}°C</Text>

                {fatte.map((f) => (
                  <TouchableOpacity key={f.id} onPress={() => apriModifica({ ...f, nome: p.nome })}
                    accessibilityRole="button"
                    accessibilityLabel={`${gradi(f.temperatura)}, ${f.esito}. Tocca per correggere`}
                    style={[S.row, { minHeight: 48, borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 8, paddingTop: 6 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 17, fontWeight: '800', color: f.esito === 'conforme' ? COLORS.ok : COLORS.danger }}>
                        {gradi(f.temperatura)} <Text style={{ fontSize: 14, fontWeight: '600' }}>({f.esito})</Text>
                      </Text>
                      <Text style={S.muted}>{passato ? (f.note || fmtData(giorno)) : `alle ${ora(f.data_ora)}${f.note ? ` · ${f.note}` : ''}`}</Text>
                    </View>
                    <Text style={{ color: COLORS.azione, fontWeight: '700' }}>✎ Correggi</Text>
                  </TouchableOpacity>
                ))}

                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 }}>
                  <TextInput
                    style={[S.input, { flex: 1, minWidth: 0 }]}
                    placeholder={fatte.length ? 'Altra rilevazione °C' : '°C'}
                    accessibilityLabel={`Temperatura di ${p.nome} in gradi`}
                    keyboardType="numbers-and-punctuation"
                    value={valori[p.id] ?? ''}
                    onChangeText={(v) => setValori((s) => ({ ...s, [p.id]: v }))}
                    placeholderTextColor={COLORS.segnaposto}
                  />
                  <View style={{ width: 130, marginTop: -14 }}>
                    <Bottone testo={fatte.length ? 'Aggiungi' : 'Registra'} ghost={fatte.length > 0} onPress={() => registra(p)} />
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {punti.length > 0 && <RiquadroPromemoria />}

        {storico.length > 0 && (
          <>
            <Text style={[S.h2, { marginTop: 20 }]}>Ultime rilevazioni</Text>
            <View style={S.card}>
              {storico.map((r) => (
                <TouchableOpacity key={r.id} onPress={() => apriModifica(r)} accessibilityRole="button"
                  style={[S.row, { paddingVertical: 8, minHeight: 48 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>{r.nome}</Text>
                    <Text style={S.muted}>
                      {r.note && r.note.includes('in ritardo') ? fmtData(giornoDi(r.data_ora)) : fmtDataOra(r.data_ora)}
                    </Text>
                    {!!r.note && <Text style={[S.muted, { fontStyle: 'italic' }]}>{r.note}</Text>}
                  </View>
                  <Text style={{ fontWeight: '700', color: r.esito === 'conforme' ? COLORS.ok : COLORS.danger }}>
                    {gradi(r.temperatura)}  <Text style={{ color: COLORS.azione }}>✎</Text>
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
        const n = aNumero(sequenza.valore);
        return (
          <Modal visible transparent animationType="fade" onRequestClose={() => { setSequenza(null); dopoSalvataggio(); }}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 18 }}>
              <View style={S.card}>
                <Text style={S.muted}>{sequenza.i + 1} di {sequenza.coda.length}{passato ? ` · ${fmtData(giorno)}` : ''}</Text>
                <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 2 }}>{punto.nome}</Text>
                <Text style={S.muted}>Limiti {punto.temp_min}°C / {punto.temp_max}°C</Text>
                <TextInput
                  key={punto.id}
                  style={[S.input, { fontSize: 32, textAlign: 'center', paddingVertical: 14, marginTop: 14 },
                    sequenza.errore && S.inputErrore]}
                  accessibilityLabel={`Temperatura di ${punto.nome} in gradi`}
                  keyboardType="numbers-and-punctuation" autoFocus value={sequenza.valore}
                  onChangeText={(v) => setSequenza((sq) => ({ ...sq, valore: v, errore: null }))}
                  onSubmitEditing={() => avantiSequenza(false)} returnKeyType="next" placeholder="°C"
                  placeholderTextColor={COLORS.segnaposto}
                />
                {n !== null && (n < punto.temp_min || n > punto.temp_max
                  ? <Text style={S.testoErrore}>Fuori dai limiti: verrà aperta una non conformità</Text>
                  : <Text style={{ color: COLORS.ok, fontWeight: '700', marginTop: 5 }}>Nei limiti ✓</Text>)}
                {!!sequenza.errore && <Text style={S.testoErrore}>{sequenza.errore}</Text>}
                <Bottone testo={sequenza.i + 1 < sequenza.coda.length ? 'Salva e avanti' : 'Salva e termina'}
                  icona="check" onPress={() => avantiSequenza(false)} />
                <Bottone testo="Salta questo" ghost onPress={() => avantiSequenza(true)} />
                <Bottone testo="Interrompi" ghost onPress={() => { setSequenza(null); dopoSalvataggio(); }} />
              </View>
            </View>
          </Modal>
        );
      })()}
      {avviso}
    </View>
  );
}
