import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtData, giorniAllaScadenza } from './theme';
import {
  lottiInScadenza, temperatureDiOggi, listaPuntiControllo, nonConformitaAperte,
} from './database';

const VOCI = [
  { titolo: 'Ricevi merce', rotta: 'Ricevimento', desc: 'Nuovo carico da DDT o fattura' },
  { titolo: 'Temperature', rotta: 'Temperature', desc: 'Registro giornaliero' },
  { titolo: 'Magazzino', rotta: 'Magazzino', desc: 'Lotti disponibili e scarichi' },
  { titolo: 'Prodotti', rotta: 'Prodotti', desc: 'Catalogo e allergeni' },
  { titolo: 'Fornitori', rotta: 'Fornitori', desc: 'Anagrafica fornitori' },
  { titolo: 'Frigoriferi', rotta: 'PuntiControllo', desc: 'Punti di controllo e limiti' },
];

export default function HomeScreen({ navigation }) {
  const [scadenze, setScadenze] = useState([]);
  const [tempFatte, setTempFatte] = useState(0);
  const [puntiTot, setPuntiTot] = useState(0);
  const [ncAperte, setNcAperte] = useState(0);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setScadenze(await lottiInScadenza(3));
        const t = await temperatureDiOggi();
        setTempFatte(new Set(t.map((x) => x.punto_controllo_id)).size);
        setPuntiTot((await listaPuntiControllo()).length);
        setNcAperte((await nonConformitaAperte()).length);
      })();
    }, [])
  );

  const tempOk = puntiTot > 0 && tempFatte >= puntiTot;

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <Text style={S.h1}>Oggi</Text>
      <Text style={[S.muted, { marginBottom: 16 }]}>
        {new Date().toLocaleDateString('it-IT', {
          weekday: 'long', day: 'numeric', month: 'long',
        })}
      </Text>

      {/* Riepilogo controlli */}
      <View style={[S.card, { borderLeftWidth: 4, borderLeftColor: tempOk ? COLORS.ok : COLORS.warning }]}>
        <Text style={S.h2}>Controllo temperature</Text>
        <Text style={S.muted}>
          {puntiTot === 0
            ? 'Nessun frigorifero configurato. Aggiungine uno in "Frigoriferi".'
            : tempOk
            ? `Completato: ${tempFatte} punti su ${puntiTot}.`
            : `Da fare: ${puntiTot - tempFatte} punti su ${puntiTot}.`}
        </Text>
      </View>

      {/* Non conformità */}
      {ncAperte > 0 && (
        <View style={[S.card, { borderLeftWidth: 4, borderLeftColor: COLORS.danger }]}>
          <Text style={[S.h2, { color: COLORS.danger }]}>
            {ncAperte} non conformità aperta{ncAperte > 1 ? 'e' : ''}
          </Text>
          <Text style={S.muted}>Vanno chiuse con un'azione correttiva.</Text>
        </View>
      )}

      {/* Scadenze */}
      <View style={S.card}>
        <Text style={S.h2}>In scadenza (3 giorni)</Text>
        {scadenze.length === 0 ? (
          <Text style={S.muted}>Nessun prodotto in scadenza.</Text>
        ) : (
          scadenze.map((l) => {
            const g = giorniAllaScadenza(l.data_scadenza);
            return (
              <View key={l.id} style={[S.row, { paddingVertical: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600' }}>{l.prodotto}</Text>
                  <Text style={S.muted}>
                    Lotto {l.numero_lotto || '—'} · {l.quantita_residua} {l.unita_misura}
                  </Text>
                </View>
                <Text style={{
                  color: g < 0 ? COLORS.danger : g <= 1 ? COLORS.warning : COLORS.muted,
                  fontWeight: '700',
                }}>
                  {g < 0 ? 'SCADUTO' : g === 0 ? 'oggi' : `${g}g`}
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* Menu */}
      {VOCI.map((v) => (
        <TouchableOpacity key={v.rotta} style={S.card} onPress={() => navigation.navigate(v.rotta)}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: COLORS.primary }}>{v.titolo}</Text>
          <Text style={[S.muted, { marginTop: 2 }]}>{v.desc}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
