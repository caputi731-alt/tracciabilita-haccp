/**
 * Sezione "Sale": la disposizione dei tavoli nelle due sale mensa per un giorno e un servizio, con le prenotazioni.
 * In alto la sala in 3D (SaleVista.js), sotto la disposizione guidata: file parallele, in ogni fila le tavolate
 * (tavoli uniti in linea). Le posizioni e le distanze le calcola sale.js; qui si sceglie solo cosa mettere.
 * Ogni modifica si salva subito per quel giorno e quel servizio. I modelli sono disposizioni con un nome, da riusare.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, TEMA_SCURO, aNumero, numeroPerCampo, oggiLocale, fmtData } from './theme';
import { Icona, Bottone, Campo, CampoData, Segmenti, VistaModale, Vuoto, conferma, useAvviso, useErrori } from './UI';
import {
  disposizioneGiorno, salvaDisposizioneGiorno, modelliSale, salvaModelloSale, eliminaModelloSale, misureSale, salvaMisureSale,
  getImpostazioni,
} from './database';
import {
  SALE, ID_SALE, SERVIZI, TAVOLI, MASSIMO_TAVOLI, DAL_MURO, TRA_TAVOLI, salaCon, posti, lunghezza, maxFile, restoFila, entraTavolata,
  pianoBase, pianoVuoto, senzaPrenotazioni, nuovaTavolata, disponi, sigle, totali, datiScenaSala,
} from './sale';
import { htmlDisposizioneSale } from './report';
import { condividiPdf } from './condividi';

const NOMI_SALE = ID_SALE.map((id) => SALE[id].nome.replace('Sala ', '').replace(/^./, (c) => c.toUpperCase()));
const metri = (n) => `${String(Math.round(n * 100) / 100).replace('.', ',')} m`;
const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;
const composizione = (t) => [t.t180 ? `${t.t180} × 180` : '', t.t90 ? `${t.t90} × 90` : ''].filter(Boolean).join(' + ');
const VUOTI = () => Object.fromEntries(ID_SALE.map((id) => [id, pianoVuoto()]));

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

/** − numero + per scegliere quanti tavoli di un tipo. */
function Contatore({ etichetta, valore, meno, piu, puoPiu }) {
  const tasto = (icona, azione, attivo, voce) => (
    <TouchableOpacity onPress={azione} disabled={!attivo} accessibilityRole="button" accessibilityLabel={`${voce} ${etichetta}`}
      style={{
        width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
        backgroundColor: COLORS.contenitore, opacity: attivo ? 1 : 0.35,
      }}>
      <Icona nome={icona} size={24} colore={COLORS.text} />
    </TouchableOpacity>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
      <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.text }}>{etichetta}</Text>
      {tasto('minus', meno, valore > 0, 'Togli')}
      <Text style={{ width: 44, textAlign: 'center', fontSize: 22, fontWeight: '800', color: COLORS.text }}>{valore}</Text>
      {tasto('plus', piu, puoPiu, 'Aggiungi')}
    </View>
  );
}

