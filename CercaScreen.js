/**
 * "Cerca" in tutta l'app (proposta A del 20/10/2026, fase 2): si apre dal pulsante in alto di Cucina, Sala e Altro.
 * Trova prodotti (con giacenza e azioni dirette: Scarica, Etichetta, Lotti), ricette, portate del Menù e sezioni.
 * Senza testo mostra le sezioni usate di recente. La logica sta in cerca.js; qui solo lettura dei dati e disegno.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { S, COLORS, giorniAllaScadenza, numeroPerCampo, fmtData } from './theme';
import { Icona } from './UI';
import { listaProdotti, listaLotti, listaRicette, menuLeggi, leggiPreferenza, salvaPreferenza } from './database';
import {
  prodottiConGiacenza, portateDelMenu, cercaTutto, leggiRecenti, aggiungiRecente, vociRecenti,
} from './cerca';
import { SEZIONI_SUITE } from './sezioni';

export const CHIAVE_RECENTI = 'sezioni_recenti';

/** Ricorda una sezione aperta fra le "usate di recente" (preferenza locale, non va nel backup). */
export async function ricordaSezione(id) {
  try {
    const ora = leggiRecenti(await leggiPreferenza(CHIAVE_RECENTI));
    await salvaPreferenza(CHIAVE_RECENTI, JSON.stringify(aggiungiRecente(ora, id)));
  } catch (e) { /* non indispensabile */ }
}

const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

function Titolo({ children }) {
  return <Text style={[S.sectionTitle, { marginTop: 18 }]}>{children}</Text>;
}

function Etichetta({ testo, tono }) {
  const fondo = tono === 'errore' ? COLORS.dangerSoft : COLORS.terraSoft;
  const tinta = tono === 'errore' ? COLORS.danger : COLORS.terraScuro;
  return (
    <Text style={{ fontSize: 13, fontWeight: '600', color: tinta, backgroundColor: fondo, borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' }}>{testo}</Text>
  );
}

function Azione({ testo, pieno, onPress, etichetta }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={etichetta || testo}
      style={{
        flex: 1, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
        backgroundColor: pieno ? COLORS.azione : COLORS.card, borderWidth: pieno ? 0 : 1, borderColor: COLORS.bordoCampo,
      }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: pieno ? COLORS.suAzione : COLORS.text }}>{testo}</Text>
    </TouchableOpacity>
  );
}

function RigaVoce({ icona, titolo, testo, prima, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${titolo}. ${testo || ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingVertical: 8, gap: 12,
        borderTopWidth: prima ? 0 : 1, borderTopColor: COLORS.border }}>
      <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: COLORS.contenitore, alignItems: 'center', justifyContent: 'center' }}>
        <Icona nome={icona} size={20} colore={COLORS.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600' }}>{titolo}</Text>
        {!!testo && <Text style={{ fontSize: 13, color: COLORS.muted }}>{testo}</Text>}
      </View>
      <Icona nome="chevron-right" size={20} colore={COLORS.muted} />
    </TouchableOpacity>
  );
}

