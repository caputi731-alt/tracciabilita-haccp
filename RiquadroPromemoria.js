import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Switch, Alert } from 'react-native';
import { S, COLORS } from './theme';
import { Campo, Bottone, Sezione } from './UI';
import {
  impostazioniPromemoria, attivaPromemoria, disattivaPromemoria, notificaDiProva, normalizzaOra, ORA_PREDEFINITA,
} from './notifiche';

/** Impostazioni del promemoria giornaliero delle temperature (dentro la schermata Temperature). */
export default function RiquadroPromemoria() {
  const [imp, setImp] = useState(null);
  const [ora, setOra] = useState(ORA_PREDEFINITA);
  const [errore, setErrore] = useState(null);

  const leggi = useCallback(async () => {
    try {
      const x = await impostazioniPromemoria();
      setImp(x);
      setOra(x.ora);
    } catch (e) { setImp({ attivo: false, ora: ORA_PREDEFINITA, permesso: false }); }
  }, []);
  useEffect(() => { leggi(); }, [leggi]);

  if (!imp) return null;
  const acceso = imp.attivo && imp.permesso;

  const accendi = async (oraScelta) => {
    const pulita = normalizzaOra(oraScelta);
    if (!pulita) { setErrore({ testo: 'Scrivi l\'ora come 10:00' }); return; }
    setErrore(null);
    try {
      const ok = await attivaPromemoria(pulita);
      if (!ok) {
        Alert.alert('Notifiche non permesse',
          'Per ricevere il promemoria abilita le notifiche in Impostazioni > App > Tracciabilità HACCP > Notifiche, poi riprova.');
      }
    } catch (e) {
      Alert.alert('Promemoria non attivato', String(e?.message || e));
    }
    await leggi();
  };
  const spegni = async () => { await disattivaPromemoria(); await leggi(); };

  return (
    <Sezione titolo="Promemoria giornaliero" icona="bell-outline" aperta={!acceso}
      riassunto={acceso ? `Attivo: ogni giorno alle ${imp.ora}` : 'Non attivo'}>
      <View style={[S.row, { minHeight: 48 }]}>
        <Text style={{ fontSize: 16, color: COLORS.text, flex: 1, paddingRight: 10 }}>
          Notifica ogni giorno se mancano le temperature
        </Text>
        <Switch value={acceso} onValueChange={(v) => (v ? accendi(ora) : spegni())}
          trackColor={{ true: COLORS.azione }} accessibilityLabel="Promemoria giornaliero delle temperature" />
      </View>
      <Text style={S.muted}>
        Toccando la notifica si apre subito l'inserimento, un frigorifero dopo l'altro. Se le temperature
        del giorno sono già registrate, la notifica non arriva.
      </Text>
      <Campo label="A che ora" value={ora} onChange={setOra} errore={errore}
        keyboardType="numbers-and-punctuation" placeholder="10:00" />
      <Bottone testo={acceso ? 'Salva nuovo orario' : 'Attiva il promemoria'} onPress={() => accendi(ora)} />
      {acceso && (
        <Bottone testo="Invia una notifica di prova" ghost icona="bell-ring-outline"
          onPress={async () => { await notificaDiProva(); Alert.alert('Prova inviata', 'La notifica arriva tra circa 5 secondi: abbassa la tendina e toccala.'); }} />
      )}
    </Sezione>
  );
}