/** La tavolata toccata: da quali tavoli è fatta e chi l'ha prenotata. */
function SchedaTavolata({ sala, fila, tavolata, sigla, onSalva, onElimina, onChiudi }) {
  const [t, setT] = useState(tavolata);
  const { errori, segnala, azzera, riepilogo } = useErrori();
  useEffect(() => { setT(tavolata); azzera(); }, [tavolata, azzera]);
  const p = posti(t);
  // spazio che resta nella fila contando le altre tavolate e questa com'è adesso
  const resto = restoFila(sala, fila.map((x) => (x.id === t.id ? t : x)));
  const pezzi = t.t180 + t.t90;
  const puo = (tipo) => pezzi < MASSIMO_TAVOLI && resto >= TAVOLI[tipo] - 1e-9;
  const cambia = (tipo, d) => setT((v) => ({ ...v, [tipo]: Math.max(0, v[tipo] + d) }));
  const persone = aNumero(t.persone);
  const troppi = persone !== null && persone > p.posti;

  const salva = () => {
    azzera();
    if (pezzi === 0) return segnala('tavoli', 'Una tavolata ha almeno un tavolo: per toglierla usa "Togli la tavolata"');
    if (String(t.persone).trim() && (persone === null || persone < 0 || !Number.isInteger(persone))) return segnala('persone', 'Scrivi il numero di persone, per esempio 8');
    return onSalva({ ...t, nome: t.nome.trim(), persone: persone ? String(persone) : '', ora: t.ora.trim(), note: t.note.trim() });
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onChiudi}>
      <VistaModale>
        <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 1, color: COLORS.muted }}>{sala.nome.toUpperCase()}</Text>
        <Text style={S.h1}>Tavolo {sigla}</Text>

        <View style={S.card}>
          <Text style={S.h2}>Tavoli uniti</Text>
          <Contatore etichetta="Tavoli da 180 × 90" valore={t.t180} meno={() => cambia('t180', -1)} piu={() => cambia('t180', 1)} puoPiu={puo('t180')} />
          <Contatore etichetta="Tavoli da 90 × 90" valore={t.t90} meno={() => cambia('t90', -1)} piu={() => cambia('t90', 1)} puoPiu={puo('t90')} />
          <View style={{ backgroundColor: COLORS.primarySoft, borderRadius: 16, padding: 14, marginTop: 14 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.primaryDark }}>{plurale(p.posti, 'posto', 'posti')}</Text>
            <Text style={{ fontSize: 14, color: COLORS.primaryDark }}>
              {pezzi === 0 ? 'Aggiungi almeno un tavolo'
                : `Lunga ${metri(lunghezza(t))}: ${p.lati} per lato${p.capotavola === 2 ? ' e 2 capotavola' : ' e 1 capotavola'} (80 cm a persona)`}
            </Text>
          </View>
          {!puo('t90') && pezzi > 0 && (
            <Text style={[S.muted, { marginTop: 8 }]}>
              {pezzi >= MASSIMO_TAVOLI ? `Al massimo ${MASSIMO_TAVOLI} tavoli uniti.` : 'In questa fila non c\'è altro spazio: restano liberi i passaggi dai muri e fra le tavolate.'}
            </Text>
          )}
          {errori.tavoli && <Text style={{ color: COLORS.danger, fontWeight: '700', marginTop: 8 }}>{errori.tavoli.testo}</Text>}
        </View>

        <View style={S.card}>
          <Text style={S.h2}>Prenotazione</Text>
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
          {troppi && (
            <Text style={{ color: COLORS.danger, fontWeight: '700', marginTop: 8 }}>
              {persone} persone su {plurale(p.posti, 'posto', 'posti')}: starebbero stretti. Unisci un altro tavolo o dividi il gruppo.
            </Text>
          )}
          <Campo label="Note" value={t.note} onChange={(v) => setT((x) => ({ ...x, note: v }))} placeholder="Seggiolone, intolleranze, torta…" />
          {riepilogo}
        </View>

        <Bottone testo="Fatto" onPress={salva} />
        {!!(tavolata.nome || tavolata.persone) && (
          <Bottone testo="Libera il tavolo" ghost onPress={() => onSalva({ ...t, nome: '', persone: '', ora: '', note: '' })} />
        )}
        <Bottone testo="Togli la tavolata" ghost colore={COLORS.danger} onPress={onElimina} />
        <Bottone testo="Chiudi senza salvare" ghost onPress={onChiudi} />
      </VistaModale>
    </Modal>
  );
}

