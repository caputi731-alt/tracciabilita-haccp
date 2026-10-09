/**
 * Sezione "Sale": le prenotazioni di un giorno e di un servizio, sistemate nelle due sale mensa.
 * In alto la sala in 3D (SaleVista.js), sotto le file della sala: in ogni fila si aggiunge una prenotazione (nome, persone, ora)
 * e l'app dimensiona la tavolata e la mette al suo posto (sale.js). Ogni modifica si salva subito per quel giorno e quel
 * servizio. Una prenotazione si sposta tenendola premuta sulla piantina e trascinandola su un'altra fila; con il telefono in
 * orizzontale le due sale si vedono insieme, a tutto schermo, e si sposta anche dall'una all'altra.
 * I modelli sono disposizioni con un nome, senza prenotazioni, da riusare.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, TEMA_SCURO, aNumero, oggiLocale, fmtData } from './theme';
import { Icona, Bottone, Campo, CampoData, Segmenti, Sezione, VistaModale, conferma, useAvviso, useErrori } from './UI';
import {
  disposizioneGiorno, salvaDisposizioneGiorno, modelliSale, salvaModelloSale, eliminaModelloSale, getImpostazioni,
} from './database';
import {
  SALE, ID_SALE, SERVIZI, LUNGA_MIN, LUNGA_MAX, posti, lunghezza, lunghezzaPer, restoFila, entra, pianoVuoto, sistemaPiano, senzaPrenotazioni,
  nuovaTavolata, disponi, sigle, totali, datiScenaSala, datiScenaSale, metri, metti, togli, trova, filaVicina,
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
function SchedaTavolata({ sala, piano, fila, tavolata, sigla, nuova, destinazioni = [], onSalva, onSposta, onElimina, onChiudi }) {
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
        {!nuova && destinazioni.length > 0 && (
          <Sezione titolo="Sposta in un'altra fila o sala" icona="swap-horizontal" riassunto="Oppure tienila premuta sulla piantina e trascinala">
            <Text style={S.muted}>La prenotazione si sposta com'è adesso salvata; le file dove non entra sono spente.</Text>
            {destinazioni.map((d) => (
              <Bottone key={`${d.sala}-${d.f}`} ghost disabilitato={!d.entra} onPress={() => onSposta(d.sala, d.f)}
                testo={`${d.nomeSala} · ${d.nome}${d.entra ? '' : ' (non entra)'}`} />
            ))}
          </Sezione>
        )}
        {!nuova && <Bottone testo="Togli la tavolata" ghost colore={COLORS.danger} onPress={onElimina} />}
        <Bottone testo={nuova ? 'Annulla' : 'Chiudi senza salvare'} ghost onPress={onChiudi} />
      </VistaModale>
    </Modal>
  );
}

/** Il telefono si può girare solo in questa sezione: in orizzontale le due sale si vedono insieme, a tutto schermo. */
function orientamento(libero) {
  try {
    const O = require('expo-screen-orientation');
    return libero ? O.unlockAsync() : O.lockAsync(O.OrientationLock.PORTRAIT_UP);
  } catch (e) {
    return null;
  }
}

