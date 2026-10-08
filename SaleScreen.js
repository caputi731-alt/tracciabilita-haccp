/**
 * Sezione "Sale": le prenotazioni di un giorno e di un servizio, sistemate nelle due sale mensa.
 * In alto la sala in 3D (SaleVista.js), sotto le file della sala: in ogni fila si aggiunge una prenotazione (nome, persone, ora)
 * e l'app dimensiona la tavolata e la mette al suo posto (sale.js). Ogni modifica si salva subito per quel giorno e quel
 * servizio. I modelli sono disposizioni con un nome, senza prenotazioni, da riusare.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, TEMA_SCURO, aNumero, oggiLocale, fmtData } from './theme';
import { Icona, Bottone, Campo, CampoData, Segmenti, VistaModale, conferma, useAvviso, useErrori } from './UI';
import {
  disposizioneGiorno, salvaDisposizioneGiorno, modelliSale, salvaModelloSale, eliminaModelloSale, getImpostazioni,
} from './database';
import {
  SALE, ID_SALE, SERVIZI, LUNGA_MIN, LUNGA_MAX, posti, lunghezza, lunghezzaPer, restoFila, pianoVuoto, pianoPulito, senzaPrenotazioni,
  nuovaTavolata, disponi, sigle, totali, datiScenaSala, metri,
} from './sale';
import { htmlDisposizioneSale } from './report';
import { condividiPdf } from './condividi';

const NOMI_SALE = ID_SALE.map((id) => SALE[id].nome.replace('Sala ', '').replace(/^./, (c) => c.toUpperCase()));
const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;
const VUOTI = () => Object.fromEntries(ID_SALE.map((id) => [id, pianoVuoto(SALE[id])]));
const COPPIE = (dati) => ID_SALE.map((id) => [SALE[id], dati[id]]);

/** Un problema della vista 3D resta chiuso qui: la disposizione si usa lo stesso dall'elenco. */
class RiparoSala extends React.Component {
  constructor(props) {
    super(props);
    this.state = { rotto: false };
  }

  static getDerivedStateFromError() {
    return { rotto: true };
  }

  componentDidCatch() {
    this.props.suRotto();
  }

  render() {
    return this.state.rotto ? null : this.props.children;
  }
}

function moduloSala() {
  try {
    return require('./SaleVista').default;
  } catch (e) {
    return null;
  }
}

