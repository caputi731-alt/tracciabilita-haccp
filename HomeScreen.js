import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, giorniAllaScadenza } from './theme';
import {
  lottiInScadenza, temperatureDiOggi, listaPuntiControllo, nonConformitaAperte,
} from './database';

const SEZIONI = [
  {
    titolo: 'Operativo',
    voci: [
      { titolo: 'Ricevi merce', rotta: 'Ricevimento', desc: 'Nuovo carico da DDT o fattura', c: COLORS.primary },
      { titolo: 'Magazzino', rotta: 'Magazzino', desc: 'Lotti disponibili e scarichi', c: COLORS.primary },
      { titolo: 'Produzioni', rotta: 'Produzioni', desc: 'Prepara un piatto e collega i lotti', c: COLORS.primary },
    ],
  },
  {
    titolo: 'Anagrafiche',
    voci: [
      { titolo: 'Prodotti', rotta: 'Prodotti', desc: 'Catalogo e allergeni', c: COLORS.accent },
      { titolo: 'Fornitori', rotta: 'Fornitori', desc: 'Anagrafica fornitori', c: COLORS.accent },
      { titolo: 'Ricette', rotta: 'Ricette', desc: 'Ingredienti e allergeni calcolati', c: COLORS.accent },
      { titolo: 'Frigoriferi', rotta: 'PuntiControllo', desc: 'Punti di controllo e limiti', c: COLORS.accent },
    ],
  },
  {
    titolo: 'Registri HACCP',
    voci: [
      { titolo: 'Temperature', rotta: 'Temperature', desc: 'Registro giornaliero', c: COLORS.warning },
      { titolo: 'Sanificazione', rotta: 'Sanificazione', desc: 'Pulizie per area e registro', c: COLORS.warning },
      { titolo: 'Non conformità', rotta: 'NonConformita', desc: 'Apri, gestisci e chiudi', c: COLORS.danger },
    ],
  },
  {
    titolo: 'Tracciabilità e documenti',
    voci: [
      { titolo: 'Rintracciabilità', rotta: 'Rintracciabilita', desc: 'Cerca un lotto e la sua storia', c: COLORS.primaryDark },
      { titolo: 'Report ASL', rotta: 'Report', desc: 'Registri PDF stampabili', c: COLORS.primaryDark },
      { titolo: 'Etichette', rotta: 'Etichette', desc: 'Apertura, congelamento, produzione', c: COLORS.primaryDark },
      { titolo: 'Backup e dati', rotta: 'Backup', desc: 'Salvataggio, ripristino, export', c: COLORS.primaryDark },
    ],
  },
];

function Stato({ colore, titolo, testo }) {
  return (
    <View style={[S.card, { borderLeftWidth: 5, borderLeftColor: colore }]}>
      <Text style={S.h2}>{titolo}</Text>
      <Text style={S.muted}>{testo}</Text>
    </View>
  );
}

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
      <Text style={S.pill}>
        {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
      </Text>
      <Text style={S.h1}>Il tuo autocontrollo</Text>

      {/* Dashboard */}
      <View style={{ marginTop: 12 }}>
        <Stato
          colore={puntiTot === 0 ? COLORS.muted : tempOk ? COLORS.ok : COLORS.warning}
          titolo="Controllo temperature"
          testo={
            puntiTot === 0
              ? 'Nessun frigorifero configurato. Aggiungilo in "Frigoriferi".'
              : tempOk
              ? `Completato: ${tempFatte} punti su ${puntiTot}.`
              : `Da fare: ${puntiTot - tempFatte} punti su ${puntiTot}.`
          }
        />

        {ncAperte > 0 && (
          <Stato colore={COLORS.danger} titolo={`${ncAperte} non conformità aperta${ncAperte > 1 ? 'e' : ''}`}
            testo="Vanno chiuse con un'azione correttiva." />
        )}

        <View style={S.card}>
          <Text style={S.h2}>In scadenza (3 giorni)</Text>
          {scadenze.length === 0 ? (
            <Text style={S.muted}>Nessun prodotto in scadenza.</Text>
          ) : (
            scadenze.map((l) => {
              const g = giorniAllaScadenza(l.data_scadenza);
              return (
                <View key={l.id} style={[S.row, { paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}>{l.prodotto}</Text>
                    <Text style={S.muted}>Lotto {l.numero_lotto || '—'} · {l.quantita_residua} {l.unita_misura}</Text>
                  </View>
                  <Text style={{
                    color: g < 0 ? COLORS.danger : g <= 1 ? COLORS.warning : COLORS.muted,
                    fontWeight: '800', fontSize: 14,
                  }}>
                    {g < 0 ? 'SCADUTO' : g === 0 ? 'oggi' : `${g}g`}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </View>

      {/* Menu raggruppato */}
      {SEZIONI.map((sez) => (
        <View key={sez.titolo}>
          <Text style={S.sectionTitle}>{sez.titolo}</Text>
          {sez.voci.map((v) => (
            <TouchableOpacity key={v.rotta} style={S.tile} onPress={() => navigation.navigate(v.rotta)}
              activeOpacity={0.7}>
              <View style={[S.tileAccent, { backgroundColor: v.c }]} />
              <View style={{ flex: 1 }}>
                <Text style={S.tileTitle}>{v.titolo}</Text>
                <Text style={S.tileDesc}>{v.desc}</Text>
              </View>
              <Text style={S.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