export default function SaleScreen({ suTuttoSchermo }) {
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
  // ogni sala con le prenotazioni al loro posto
  const piani = useMemo(() => Object.fromEntries(ID_SALE.map((id) => [id, sistemaPiano(SALE[id], dati[id])])), [dati]);
  const piano = piani[idSala];
  const largo = schermo.width > schermo.height;   // telefono in orizzontale

  useEffect(() => {
    Promise.resolve(orientamento(true)).catch(() => {});
    return () => { Promise.resolve(orientamento(false)).catch(() => {}); };
  }, []);
  useEffect(() => { if (suTuttoSchermo) suTuttoSchermo(largo); }, [largo, suTuttoSchermo]);
  useEffect(() => () => { if (suTuttoSchermo) suTuttoSchermo(false); }, [suTuttoSchermo]);

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
  const cambiaPiano = (id, nuovo) => cambia({ ...piani, [id]: nuovo });

  const disposta = useMemo(() => disponi(sala, piano), [sala, piano]);
  const nomi = useMemo(() => sigle(sala, piano), [sala, piano]);
  const tot = useMemo(() => totali([[sala, piano]]), [sala, piano]);
  const totTutte = useMemo(() => totali(COPPIE(piani)), [piani]);
  // in verticale la sala scelta, in orizzontale tutte e due una accanto all'altra
  const scenaDati = useMemo(() => (largo
    ? datiScenaSale(COPPIE(piani), { scuro: TEMA_SCURO, scelto: scelta })
    : datiScenaSala(sala, piano, { scuro: TEMA_SCURO, scelto: scelta })), [largo, piani, sala, piano, scelta]);
  const Sala3D = scena === 'no' ? null : moduloSala();
  const senza3d = useCallback(() => setScena('no'), []);
  const suTavolata = useCallback((id) => setScelta(id), []);

  // la prenotazione aperta: può essere in una qualsiasi delle due sale (in orizzontale si vedono insieme)
  const aperta = useMemo(() => {
    if (!scelta) return null;
    for (const id of ID_SALE) { const q = trova(SALE[id], piani[id], scelta); if (q) return { sala: id, ...q }; }
    return null;
  }, [piani, scelta]);

  /** Sposta una prenotazione in una fila (di questa o dell'altra sala), vicino a `centro` se indicato. */
  const sposta = useCallback((id, aSala, f, centro = null) => {
    const da = ID_SALE.find((x) => trova(SALE[x], piani[x], id));
    if (!da) return false;
    const { t } = trova(SALE[da], piani[da], id);
    const nuovo = metti(SALE[aSala], da === aSala ? piani[da] : piani[aSala], f, t, centro);
    if (!nuovo) { mostra(`Lì non c'è posto per una tavolata di ${metri(lunghezza(t))}`); return false; }
    cambia(da === aSala ? { ...piani, [da]: nuovo } : { ...piani, [da]: togli(SALE[da], piani[da], id), [aSala]: nuovo });
    return true;
  }, [piani, cambia, mostra]);

  /** Una prenotazione trascinata sulla piantina: va sulla fila più vicina al punto in cui è stata lasciata. */
  const suSposta = useCallback(({ id, sala: aSala, x, y }) => {
    if (!SALE[aSala]) return;
    const q = filaVicina(SALE[aSala], x, y);
    if (q && sposta(id, aSala, q.f, q.centro)) mostra('Spostata ✓');
  }, [sposta, mostra]);

  const destinazioni = useMemo(() => (aperta ? ID_SALE.flatMap((id) => SALE[id].file.map((fila, f) => ({
    sala: id, f, nomeSala: SALE[id].nome.replace('Sala ', '').replace(/^./, (c) => c.toUpperCase()), nome: fila.nome,
    entra: entra(SALE[id], piani[id], f, lunghezza(aperta.t), aperta.t.id),
  })).filter((d) => !(d.sala === aperta.sala && d.f === aperta.f))) : []), [aperta, piani]);

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
    await salvaModelloSale(nomeModello, piani);
    setModelli(await modelliSale()); setNomeModello('');
    return mostra('Modello salvato ✓');
  };

  const invia = async () => {
    const html = htmlDisposizioneSale({ data, servizio, sale: ID_SALE.map((id) => ({ sala: SALE[id], piano: piani[id] })) }, await getImpostazioni());
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

  const giornoBreve = new Date(`${data}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });

  // telefono in orizzontale: le due sale insieme a tutto schermo, per spostare le prenotazioni anche da una sala all'altra
  if (largo && Sala3D) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.contenitore }}>
        <RiparoSala suRotto={senza3d}>
          <Sala3D dati={scenaDati} suTavolata={suTavolata} suSposta={suSposta} suStato={setScena} />
        </RiparoSala>
        <View pointerEvents="none" style={{ position: 'absolute', left: 12, top: 10, backgroundColor: COLORS.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text }}>
            {giornoBreve} · {servizio} · {plurale(totTutte.persone, 'persona', 'persone')}
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.muted }}>Tieni premuta una prenotazione e trascinala · gira il telefono per tornare all'elenco</Text>
        </View>
      {!!aperta && (
        <SchedaTavolata sala={SALE[aperta.sala]} piano={piani[aperta.sala]} fila={aperta.f} tavolata={aperta.t} sigla={sigle(SALE[aperta.sala], piani[aperta.sala])[scelta]}
          destinazioni={destinazioni}
          onChiudi={() => setScelta(null)}
          onSalva={(t) => {
            // resta dov'è, o nel posto libero più vicino se allungandola non ci sta più
            const nuovo = metti(SALE[aperta.sala], piani[aperta.sala], aperta.f, t, aperta.t.p === null ? null : aperta.t.p + lunghezza(aperta.t) / 2);
            if (!nuovo) { mostra('In questa fila non c\'è posto per una tavolata così lunga'); return; }
            cambiaPiano(aperta.sala, nuovo); setScelta(null); mostra('Salvato ✓');
          }}
          onSposta={(aSala, f) => { if (sposta(scelta, aSala, f)) { setScelta(null); mostra('Spostata ✓'); } }}
          onElimina={() => { cambiaPiano(aperta.sala, togli(SALE[aperta.sala], piani[aperta.sala], scelta)); setScelta(null); }} />
      )}
      {!!nuova && (
        <SchedaTavolata nuova sala={sala} piano={piano} fila={nuova.fila} tavolata={nuova.tavolata}
          onChiudi={() => setNuova(null)}
          onSalva={(t) => {
            const nuovo = metti(sala, piano, nuova.fila, t);
            if (!nuovo) { mostra('In questa fila non c\'è posto'); return; }
            cambiaPiano(idSala, nuovo); setNuova(null); mostra('Prenotazione aggiunta ✓');
          }} />
      )}

        {avviso}
      </View>
    );
  }

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
            <Sala3D dati={scenaDati} suTavolata={suTavolata} suSposta={suSposta} suStato={setScena} />
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
            onPress={() => conferma('Svuotare la sala?', `Verranno tolte tutte le tavolate della ${sala.nome.toLowerCase()} per ${fmtData(data)} a ${servizio.toLowerCase()}${tot.prenotate ? `, con ${plurale(tot.prenotate, 'prenotazione', 'prenotazioni')}` : ''}.`, () => cambiaPiano(idSala, pianoVuoto(sala)))} />
        )}
        <Text style={[S.muted, { marginTop: 12, marginLeft: 4 }]}>
          Per spostare una prenotazione tienila premuta sulla piantina e trascinala su un'altra fila. Girando il telefono in orizzontale
          vedi le due sale insieme e la sposti anche dall'una all'altra. Le sale sono disegnate dalle piante con misure stimate;
          davanti a ingresso, cucina e bagni resta sempre libero un metro e mezzo.
        </Text>
      </ScrollView>

      {!!aperta && (
        <SchedaTavolata sala={SALE[aperta.sala]} piano={piani[aperta.sala]} fila={aperta.f} tavolata={aperta.t} sigla={sigle(SALE[aperta.sala], piani[aperta.sala])[scelta]}
          destinazioni={destinazioni}
          onChiudi={() => setScelta(null)}
          onSalva={(t) => {
            // resta dov'è, o nel posto libero più vicino se allungandola non ci sta più
            const nuovo = metti(SALE[aperta.sala], piani[aperta.sala], aperta.f, t, aperta.t.p === null ? null : aperta.t.p + lunghezza(aperta.t) / 2);
            if (!nuovo) { mostra('In questa fila non c\'è posto per una tavolata così lunga'); return; }
            cambiaPiano(aperta.sala, nuovo); setScelta(null); mostra('Salvato ✓');
          }}
          onSposta={(aSala, f) => { if (sposta(scelta, aSala, f)) { setScelta(null); mostra('Spostata ✓'); } }}
          onElimina={() => { cambiaPiano(aperta.sala, togli(SALE[aperta.sala], piani[aperta.sala], scelta)); setScelta(null); }} />
      )}
      {!!nuova && (
        <SchedaTavolata nuova sala={sala} piano={piano} fila={nuova.fila} tavolata={nuova.tavolata}
          onChiudi={() => setNuova(null)}
          onSalva={(t) => {
            const nuovo = metti(sala, piano, nuova.fila, t);
            if (!nuovo) { mostra('In questa fila non c\'è posto'); return; }
            cambiaPiano(idSala, nuovo); setNuova(null); mostra('Prenotazione aggiunta ✓');
          }} />
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
