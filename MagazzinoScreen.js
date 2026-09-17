import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtData, fmtDataOra, giorniAllaScadenza } from './theme';
import {
  Campo, Bottone, Chips, ModaleModifica, useAvviso, conferma, useFoto, AnteprimaFoto,
} from './UI';
import {
  listaLotti, registraScarico, query, correggiRecord, correggiUscita, annullaCarico, impostaFotoLotto,
} from './database';

const fmtQ = (n) => (n === null || n === undefined ? '—'
  : (Math.round(Number(n) * 1000) / 1000).toLocaleString('it-IT'));
const aNumero = (t) => {
  const n = Number(String(t).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

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

export default function MagazzinoScreen() {
  const [lotti, setLotti] = useState([]);
  const [cerca, setCerca] = useState('');
  const [aperti, setAperti] = useState({});
  const [sel, setSel] = useState(null);           // lotto aperto nel dettaglio
  const [storico, setStorico] = useState([]);
  const [uscita, setUscita] = useState(null);     // { gruppo | lotto, qta, causale }
  const [modCarico, setModCarico] = useState(false);
  const [modUscita, setModUscita] = useState(null);
  const [qtaUscita, setQtaUscita] = useState('');
  const { avviso, mostra } = useAvviso();
  const { chiediFoto, fotocamera } = useFoto();

  const ricarica = useCallback(() => { listaLotti(cerca).then(setLotti); }, [cerca]);
  useFocusEffect(ricarica);
  React.useEffect(() => { ricarica(); }, [cerca]);

  // raggruppa i lotti per prodotto (e unità di misura)
  const gruppi = [];
  const mappa = {};
  for (const l of lotti) {
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
    setSel(l);
    setStorico(await query('SELECT * FROM movimenti WHERE lotto_id = ? ORDER BY data_ora DESC', [l.id]));
  };
  const ricaricaLotto = async (id) => {
    const nuovi = await listaLotti(cerca);
    setLotti(nuovi);
    const l = nuovi.find((x) => x.id === id);
    if (l) await apriLotto(l); else setSel(null);
  };

  /* --- uscite: su un gruppo si scarica in ordine FIFO, anche su più lotti --- */
  const confermaUscita = async () => {
    const q = aNumero(uscita.qta);
    if (!q || q <= 0) return Alert.alert('Quantità non valida', 'Inserisci un numero maggiore di zero.');
    const elenco = uscita.lotto ? [uscita.lotto] : uscita.gruppo.lotti;
    const disponibile = elenco.reduce((s, l) => s + Number(l.quantita_residua), 0);
    if (q > disponibile + 1e-9) {
      return Alert.alert('Quantità eccessiva', `Disponibili ${fmtQ(disponibile)} ${elenco[0].unita_misura || ''}.`);
    }
    let resto = q;
    const usati = [];
    for (const l of elenco) {
      if (resto <= 1e-9) break;
      const parte = Math.min(resto, Number(l.quantita_residua));
      if (parte <= 0) continue;
      await registraScarico(l.id, Math.round(parte * 1000) / 1000, uscita.causale);
      usati.push(l.numero_lotto || `#${l.id}`);
      resto -= parte;
    }
    const idLotto = uscita.lotto ? uscita.lotto.id : null;
    setUscita(null);
    if (idLotto) await ricaricaLotto(idLotto); else ricarica();
    mostra(`Salvato ✓ ${fmtQ(q)} ${elenco[0].unita_misura || ''} (${usati.length > 1 ? `lotti ${usati.join(', ')}` : `lotto ${usati[0]}`})`);
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
      <Modal visible={!!uscita} transparent animationType="fade" onRequestClose={() => setUscita(null)}>
        {uscita && (() => {
          const elenco = uscita.lotto ? [uscita.lotto] : uscita.gruppo.lotti;
          const um = elenco[0].unita_misura || '';
          const disp = elenco.reduce((s, l) => s + Number(l.quantita_residua), 0);
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
                <Campo label={`Quantità (${um})`} value={uscita.qta} keyboardType="decimal-pad" autoFocus
                  onChange={(v) => setUscita((u) => ({ ...u, qta: v }))} />
                <View style={[S.chipWrap, { marginTop: 10 }]}>
                  <TouchableOpacity style={S.chip}
                    onPress={() => setUscita((u) => ({ ...u, qta: String(Number(elenco[0].quantita_residua)).replace('.', ',') }))}>
                    <Text style={S.chipText}>Tutto il primo lotto</Text>
                  </TouchableOpacity>
                  {elenco.length > 1 && (
                    <TouchableOpacity style={S.chip}
                      onPress={() => setUscita((u) => ({ ...u, qta: String(Math.round(disp * 1000) / 1000).replace('.', ',') }))}>
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
                <Bottone testo="Annulla" ghost onPress={() => setUscita(null)} />
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

  const Riquadro = ({ titolo, children }) => (
    <View style={S.card}>
      {!!titolo && <Text style={S.h2}>{titolo}</Text>}
      {children}
    </View>
  );

  return (
    <View style={S.screen}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <TextInput style={S.input} placeholder="Cerca prodotto o lotto…" value={cerca}
          onChangeText={setCerca} placeholderTextColor="#9CA3AF" />
      </View>

      <ScrollView contentContainerStyle={S.content}>
        {gruppi.length === 0 && <Text style={S.empty}>Nessun prodotto in magazzino.</Text>}

        {gruppi.map((g) => {
          const primo = g.lotti[0];
          const aperto = !!aperti[g.chiave];
          return (
            <View key={g.chiave} style={[S.card, { borderLeftWidth: 4, borderLeftColor: coloreScadenza(primo.data_scadenza) }]}>
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

              <Bottone testo="Scarica"
                onPress={() => setUscita({ gruppo: g, qta: '', causale: 'consumo' })} />

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
                    {testoScadenza(l.data_scadenza)}  <Text style={{ color: COLORS.primary }}>› dettagli</Text>
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          );
        })}
      </ScrollView>

      {!sel && modaleUscita}

      {/* Dettaglio lotto */}
      <Modal visible={!!sel} animationType="slide" onRequestClose={() => setSel(null)}>
        {sel && (
          <View style={S.screen}>
            <ScrollView contentContainerStyle={[S.content, { paddingTop: 50 }]}>
              <Text style={S.h1}>{sel.prodotto}</Text>
              <Riquadro>
                <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.text }}>
                  Giacenza: {fmtQ(sel.quantita_residua)} {sel.unita_misura}
                </Text>
                <Text style={[S.muted, { marginTop: 6 }]}>Lotto: {sel.numero_lotto || '—'}</Text>
                <Text style={{ color: coloreScadenza(sel.data_scadenza), fontWeight: '700' }}>
                  {testoScadenza(sel.data_scadenza)}
                </Text>
                <Text style={S.muted}>
                  Ricevuti {fmtQ(sel.quantita_iniziale)} {sel.unita_misura}
                  {sel.colli ? ` in ${sel.colli} ${sel.colli === 1 ? 'collo' : 'colli'}` : ''} il {fmtData(sel.data_ricevimento)}
                </Text>
                <Text style={S.muted}>{sel.fornitore} · DDT/fattura {sel.ddt_numero || '—'} del {fmtData(sel.ddt_data)}</Text>
                <Text style={S.muted}>Temperatura al ricevimento: {sel.temperatura_rilevata ?? '—'}°C</Text>
                {!!sel.note && <Text style={[S.muted, { fontStyle: 'italic', marginTop: 4 }]}>{sel.note}</Text>}
                <TouchableOpacity onPress={() => setModCarico(true)}>
                  <Text style={{ color: COLORS.primary, fontWeight: '800', marginTop: 10, fontSize: 15 }}>✎ Modifica dati del carico</Text>
                </TouchableOpacity>
              </Riquadro>

              <Riquadro titolo="Foto">
                {sel.foto_etichetta ? (
                  <AnteprimaFoto uri={sel.foto_etichetta} titolo="Etichetta" altezza={220} />
                ) : (
                  <Text style={S.muted}>Nessuna foto dell'etichetta.</Text>
                )}
                <Bottone testo={sel.foto_etichetta ? '📷 Sostituisci foto etichetta' : "📷 Fotografa l'etichetta"}
                  ghost onPress={() => cambiaFoto('foto_etichetta')} />
                {sel.foto_ddt ? <AnteprimaFoto uri={sel.foto_ddt} titolo="Documento di trasporto" /> : null}
                <Bottone testo={sel.foto_ddt ? '📷 Sostituisci foto documento' : '📷 Fotografa DDT / fattura'}
                  ghost onPress={() => cambiaFoto('foto_ddt')} />
              </Riquadro>

              <Bottone testo="Scarica da questo lotto"
                onPress={() => setUscita({ lotto: sel, qta: '', causale: 'consumo' })} />

              <Text style={[S.h2, { marginTop: 20 }]}>Movimenti</Text>
              <Riquadro>
                {storico.map((m, i) => (
                  <TouchableOpacity key={m.id} disabled={m.tipo === 'carico'}
                    onPress={() => { setModUscita(m); setQtaUscita(String(m.quantita).replace('.', ',')); }}
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
                      {m.tipo !== 'carico' && <Text style={{ color: COLORS.primary }}>  ✎</Text>}
                    </Text>
                  </TouchableOpacity>
                ))}
              </Riquadro>

              <Bottone testo="Chiudi" ghost onPress={() => setSel(null)} />
            </ScrollView>

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
            {fotocamera}
            {avviso}
          </View>
        )}
      </Modal>
      {avviso}
    </View>
  );
}
