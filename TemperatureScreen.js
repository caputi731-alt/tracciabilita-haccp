/**
 * Registro temperature (proposta A del 20/10/2026, fase 4): una riga per frigorifero con il valore del giorno e gli ultimi
 * 7 giorni a pallini, le non conformità di temperatura ancora aperte e, in fondo, "Registra le N mancanti".
 * Toccando una riga (o il pulsante in fondo) si apre il tastierino grande (TastierinoTemperatura.js), che parte dal valore
 * dell'ultima rilevazione prima del giorno scelto. Si possono registrare più rilevazioni al giorno e recuperare i giorni saltati.
 * Le correzioni si fanno dall'elenco "Ultime rilevazioni".
 */
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Alert, TouchableOpacity, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  S, COLORS, fmtData, fmtDataOra, aNumero, numeroPerCampo, oggiLocale, giornoDi, piuGiorni,
} from './theme';
import {
  Bottone, useAvviso, Campo, useErrori, Vuoto, Icona, CampoData, Sezione,
} from './UI';
import {
  listaPuntiControllo, registraTemperatura, temperatureDelGiorno, query, modificaTemperatura, annullaTemperatura,
  ultimeTemperature, temperatureTraGiorni, nonConformitaAperte,
} from './database';
import { aggiornaPromemoria } from './notifiche';
import RiquadroPromemoria from './RiquadroPromemoria';
import TastierinoTemperatura from './TastierinoTemperatura';
import { settimanaPunti, testoDi } from './tastierino';

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const nomeGiorno = (iso) => {
  const [a, m, g] = iso.split('-').map(Number);
  return `${GIORNI[new Date(a, m - 1, g, 12).getDay()]} ${g}`;
};
const ora = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const gradi = (n) => `${testoDi(n)} °C`;
const PALLINO = { ok: 'ok', fuori: 'danger', manca: 'bordoCampo' };

function Pallini({ giorni, scelto }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4, justifyContent: 'flex-end' }}
      accessible accessibilityLabel={`Ultimi 7 giorni: ${giorni.map((g) => (g.stato === 'ok' ? 'nei limiti' : g.stato === 'fuori' ? 'fuori limite' : 'non registrata')).join(', ')}`}>
      {giorni.map((g) => {
        const colore = COLORS[PALLINO[g.stato]];
        const vuoto = g.stato === 'manca' && g.giorno === scelto;
        return (
          <View key={g.giorno} style={{
            width: 9, height: 9, borderRadius: 5,
            backgroundColor: vuoto ? 'transparent' : colore, borderWidth: vuoto ? 2 : 0, borderColor: COLORS.terra,
          }} />
        );
      })}
    </View>
  );
}

