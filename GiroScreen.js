/**
 * Giro di controllo guidato: le temperature e le pulizie che mancano oggi, una alla volta, e in fondo le scadenze.
 * Ogni passo si salva subito con le stesse funzioni delle schermate Temperature e Sanificazione; l'elenco dei passi è in giro.js.
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { S, COLORS, aNumero, fmtData, oggiLocale, piuGiorni } from './theme';
import { Bottone, Icona, Vuoto, Caricamento } from './UI';
import {
  listaPuntiControllo, temperatureDiOggi, areeConStato, lottiInScadenza,
  registraTemperatura, registraSanificazione, annullaTemperatura, annullaSanificazione,
} from './database';
import { passiGiro } from './giro';
import { aggiornaPromemoria } from './notifiche';

const gradi = (n) => `${String(n).replace('.', ',')}°C`;
const QUANDO = { scaduto: 'scaduto', oggi: 'scade oggi', domani: 'scade domani' };

export default function GiroScreen({ navigation }) {
  const [passi, setPassi] = useState(null);
  const [i, setI] = useState(0);
  const [valore, setValore] = useState('');
  const [errore, setErrore] = useState(null);
  const [esito, setEsito] = useState({ temperature: 0, pulizie: 0, saltati: 0, fuori: [] });
  const [ultimo, setUltimo] = useState(null); // ultima registrazione fatta, per poterla correggere subito
  const campo = useRef(null);

  useEffect(() => {
    (async () => {
      const oggi = oggiLocale();
      try {
        setPassi(passiGiro({
          punti: await listaPuntiControllo(), temperatureOggi: await temperatureDiOggi(), aree: await areeConStato(),
          lotti: await lottiInScadenza(1), oggi, domani: piuGiorni(oggi, 1),
        }));
      } catch (e) { setPassi([]); }
    })();
    return () => { aggiornaPromemoria(); };
  }, []);

  if (!passi) return <View style={S.screen}><View style={S.content}><Caricamento /></View></View>;

  const finito = i >= passi.length;
  const passo = passi[i];
  const avanti = (cambi = {}, registrato = null) => {
    setEsito((e) => ({ ...e, ...cambi }));
    setUltimo(registrato);
    setValore('');
    setErrore(null);
    setI((n) => n + 1);
  };

  const salvaTemperatura = async () => {
    const numero = aNumero(valore);
    if (numero === null) { setErrore('Scrivi la temperatura in numeri, per esempio 3,5'); return; }
    const r = await registraTemperatura(passo.punto.id, numero, null, null);
    avanti({
      temperature: esito.temperature + 1,
      fuori: r.conforme ? esito.fuori : [...esito.fuori, `${passo.punto.nome} ${gradi(numero)}`],
    }, { tipo: 'temperatura', id: r.id, ncId: r.ncId, fuoriLimite: !r.conforme });
  };

  const salvaPulizia = async () => {
    const id = await registraSanificazione({
      area_id: passo.area.id, prodotto_utilizzato: passo.area.prodotto_previsto || '', operatore: '', note: '', esito: 'conforme',
    });
    avanti({ pulizie: esito.pulizie + 1 }, { tipo: 'pulizia', id });
  };

  // toglie l'ultima registrazione e torna al passo precedente (vale subito dopo, come "Annulla" nelle altre schermate)
  const correggi = async () => {
    if (!ultimo) return;
    if (ultimo.tipo === 'temperatura') {
      await annullaTemperatura(ultimo.id, ultimo.ncId);
      setEsito((e) => ({ ...e, temperature: e.temperature - 1, fuori: ultimo.fuoriLimite ? e.fuori.slice(0, -1) : e.fuori }));
    } else {
      await annullaSanificazione(ultimo.id);
      setEsito((e) => ({ ...e, pulizie: e.pulizie - 1 }));
    }
    setUltimo(null);
    setValore('');
    setErrore(null);
    setI((n) => n - 1);
  };

  if (passi.length === 0) {
    return (
      <View style={[S.screen, { justifyContent: 'center' }]}>
        <Vuoto icona="check-circle-outline" titolo="Tutto fatto"
          testo="Oggi non ci sono temperature o pulizie da registrare, né lotti in scadenza." azione="Chiudi" onAzione={() => navigation.goBack()} />
      </View>
    );
  }

  const avanzamento = (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.muted }}>
        {finito ? 'Giro completato' : `Passo ${i + 1} di ${passi.length}`}
      </Text>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: COLORS.contenitore, marginTop: 8, overflow: 'hidden' }}
        accessible accessibilityRole="progressbar" accessibilityLabel={`${Math.min(i, passi.length)} passi su ${passi.length}`}>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: COLORS.azione, width: `${(Math.min(i, passi.length) / passi.length) * 100}%` }} />
      </View>
    </View>
  );

  const correzione = ultimo && (
    <Bottone testo={ultimo.tipo === 'temperatura' ? 'Ho sbagliato la temperatura di prima' : 'Ho sbagliato la pulizia di prima'}
      ghost icona="undo-variant" onPress={correggi} />
  );

  if (finito) {
    return (
      <ScrollView style={S.screen} contentContainerStyle={S.content}>
        {avanzamento}
        <View style={[S.card, { alignItems: 'center', paddingVertical: 28 }]}>
          <Icona nome="check-circle-outline" size={52} colore={COLORS.ok} />
          <Text style={[S.h1, { marginTop: 10, textAlign: 'center' }]}>Giro finito</Text>
          <Text style={[S.muted, { textAlign: 'center' }]}>
            {[esito.temperature ? `${esito.temperature} temperature` : '', esito.pulizie ? `${esito.pulizie} pulizie` : ''].filter(Boolean).join(' e ') || 'Nessuna registrazione'}
            {esito.temperature || esito.pulizie ? ' registrate' : ''}{esito.saltati ? ` · ${esito.saltati} passi saltati` : ''}
          </Text>
        </View>
        {esito.fuori.length > 0 && (
          <View style={[S.card, { borderWidth: 1.5, borderColor: COLORS.danger }]}>
            <Text style={[S.h2, { color: COLORS.danger }]}>Temperature fuori limite</Text>
            <Text style={{ fontSize: 15, color: COLORS.text }}>{esito.fuori.join(', ')}</Text>
            <Text style={[S.muted, { marginTop: 6 }]}>È stata aperta una non conformità per ciascuna: annota l'azione correttiva.</Text>
            <Bottone testo="Apri le non conformità" colore={COLORS.danger} onPress={() => navigation.replace('NonConformita')} />
          </View>
        )}
        {esito.saltati > 0 && (
          <Text style={[S.muted, { textAlign: 'center' }]}>I passi saltati restano da fare: li ritrovi nella Home.</Text>
        )}
        <Bottone testo="Fine" onPress={() => navigation.goBack()} />
        {correzione}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.content} keyboardShouldPersistTaps="handled">
      {avanzamento}

      {passo.tipo === 'temperatura' && (
        <View style={S.card}>
          <Icona nome="thermometer" size={32} colore={COLORS.azione} />
          <Text style={[S.h1, { marginTop: 8 }]}>{passo.punto.nome}</Text>
          <Text style={S.muted}>Temperatura · limiti {passo.punto.temp_min}°C / {passo.punto.temp_max}°C</Text>
          <TextInput ref={campo} key={passo.punto.id} autoFocus value={valore} onChangeText={(v) => { setValore(v); setErrore(null); }}
            keyboardType="decimal-pad" placeholder="°C" placeholderTextColor={COLORS.segnaposto} onSubmitEditing={salvaTemperatura}
            accessibilityLabel={`Temperatura di ${passo.punto.nome}`}
            style={[S.input, { fontSize: 36, fontWeight: '700', textAlign: 'center', paddingVertical: 18, marginTop: 14 }, errore && S.inputErrore]} />
          {!!errore && <Text style={S.testoErrore} accessibilityLiveRegion="polite">{errore}</Text>}
          <Bottone testo="Salva e avanti" icona="check" onPress={salvaTemperatura} />
          <Bottone testo="Salta" ghost onPress={() => avanti({ saltati: esito.saltati + 1 })} />
        </View>
      )}

      {passo.tipo === 'pulizia' && (
        <View style={S.card}>
          <Icona nome="spray-bottle" size={32} colore={COLORS.azione} />
          <Text style={[S.h1, { marginTop: 8 }]}>{passo.area.nome}</Text>
          <Text style={S.muted}>
            Pulizia {passo.area.frequenza || 'giornaliera'}
            {passo.area.ultima ? ` · ultima il ${fmtData(passo.area.ultima)}` : ' · mai registrata'}
            {passo.area.prodotto_previsto ? ` · con ${passo.area.prodotto_previsto}` : ''}
          </Text>
          <Bottone testo="Fatta, avanti" icona="check" onPress={salvaPulizia} />
          <Bottone testo="Salta" ghost onPress={() => avanti({ saltati: esito.saltati + 1 })} />
        </View>
      )}

      {passo.tipo === 'scadenze' && (
        <View style={S.card}>
          <Icona nome="clock-alert-outline" size={32} colore={COLORS.terra} />
          <Text style={[S.h1, { marginTop: 8 }]}>Scadenze da controllare</Text>
          <Text style={[S.muted, { marginBottom: 6 }]}>Usa per primi questi lotti; quelli scaduti vanno scartati dal Magazzino.</Text>
          {passo.lotti.map((l, n) => (
            <View key={l.id} style={{ paddingVertical: 10, borderTopWidth: n ? 1 : 0, borderTopColor: COLORS.border, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{l.prodotto}</Text>
                <Text style={{ fontSize: 14, color: COLORS.muted }}>
                  {l.numero_lotto ? `Lotto ${l.numero_lotto} · ` : ''}{String(l.quantita_residua).replace('.', ',')} {l.unita_misura || ''}
                </Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: l.quando === 'scaduto' ? COLORS.danger : COLORS.warning }}>{QUANDO[l.quando]}</Text>
            </View>
          ))}
          <Bottone testo="Ho controllato" icona="check" onPress={() => avanti()} />
          <Bottone testo="Apri il magazzino" ghost onPress={() => navigation.replace('Magazzino')} />
        </View>
      )}

      {correzione}
    </ScrollView>
  );
}
