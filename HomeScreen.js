import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, giorniAllaScadenza } from './theme';
import {
  lottiInScadenza, temperatureDiOggi, listaPuntiControllo, nonConformitaAperte,
  listaAree, sanificazioniOggi,
} from './database';

const SEZIONI = [
  {
    titolo: 'Operativo',
    voci: [
      { titolo: 'Importa fattura PDF', rotta: 'ImportaFattura', desc: 'Carica in magazzino tutte le righe di una fattura', c: COLORS.primary },
      { titolo: 'Ricevi merce', rotta: 'Ricevimento', desc: 'Carico manuale di un singolo prodotto', c: COLORS.primary },
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

const AZIONI = [
  { titolo: 'Importa fattura', sotto: 'PDF → magazzino', rotta: 'ImportaFattura', icona: '📄' },
  { titolo: 'Temperature', sotto: 'Frigoriferi', rotta: 'Temperature', icona: '🌡️' },
  { titolo: 'Scarica merce', sotto: 'Magazzino', rotta: 'Magazzino', icona: '📦' },
  { titolo: 'Pulizie', sotto: 'Sanificazione', rotta: 'Sanificazione', icona: '🧽' },
];

function RigaStato({ colore, titolo, testo, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={[S.row, { paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border }]}>
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colore, marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{titolo}</Text>
        <Text style={S.muted}>{testo}</Text>
      </View>
      <Text style={S.chevron}>›</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen({ navigation }) {
  const [scadenze, setScadenze] = useState([]);
  const [tempFatte, setTempFatte] = useState(0);
  const [puntiTot, setPuntiTot] = useState(0);
  const [ncAperte, setNcAperte] = useState(0);
  const [pulizie, setPulizie] = useState({ fatte: 0, totali: 0 });
  const [menuAperto, setMenuAperto] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setScadenze(await lottiInScadenza(3));
        const t = await temperatureDiOggi();
        setTempFatte(new Set(t.map((x) => x.punto_controllo_id)).size);
        setPuntiTot((await listaPuntiControllo()).length);
        setNcAperte((await nonConformitaAperte()).length);
        const giornaliere = (await listaAree()).filter((a) => a.frequenza === 'giornaliera');
        const fatteOggi = new Set((await sanificazioniOggi()).map((x) => x.area_id));
        setPulizie({ fatte: giornaliere.filter((a) => fatteOggi.has(a.id)).length, totali: giornaliere.length });
      })();
    }, [])
  );

  const tempOk = puntiTot > 0 && tempFatte >= puntiTot;
  const pulizieOk = pulizie.totali > 0 && pulizie.fatte >= pulizie.totali;
  const scaduti = scadenze.filter((l) => giorniAllaScadenza(l.data_scadenza) < 0).length;
  const tuttoOk = (puntiTot === 0 || tempOk) && (pulizie.totali === 0 || pulizieOk) && ncAperte === 0 && scadenze.length === 0;

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <Text style={S.pill}>
        {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
      </Text>
      <Text style={S.h1}>Oggi</Text>

      {/* Da fare oggi: ogni riga porta alla schermata giusta */}
      <View style={[S.card, { marginTop: 10, paddingBottom: 4 }]}>
        <View style={S.row}>
          <Text style={[S.h2, { marginBottom: 6 }]}>Da fare</Text>
          {tuttoOk && <Text style={{ color: COLORS.ok, fontWeight: '800' }}>Tutto in regola ✓</Text>}
        </View>
        <RigaStato
          colore={puntiTot === 0 ? COLORS.muted : tempOk ? COLORS.ok : COLORS.warning}
          titolo="Temperature"
          testo={puntiTot === 0 ? 'Nessun frigorifero configurato'
            : tempOk ? `Registrate tutte (${tempFatte}/${puntiTot})`
            : `Mancano ${puntiTot - tempFatte} su ${puntiTot}`}
          onPress={() => navigation.navigate(puntiTot === 0 ? 'PuntiControllo' : 'Temperature')} />
        <RigaStato
          colore={pulizie.totali === 0 ? COLORS.muted : pulizieOk ? COLORS.ok : COLORS.warning}
          titolo="Pulizie giornaliere"
          testo={pulizie.totali === 0 ? 'Nessuna area giornaliera configurata'
            : pulizieOk ? `Fatte tutte (${pulizie.fatte}/${pulizie.totali})`
            : `Mancano ${pulizie.totali - pulizie.fatte} su ${pulizie.totali}`}
          onPress={() => navigation.navigate('Sanificazione')} />
        <RigaStato
          colore={scaduti ? COLORS.danger : scadenze.length ? COLORS.warning : COLORS.ok}
          titolo="Scadenze"
          testo={scaduti ? `${scaduti} scadut${scaduti > 1 ? 'i' : 'o'} da togliere · ${scadenze.length - scaduti} in scadenza`
            : scadenze.length ? `${scadenze.length} in scadenza entro 3 giorni` : 'Nulla in scadenza nei prossimi 3 giorni'}
          onPress={() => navigation.navigate('Magazzino')} />
        {ncAperte > 0 && (
          <RigaStato colore={COLORS.danger}
            titolo={`${ncAperte} non conformità apert${ncAperte > 1 ? 'e' : 'a'}`}
            testo="Da chiudere con un'azione correttiva"
            onPress={() => navigation.navigate('NonConformita')} />
        )}
      </View>

      {/* Azioni rapide */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {AZIONI.map((a) => (
          <TouchableOpacity key={a.rotta} activeOpacity={0.75} onPress={() => navigation.navigate(a.rotta)}
            style={{
              width: '48.5%', backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 18,
              paddingHorizontal: 14, marginBottom: 10, minHeight: 104, justifyContent: 'space-between', elevation: 3,
            }}>
            <Text style={{ fontSize: 26 }}>{a.icona}</Text>
            <View>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>{a.titolo}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>{a.sotto}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {scadenze.length > 0 && (
        <TouchableOpacity style={[S.card, { marginTop: 4 }]} activeOpacity={0.8}
          onPress={() => navigation.navigate('Magazzino')}>
          <Text style={S.h2}>In scadenza (3 giorni)</Text>
          {scadenze.map((l) => {
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
          })}
        </TouchableOpacity>
      )}

      {/* Tutte le funzioni */}
      <TouchableOpacity onPress={() => setMenuAperto((v) => !v)} activeOpacity={0.7}
        style={[S.tile, { marginTop: 8, justifyContent: 'space-between' }]}>
        <Text style={S.tileTitle}>Tutte le funzioni</Text>
        <Text style={[S.chevron, { transform: [{ rotate: menuAperto ? '90deg' : '0deg' }] }]}>›</Text>
      </TouchableOpacity>

      {menuAperto && SEZIONI.map((sez) => (
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
