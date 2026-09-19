import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { S, COLORS } from './theme';
import { VistaModale } from './UI';

const SCELTE = [
  {
    icona: '📄', titolo: 'Da fattura PDF', rotta: 'ImportaFattura',
    desc: 'Scegli il PDF del fornitore: l\'app legge tutte le righe, tu controlli e carichi in un colpo solo.',
    consigliato: true,
  },
  {
    icona: '✍️', titolo: 'A mano', rotta: 'Ricevimento',
    desc: 'Un prodotto alla volta, con foto dell\'etichetta e del documento. Per acquisti senza fattura in PDF.',
  },
];

export default function CaricoMerceScreen({ navigation }) {
  return (
    <VistaModale paddingTop={16}>
      <Text style={S.h1}>Carico merce</Text>
      <Text style={[S.muted, { marginBottom: 14 }]}>Come vuoi registrare la merce arrivata?</Text>

      {SCELTE.map((s) => (
        <TouchableOpacity key={s.rotta} activeOpacity={0.8} onPress={() => navigation.navigate(s.rotta)}
          style={[S.card, { borderLeftWidth: 5, borderLeftColor: s.consigliato ? COLORS.primary : COLORS.accent }]}>
          <View style={S.row}>
            <Text style={{ fontSize: 30, marginRight: 12 }}>{s.icona}</Text>
            <View style={{ flex: 1 }}>
              <View style={S.row}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text }}>{s.titolo}</Text>
                {s.consigliato && (
                  <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 12 }}>PIÙ VELOCE</Text>
                )}
              </View>
              <Text style={S.muted}>{s.desc}</Text>
            </View>
            <Text style={S.chevron}>›</Text>
          </View>
        </TouchableOpacity>
      ))}

      <Text style={[S.muted, { marginTop: 10 }]}>
        In entrambi i casi la merce entra in magazzino come lotto, con quantità, unità di misura, colli,
        scadenza e foto dell'etichetta.
      </Text>
    </VistaModale>
  );
}