export default function TemperatureScreen({ navigation, route }) {
  const margini = useSafeAreaInsets();
  const [giorno, setGiorno] = useState(route?.params?.giorno || oggiLocale());
  const [punti, setPunti] = useState([]);
  const [delGiorno, setDelGiorno] = useState([]);
  const [ultime, setUltime] = useState({});
  const [settimana, setSettimana] = useState({});
  const [ncAperte, setNcAperte] = useState([]);
  const [storico, setStorico] = useState([]);
  const [inModifica, setInModifica] = useState(null);
  const [nuovoValore, setNuovoValore] = useState('');
  const [tastiera, setTastiera] = useState(null); // { coda: [punti], i, fatte, fuori, singolo }
  const { avviso, mostra } = useAvviso();
  const { errori, segnala, azzera } = useErrori();

  const oggi = oggiLocale();
  const passato = giorno < oggi;

  const carica = useCallback(async (g) => {
    try {
      const [p, d, u, sett, nc, st] = await Promise.all([
        listaPuntiControllo(), temperatureDelGiorno(g), ultimeTemperature(g), temperatureTraGiorni(piuGiorni(g, -6), g),
        nonConformitaAperte(),
        query(
          `SELECT r.*, pc.nome FROM registro_temperature r
           JOIN punti_controllo pc ON pc.id = r.punto_controllo_id
           ORDER BY r.data_ora DESC, r.id DESC LIMIT 30`),
      ]);
      setPunti(p); setDelGiorno(d); setUltime(u); setSettimana(settimanaPunti(p, sett, g));
      setNcAperte(nc.filter((n) => n.origine === 'temperatura')); setStorico(st);
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
  const fatti = punti.length - daFare.length;

  /** Dopo ogni registrazione: elenco aggiornato e promemoria riprogrammati (oggi non serve più se è tutto fatto). */
  const dopoSalvataggio = async () => { await ricarica(); aggiornaPromemoria(); };

  /* --- apertura dalla notifica o dal riquadro della Cucina: parte subito la sequenza dei frigoriferi mancanti --- */
  const richiesta = route?.params?.daNotifica;
  React.useEffect(() => {
    if (!richiesta) return;
    (async () => {
      const g = oggiLocale();
      setGiorno(g);
      const dati = await carica(g);
      const coda = dati.punti.filter((p) => !dati.delGiorno.some((o) => o.punto_controllo_id === p.id));
      if (coda.length) setTastiera({ coda, i: 0, fatte: 0, fuori: [] });
      else if (dati.punti.length) mostra('Temperature di oggi già registrate ✓');
    })();
  }, [richiesta]);

  const avviaSequenza = () => { if (daFare.length) setTastiera({ coda: daFare, i: 0, fatte: 0, fuori: [] }); };
  const apriUno = (p) => setTastiera({ coda: [p], i: 0, fatte: 0, fuori: [], singolo: true });

  const chiudiTastiera = async (t) => {
    setTastiera(null);
    await dopoSalvataggio();
    if (t.fuori.length) {
      Alert.alert('Temperature fuori limite',
        `${t.fuori.join(', ')}.\n\nÈ stata aperta una non conformità per ciascuna: intervieni subito e annota l'azione correttiva.`);
    } else if (t.fatte > 1) {
      mostra(`Salvate ${t.fatte} temperature ✓`);
    }
  };

  /** Salva il valore del frigorifero mostrato e passa al successivo (o chiude). */
  const salvaDalTastierino = async (numero) => {
    const t = tastiera;
    const punto = t.coda[t.i];
    const r = await registraTemperatura(punto.id, numero, null, passato ? giorno : null);
    const dopo = { ...t, fatte: t.fatte + 1, fuori: r.conforme ? t.fuori : [...t.fuori, `${punto.nome} ${gradi(numero)}`] };
    if (t.i + 1 < t.coda.length) { setTastiera({ ...dopo, i: t.i + 1 }); return; }
    await chiudiTastiera(dopo);
    if (t.singolo && r.conforme) {
      mostra(`Salvato ✓ ${punto.nome}: ${gradi(numero)}`, {
        testo: 'Annulla',
        onPress: async () => { await annullaTemperatura(r.id, r.ncId); await dopoSalvataggio(); mostra('Rilevazione annullata'); },
      });
    }
  };
  const saltaNelTastierino = () => {
    const t = tastiera;
    if (t.i + 1 < t.coda.length) setTastiera({ ...t, i: t.i + 1 });
    else chiudiTastiera(t);
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

  const scegliGiorno = (g) => { const v = g > oggi ? oggi : g; setGiorno(v); carica(v); };

  const colonne = { flexDirection: 'row', alignItems: 'center', gap: 8 };
  const tPunto = tastiera ? tastiera.coda[tastiera.i] : null;
  const tProssimo = tastiera ? tastiera.coda[tastiera.i + 1] : null;

  return (
    <View style={S.screen}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[S.content, { paddingBottom: daFare.length ? 110 : 44 }]}
        keyboardShouldPersistTaps="handled">

        {/* giorno: frecce per spostarsi, il calendario nella sezione qui sotto */}
        {punti.length > 0 && (
          <View style={[colonne, { justifyContent: 'space-between', marginBottom: 12 }]}>
            <TouchableOpacity onPress={() => scegliGiorno(piuGiorni(giorno, -1))} accessibilityRole="button" accessibilityLabel="Giorno prima"
              style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
                alignItems: 'center', justifyContent: 'center' }}>
              <Icona nome="chevron-left" />
            </TouchableOpacity>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700' }}>
                {giorno === oggi ? `Oggi, ${nomeGiorno(giorno)}` : giorno === piuGiorni(oggi, -1) ? `Ieri, ${nomeGiorno(giorno)}` : `${nomeGiorno(giorno)} · ${fmtData(giorno)}`}
              </Text>
              <Text style={{ fontSize: 13, color: COLORS.muted }}>{fatti} di {punti.length} registrate</Text>
            </View>
            <TouchableOpacity onPress={() => scegliGiorno(piuGiorni(giorno, 1))} disabled={!passato}
              accessibilityRole="button" accessibilityLabel="Giorno dopo" accessibilityState={{ disabled: !passato }}
              style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border,
                backgroundColor: passato ? COLORS.card : COLORS.bg, alignItems: 'center', justifyContent: 'center', opacity: passato ? 1 : 0.4 }}>
              <Icona nome="chevron-right" />
            </TouchableOpacity>
          </View>
        )}

        {passato && (
          <View style={[S.card, { backgroundColor: COLORS.warningSoft, borderColor: COLORS.warning }]}>
            <Text style={{ color: COLORS.warning, fontWeight: '700', fontSize: 15 }}>Stai registrando per il {fmtData(giorno)}</Text>
            <Text style={S.muted}>Nel registro le rilevazioni risulteranno annotate come inserite in ritardo, con la data di oggi.</Text>
            <Bottone testo="Torna a oggi" ghost onPress={() => scegliGiorno(oggi)} />
          </View>
        )}

        {punti.length === 0 && (
          <Vuoto icona="fridge-outline" titolo="Nessun frigorifero configurato"
            testo="Aggiungi frigoriferi e congelatori con i loro limiti di temperatura: poi le registrazioni si fanno da qui."
            azione="Configura i frigoriferi"
            onAzione={() => navigation.navigate('Anagrafiche', { scheda: 'Frigoriferi' })} />
        )}

        {punti.length > 0 && (
          <Sezione piatta titolo="Frigoriferi" icona="fridge-outline" memoria="temp_frigoriferi" apertaDiPartenza
            riassunto={daFare.length ? `${daFare.length} da fare · ${fatti} fatte` : `Tutte registrate (${fatti})`}>
          <View style={[S.card, { padding: 0, overflow: 'hidden' }]}>
            <View style={[colonne, { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border }]}>
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.muted }}>Frigorifero</Text>
              <Text style={{ width: 84, textAlign: 'right', fontSize: 12, fontWeight: '600', color: COLORS.muted }}>{giorno === oggi ? 'Oggi' : 'Quel giorno'}</Text>
              <Text style={{ width: 96, textAlign: 'right', fontSize: 12, fontWeight: '600', color: COLORS.muted }}>Ultimi 7 giorni</Text>
            </View>
            {punti.map((p, n) => {
              const fatte = rilevazioni(p.id);
              const ultima = fatte[0];
              const fuori = fatte.some((f) => f.esito !== 'conforme');
              return (
                <TouchableOpacity key={p.id} onPress={() => apriUno(p)} activeOpacity={0.7} accessibilityRole="button"
                  accessibilityLabel={`${p.nome}. ${ultima ? `${gradi(ultima.temperatura)} alle ${ora(ultima.data_ora)}` : 'da fare'}. Tocca per registrare`}
                  style={[colonne, {
                    paddingHorizontal: 14, paddingVertical: 12, minHeight: 66,
                    borderTopWidth: n ? 1 : 0, borderTopColor: COLORS.border, backgroundColor: ultima ? COLORS.card : COLORS.warningSoft,
                  }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600' }}>{p.nome}</Text>
                    <Text style={{ fontSize: 13, color: COLORS.muted }}>{testoDi(p.temp_min)} / {testoDi(p.temp_max)} °C</Text>
                  </View>
                  <View style={{ width: 84, alignItems: 'flex-end' }}>
                    {ultima ? (
                      <>
                        <Text style={{ fontSize: 17, fontWeight: '700', color: fuori ? COLORS.danger : COLORS.text }}>{testoDi(ultima.temperatura)}°</Text>
                        <Text style={{ fontSize: 12, color: COLORS.muted }}>
                          {passato ? 'in ritardo' : ora(ultima.data_ora)}{fatte.length > 1 ? ` · ${fatte.length}` : ''}
                        </Text>
                      </>
                    ) : <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.warning }}>Da fare</Text>}
                  </View>
                  <View style={{ width: 96 }}><Pallini giorni={settimana[p.id] || []} scelto={giorno} /></View>
                </TouchableOpacity>
              );
            })}
          </View>
          </Sezione>
        )}

        {punti.length > 0 && (
          <View style={[colonne, { flexWrap: 'wrap', gap: 14, paddingHorizontal: 6, marginBottom: 12 }]}>
            {[['ok', 'nei limiti'], ['danger', 'fuori limite'], ['bordoCampo', 'non registrata']].map(([c, t]) => (
              <View key={c} style={[colonne, { gap: 5 }]}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS[c] }} />
                <Text style={{ fontSize: 12, color: COLORS.muted }}>{t}</Text>
              </View>
            ))}
          </View>
        )}

        {ncAperte.slice(0, 3).map((nc) => (
          <View key={nc.id} style={[S.card, colonne, { gap: 12 }]}>
            <Icona nome="alert-circle-outline" colore={COLORS.danger} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600' }} numberOfLines={2}>{nc.descrizione}</Text>
              <Text style={{ fontSize: 13, color: COLORS.muted }}>Non conformità aperta · {fmtData(nc.data_ora)}</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('NonConformita')} accessibilityRole="button"
              accessibilityLabel="Apri le non conformità" style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 }}>
              <Text style={S.link}>Chiudi</Text>
            </TouchableOpacity>
          </View>
        ))}

        {punti.length > 0 && (
          <Sezione titolo="Un altro giorno" icona="calendar-month-outline" riassunto="Recupera un giorno saltato">
            <CampoData label="Giorno" value={giorno} facoltativo={false} massimo={oggi} onChange={(iso) => scegliGiorno(iso || oggi)} />
          </Sezione>
        )}

        {punti.length > 0 && <RiquadroPromemoria />}

        {storico.length > 0 && (
          <Sezione titolo="Ultime rilevazioni" icona="history" memoria="temp_ultime"
            riassunto={`${storico.length} rilevazioni · tocca per correggere`}>
              {storico.map((r) => (
                <TouchableOpacity key={r.id} onPress={() => apriModifica(r)} accessibilityRole="button"
                  accessibilityLabel={`${r.nome}, ${gradi(r.temperatura)}. Tocca per correggere`}
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
          </Sezione>
        )}

        <Modal visible={!!inModifica} transparent animationType="fade" onRequestClose={() => setInModifica(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
            <View style={S.card}>
              <Text style={S.h2}>Correggi rilevazione</Text>
              {inModifica && (
                <Text style={[S.muted, { marginBottom: 10 }]}>{inModifica.nome} · {fmtDataOra(inModifica.data_ora)}</Text>
              )}
              <Campo label="Temperatura (°C)" keyboardType="numbers-and-punctuation"
                value={nuovoValore} onChange={setNuovoValore} errore={errori.valore} autoFocus selectTextOnFocus />
              <View style={{ marginTop: 12 }}>
                <Bottone testo="Salva correzione" onPress={salvaModifica} />
                <Bottone testo="Annulla" ghost onPress={() => { azzera(); setInModifica(null); }} />
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>

      {daFare.length > 0 && !tastiera && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10,
          paddingBottom: 14 + margini.bottom, backgroundColor: COLORS.bg, borderTopWidth: 1, borderTopColor: COLORS.border }}>
          <Bottone testo={daFare.length === 1 ? `Registra ${daFare[0].nome}` : `Registra le ${daFare.length} mancanti`}
            icona="thermometer" onPress={daFare.length === 1 ? () => apriUno(daFare[0]) : avviaSequenza} />
        </View>
      )}

      {/* tastierino a tutto schermo: un frigorifero o tutti quelli mancanti in fila */}
      <Modal visible={!!tPunto} animationType="slide" onRequestClose={() => tastiera && chiudiTastiera(tastiera)}>
        {!!tPunto && (
          <View style={[S.screen, { paddingTop: margini.top }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 8 }}>
              <TouchableOpacity onPress={() => chiudiTastiera(tastiera)} accessibilityRole="button" accessibilityLabel="Chiudi"
                style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                <Icona nome="close" size={24} />
              </TouchableOpacity>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.muted }}>
                {tastiera.singolo ? 'Nuova rilevazione' : `Temperatura ${tastiera.i + 1} di ${tastiera.coda.length}`}
                {passato ? ` · ${fmtData(giorno)}` : ''}
              </Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 + margini.bottom }}>
              <TastierinoTemperatura key={`${tPunto.id}-${tastiera.i}`} punto={tPunto} ultima={ultime[tPunto.id] || null}
                testoSalva={tProssimo ? `Salva e vai a ${tProssimo.nome}` : tastiera.singolo ? 'Salva' : 'Salva e termina'}
                onSalva={salvaDalTastierino} onSalta={tastiera.singolo ? null : saltaNelTastierino} />
            </ScrollView>
          </View>
        )}
      </Modal>
      {avviso}
    </View>
  );
}
