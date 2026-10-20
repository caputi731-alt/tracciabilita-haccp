/**
 * Sezione "Altro": tutte le funzioni che non stanno nella barra in basso, più la ricerca di qualsiasi sezione
 * e le sezioni preferite in cima (scelte con la stellina; restano su questo telefono, non vanno nel backup).
 * Elenco, ricerca e preferiti stanno in sezioni.js.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { S, COLORS } from './theme';
import { Icona } from './UI';
import { BUILD } from './build';
import { leggiPreferenza, salvaPreferenza } from './database';
import {
  GRUPPI_SEZIONI, cercaSezioni, leggiPreferiti, cambiaPreferito, vociPreferite, vociDelGruppo,
} from './sezioni';

const CHIAVE_PREFERITI = 'sezioni_preferite';

function Riga({ voce, prima, preferita, onApri, onStella }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', minHeight: 64,
      borderTopWidth: prima ? 0 : 1, borderTopColor: COLORS.border,
    }}>
      <TouchableOpacity onPress={() => onApri(voce)} activeOpacity={0.7}
        accessibilityRole="button" accessibilityLabel={`${voce.titolo}. ${voce.desc}`}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
        <View style={{
          width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primarySoft,
          alignItems: 'center', justifyContent: 'center', marginRight: 14,
        }}>
          <Icona nome={voce.icona} size={22} colore={COLORS.primaryDark} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{voce.titolo}</Text>
          <Text style={{ fontSize: 13, color: COLORS.muted, marginTop: 1 }}>{voce.desc}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onStella(voce)} activeOpacity={0.7}
        accessibilityRole="button" accessibilityState={{ selected: preferita }}
        accessibilityLabel={preferita ? `Togli ${voce.titolo} dai preferiti` : `Aggiungi ${voce.titolo} ai preferiti`}
        style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
        <Icona nome={preferita ? 'star' : 'star-outline'} colore={preferita ? COLORS.terra : COLORS.muted} />
      </TouchableOpacity>
    </View>
  );
}

function Blocco({ titolo, voci, preferiti, onApri, onStella }) {
  return (
    <View>
      {titolo ? <Text style={S.sectionTitle}>{titolo}</Text> : null}
      <View style={[S.card, { paddingVertical: 4, paddingRight: 4 }]}>
        {voci.map((v, i) => (
          <Riga key={v.id} voce={v} prima={i === 0} preferita={preferiti.includes(v.id)} onApri={onApri} onStella={onStella} />
        ))}
      </View>
    </View>
  );
}

export default function AltroScreen({ navigation, suSezione }) {
  const [cerca, setCerca] = useState('');
  const [preferiti, setPreferiti] = useState([]);

  useEffect(() => {
    leggiPreferenza(CHIAVE_PREFERITI).then((t) => setPreferiti(leggiPreferiti(t))).catch(() => {});
  }, []);

  const apri = useCallback((voce) => {
    if (voce.sezione) {
      if (suSezione) suSezione(voce.sezione, voce.parte || null);
    } else {
      navigation.navigate(voce.rotta, voce.parametri);
    }
  }, [navigation, suSezione]);

  const stella = useCallback((voce) => {
    setPreferiti((ora) => {
      const nuovi = cambiaPreferito(ora, voce.id);
      salvaPreferenza(CHIAVE_PREFERITI, JSON.stringify(nuovi)).catch(() => {});
      return nuovi;
    });
  }, []);

  const trovate = cercaSezioni(cerca);
  const staCercando = cerca.trim().length > 0;
  const preferite = vociPreferite(preferiti);

  return (
    <ScrollView style={S.screen} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 16, paddingTop: 20, paddingBottom: 32 }}>
      <Text accessibilityRole="header" style={[S.h1, { marginLeft: 4 }]}>Altro</Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
        <View style={{ position: 'absolute', left: 14, zIndex: 1 }}>
          <Icona nome="magnify" colore={COLORS.muted} />
        </View>
        <TextInput value={cerca} onChangeText={setCerca} placeholder="Cerca: frigo, ricette, backup…"
          placeholderTextColor={COLORS.segnaposto} accessibilityLabel="Cerca una sezione" returnKeyType="search"
          autoCorrect={false} style={[S.input, { flex: 1, paddingLeft: 46, paddingRight: staCercando ? 48 : 14 }]}
          onSubmitEditing={() => { if (trovate.length) apri(trovate[0]); }} />
        {staCercando && (
          <TouchableOpacity onPress={() => setCerca('')} accessibilityRole="button" accessibilityLabel="Cancella la ricerca"
            style={{ position: 'absolute', right: 0, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Icona nome="close-circle" colore={COLORS.muted} />
          </TouchableOpacity>
        )}
      </View>

      {staCercando ? (
        trovate.length
          ? <Blocco titolo={trovate.length === 1 ? '1 sezione trovata' : `${trovate.length} sezioni trovate`}
            voci={trovate} preferiti={preferiti} onApri={apri} onStella={stella} />
          : <Text style={[S.muted, { marginTop: 20, marginLeft: 4 }]}>Nessuna sezione per "{cerca.trim()}". Prova con un'altra parola.</Text>
      ) : (
        <>
          {preferite.length
            ? <Blocco titolo="Preferite" voci={preferite} preferiti={preferiti} onApri={apri} onStella={stella} />
            : <Text style={[S.muted, { fontSize: 13, marginTop: 14, marginLeft: 4 }]}>
              Tocca la stellina accanto a una sezione per tenerla qui in cima.
            </Text>}
          {GRUPPI_SEZIONI.map((g) => (
            <Blocco key={g} titolo={g} voci={vociDelGruppo(g)} preferiti={preferiti} onApri={apri} onStella={stella} />
          ))}
        </>
      )}
      <Text style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: COLORS.muted }}>Versione: build {BUILD}</Text>
    </ScrollView>
  );
}
