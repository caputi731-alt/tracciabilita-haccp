import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtData, fmtDataOra, giorniAllaScadenza, aNumero, numeroPerCampo, arrotonda } from './theme';
import {
  Campo, Bottone, Chips, ModaleModifica, useAvviso, conferma, useFoto, AnteprimaFoto, VistaModale, Segmenti, useErrori, Sezione, Caricamento, Vuoto, Icona,
} from './UI';
import {
  listaLotti, registraScarico, query, correggiRecord, correggiUscita, annullaCarico, impostaFotoLotto,
  lottiBloccati, annullaUscita, cercaLotti, movimentiDiLotto, produzioniDaLotto, impattoLotto, bloccaLotto, sbloccaLotto,
  getImpostazioni, getLotto, lottoScaduto,
} from './database';
import { stampaSchedaLotto } from './schedaLotto';
import RiquadroPromemoria from './RiquadroPromemoria';

const MOTIVI = ['Richiamo del fornitore', 'Allerta sanitaria', 'Sospetta non conformità'];

const coloreStato = (stato) =>
  (stato === 'disponibile' ? COLORS.ok
    : stato === 'bloccato' || stato === 'scartato' ? COLORS.danger : COLORS.muted);

const fmtQ = (n) => (n === null || n === undefined ? '—' : numeroPerCampo(arrotonda(n)));

function Riquadro({ titolo, children }) {
  return (
    <View style={S.card}>
      {!!titolo && <Text style={S.h2}>{titolo}</Text>}
      {children}
    </View>
  );
}

/** Lotti da cui si può scaricare con questa causale: per il consumo quelli scaduti sono esclusi. */
const utilizzabili = (elenco, causale) => (causale === 'consumo' ? elenco.filter((l) => !lottoScaduto(l)) : elenco);

const CAMPI_CARICO = [
  { chiave: 'numero_lotto', label: 'Numero di lotto', tipo: 'testo' },
  { chiave: 'data_scadenza', label: 'Scadenza / TMC', tipo: 'data' },
  { chiave: 'quantita_iniziale', label: 'Quantità ricevuta', tipo: 'numero', obbligatorio: true },
  { chiave: 'colli', label: 'Colli', tipo: 'intero' },
  { chiave: 'ddt_numero', label: 'N. DDT / fattura', tipo: 'testo' },
  { chiave: 'ddt_data', label: 'Data documento', tipo: 'data' },
  { chiave: 'temperatura_rilevata', label: 'Temperatura al ricevimento (°C)', tipo: 'numero' },
  { chiave: 'prezzo_unitario', label: 'Prezzo unitario (€)', tipo: 'numero' },
  { chiave: 'note', label: 'Note', tipo: 'multiline' },
];

const coloreScadenza = (iso) => {
  const g = giorniAllaScadenza(iso);
  if (g === null) return COLORS.border;
  if (g < 0) return COLORS.danger;
  if (g <= 3) return COLORS.warning;
  return COLORS.ok;
};
const testoScadenza = (iso) => {
  const g = giorniAllaScadenza(iso);
  if (g === null) return 'senza scadenza';
  if (g < 0) return `SCADUTO il ${fmtData(iso)}`;
  if (g === 0) return 'scade oggi';
  if (g <= 3) return `scade fra ${g}g (${fmtData(iso)})`;
  return `scade il ${fmtData(iso)}`;
};

/** Ordine FIFO: prima scadenza più vicina, poi il ricevimento più vecchio. */
const fifo = (a, b) => {
  if (a.data_scadenza && b.data_scadenza && a.data_scadenza !== b.data_scadenza) {
    return a.data_scadenza < b.data_scadenza ? -1 : 1;
  }
  if (!!a.data_scadenza !== !!b.data_scadenza) return a.data_scadenza ? -1 : 1;
  return (a.data_ricevimento || '') < (b.data_ricevimento || '') ? -1 : 1;
};