function SchedaProdotto({ p, apri }) {
  const g = giorniAllaScadenza(p.scadenza);
  const quando = g === null ? null : g < 0 ? 'scaduto' : g === 0 ? 'scade oggi' : g === 1 ? 'scade domani' : g <= 3 ? `scade fra ${g} giorni` : null;
  const giacenza = p.lotti.length
    ? `${numeroPerCampo(p.totale)} ${p.unita} · ${plurale(p.lotti.length, 'lotto', 'lotti')}`
    : 'Non in magazzino';
  const trovato = p.lottoTrovato;
  return (
    <View style={[S.card, { gap: 12, marginBottom: 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '700' }}>{p.nome}</Text>
          <Text style={{ fontSize: 14, color: COLORS.muted }}>{[giacenza, p.categoria].filter(Boolean).join(' · ')}</Text>
          {!!trovato && (
            <Text style={{ fontSize: 14, color: COLORS.muted }}>
              Lotto {trovato.numero_lotto}{trovato.data_scadenza ? ` · scade il ${fmtData(trovato.data_scadenza)}` : ''}
            </Text>
          )}
        </View>
        {!!quando && <Etichetta testo={quando} tono={g < 0 ? 'errore' : 'attesa'} />}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {p.lotti.length > 0 && (
          <Azione pieno testo="Scarica" etichetta={`Scarica ${p.nome}`}
            onPress={() => apri('Magazzino', { scarica: p.id, unita: p.unita, t: Date.now() })} />
        )}
        <Azione testo="Etichetta" etichetta={`Etichetta per ${p.nome}`}
          onPress={() => apri('Etichette', { precompila: {
            tipo: 'Apertura', prodotto_id: p.id, nome: p.nome,
            lotto: (trovato || p.lotti[0] || {}).numero_lotto || '', scadenza: (trovato || p.lotti[0] || {}).data_scadenza || '',
          } })} />
        <Azione testo={trovato ? 'Apri lotto' : 'Lotti'} etichetta={trovato ? `Apri il lotto ${trovato.numero_lotto}` : `Lotti di ${p.nome}`}
          onPress={() => (trovato ? apri('Magazzino', { lottoId: trovato.id }) : apri('Magazzino', { cerca: p.nome, t: Date.now() }))} />
      </View>
    </View>
  );
}

export default function CercaScreen({ navigation }) {
  const margini = useSafeAreaInsets();
  const [testo, setTesto] = useState('');
  const [dati, setDati] = useState({ prodotti: [], ricette: [], portate: [] });
  const [recenti, setRecenti] = useState([]);
  const campo = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [prodotti, lotti, ricette, menu, rec] = await Promise.all([
          listaProdotti(), listaLotti(''), listaRicette(), menuLeggi('state'), leggiPreferenza(CHIAVE_RECENTI),
        ]);
        setDati({ prodotti: prodottiConGiacenza(prodotti, lotti), ricette, portate: portateDelMenu(menu) });
        setRecenti(leggiRecenti(rec));
      } catch (e) { /* si cerca almeno fra le sezioni */ }
    })();
  }, []);

  // tasto indietro: prima svuota la ricerca, poi chiude
  useEffect(() => {
    const a = BackHandler.addEventListener('hardwareBackPress', () => {
      if (testo) { setTesto(''); return true; }
      return false;
    });
    return () => a.remove();
  }, [testo]);

  const risultato = useMemo(() => cercaTutto(testo, dati), [testo, dati]);
  const staCercando = testo.trim().length > 0;

  const apri = useCallback((rotta, parametri) => navigation.navigate(rotta, parametri), [navigation]);
  const apriSezione = useCallback((voce) => {
    ricordaSezione(voce.id);
    if (voce.sezione) navigation.navigate('Home', { sezione: voce.sezione, parte: voce.parte || null, t: Date.now() });
    else navigation.navigate(voce.rotta, voce.parametri);
  }, [navigation]);
  const voceMenu = SEZIONI_SUITE.find((s) => s.id === 'menu');

  return (
    <View style={[S.screen, { paddingTop: margini.top }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingTop: 10, paddingBottom: 8 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Chiudi la ricerca"
          style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Icona nome="arrow-left" size={24} />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 50, borderRadius: 25, paddingLeft: 14,
          backgroundColor: COLORS.campo, borderWidth: 2, borderColor: COLORS.azione }}>
          <Icona nome="magnify" size={20} colore={COLORS.muted} />
          <TextInput ref={campo} value={testo} onChangeText={setTesto} autoFocus autoCorrect={false} returnKeyType="search"
            placeholder="Prodotto, lotto, ricetta, sezione…" placeholderTextColor={COLORS.segnaposto}
            accessibilityLabel="Cerca in tutta l'app"
            style={{ flex: 1, fontSize: 17, paddingHorizontal: 10, paddingVertical: 10, color: COLORS.text }} />
          {staCercando && (
            <TouchableOpacity onPress={() => { setTesto(''); if (campo.current) campo.current.focus(); }}
              accessibilityRole="button" accessibilityLabel="Cancella la ricerca"
              style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}>
              <Icona nome="close-circle" size={20} colore={COLORS.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {!staCercando ? (
          <>
            <Titolo>Usate di recente</Titolo>
            {recenti.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {vociRecenti(recenti).map((v) => (
                  <TouchableOpacity key={v.id} onPress={() => apriSezione(v)} activeOpacity={0.8}
                    accessibilityRole="button" accessibilityLabel={v.titolo}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 46, paddingHorizontal: 14,
                      borderRadius: 23, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card }}>
                    <Icona nome={v.icona} size={18} colore={COLORS.primary} />
                    <Text style={{ fontSize: 15 }}>{v.titolo}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={S.muted}>Qui compariranno le sezioni che apri più spesso.</Text>
            )}
            <Text style={[S.muted, { marginTop: 20 }]}>
              Puoi cercare un prodotto ("burrata"), un numero di lotto, una ricetta, una portata del menù o una sezione ("frigo", "fatture", "backup").
            </Text>
          </>
        ) : risultato.totale === 0 ? (
          <Text style={[S.muted, { marginTop: 24 }]}>Niente per "{testo.trim()}". Prova con un'altra parola.</Text>
        ) : (
          <>
            {risultato.prodotti.length > 0 && <Titolo>Prodotti</Titolo>}
            {risultato.prodotti.map((p) => <SchedaProdotto key={p.id} p={p} apri={apri} />)}

            {risultato.ricette.length > 0 && (
              <>
                <Titolo>Ricette</Titolo>
                <View style={[S.card, { paddingVertical: 4 }]}>
                  {risultato.ricette.map((r, i) => (
                    <RigaVoce key={r.id} prima={i === 0} icona="chef-hat" titolo={r.nome} testo={r.categoria || 'Ricetta'}
                      onPress={() => apri('Anagrafiche', { scheda: 'Ricette', ricetta: r.id })} />
                  ))}
                </View>
              </>
            )}

            {risultato.portate.length > 0 && (
              <>
                <Titolo>Portate del menù</Titolo>
                <View style={[S.card, { paddingVertical: 4 }]}>
                  {risultato.portate.map((d, i) => (
                    <RigaVoce key={d.id} prima={i === 0} icona="silverware-variant" titolo={d.nome}
                      testo={[d.categoria, d.ricettaId ? 'ricetta collegata' : ''].filter(Boolean).join(' · ')}
                      onPress={() => (d.ricettaId ? apri('Anagrafiche', { scheda: 'Ricette', ricetta: d.ricettaId }) : apriSezione(voceMenu))} />
                  ))}
                </View>
              </>
            )}

            {risultato.sezioni.length > 0 && (
              <>
                <Titolo>Sezioni</Titolo>
                <View style={[S.card, { paddingVertical: 4 }]}>
                  {risultato.sezioni.map((v, i) => (
                    <RigaVoce key={v.id} prima={i === 0} icona={v.icona} titolo={v.titolo} testo={v.desc} onPress={() => apriSezione(v)} />
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
