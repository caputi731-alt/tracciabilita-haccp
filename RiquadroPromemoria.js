import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Switch, Alert } from 'react-native';
import { S, COLORS } from './theme';
import { Campo, Bottone, Sezione } from './UI';
import {
  impostazioniPromemoria, attivaPromemoria, disattivaPromemoria, notificaDiProva, normalizzaOra, PROMEMORIA,
} from './notifiche';

const TESTI = {
  temperature: {
    titolo: 'Promemoria giornaliero', interruttore: 'Notifica ogni giorno se mancano le temperature',
    nota: 'Toccando la notifica si apre subito l\'inserimento, un frigorifero dopo l\'altro. Se le temperature del giorno sono già registrate, la notifica non arriva.',
  },
  pulizie: {
    titolo: 'Promemoria pulizie', interruttore: 'Notifica ogni giorno se ci sono pulizie da fare',
    nota: 'Toccando la notifica si apre questa schermata. Se oggi non c\'è più niente da pulire, la notifica non arriva.',
  },
  scadenze: {
    titolo: 'Promemoria scadenze', interruttore: 'Notifica quando qualcosa sta per scadere',
    nota: 'Arriva solo nei giorni in cui un lotto scade (o scade l\'indomani), con i nomi dei prodotti. L\'elenco è quello dell\'ultima volta che hai aperto l\'app.',
  },
};

/** Impostazioni di un promemoria: tipo = 'temperature' (schermata Temperature), 'pulizie' (Sanificazione) o 'scadenze' (Magazzino). */
export default function RiquadroPromemoria({ tipo = 'temperature' }) {
  const T = TESTI[tipo];
  const predefinita = PROMEMORIA[tipo].ora;
  const [imp, setImp] = useState(null);
  const [ora, setOra] = useState(predefinita);
  const [errore, setErrore] = useState(null);

  const leggi = useCallback(async () => {
    try {
      const x = await impostazioniPromemoria(tipo);
      setImp(x);
      setOra(x.ora);
    } catch (e) { setImp({ attivo: false, ora: predefinita, permesso: false }); }
  }, [tipo, predefinita]);
  useEffect(() => { leggi(); }, [leggi]);

  if (!imp) return null;
  const acceso = imp.attivo && imp.permesso;

  const accendi = async (oraScelta) => {
    const pulita = normalizzaOra(oraScelta);
    if (!pulita) { setErrore({ testo: `Scrivi l'ora come ${predefinita}` }); return; }
    setErrore(null);
    try {
      const ok = await attivaPromemoria(pulita, tipo);
      if (!ok) {
        Alert.alert('Notifiche non permesse',
          'Per ricevere il promemoria abilita le notifiche in Impostazioni > App > Tenuta Coppa > Notifiche, poi riprova.');
      }
    } catch (e) {
      Alert.alert('Promemoria non attivato', String(e?.message || e));
    }
    await leggi();
  };
  const spegni = async () => { await disattivaPromemoria(tipo); await leggi(); };

  return (
    <Sezione titolo={T.titolo} icona="bell-outline" aperta={!acceso && tipo === 'temperature'}
      riassunto={acceso ? `Attivo: alle ${imp.ora}` : 'Non attivo'}>
      <View style={[S.row, { minHeight: 48 }]}>
        <Text style={{ fontSize: 16, color: COLORS.text, flex: 1, paddingRight: 10 }}>{T.interruttore}</Text>
        <Switch value={acceso} onValueChange={(v) => (v ? accendi(ora) : spegni())}
          trackColor={{ true: COLORS.azione }} accessibilityLabel={T.titolo} />
      </View>
      <Text style={S.muted}>{T.nota}</Text>
      <Campo label="A che ora" value={ora} onChange={setOra} errore={errore}
        keyboardType="numbers-and-punctuation" placeholder={predefinita} />
      <Bottone testo={acceso ? 'Salva nuovo orario' : 'Attiva il promemoria'} onPress={() => accendi(ora)} />
      {acceso && (
        <Bottone testo="Invia una notifica di prova" ghost icona="bell-ring-outline"
          onPress={async () => { await notificaDiProva(tipo); Alert.alert('Prova inviata', 'La notifica arriva tra circa 5 secondi: abbassa la tendina e toccala.'); }} />
      )}
    </Sezione>
  );
}