export default function SaleScreen() {
  const [data, setData] = useState(oggiLocale());
  const [servizio, setServizio] = useState(new Date().getHours() < 16 ? SERVIZI[0] : SERVIZI[1]);
  const [quale, setQuale] = useState(0); // sala mostrata: posizione in ID_SALE
  const [dati, setDati] = useState(VUOTI);
  const [caricato, setCaricato] = useState(false);
  const [misure, setMisure] = useState({});
  const [modelli, setModelli] = useState([]);
  const [scena, setScena] = useState('attesa');
  const [scelta, setScelta] = useState(null); // id della tavolata aperta
  const [finestra, setFinestra] = useState(null); // 'modelli' | 'misure'
  const [nomeModello, setNomeModello] = useState('');
  const [formMisure, setFormMisure] = useState({ L: '', W: '' });
  const { errori, segnala, azzera, riepilogo } = useErrori();
  const { avviso, mostra } = useAvviso();
  const schermo = useWindowDimensions();
  const chiave = useRef('');

  const idSala = ID_SALE[quale];
  const sala = useMemo(() => salaCon(idSala, misure), [idSala, misure]);
  const piano = dati[idSala] || pianoVuoto();

  const carica = useCallback(async () => {
    const k = `${data}|${servizio}`;
    chiave.current = k;
    const [d, m, mod] = [await disposizioneGiorno(data, servizio), await misureSale(), await modelliSale()];
    if (chiave.current !== k) return; // nel frattempo è stato scelto un altro giorno
    setDati(d || VUOTI()); setMisure(m); setModelli(mod); setCaricato(true);
  }, [data, servizio]);
  useFocusEffect(useCallback(() => { carica().catch(() => setCaricato(true)); }, [carica]));

  /** Ogni modifica si salva subito per questo giorno e questo servizio. */
  const cambia = useCallback((nuovi) => {
    setDati(nuovi);
    salvaDisposizioneGiorno(data, servizio, nuovi).catch((e) => mostra(`Non salvato: ${String(e && e.message || e)}`));
  }, [data, servizio, mostra]);
  const cambiaPiano = (nuovo) => cambia({ ...dati, [idSala]: nuovo });
  const cambiaFile = (file) => cambiaPiano({ file: file.filter((f) => f.length > 0) });

  const disposta = useMemo(() => disponi(sala, piano), [sala, piano]);
  const nomi = useMemo(() => sigle(sala, piano), [sala, piano]);
  const tot = useMemo(() => totali(piano), [piano]);
  const totTutte = useMemo(() => totali(Object.values(dati)), [dati]);
  const scenaDati = useMemo(() => datiScenaSala(sala, piano, { scuro: TEMA_SCURO, scelto: scelta }), [sala, piano, scelta]);
  const Sala3D = scena === 'no' ? null : moduloSala();
  const senza3d = useCallback(() => setScena('no'), []);
  const suTavolata = useCallback((id) => setScelta(id), []);

  const aggiungiTavolata = (i) => {
    const fila = piano.file[i];
    const tipo = entraTavolata(sala, fila, TAVOLI.t180) ? 't180' : 't90';
    const nuova = nuovaTavolata(tipo === 't180' ? 1 : 0, tipo === 't90' ? 1 : 0);
    cambiaFile(piano.file.map((f, j) => (j === i ? [...f, nuova] : f)));
  };
  const aggiungiFila = () => cambiaFile([...piano.file, [nuovaTavolata(1, 0)]]);
  const inizia = () => cambiaPiano(pianoBase(sala));

  const posizione = useMemo(() => {
    for (let i = 0; i < piano.file.length; i++) {
      const j = piano.file[i].findIndex((t) => t.id === scelta);
      if (j >= 0) return { i, j };
    }
    return null;
  }, [piano, scelta]);

  const usaModello = (m) => {
    const applica = () => {
      cambia(Object.fromEntries(ID_SALE.map((id) => [id, senzaPrenotazioni(m.dati[id])])));
      setFinestra(null);
      mostra(`Disposizione "${m.nome}" applicata`);
    };
    if (totTutte.tavolate === 0) applica();
    else conferma('Sostituire la disposizione?', totTutte.prenotate
      ? `Per ${fmtData(data)} a ${servizio.toLowerCase()} ci sono ${plurale(totTutte.prenotate, 'prenotazione', 'prenotazioni')}: verranno tolte insieme ai tavoli.`
      : 'I tavoli messi finora in tutte e due le sale verranno sostituiti da quelli del modello.', applica);
  };
  const salvaModello = async () => {
    azzera();
    if (!nomeModello.trim()) return segnala('modello', 'Scrivi il nome del modello, per esempio "Domenica"');
    if (totTutte.tavolate === 0) return segnala('modello', 'Non c\'è ancora nessun tavolo da salvare');
    await salvaModelloSale(nomeModello, dati);
    setModelli(await modelliSale()); setNomeModello('');
    return mostra('Modello salvato ✓');
  };

  const apriMisure = () => { azzera(); setFormMisure({ L: numeroPerCampo(sala.L), W: numeroPerCampo(sala.W) }); setFinestra('misure'); };
  const salvaMisure = async () => {
    azzera();
    const L = aNumero(formMisure.L), W = aNumero(formMisure.W);
    let ok = true;
    if (L === null || L < 3 || L > 60) ok = segnala('L', 'Scrivi la lunghezza in metri, fra 3 e 60');
    if (W === null || W < 3 || W > 60) ok = segnala('W', 'Scrivi la larghezza in metri, fra 3 e 60');
    if (!ok) return;
    const nuove = { ...misure, [idSala]: { L, W } };
    await salvaMisureSale(nuove);
    setMisure(nuove); setFinestra(null);
    mostra('Misure salvate ✓');
  };

  const invia = async () => {
    const html = htmlDisposizioneSale({
      data, servizio, sale: ID_SALE.map((id) => ({ sala: salaCon(id, misure), piano: dati[id] })),
    }, await getImpostazioni());
    await condividiPdf(html, `Tavoli ${data} ${servizio}`);
  };

  const libere = maxFile(sala) - piano.file.length;
  const altoScena = Math.round(Math.min(340, Math.max(210, schermo.height * 0.3)));
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
            <CampoData label="Giorno" value={data} facoltativo={false} onChange={(v) => { if (v) { setCaricato(false); setData(v); } }}
              scorciatoie={[{ testo: 'Domani', giorni: 1 }, { testo: 'Fra una settimana', giorni: 7 }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Segmenti opzioni={SERVIZI} valore={servizio} onChange={(v) => { setCaricato(false); setServizio(v); }} />
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
        {caricato && piano.file.length === 0 ? (
          <Vuoto icona="table-furniture" titolo="Nessun tavolo in questa sala"
            testo={`${sala.nome}, ${fmtData(data)} a ${servizio.toLowerCase()}. Parti dalle due file parallele oppure da un modello salvato.`}
            azione="Metti due file parallele" onAzione={inizia} />
        ) : (
          <>
            <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text, marginLeft: 4 }}>
              {plurale(tot.tavolate, 'tavolata', 'tavolate')} · {tot.posti} posti{tot.persone ? ` · ${tot.persone} persone prenotate` : ''}
            </Text>
            <Text style={[S.muted, { marginLeft: 4, marginBottom: 10 }]}>
              Tavoli usati: {tot.t180} da 180, {tot.t90} da 90
              {totTutte.tavolate > tot.tavolate ? ` · nelle due sale ${totTutte.t180} da 180 e ${totTutte.t90} da 90` : ''}
            </Text>
            {disposta.problemi.length > 0 && (
              <View style={{ backgroundColor: COLORS.dangerSoft, borderRadius: 16, padding: 14, marginBottom: 12 }}>
                <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 15 }}>Da sistemare</Text>
                {disposta.problemi.map((p) => <Text key={p} style={{ color: COLORS.danger, fontSize: 15, marginTop: 2 }}>{p}</Text>)}
              </View>
            )}

            {piano.file.map((fila, i) => (
              <View key={`fila${i}`} style={S.card}>
                <Text style={S.h2}>Fila {i + 1}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {fila.map((t) => {
                    const p = posti(t), persone = aNumero(t.persone) || 0, prenotata = !!(t.nome || persone), troppi = persone > p.posti;
                    return (
                      <TouchableOpacity key={t.id} onPress={() => setScelta(t.id)} activeOpacity={0.75} accessibilityRole="button"
                        accessibilityLabel={`Tavolo ${nomi[t.id]}, ${composizione(t)}, ${prenotata ? `${t.nome || 'prenotato'}, ${persone} persone su ${p.posti} posti` : `libero, ${p.posti} posti`}`}
                        style={{
                          minHeight: 64, minWidth: 104, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1.5,
                          borderColor: troppi ? COLORS.danger : prenotata ? COLORS.ok : COLORS.bordoCampo,
                          backgroundColor: prenotata && !troppi ? COLORS.primarySoft : COLORS.card,
                        }}>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: troppi ? COLORS.danger : prenotata ? COLORS.primaryDark : COLORS.text }}>
                          {nomi[t.id]}{t.nome ? ` · ${t.nome}` : ''}
                        </Text>
                        <Text style={{ fontSize: 13, color: troppi ? COLORS.danger : prenotata ? COLORS.primaryDark : COLORS.muted }}>
                          {composizione(t)} · {prenotata ? `${persone || '?'} su ${p.posti}${t.ora ? ` · ${t.ora}` : ''}` : `${p.posti} posti`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {entraTavolata(sala, fila, TAVOLI.t90) && (
                    <TouchableOpacity onPress={() => aggiungiTavolata(i)} activeOpacity={0.75} accessibilityRole="button"
                      accessibilityLabel={`Aggiungi un tavolo alla fila ${i + 1}`}
                      style={{
                        minHeight: 64, minWidth: 64, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: COLORS.bordoCampo,
                        alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingHorizontal: 12,
                      }}>
                      <Icona nome="plus" size={22} colore={COLORS.azione} />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.azione, marginLeft: 4 }}>Tavolo</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
            {libere > 0 && <Bottone testo="Aggiungi una fila" icona="plus" ghost onPress={aggiungiFila} />}
            {libere <= 0 && (
              <Text style={[S.muted, { marginLeft: 4, marginTop: 4 }]}>
                In questa sala entrano al massimo {plurale(maxFile(sala), 'fila', 'file')}: {metri(DAL_MURO)} liberi dai muri e {metri(TRA_TAVOLI)} fra una fila e l'altra.
              </Text>
            )}
          </>
        )}

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          {pulsantino('bookmark-multiple-outline', 'Modelli', () => { azzera(); setFinestra('modelli'); })}
          {pulsantino('share-variant-outline', 'Ai camerieri', () => invia().catch((e) => mostra(String(e && e.message || e))))}
          {pulsantino('ruler', 'Misure', apriMisure)}
        </View>
        {piano.file.length > 0 && (
          <Bottone testo="Svuota questa sala" ghost colore={COLORS.danger}
            onPress={() => conferma('Svuotare la sala?', `Verranno tolti tutti i tavoli della ${sala.nome.toLowerCase()} per ${fmtData(data)} a ${servizio.toLowerCase()}${tot.prenotate ? `, con ${plurale(tot.prenotate, 'prenotazione', 'prenotazioni')}` : ''}.`, () => cambiaPiano(pianoVuoto()))} />
        )}
      </ScrollView>

      {!!posizione && (
        <SchedaTavolata sala={sala} fila={piano.file[posizione.i]} tavolata={piano.file[posizione.i][posizione.j]} sigla={nomi[scelta]}
          onChiudi={() => setScelta(null)}
          onSalva={(t) => { cambiaFile(piano.file.map((f) => f.map((x) => (x.id === t.id ? t : x)))); setScelta(null); mostra('Salvato ✓'); }}
          onElimina={() => { cambiaFile(piano.file.map((f) => f.filter((x) => x.id !== scelta))); setScelta(null); }} />
      )}

      <Modal visible={finestra === 'modelli'} animationType="slide" onRequestClose={() => setFinestra(null)}>
        <VistaModale>
          <Text style={S.h1}>Modelli</Text>
          <Text style={[S.muted, { marginBottom: 8 }]}>
            Un modello è una disposizione delle due sale con un nome, senza prenotazioni: la applichi a un giorno e poi la ritocchi.
          </Text>
          {modelli.length === 0 && <Text style={[S.muted, { marginVertical: 8 }]}>Nessun modello salvato.</Text>}
          {modelli.map((m) => {
            const t = totali(Object.values(m.dati));
            return (
              <View key={m.id} style={S.card}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: COLORS.text }}>{m.nome}</Text>
                <Text style={S.muted}>{plurale(t.tavolate, 'tavolata', 'tavolate')} · {t.posti} posti · {t.t180} da 180, {t.t90} da 90</Text>
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

      <Modal visible={finestra === 'misure'} animationType="slide" onRequestClose={() => setFinestra(null)}>
        <VistaModale>
          <Text style={S.h1}>Misure della {sala.nome.toLowerCase()}</Text>
          <Text style={[S.muted, { marginBottom: 8 }]}>
            Le misure di partenza sono ricavate dalla pianta e sono approssimate. Misura lo spazio dove stanno i tavoli, da muro a muro,
            e correggile: da qui dipende quanti tavoli entrano.
          </Text>
          <View style={S.card}>
            <Campo label="Lato lungo (metri)" value={formMisure.L} errore={errori.L} keyboardType="numbers-and-punctuation"
              onChange={(v) => setFormMisure((f) => ({ ...f, L: v }))} />
            <Campo label="Lato corto (metri)" value={formMisure.W} errore={errori.W} keyboardType="numbers-and-punctuation"
              onChange={(v) => setFormMisure((f) => ({ ...f, W: v }))} />
            {riepilogo}
            <Bottone testo="Salva" onPress={salvaMisure} />
          </View>
          <Bottone testo="Chiudi" ghost onPress={() => setFinestra(null)} />
        </VistaModale>
      </Modal>
      {avviso}
    </View>
  );
}