export default function MagazzinoScreen({ route, navigation }) {
  const [lotti, setLotti] = useState([]);
  const [tutti, setTutti] = useState([]);
  const [modo, setModo] = useState('In giacenza');
  const [caricato, setCaricato] = useState(false);
  const [filtro, setFiltro] = useState('Tutti');
  const [bloccati, setBloccati] = useState([]);
  const [produzioni, setProduzioni] = useState([]);
  const [impatto, setImpatto] = useState(null);
  const [azione, setAzione] = useState(null); // { tipo: 'blocca' | 'sblocca', lotti: [id], testo }
  const [cerca, setCerca] = useState('');
  const [aperti, setAperti] = useState({});
  const [sel, setSel] = useState(null);           // lotto aperto nel dettaglio
  const [storico, setStorico] = useState([]);
  const [uscita, setUscita] = useState(null);     // { gruppo | lotto, qta, causale }
  const [modCarico, setModCarico] = useState(false);
  const [modUscita, setModUscita] = useState(null);
  const [qtaUscita, setQtaUscita] = useState('');
  const { avviso, mostra } = useAvviso();
  const { errori, segnala, azzera } = useErrori();
  const { chiediFoto, fotocamera } = useFoto();

  const richiesta = React.useRef(0);
  const ricarica = useCallback(() => {
    const n = ++richiesta.current;
    return Promise.all([listaLotti(cerca), cercaLotti(cerca), lottiBloccati()]).then(([a, b, c]) => {
      if (n !== richiesta.current) return; // è arrivata una ricerca più recente
      setLotti(a); setTutti(b); setBloccati(c); setCaricato(true);
    }).catch((e) => { setCaricato(true); Alert.alert('Lettura non riuscita', String(e?.message || e)); });
  }, [cerca]);
  // all'apertura subito; mentre si scrive nella ricerca si aspetta una breve pausa
  const primaVolta = React.useRef(true);
  useFocusEffect(useCallback(() => {
    const attesa = primaVolta.current ? 0 : 250;
    primaVolta.current = false;
    const t = setTimeout(ricarica, attesa);
    return () => clearTimeout(t);
  }, [ricarica]));

  // raggruppa i lotti per prodotto (e unità di misura)
  const gruppi = [];
  const mappa = {};
  const FILTRI = {
    Tutti: () => true,
    Frigo: (l) => l.conservazione === 'refrigerato',
    Congelati: (l) => l.conservazione === 'congelato',
    Dispensa: (l) => !l.conservazione || l.conservazione === 'ambiente',
    'In scadenza': (l) => { const g = giorniAllaScadenza(l.data_scadenza); return g !== null && g <= 3; },
  };
  for (const l of lotti.filter(FILTRI[filtro] || FILTRI.Tutti)) {
    const k = `${l.prodotto_id}|${l.unita_misura || ''}`;
    if (!mappa[k]) {
      mappa[k] = { chiave: k, prodotto: l.prodotto, unita: l.unita_misura, lotti: [], totale: 0 };
      gruppi.push(mappa[k]);
    }
    mappa[k].lotti.push(l);
    mappa[k].totale += Number(l.quantita_residua) || 0;
  }
  gruppi.forEach((g) => g.lotti.sort(fifo));
  gruppi.sort((a, b) => fifo(a.lotti[0], b.lotti[0]));

  const apriLotto = async (l) => {
    try {
      setSel(l);
      const [m, pr, im] = await Promise.all([movimentiDiLotto(l.id), produzioniDaLotto(l.id), impattoLotto(l.id)]);
      setStorico(m); setProduzioni(pr); setImpatto(im);
    } catch (e) {
      Alert.alert('Lettura non riuscita', String(e?.message || e));
    }
  };
  const ricaricaLotto = async (id) => {
    ricarica();
    const l = await getLotto(id);
    if (l) await apriLotto(l); else setSel(null);
  };

  // apertura diretta di un lotto (es. dal riquadro dei lotti bloccati o da un'altra schermata)
  React.useEffect(() => {
    const id = route?.params?.lottoId;
    if (!id) return;
    (async () => {
      const l = await getLotto(id);
      if (l) {
        await apriLotto(l);
        if (route.params.blocca && l.stato !== 'bloccato') setAzione({ tipo: 'blocca', lotti: [l.id], testo: '' });
      }
    })();
  }, [route?.params?.lottoId]);

  const confermaAzione = async () => {
    try {
      if (azione.tipo === 'blocca') {
        for (const id of azione.lotti) await bloccaLotto(id, azione.testo);
        mostra(azione.lotti.length > 1 ? `${azione.lotti.length} lotti bloccati ✓` : 'Lotto bloccato ✓ Non conformità aperta');
      } else {
        await sbloccaLotto(azione.lotti[0], azione.testo);
        mostra('Lotto sbloccato ✓');
      }
      setAzione(null);
      await ricaricaLotto(sel.id);
    } catch (e) {
      Alert.alert('Operazione non riuscita', String(e?.message || e));
    }
  };

  const schedaPdf = async () => {
    try {
      await stampaSchedaLotto({ lotto: sel, movimenti: storico, produzioni, impatto }, await getImpostazioni());
    } catch (e) {
      Alert.alert('Stampa non riuscita', String(e?.message || e));
    }
  };

  /* --- uscite: su un gruppo si scarica in ordine FIFO, anche su più lotti --- */
  const confermaUscita = async () => {
    azzera();
    const q = aNumero(uscita.qta);
    if (q === null || q <= 0) return segnala('qta', 'Inserisci una quantità maggiore di zero, es. 0,5');
    const tutti0 = uscita.lotto ? [uscita.lotto] : uscita.gruppo.lotti;
    const elenco = utilizzabili(tutti0, uscita.causale);
    const um = tutti0[0].unita_misura || '';
    if (elenco.length === 0) {
      return segnala('qta', 'Lotto scaduto: non si può usare. Scegli la causale "scarto".');
    }
    const disponibile = elenco.reduce((t, l) => t + Number(l.quantita_residua), 0);
    if (q > disponibile + 0.0005) {
      const scaduti = tutti0.length - elenco.length;
      return segnala('qta', `Ne sono disponibili solo ${fmtQ(disponibile)} ${um}${scaduti ? ` (${scaduti} ${scaduti === 1 ? 'lotto scaduto escluso' : 'lotti scaduti esclusi'}: scaricali come scarto)` : ''}`);
    }
    let resto = q;
    const usati = [];
    const movimenti = [];
    const idLotto = uscita.lotto ? uscita.lotto.id : null;
    const causale = uscita.causale;
    try {
      for (const l of elenco) {
        if (resto <= 0.0005) break;
        const parte = Math.min(resto, Number(l.quantita_residua));
        if (parte <= 0) continue;
        movimenti.push(await registraScarico(l.id, arrotonda(parte), causale));
        usati.push(l.numero_lotto || `#${l.id}`);
        resto -= parte;
      }
    } catch (e) {
      // la giacenza è cambiata nel frattempo: si annulla quanto già scaricato in questo giro
      for (const m of movimenti) { try { await annullaUscita(m); } catch (e2) { /* resta visibile nei movimenti */ } }
      setUscita(null);
      if (idLotto) await ricaricaLotto(idLotto); else ricarica();
      return Alert.alert('Scarico non registrato', String(e?.message || e));
    }
    setUscita(null);
    if (idLotto) await ricaricaLotto(idLotto); else ricarica();
    mostra(`Scaricati ${fmtQ(q)} ${um} (${usati.length > 1 ? `lotti ${usati.join(', ')}` : `lotto ${usati[0]}`})`, {
      testo: 'Annulla',
      onPress: async () => {
        try {
          for (const m of movimenti) await annullaUscita(m);
          mostra('Scarico annullato');
        } catch (e) {
          Alert.alert('Annullamento non riuscito', String(e?.message || e));
        }
        if (idLotto) await ricaricaLotto(idLotto); else ricarica();
      },
    });
  };

  const salvaCarico = async (cambi) => {
    try {
      const n = await correggiRecord('lotti', sel.id, cambi);
      setModCarico(false);
      await ricaricaLotto(sel.id);
      mostra(n ? 'Carico corretto ✓' : 'Nessuna modifica');
    } catch (e) {
      Alert.alert('Correzione non salvata', String(e?.message || e));
    }
  };

  const annulla = () => conferma('Annullare il carico?',
    'Il lotto sparisce dal magazzino ma resta nel registro come "annullato". Usalo per carichi registrati per errore.',
    async () => {
      try {
        await annullaCarico(sel.id, 'registrato per errore');
        setModCarico(false);
        setSel(null);
        ricarica();
        mostra('Carico annullato ✓');
      } catch (e) {
        Alert.alert('Non annullabile', String(e?.message || e));
      }
    });

  const salvaUscita = async () => {
    const q = aNumero(qtaUscita);
    if (q === null || q <= 0) return Alert.alert('Quantità non valida', 'Inserisci un numero maggiore di zero, es. 0,5.');
    try {
      await correggiUscita(modUscita.id, q);
      setModUscita(null);
      await ricaricaLotto(sel.id);
      mostra('Uscita corretta ✓');
    } catch (e) {
      Alert.alert('Correzione non salvata', String(e?.message || e));
    }
  };

  /* Uscita (da gruppo in FIFO o da singolo lotto) */
  const modaleUscita = (
      <Modal visible={!!uscita} transparent animationType="fade" onRequestClose={() => { azzera(); setUscita(null); }}>
        {uscita && (() => {
          const tutti0 = uscita.lotto ? [uscita.lotto] : uscita.gruppo.lotti;
          const um = tutti0[0].unita_misura || '';
          const utili = utilizzabili(tutti0, uscita.causale);
          const scaduti = tutti0.filter((l) => lottoScaduto(l)).length;
          const elenco = utili.length ? utili : tutti0;
          const disp = utili.reduce((s, l) => s + Number(l.quantita_residua), 0);
          const q = aNumero(uscita.qta) || 0;
          let resto = q;
          const piano = [];
          for (const l of elenco) {
            if (resto <= 1e-9) break;
            const parte = Math.min(resto, Number(l.quantita_residua));
            piano.push(`${fmtQ(parte)} ${um} dal lotto ${l.numero_lotto || '—'}`);
            resto -= parte;
          }
          return (
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 }}>
              <View style={S.card}>
                <Text style={S.h2}>Scarica {uscita.lotto ? uscita.lotto.prodotto : uscita.gruppo.prodotto}</Text>
                <Text style={S.muted}>Disponibili {fmtQ(disp)} {um}{uscita.lotto ? ` nel lotto ${uscita.lotto.numero_lotto || '—'}` : ''}</Text>
                {scaduti > 0 && (
                  <Text style={{ color: COLORS.danger, fontWeight: '700', marginTop: 4 }}>
                    {uscita.causale === 'consumo'
                      ? `${scaduti} ${scaduti === 1 ? 'lotto scaduto' : 'lotti scaduti'}: non si ${scaduti === 1 ? 'può' : 'possono'} usare. Per toglier${scaduti === 1 ? 'lo' : 'li'} scegli "scarto".`
                      : `${scaduti} ${scaduti === 1 ? 'lotto scaduto' : 'lotti scaduti'} da togliere dal magazzino.`}
                  </Text>
                )}
                <Campo label={`Quantità (${um})`} value={uscita.qta} keyboardType="decimal-pad" autoFocus
                  errore={errori.qta} onChange={(v) => setUscita((u) => ({ ...u, qta: v }))} />
                <View style={[S.chipWrap, { marginTop: 10 }]}>
                  <TouchableOpacity style={S.chip}
                    onPress={() => setUscita((u) => ({ ...u, qta: fmtQ(elenco[0].quantita_residua) }))}>
                    <Text style={S.chipText}>Tutto il primo lotto</Text>
                  </TouchableOpacity>
                  {elenco[0].colli > 0 && (
                    <TouchableOpacity style={S.chip}
                      onPress={() => {
                        const unCollo = arrotonda(elenco[0].quantita_iniziale / elenco[0].colli);
                        setUscita((u) => ({ ...u, qta: fmtQ(Math.min(unCollo, disp || unCollo)) }));
                      }}>
                      <Text style={S.chipText}>1 collo ({fmtQ(elenco[0].quantita_iniziale / elenco[0].colli)})</Text>
                    </TouchableOpacity>
                  )}
                  {elenco.length > 1 && (
                    <TouchableOpacity style={S.chip}
                      onPress={() => setUscita((u) => ({ ...u, qta: fmtQ(disp) }))}>
                      <Text style={S.chipText}>Tutto ({fmtQ(disp)})</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Chips label="Causale" opzioni={['consumo', 'scarto', 'reso']}
                  valore={uscita.causale} onChange={(v) => setUscita((u) => ({ ...u, causale: v }))} />
                {q > 0 && q <= disp + 1e-9 && (
                  <Text style={[S.muted, { marginTop: 10 }]}>Verrà scaricato: {piano.join(' + ')}</Text>
                )}
                <Bottone testo="Conferma uscita" onPress={confermaUscita}
                  colore={uscita.causale === 'consumo' ? undefined : COLORS.danger} />
                <Bottone testo="Annulla" ghost onPress={() => { azzera(); setUscita(null); }} />
              </View>
            </View>
          );
        })()}
      </Modal>
  );

  const cambiaFoto = (campo) => chiediFoto(campo === 'foto_ddt' ? 'documento' : 'etichetta', async (uri) => {
    try {
      await impostaFotoLotto(sel.id, campo, uri);
      await ricaricaLotto(sel.id);
      mostra('Foto salvata ✓');
    } catch (e) {
      Alert.alert('Foto non salvata', String(e?.message || e));
    }
  });

  return (
    <View style={S.screen}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <TextInput style={S.input} placeholder="Cerca prodotto, lotto o fornitore…" value={cerca}
          accessibilityLabel="Cerca prodotto, lotto o fornitore"
          onChangeText={setCerca} placeholderTextColor={COLORS.segnaposto} />
        <Segmenti opzioni={['In giacenza', 'Tutti i lotti']} valore={modo} onChange={setModo} />
        {modo === 'In giacenza' && lotti.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}
            contentContainerStyle={{ gap: 8 }}>
            {['Tutti', 'Frigo', 'Congelati', 'Dispensa', 'In scadenza'].map((f) => (
              <TouchableOpacity key={f} onPress={() => setFiltro(f)}
                style={[S.chip, filtro === f && S.chipOn, { marginRight: 0, marginBottom: 0 }]}>
                <Text style={[S.chipText, filtro === f && S.chipTextOn]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={S.content}>
        {bloccati.length > 0 && (
          <View style={[S.card, { backgroundColor: COLORS.dangerSoft, borderColor: COLORS.danger }]}>
            <Text style={{ color: COLORS.danger, fontWeight: '800', fontSize: 16 }}>
              <Icona nome="cancel" size={17} colore={COLORS.danger} /> {bloccati.length} lott{bloccati.length > 1 ? 'i bloccati' : 'o bloccato'}: da tenere separat{bloccati.length > 1 ? 'i' : 'o'}
            </Text>
            {bloccati.map((l) => (
              <TouchableOpacity key={l.id} style={{ paddingVertical: 8 }} onPress={() => apriLotto(l)}>
                <Text style={{ fontWeight: '700', color: COLORS.text }}>
                  {l.prodotto} · lotto {l.numero_lotto || '—'} · {fmtQ(l.quantita_residua)} {l.unita_misura}
                </Text>
                <Text style={S.muted}>{l.fornitore} · tocca per gestire il richiamo ›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {modo === 'Tutti i lotti' && (
          <>
            <Text style={[S.muted, { marginBottom: 6 }]}>
              Storico completo, anche lotti esauriti, bloccati o annullati: qui trovi la rintracciabilità di ogni partita.
              {tutti.length >= 150 ? ' Sono mostrati i 150 più recenti: usa la ricerca per trovare quelli più vecchi.' : ''}
            </Text>
            {caricato && tutti.length === 0 && (
              <Vuoto icona="magnify" titolo="Nessun lotto trovato" testo={cerca ? 'Prova a cercare con un\'altra parola.' : 'Qui compariranno tutti i lotti ricevuti.'} />
            )}
            {tutti.map((l) => (
              <TouchableOpacity key={l.id} style={[S.card, { borderWidth: 1.5, borderColor: coloreStato(l.stato) }]}
                onPress={() => apriLotto(l)} activeOpacity={0.7}>
                <View style={S.row}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.text, flex: 1, paddingRight: 8 }}>
                    {l.prodotto}
                  </Text>
                  <Text style={{ fontWeight: '700', color: COLORS.text }}>
                    {fmtQ(l.quantita_residua)} / {fmtQ(l.quantita_iniziale)} {l.unita_misura}
                  </Text>
                </View>
                <Text style={S.muted}>
                  Lotto {l.numero_lotto || '—'} · {l.fornitore} · ricevuto {fmtData(l.data_ricevimento)}
                </Text>
                <Text style={{ color: coloreStato(l.stato), fontWeight: l.stato === 'bloccato' ? '800' : '600' }}>
                  {l.stato === 'bloccato' ? 'BLOCCATO' : l.stato} · {testoScadenza(l.data_scadenza)}
                </Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {modo === 'In giacenza' && gruppi.length === 0 && (
          !caricato ? <Caricamento /> : lotti.length === 0 ? (
            <Vuoto icona="package-variant" titolo={cerca ? 'Nessun prodotto trovato' : 'Il magazzino è vuoto'}
              testo={cerca ? 'Prova a cercare con un\'altra parola.' : 'Registra la merce arrivata: da fattura PDF ci vuole un minuto.'}
              azione={cerca ? null : 'Registra un carico'} onAzione={() => navigation.navigate('CaricoMerce')} />
          ) : (
            <Vuoto icona="filter-variant" titolo="Nessun prodotto con questo filtro"
              azione="Mostra tutti" onAzione={() => setFiltro('Tutti')} />
          )
        )}

        {modo === 'In giacenza' && gruppi.map((g) => {
          const primo = g.lotti[0];
          const aperto = !!aperti[g.chiave];
          return (
            <View key={g.chiave} style={[S.card, { borderWidth: 1.5, borderColor: coloreScadenza(primo.data_scadenza) }]}>
              <TouchableOpacity activeOpacity={0.7}
                onPress={() => setAperti((s) => ({ ...s, [g.chiave]: !s[g.chiave] }))}>
                <View style={S.row}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.text, flex: 1, paddingRight: 8 }}>
                    {g.prodotto}
                  </Text>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.text }}>
                    {fmtQ(g.totale)} {g.unita}
                  </Text>
                </View>
                <Text style={S.muted}>
                  {g.lotti.length} {g.lotti.length === 1 ? 'lotto' : 'lotti'} · {aperto ? '▲ nascondi' : '▼ vedi lotti'}
                </Text>
                <Text style={{ marginTop: 4, color: coloreScadenza(primo.data_scadenza), fontWeight: '700' }}>
                  Primo da usare: {testoScadenza(primo.data_scadenza)}
                </Text>
              </TouchableOpacity>

              {g.lotti.every((l) => lottoScaduto(l)) ? (
                <Bottone testo="Scarta (scaduto)" colore={COLORS.danger} icona="delete-outline"
                  onPress={() => setUscita({ gruppo: g, qta: fmtQ(g.totale), causale: 'scarto' })} />
              ) : (
                <Bottone testo="Scarica"
                  onPress={() => setUscita({ gruppo: g, qta: '', causale: 'consumo' })} />
              )}

              {aperto && g.lotti.map((l, i) => (
                <TouchableOpacity key={l.id} onPress={() => apriLotto(l)}
                  style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: i ? 0 : 12 }}>
                  <View style={S.row}>
                    <Text style={{ fontWeight: '700', color: COLORS.text, flex: 1 }}>
                      {i === 0 ? '① ' : ''}Lotto {l.numero_lotto || '—'}
                    </Text>
                    <Text style={{ fontWeight: '700', color: COLORS.text }}>{fmtQ(l.quantita_residua)} {l.unita_misura}</Text>
                  </View>
                  <Text style={S.muted}>
                    {l.fornitore} · ricevuto {fmtData(l.data_ricevimento)}
                    {l.colli ? ` · ${l.colli} ${l.colli === 1 ? 'collo' : 'colli'}` : ''}
                  </Text>
                  <Text style={{ color: coloreScadenza(l.data_scadenza), fontWeight: '600' }}>
                    {testoScadenza(l.data_scadenza)}  <Text style={{ color: COLORS.azione }}>› dettagli</Text>
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          );
        })}
        <RiquadroPromemoria tipo="scadenze" />
      </ScrollView>

      {!sel && modaleUscita}

      {/* Dettaglio lotto */}
      <Modal visible={!!sel} animationType="slide" onRequestClose={() => setSel(null)}>
        {sel && (
          <View style={S.screen}>
            <VistaModale>
              <Text style={S.h1}>{sel.prodotto}</Text>
              <Riquadro>
                <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.text }}>
                  {fmtQ(sel.quantita_residua)} {sel.unita_misura}
                </Text>
                <Text style={{ color: coloreScadenza(sel.data_scadenza), fontWeight: '800', fontSize: 16, marginTop: 2 }}>
                  {testoScadenza(sel.data_scadenza)}
                </Text>
                <Text style={[S.muted, { marginTop: 4 }]}>Lotto {sel.numero_lotto || '—'} · {sel.fornitore}</Text>
                {sel.stato === 'disponibile' && (
                  lottoScaduto(sel) ? (
                    <Bottone testo="Scarta questo lotto (scaduto)" icona="delete-outline" colore={COLORS.danger}
                      onPress={() => setUscita({ lotto: sel, qta: fmtQ(sel.quantita_residua), causale: 'scarto' })} />
                  ) : (
                    <Bottone testo="Scarica da questo lotto" icona="tray-arrow-up"
                      onPress={() => setUscita({ lotto: sel, qta: '', causale: 'consumo' })} />
                  )
                )}
                <Bottone testo="Stampa etichetta" icona="label-outline" ghost
                  onPress={() => {
                    const l = sel;
                    setSel(null);
                    navigation.navigate('Etichette', {
                      precompila: {
                        tipo: 'Apertura', prodotto_id: l.prodotto_id, nome: l.prodotto,
                        lotto: l.numero_lotto || '', scadenza: l.data_scadenza || '',
                      },
                    });
                  }} />
              </Riquadro>

              <Sezione titolo="Dati del carico" icona="truck-delivery-outline"
                riassunto={`Ricevuti ${fmtQ(sel.quantita_iniziale)} ${sel.unita_misura} il ${fmtData(sel.data_ricevimento)}`}>
                <Text style={S.muted}>
                  Ricevuti {fmtQ(sel.quantita_iniziale)} {sel.unita_misura}
                  {sel.colli ? ` in ${sel.colli} ${sel.colli === 1 ? 'collo' : 'colli'}` : ''} il {fmtData(sel.data_ricevimento)}
                </Text>
                <Text style={S.muted}>DDT/fattura {sel.ddt_numero || '—'} del {fmtData(sel.ddt_data)}</Text>
                <Text style={S.muted}>Temperatura al ricevimento: {sel.temperatura_rilevata ?? '—'}°C</Text>
                {!!sel.note && <Text style={[S.muted, { fontStyle: 'italic', marginTop: 4 }]}>{sel.note}</Text>}
                <Bottone testo="Modifica dati del carico" icona="pencil-outline" ghost onPress={() => setModCarico(true)} />
              </Sezione>

              <Sezione titolo="Foto" icona="camera-outline" aperta={!!sel.foto_etichetta}
                riassunto={sel.foto_etichetta ? 'Etichetta presente' : 'Nessuna foto'}>
                {sel.foto_etichetta ? (
                  <AnteprimaFoto uri={sel.foto_etichetta} titolo="Etichetta" altezza={220} />
                ) : (
                  <Text style={S.muted}>Nessuna foto dell'etichetta.</Text>
                )}
                <Bottone testo={sel.foto_etichetta ? 'Sostituisci foto etichetta' : "Fotografa l'etichetta"}
                  icona="camera" ghost onPress={() => cambiaFoto('foto_etichetta')} />
                {sel.foto_ddt ? <AnteprimaFoto uri={sel.foto_ddt} titolo="Documento di trasporto" /> : null}
                <Bottone testo={sel.foto_ddt ? 'Sostituisci foto documento' : 'Fotografa DDT / fattura'}
                  icona="file-document-outline" ghost onPress={() => cambiaFoto('foto_ddt')} />
              </Sezione>

              {sel.stato === 'bloccato' && (
                <View style={[S.card, { backgroundColor: COLORS.dangerSoft, borderColor: COLORS.danger }]}>
                  <Text style={{ color: COLORS.danger, fontWeight: '800', fontSize: 17 }}>Lotto bloccato</Text>
                  <Text style={{ color: COLORS.text, marginTop: 4 }}>
                    Non è utilizzabile né nelle produzioni. Tienilo separato e identificato finché il
                    fornitore o l'autorità non indicano cosa fare.
                  </Text>
                </View>
              )}

              <Sezione titolo="Impiego e richiamo" icona="shield-alert-outline" aperta={sel.stato === 'bloccato'}
                colore={sel.stato === 'bloccato' ? COLORS.danger : undefined}
                riassunto={impatto ? `${produzioni.length} produzion${produzioni.length === 1 ? 'e' : 'i'} · PDF per ASL` : ''}>
                {impatto && (
                  <>
                    <Text style={{ color: COLORS.text }}>
                      Usati {fmtQ(impatto.usato)} {sel.unita_misura} su {fmtQ(sel.quantita_iniziale)} · in magazzino {fmtQ(sel.quantita_residua)} {sel.unita_misura}
                    </Text>
                    {produzioni.length ? produzioni.map((pr) => (
                      <Text key={pr.id} style={S.muted}>
                        • {fmtData(pr.data_ora)} · {pr.nome} · lotto {pr.lotto_produzione || '—'} · {pr.quantita_usata} {sel.unita_misura}
                      </Text>
                    )) : <Text style={S.muted}>Non risulta impiegato in produzioni.</Text>}
                    {impatto.stessaPartita.length > 0 && (
                      <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8 }}>
                        <Text style={{ fontWeight: '700', color: COLORS.warning }}>
                          Stesso numero di lotto ricevuto altre {impatto.stessaPartita.length} volte:
                        </Text>
                        {impatto.stessaPartita.map((x) => (
                          <Text key={x.id} style={S.muted}>
                            • {fmtData(x.data_ricevimento)} · {x.fornitore} · residuo {fmtQ(x.quantita_residua)} {x.unita_misura} · {x.stato}
                          </Text>
                        ))}
                      </View>
                    )}
                    {sel.stato === 'bloccato' ? (
                      <Bottone testo="Sblocca dopo la verifica" ghost
                        onPress={() => setAzione({ tipo: 'sblocca', lotti: [sel.id], testo: '' })} />
                    ) : sel.stato !== 'annullato' && (
                      <Bottone testo={impatto.stessaPartita.some((x) => x.stato !== 'bloccato')
                        ? 'Blocca questo lotto e gli altri con lo stesso numero' : 'Blocca lotto (richiamo)'}
                        colore={COLORS.danger}
                        onPress={() => setAzione({
                          tipo: 'blocca', testo: '',
                          lotti: [sel.id, ...impatto.stessaPartita.filter((x) => x.stato !== 'bloccato').map((x) => x.id)],
                        })} />
                    )}
                  </>
                )}
                <Bottone testo={sel.stato === 'bloccato' ? 'Rapporto di richiamo PDF' : 'Scheda PDF per ASL'}
                  ghost onPress={schedaPdf} />
              </Sezione>

              <Sezione titolo="Movimenti" icona="swap-vertical" riassunto={`${storico.length} moviment${storico.length === 1 ? 'o' : 'i'}`}>
                {storico.map((m, i) => (
                  <TouchableOpacity key={m.id} disabled={m.tipo === 'carico'}
                    onPress={() => { setModUscita(m); setQtaUscita(fmtQ(m.quantita)); }}
                    style={[S.row, { paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>
                        {m.tipo === 'carico' ? 'Carico' : m.causale || m.tipo}
                      </Text>
                      <Text style={S.muted}>{fmtDataOra(m.data_ora)}</Text>
                      {!!m.note && <Text style={[S.muted, { fontStyle: 'italic' }]}>{m.note}</Text>}
                    </View>
                    <Text style={{ fontWeight: '700', color: m.tipo === 'carico' ? COLORS.ok : COLORS.text }}>
                      {m.tipo === 'carico' ? '+' : '−'}{fmtQ(m.quantita)} {sel.unita_misura}
                      {m.tipo !== 'carico' && <Text style={{ color: COLORS.azione }}>  ✎</Text>}
                    </Text>
                  </TouchableOpacity>
                ))}
              </Sezione>

              <Bottone testo="Chiudi" ghost onPress={() => setSel(null)} />
            </VistaModale>

            <ModaleModifica visibile={modCarico} titolo="Modifica carico"
              sottotitolo={`${sel.prodotto} · lotto ${sel.numero_lotto || '—'}`}
              campi={CAMPI_CARICO} record={sel} onSalva={salvaCarico} onChiudi={() => setModCarico(false)}
              azioni={<Bottone testo="Annulla carico (registrato per errore)" ghost colore={COLORS.danger} onPress={annulla} />} />

            <Modal visible={!!modUscita} transparent animationType="fade" onRequestClose={() => setModUscita(null)}>
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
                <View style={S.card}>
                  <Text style={S.h2}>Correggi uscita</Text>
                  {modUscita && <Text style={S.muted}>{modUscita.causale || modUscita.tipo} · {fmtDataOra(modUscita.data_ora)}</Text>}
                  <Campo label={`Quantità (${sel.unita_misura || ''})`} value={qtaUscita} onChange={setQtaUscita}
                    keyboardType="decimal-pad" autoFocus selectTextOnFocus />
                  <Bottone testo="Salva correzione" onPress={salvaUscita} />
                  <Bottone testo="Annulla" ghost onPress={() => setModUscita(null)} />
                </View>
              </View>
            </Modal>
            {modaleUscita}
            <Modal visible={!!azione} transparent animationType="fade" onRequestClose={() => setAzione(null)}>
              {azione && (
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 }}>
                  <View style={S.card}>
                    <Text style={S.h2}>
                      {azione.tipo === 'blocca'
                        ? (azione.lotti.length > 1 ? `Blocca ${azione.lotti.length} lotti` : 'Blocca lotto')
                        : 'Sblocca lotto'}
                    </Text>
                    {azione.tipo === 'blocca' && (
                      <Chips label="Motivo" opzioni={MOTIVI} valore={azione.testo}
                        onChange={(v) => setAzione((a) => ({ ...a, testo: v }))} />
                    )}
                    <Campo label={azione.tipo === 'blocca' ? 'Dettagli (n. avviso, comunicazione…)' : 'Esito della verifica *'}
                      value={azione.testo} multiline
                      onChange={(v) => setAzione((a) => ({ ...a, testo: v }))} />
                    <Text style={[S.muted, { marginTop: 8 }]}>
                      {azione.tipo === 'blocca'
                        ? 'Il lotto esce dalla merce utilizzabile e si apre una non conformità.'
                        : 'Il lotto torna utilizzabile. La non conformità resta da chiudere con l\'azione correttiva.'}
                    </Text>
                    <Bottone testo={azione.tipo === 'blocca' ? 'Conferma blocco' : 'Conferma sblocco'}
                      colore={azione.tipo === 'blocca' ? COLORS.danger : undefined} onPress={confermaAzione} />
                    <Bottone testo="Annulla" ghost onPress={() => setAzione(null)} />
                  </View>
                </View>
              )}
            </Modal>
            {fotocamera}
            {avviso}
          </View>
        )}
      </Modal>
      {avviso}
    </View>
  );
}