/** Una prenotazione e la sua tavolata: dalle persone la lunghezza, che si può correggere a mano. */
function SchedaTavolata({ sala, piano, fila, tavolata, sigla, nuova, onSalva, onElimina, onChiudi }) {
  const [t, setT] = useState(tavolata);
  const { errori, segnala, azzera, riepilogo } = useErrori();
  useEffect(() => { setT(tavolata); azzera(); }, [tavolata, azzera]);
  const persone = aNumero(t.persone);
  const len = lunghezza(t);
  const p = posti(len);
  const troppi = persone !== null && persone > p.posti;
  const massima = restoFila(sala, piano, fila, tavolata.id);   // la più lunga che entra in questa fila, senza contare lei
  const nonEntra = len > massima + 1e-9;
  const tasto = (icona, d, attivo, voce) => (
    <TouchableOpacity onPress={() => setT((v) => ({ ...v, len: Math.round((lunghezza(v) + d) * 10) / 10 }))} disabled={!attivo}
      accessibilityRole="button" accessibilityLabel={voce}
      style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.contenitore, opacity: attivo ? 1 : 0.35 }}>
      <Icona nome={icona} size={24} colore={COLORS.text} />
    </TouchableOpacity>
  );

  const salva = () => {
    azzera();
    if (String(t.persone).trim() && (persone === null || persone < 0 || !Number.isInteger(persone))) return segnala('persone', 'Scrivi il numero di persone, per esempio 8');
    if (nonEntra) return segnala('len', massima > 0 ? `In questa fila entra al massimo una tavolata di ${metri(massima)}` : 'In questa fila non c\'è più posto');
    return onSalva({ ...t, nome: t.nome.trim(), persone: persone ? String(persone) : '', ora: t.ora.trim(), note: t.note.trim() });
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onChiudi}>
      <VistaModale>
        <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 1, color: COLORS.muted }}>
          {sala.nome.toUpperCase()} · {sala.file[fila].nome.toUpperCase()}
        </Text>
        <Text style={S.h1}>{nuova ? 'Nuova prenotazione' : `Tavolo ${sigla}`}</Text>

        <View style={S.card}>
          <Campo label="Nome" value={t.nome} onChange={(v) => setT((x) => ({ ...x, nome: v }))} placeholder="Per esempio: Rossi" />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Campo label="Persone" value={t.persone} errore={errori.persone} keyboardType="number-pad"
                onChange={(v) => setT((x) => ({ ...x, persone: v }))} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo label="Ora" value={t.ora} onChange={(v) => setT((x) => ({ ...x, ora: v }))} placeholder="13:00" keyboardType="numbers-and-punctuation" />
            </View>
          </View>
          <Campo label="Note" value={t.note} onChange={(v) => setT((x) => ({ ...x, note: v }))} placeholder="Seggiolone, intolleranze, torta…" />
        </View>

        <View style={[S.card, (nonEntra || troppi) && { borderWidth: 1.5, borderColor: COLORS.danger }]}>
          <Text style={S.h2}>Tavolata da preparare</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {tasto('minus', -0.1, len > LUNGA_MIN + 1e-9, 'Accorcia di 10 centimetri')}
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 30, fontWeight: '800', color: COLORS.text, letterSpacing: -0.6 }}>{metri(len)}</Text>
              <Text style={{ fontSize: 14, color: COLORS.muted }}>
                {t.len ? 'lunghezza scelta da te' : persone ? `calcolata per ${persone} ${persone === 1 ? 'persona' : 'persone'}` : 'tavolo singolo'}
              </Text>
            </View>
            {tasto('plus', 0.1, len < LUNGA_MAX - 1e-9, 'Allunga di 10 centimetri')}
          </View>
          <View style={{ backgroundColor: troppi ? COLORS.dangerSoft : COLORS.primarySoft, borderRadius: 16, padding: 14, marginTop: 14 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: troppi ? COLORS.danger : COLORS.primaryDark }}>
              {p.posti} posti: {p.lati} per lato e {p.capotavola === 2 ? '2 capotavola' : '1 capotavola'}
            </Text>
            <Text style={{ fontSize: 14, color: troppi ? COLORS.danger : COLORS.primaryDark }}>
              {troppi ? `${persone} persone starebbero strette: allunga la tavolata o dividi il gruppo.`
                : '75 cm a persona. Componila con i tavoli e le allunghe che avete: se viene più lunga o più corta, correggi qui.'}
            </Text>
          </View>
          {!!t.len && !!persone && (
            <Bottone testo={`Torna al calcolo (${metri(lunghezzaPer(persone))})`} ghost onPress={() => setT((v) => ({ ...v, len: null }))} />
          )}
          <Text style={[S.muted, { marginTop: 8 }, nonEntra && { color: COLORS.danger, fontWeight: '700' }]}>
            {massima > 0 ? `In questa fila entra ancora una tavolata fino a ${metri(massima)}.` : 'In questa fila non c\'è più posto: usa l\'altra fila o l\'altra sala.'}
          </Text>
          {riepilogo}
        </View>

        <Bottone testo={nuova ? 'Aggiungi' : 'Fatto'} onPress={salva} />
        {!nuova && <Bottone testo="Togli la tavolata" ghost colore={COLORS.danger} onPress={onElimina} />}
        <Bottone testo={nuova ? 'Annulla' : 'Chiudi senza salvare'} ghost onPress={onChiudi} />
      </VistaModale>
    </Modal>
  );
}

