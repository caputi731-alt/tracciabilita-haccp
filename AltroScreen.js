/** Sezione "Altro": tutte le funzioni che non stanno nella barra in basso. */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { S, COLORS } from './theme';
import { Icona } from './UI';
import { BUILD } from './build';

const GRUPPI = [
  {
    titolo: 'Registri HACCP',
    voci: [
      { titolo: 'Temperature', rotta: 'Temperature', desc: 'Registro giornaliero', icona: 'thermometer' },
      { titolo: 'Sanificazione', rotta: 'Sanificazione', desc: 'Pulizie per area e registro', icona: 'spray-bottle' },
      { titolo: 'Non conformità', rotta: 'NonConformita', desc: 'Apri, gestisci e chiudi', icona: 'alert-outline' },
    ],
  },
  {
    titolo: 'Cucina',
    voci: [
      { titolo: 'Carico merce', rotta: 'CaricoMerce', desc: 'Da fattura PDF o a mano', icona: 'truck-delivery-outline' },
      { titolo: 'Eventi', rotta: 'Eventi', desc: 'Fabbisogno e costo dei menù in calendario', icona: 'calendar-star' },
      { titolo: 'Produzioni', rotta: 'Produzioni', desc: 'Prepara un piatto e collega i lotti', icona: 'pot-steam-outline' },
      { titolo: 'Etichette', rotta: 'Etichette', desc: 'Apertura, congelamento, produzione', icona: 'tag-outline' },
    ],
  },
  {
    titolo: 'Archivio e documenti',
    voci: [
      { titolo: 'Anagrafiche', rotta: 'Anagrafiche', desc: 'Prodotti, fornitori, ricette, frigoriferi', icona: 'book-open-variant' },
      { titolo: 'Documenti e dati', rotta: 'Documenti', desc: 'Registri PDF, dati attività e backup', icona: 'folder-outline' },
    ],
  },
];

export default function AltroScreen({ navigation }) {
  return (
    <ScrollView style={S.screen} contentContainerStyle={{ padding: 16, paddingTop: 20, paddingBottom: 32 }}>
      <Text accessibilityRole="header" style={[S.h1, { marginLeft: 4 }]}>Altro</Text>
      {GRUPPI.map((g) => (
        <View key={g.titolo}>
          <Text style={S.sectionTitle}>{g.titolo}</Text>
          <View style={[S.card, { paddingVertical: 4 }]}>
            {g.voci.map((v, i) => (
              <TouchableOpacity key={v.rotta} onPress={() => navigation.navigate(v.rotta)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={`${v.titolo}. ${v.desc}`}
                style={{
                  flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingVertical: 10,
                  borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.border,
                }}>
                <View style={{
                  width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primarySoft,
                  alignItems: 'center', justifyContent: 'center', marginRight: 14,
                }}>
                  <Icona nome={v.icona} size={22} colore={COLORS.primaryDark} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{v.titolo}</Text>
                  <Text style={{ fontSize: 13, color: COLORS.muted, marginTop: 1 }}>{v.desc}</Text>
                </View>
                <Icona nome="chevron-right" colore={COLORS.muted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
      <Text style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: COLORS.muted }}>Versione: build {BUILD}</Text>
    </ScrollView>
  );
}