export default function SaleScreen() {
  const [data, setData] = useState(oggiLocale());
  const [servizio, setServizio] = useState(new Date().getHours() < 16 ? SERVIZI[0] : SERVIZI[1]);
  const [quale, setQuale] = useState(0); // sala mostrata: posizione in ID_SALE
  const [dati, setDati] = useState(VUOTI);
  const [modelli, setModelli] = useState([]);
  const [scena, setScena] = useState('attesa');
  const [scelta, setScelta] = useState(null); // id della tavolata aperta
  const [nuova, setNuova] = useState(null);   // { fila, tavolata } mentre si scrive una prenotazione nuova
  const [finestra, setFinestra] = useState(null); // 'modelli'
  const [nomeModello, setNomeModello] = useState('');
  const { errori, segnala, azzera, riepilogo } = useErrori();
  const { avviso, mostra } = useAvviso();
  const schermo = useWindowDimensions();
  const chiave = useRef('');

  const idSala = ID_SALE[quale];
  const sala = SALE[idSala];
  const piano = useMemo(() => pianoPulito(sala, dati[idSala]), [sala, dati, idSala]);

  const carica = useCallback(async () => {
    const k = `${data}|${servizio}`;
    chiave.current = k;
    const [d, mod] = [await disposizioneGiorno(data, servizio), await modelliSale()];
    if (chiave.current !== k) return; // nel frattempo è stato scelto un altro giorno
    setDati(d || VUOTI()); setModelli(mod);
  }, [data, servizio]);
  useFocusEffect(useCallback(() => { carica().catch(() => {}); }, [carica]));

  /** Ogni modifica si salva subito per questo giorno e questo servizio. */
  const cambia = useCallback((nuovi) => {
    setDati(nuovi);
    salvaDisposizioneGiorno(data, servizio, nuovi).catch((e) => mostra(`Non salvato: ${String(e && e.message || e)}`));
  }, [data, servizio, mostra]);
  const cambiaFile = (file) => cambia({ ...dati, [idSala]: { file } });

  const disposta = useMemo(() => disponi(sala, piano), [sala, piano]);
  const nomi = useMemo(() => sigle(sala, piano), [sala, piano]);
  const tot = useMemo(() => totali([[sala, piano]]), [sala, piano]);
  const totTutte = useMemo(() => totali(COPPIE(dati)), [dati]);
  const scenaDati = useMemo(() => datiScenaSala(sala, piano, { scuro: TEMA_SCURO, scelto: scelta }), [sala, piano, scelta]);
  const Sala3D = scena === 'no' ? null : moduloSala();
  const senza3d = useCallback(() => setScena('no'), []);
  const suTavolata = useCallback((id) => setScelta(id), []);

  const posizione = useMemo(() => {
    for (let i = 0; i < piano.file.length; i++) {
      const j = piano.file[i].findIndex((t) => t.id === scelta);
      if (j >= 0) return { i, j };
    }
    return null;
  }, [piano, scelta]);

  const usaModello = (m) => {
    const applica = () => {
      cambia(Object.fromEntries(ID_SALE.map((id) => [id, senzaPrenotazioni(SALE[id], m.dati[id])])));
      setFinestra(null);
      mostra(`Disposizione "${m.nome}" applicata`);
    };
    if (totTutte.tavolate === 0) applica();
    else conferma('Sostituire la disposizione?', totTutte.prenotate
      ? `Per ${fmtData(data)} a ${servizio.toLowerCase()} ci sono ${plurale(totTutte.prenotate, 'prenotazione', 'prenotazioni')}: verranno tolte insieme alle tavolate.`
      : 'Le tavolate messe finora in tutte e due le sale verranno sostituite da quelle del modello.', applica);
  };
  const salvaModello = async () => {
    azzera();
    if (!nomeModello.trim()) return segnala('modello', 'Scrivi il nome del modello, per esempio "Domenica"');
    if (totTutte.tavolate === 0) return segnala('modello', 'Non c\'è ancora nessuna tavolata da salvare');
    await salvaModelloSale(nomeModello, dati);
    setModelli(await modelliSale()); setNomeModello('');
    return mostra('Modello salvato ✓');
  };

  const invia = async () => {
    const html = htmlDisposizioneSale({ data, servizio, sale: ID_SALE.map((id) => ({ sala: SALE[id], piano: dati[id] })) }, await getImpostazioni());
    await condividiPdf(html, `Tavoli ${data} ${servizio}`);
  };

  const altoScena = Math.round(Math.min(360, Math.max(220, schermo.height * 0.32)));
  const pulsantino = (icona, testo, azione) => (
    <TouchableOpacity key={testo} onPress={azione} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={testo}
      style={{
        flex: 1, minHeight: 64, borderRadius: 18, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
      }}>
      <Icona nome={icona} size={22} colore={COLORS.azione} />
      <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: COLORS.text, marginTop: 2 }}>{testo}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={S.screen}>
      <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <CampoData label="Giorno" value={data} facoltativo={false} onChange={(v) => { if (v) setData(v); }}
              scorciatoie={[{ testo: 'Domani', giorni: 1 }, { testo: 'Fra una settimana', giorni: 7 }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Segmenti opzioni={SERVIZI} valore={servizio} onChange={setServizio} />
          </View>
        </View>
        <Segmenti opzioni={NOMI_SALE} valore={NOMI_SALE[quale]} onChange={(v) => { setScelta(null); setQuale(NOMI_SALE.indexOf(v)); }} />
      </View>

      {!!Sala3D && (
        <View style={{ height: altoScena, marginTop: 10, backgroundColor: COLORS.contenitore }}>
          <RiparoSala suRotto={senza3d}>
            <Sala3D dati={scenaDati} suTavolata={suTavolata} suStato={setScena} />
          </RiparoSala>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text, marginLeft: 4 }}>
          {tot.tavolate === 0 ? 'Nessuna prenotazione in questa sala'
            : `${plurale(tot.tavolate, 'tavolata', 'tavolate')} · ${plurale(tot.persone, 'persona', 'persone')} · ${tot.posti} posti`}
        </Text>
        <Text style={[S.muted, { marginLeft: 4, marginBottom: 10 }]}>
          {tot.tavolate === 0 ? 'Aggiungi una prenotazione nella fila dove vuoi metterla: la tavolata si dimensiona da sola.'
            : `Da preparare: ${metri(tot.metri)} di tavoli${totTutte.tavolate > tot.tavolate ? ` · nelle due sale ${metri(totTutte.metri)} per ${plurale(totTutte.persone, 'persona', 'persone')}` : ''}`}
        </Text>
        {disposta.problemi.length > 0 && (
          <View style={{ backgroundColor: COLORS.dangerSoft, borderRadius: 16, padding: 14, marginBottom: 12 }}>
            <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 15 }}>Da sistemare</Text>
            {disposta.problemi.map((p) => <Text key={p} style={{ color: COLORS.danger, fontSize: 15, marginTop: 2 }}>{p}</Text>)}
          </View>
        )}

        {sala.file.map((fila, i) => {
          const resto = restoFila(sala, piano, i);
          return (
            <View key={fila.id} style={S.card}>
              <View style={[S.row, { marginBottom: 8 }]}>
                <Text style={[S.h2, { marginBottom: 0 }]}>{fila.nome}</Text>
                <Text style={{ fontSize: 13, color: COLORS.muted }}>{resto > 0 ? `liberi ${metri(resto)}` : 'piena'}</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {piano.file[i].map((t) => {
                  const len = lunghezza(t), p = posti(len), persone = aNumero(t.persone) || 0, prenotata = !!(t.nome || persone), troppi = persone > p.posti;
                  return (
                    <TouchableOpacity key={t.id} onPress={() => setScelta(t.id)} activeOpacity={0.75} accessibilityRole="button"
                      accessibilityLabel={`Tavolo ${nomi[t.id]}, ${prenotata ? `${t.nome || 'prenotato'}, ${persone} persone` : 'libero'}, tavolata di ${metri(len)}, ${p.posti} posti`}
                      style={{
                        minHeight: 64, minWidth: 104, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1.5,
                        borderColor: troppi ? COLORS.danger : prenotata ? COLORS.ok : COLORS.bordoCampo,
                        backgroundColor: prenotata && !troppi ? COLORS.primarySoft : COLORS.card,
                      }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: troppi ? COLORS.danger : prenotata ? COLORS.primaryDark : COLORS.text }}>
                        {nomi[t.id]}{t.nome ? ` · ${t.nome}` : ''}
                      </Text>
                      <Text style={{ fontSize: 13, color: troppi ? COLORS.danger : prenotata ? COLORS.primaryDark : COLORS.muted }}>
                        {prenotata ? `${persone || '?'} pers.` : 'libera'} · {metri(len)}{t.ora ? ` · ${t.ora}` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {resto >= LUNGA_MIN && (
                  <TouchableOpacity onPress={() => setNuova({ fila: i, tavolata: nuovaTavolata() })} activeOpacity={0.75} accessibilityRole="button"
                    accessibilityLabel={`Aggiungi una prenotazione alla ${fila.nome}`}
                    style={{
                      minHeight: 64, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: COLORS.bordoCampo,
                      alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingHorizontal: 14,
                    }}>
                    <Icona nome="plus" size={22} colore={COLORS.azione} />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.azione, marginLeft: 4 }}>Prenotazione</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {pulsantino('share-variant-outline', 'Ai camerieri', () => invia().catch((e) => mostra(String(e && e.message || e))))}
          {pulsantino('bookmark-multiple-outline', 'Modelli', () => { azzera(); setFinestra('modelli'); })}
        </View>
        {tot.tavolate > 0 && (
          <Bottone testo="Svuota questa sala" ghost colore={COLORS.danger}
            onPress={() => conferma('Svuotare la sala?', `Verranno tolte tutte le tavolate della ${sala.nome.toLowerCase()} per ${fmtData(data)} a ${servizio.toLowerCase()}${tot.prenotate ? `, con ${plurale(tot.prenotate, 'prenotazione', 'prenotazioni')}` : ''}.`, () => cambiaFile(pianoVuoto(sala).file))} />
        )}
        <Text style={[S.muted, { marginTop: 12, marginLeft: 4 }]}>
          Le sale sono disegnate dalle piante con misure stimate. Davanti a ingresso, cucina e bagni resta sempre libero un metro e mezzo.
        </Text>
      </ScrollView>

      {!!posizione && (
        <SchedaTavolata sala={sala} piano={piano} fila={posizione.i} tavolata={piano.file[posizione.i][posizione.j]} sigla={nomi[scelta]}
          onChiudi={() => setScelta(null)}
          onSalva={(t) => { cambiaFile(piano.file.map((f) => f.map((x) => (x.id === t.id ? t : x)))); setScelta(null); mostra('Salvato ✓'); }}
          onElimina={() => { cambiaFile(piano.file.map((f) => f.filter((x) => x.id !== scelta))); setScelta(null); }} />
      )}
      {!!nuova && (
        <SchedaTavolata nuova sala={sala} piano={piano} fila={nuova.fila} tavolata={nuova.tavolata}
          onChiudi={() => setNuova(null)}
          onSalva={(t) => { cambiaFile(piano.file.map((f, i) => (i === nuova.fila ? [...f, t] : f))); setNuova(null); mostra('Prenotazione aggiunta ✓'); }} />
      )}

      <Modal visible={finestra === 'modelli'} animationType="slide" onRequestClose={() => setFinestra(null)}>
        <VistaModale>
          <Text style={S.h1}>Modelli</Text>
          <Text style={[S.muted, { marginBottom: 8 }]}>
            Un modello è una disposizione delle due sale con un nome, senza prenotazioni: la applichi a un giorno e poi scrivi chi si siede dove.
          </Text>
          {modelli.length === 0 && <Text style={[S.muted, { marginVertical: 8 }]}>Nessun modello salvato.</Text>}
          {modelli.map((m) => {
            const t = totali(COPPIE(m.dati));
            return (
              <View key={m.id} style={S.card}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: COLORS.text }}>{m.nome}</Text>
                <Text style={S.muted}>{plurale(t.tavolate, 'tavolata', 'tavolate')} · {t.posti} posti · {metri(t.metri)} di tavoli</Text>
                <Bottone testo={`Usa per ${fmtData(data)} · ${servizio}`} onPress={() => usaModello(m)} />
                <Bottone testo="Elimina il modello" ghost colore={COLORS.danger}
                  onPress={() => conferma('Eliminare il modello?', `"${m.nome}" non sarà più disponibile. Le disposizioni dei giorni già fatti non cambiano.`,
                    async () => { await eliminaModelloSale(m.id); setModelli(await modelliSale()); })} />
              </View>
            );
          })}
          <View style={S.card}>
            <Text style={S.h2}>Salva la disposizione di adesso</Text>
            <Campo label="Nome del modello" value={nomeModello} errore={errori.modello} onChange={setNomeModello} placeholder="Per esempio: Domenica" />
            {riepilogo}
            <Bottone testo="Salva come modello" onPress={salvaModello} />
          </View>
          <Bottone testo="Chiudi" ghost onPress={() => setFinestra(null)} />
        </VistaModale>
        {avviso}
      </Modal>
      {avviso}
    </View>
  );
}
