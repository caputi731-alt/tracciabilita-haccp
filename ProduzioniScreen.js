import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtData, fmtDataOra, aNumero, numeroPerCampo, arrotonda } from './theme';
import {
  Campo, Selettore, Bottone, ModaleModifica, useAvviso, VistaModale, useErrori, Vuoto, CampoData, conferma,
} from './UI';
import {
  listaRicette, getRicetta, listaProduzioni, getProduzione, lottiDisponibiliProdotto, lottiScadutiProdotto, registraProduzione,
  correggiRecord, allergeniRicetta, annullaProduzione, leggiAllergeni,
} from './database';

const CAMPI_PRODUZIONE = [
  { chiave: 'quantita_prodotta', label: 'Quantità prodotta', tipo: 'numero' },
  { chiave: 'lotto_produzione', label: 'Lotto di produzione', tipo: 'testo' },
  { chiave: 'data_scadenza', label: 'Scadenza', tipo: 'data' },
  { chiave: 'operatore', label: 'Operatore', tipo: 'testo' },
  { chiave: 'note', label: 'Note', tipo: 'multiline' },
];

const fmtQ = (n) => numeroPerCampo(arrotonda(n));

const CONVERSIONI = { 'g>kg': 0.001, 'kg>g': 1000, 'ml>l': 0.001, 'l>ml': 1000 };
const fattore = (da, a) => (da && a && CONVERSIONI[`${da}>${a}`]) || 1;

/** Ripartisce la quantità sui lotti in ordine FIFO. Restituisce { usi: [{ lotto, quantita }], manca }. */
function ripartisci(lotti, quantita) {
  let resto = quantita;
  const usi = [];
  for (const l of lotti) {
    if (resto <= 0.0005) break;
    const parte = Math.min(resto, Number(l.quantita_residua));
    if (parte <= 0) continue;
    usi.push({ lotto: l, quantita: arrotonda(parte) });
    resto -= parte;
  }
  return { usi, manca: resto > 0.0005 ? arrotonda(resto) : 0 };
}
const lottoAuto = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `P${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

export default function ProduzioniScreen({ navigation }) {
  const [ricette, setRicette] = useState([]);
  const [produzioni, setProduzioni] = useState([]);
  const [nuova, setNuova] = useState(false);
  const [dettaglio, setDettaglio] = useState(null);
  const [modifica, setModifica] = useState(false);
  const { avviso, mostra } = useAvviso();
  const { errori, segnala, azzera, riepilogo } = useErrori();

  // form nuova produzione
  const [ricettaId, setRicettaId] = useState(null);
  const [nome, setNome] = useState('');
  const [quantita, setQuantita] = useState('');
  const [scadenza, setScadenza] = useState('');
  const [operatore, setOperatore] = useState('');
  const [lotto, setLotto] = useState('');
  const [righe, setRighe] = useState([]); // { prodotto_id, prodotto, um, lotti[] (FIFO, non scaduti), scaduti, quantita }

  const ricarica = useCallback(() => {
    Promise.all([listaRicette(), listaProduzioni()])
      .then(([r, p]) => { setRicette(r); setProduzioni(p); })
      .catch((e) => Alert.alert('Lettura non riuscita', String(e?.message || e)));
  }, []);
  useFocusEffect(ricarica);

  const apriNuova = () => {
    setRicettaId(null); setNome(''); setQuantita(''); setScadenza('');
    setOperatore(''); setLotto(lottoAuto()); setRighe([]);
    azzera();
    setNuova(true);
  };

  const scegliRicetta = async (id) => {
    setRicettaId(id);
    const r = await getRicetta(id);
    if (!r) return;
    setNome(r.nome);
    const nuoveRighe = [];
    for (const ing of r.ingredienti) {
      const lotti = await lottiDisponibiliProdotto(ing.prodotto_id);
      const scaduti = await lottiScadutiProdotto(ing.prodotto_id);
      nuoveRighe.push({
        prodotto_id: ing.prodotto_id,
        prodotto: ing.prodotto,
        um: lotti[0]?.unita_misura || ing.unita_misura || ing.um_prodotto || '',
        lotti,
        scaduti: scaduti.length,
        // la ricetta può essere in grammi e il magazzino in chili (o ml e litri): si converte
        quantita: ing.quantita ? numeroPerCampo(arrotonda(ing.quantita * fattore(ing.unita_misura, lotti[0]?.unita_misura))) : '',
      });
    }
    setRighe(nuoveRighe);
  };

  const setRiga = (idx, k, v) =>
    setRighe((rs) => rs.map((r, i) => (i === idx ? { ...r, [k]: v } : r)));

  const salva = async () => {
    azzera();
    let ok = true;
    if (!nome.trim()) ok = segnala('nome', 'Serve il nome del piatto');
    const qProdotta = quantita.trim() === '' ? null : aNumero(quantita);
    if (quantita.trim() !== '' && (qProdotta === null || qProdotta <= 0)) ok = segnala('quantita', 'Inserisci un numero, es. 2,5');
    const usi = [];
    righe.forEach((r, idx) => {
      if (String(r.quantita).trim() === '') return; // ingrediente non usato: nessuno scarico
      const q = aNumero(r.quantita);
      if (q === null || q <= 0) { ok = segnala(`riga${idx}`, 'Inserisci un numero, es. 0,5'); return; }
      const piano = ripartisci(r.lotti, q);
      if (piano.manca) {
        const disp = r.lotti.reduce((t, l) => t + Number(l.quantita_residua), 0);
        ok = segnala(`riga${idx}`, r.lotti.length
          ? `In magazzino ce ne sono solo ${fmtQ(disp)} ${r.um}`
          : 'Nessun lotto utilizzabile in magazzino: registra prima il carico');
        return;
      }
      piano.usi.forEach((u) => usi.push({ lotto_id: u.lotto.id, quantita: u.quantita }));
    });
    if (!ok) return;
    try {
      await registraProduzione({
        ricetta_id: ricettaId, nome: nome.trim(),
        quantita_prodotta: qProdotta,
        lotto_produzione: lotto, data_scadenza: scadenza || null, operatore,
      }, usi);
      setNuova(false);
      ricarica();
      mostra(usi.length ? 'Salvato ✓ Lotti scaricati e collegati al piatto' : 'Salvato ✓ (senza lotti collegati)');
    } catch (e) {
      Alert.alert('Produzione non salvata', `Nessun dato è stato registrato.\n\n${String(e?.message || e)}`);
    }
  };

  const annulla = () => conferma('Annullare la produzione?',
    'Le quantità tornano nei lotti del magazzino. La produzione resta nel registro come "annullata".',
    async () => {
      try {
        await annullaProduzione(dettaglio.id, 'registrata per errore');
        setDettaglio(null);
        ricarica();
        mostra('Produzione annullata ✓ Quantità tornate in magazzino');
      } catch (e) {
        Alert.alert('Non annullabile', String(e?.message || e));
      }
    });

  const apriDettaglio = async (pr) => setDettaglio(await getProduzione(pr.id));

  const salvaCorrezione = async (cambi) => {
    try {
      const n = await correggiRecord('produzioni', dettaglio.id, cambi);
      setModifica(false);
      setDettaglio(await getProduzione(dettaglio.id));
      ricarica();
      mostra(n ? 'Produzione corretta ✓' : 'Nessuna modifica');
    } catch (e) {
      Alert.alert('Correzione non salvata', String(e?.message || e));
    }
  };

  return (
    <View style={S.screen}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={S.content}>
        <Text style={S.h1}>Produzioni</Text>
        <Text style={[S.muted, { marginBottom: 12 }]}>
          Registra un piatto preparato: scegli la ricetta, indica i lotti usati e l'app li
          scarica dal magazzino, creando il legame lotto → piatto.
        </Text>

        {produzioni.length === 0 && (
          <Vuoto icona="pot-steam-outline" titolo="Nessuna produzione"
            testo="Registra un piatto preparato: l'app scarica gli ingredienti dal magazzino e ne tiene la rintracciabilità." />
        )}
        {produzioni.map((pr) => (
          <TouchableOpacity key={pr.id} style={[S.card, !!pr.annullata && { opacity: 0.6 }]} onPress={() => apriDettaglio(pr)}
            accessibilityRole="button">
            <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{pr.nome}</Text>
            {!!pr.annullata && <Text style={{ color: COLORS.danger, fontWeight: '800' }}>ANNULLATA</Text>}
            <Text style={S.muted}>{fmtDataOra(pr.data_ora)} · lotto {pr.lotto_produzione || '—'}</Text>
            {!!pr.data_scadenza && <Text style={S.muted}>Scadenza: {fmtData(pr.data_scadenza)}</Text>}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={{ padding: 16, paddingTop: 0 }}>
        <Bottone testo="+ Nuova produzione" onPress={apriNuova} />
      </View>

      {/* Nuova produzione */}
      <Modal visible={nuova} animationType="slide" onRequestClose={() => setNuova(false)}>
        <VistaModale>
          <Text style={S.h1}>Nuova produzione</Text>

          <View style={S.card}>
            <Selettore label="Ricetta" elementi={ricette} valore={ricettaId}
              etichetta={(x) => x.nome} onChange={scegliRicetta}
              placeholder="Scegli una ricetta" />
            <Campo label="Nome del piatto *" value={nome} onChange={setNome} errore={errori.nome} />
            <Campo label="Quantità prodotta" value={quantita} onChange={setQuantita} keyboardType="decimal-pad"
              errore={errori.quantita} />
            <CampoData label="Scadenza interna" value={scadenza || null} onChange={(iso) => setScadenza(iso || '')}
              scorciatoie={[{ testo: '+1 gg', giorni: 1 }, { testo: '+3 gg', giorni: 3 }, { testo: '+5 gg', giorni: 5 }]} />
            <Campo label="Operatore" value={operatore} onChange={setOperatore} />
            <Campo label="Lotto produzione" value={lotto} onChange={setLotto} />
          </View>

          <Text style={S.h2}>Ingredienti usati</Text>
          {righe.length === 0 ? (
            <Text style={S.muted}>Scegli una ricetta per vedere gli ingredienti, oppure registra senza lotti.</Text>
          ) : righe.map((r, idx) => {
            const q = aNumero(r.quantita);
            const piano = q && q > 0 ? ripartisci(r.lotti, q) : null;
            const disp = r.lotti.reduce((t, l) => t + Number(l.quantita_residua), 0);
            return (
              <View key={idx} style={S.card}>
                <Text style={{ fontWeight: '700', fontSize: 16, color: COLORS.text }}>{r.prodotto}</Text>
                {r.lotti.length === 0 ? (
                  <Text style={{ color: COLORS.danger, marginTop: 6, fontWeight: '600' }}>
                    Nessun lotto utilizzabile in magazzino per questo ingrediente.
                  </Text>
                ) : (
                  <Text style={S.muted}>
                    Disponibili {fmtQ(disp)} {r.um} in {r.lotti.length} {r.lotti.length === 1 ? 'lotto' : 'lotti'}
                  </Text>
                )}
                {r.scaduti > 0 && (
                  <Text style={{ color: COLORS.danger, marginTop: 4, fontWeight: '600' }}>
                    {r.scaduti} {r.scaduti === 1 ? 'lotto scaduto escluso' : 'lotti scaduti esclusi'}: scaricali come scarto dal magazzino.
                  </Text>
                )}
                <Campo label={`Quantità usata (${r.um})`} value={r.quantita} errore={errori[`riga${idx}`]}
                  onChange={(v) => setRiga(idx, 'quantita', v)} keyboardType="decimal-pad"
                  placeholder="lascia vuoto se non usato" />
                {piano && !piano.manca && (
                  <Text style={[S.muted, { marginTop: 6 }]}>
                    Verrà scaricato: {piano.usi.map((u) => `${fmtQ(u.quantita)} ${r.um} dal lotto ${u.lotto.numero_lotto || u.lotto.id}${u.lotto.data_scadenza ? ` (scad. ${fmtData(u.lotto.data_scadenza)})` : ''}`).join(' + ')}
                  </Text>
                )}
              </View>
            );
          })}

          {riepilogo}
          <Bottone testo="Registra produzione" onPress={salva} />
          <Bottone testo="Annulla" ghost onPress={() => setNuova(false)} />
        </VistaModale>
      </Modal>

      {/* Dettaglio produzione */}
      <Modal visible={!!dettaglio} animationType="slide" onRequestClose={() => setDettaglio(null)}>
        {dettaglio && (
          <VistaModale>
            <Text style={S.h1}>{dettaglio.nome}</Text>
            <View style={S.card}>
              {!!dettaglio.annullata && <Text style={{ color: COLORS.danger, fontWeight: '800', marginBottom: 4 }}>PRODUZIONE ANNULLATA</Text>}
              <Text style={S.muted}>Ricetta: {dettaglio.ricetta || '—'}</Text>
              <Text style={S.muted}>Prodotta il {fmtDataOra(dettaglio.data_ora)}</Text>
              <Text style={S.muted}>Quantità: {dettaglio.quantita_prodotta === null || dettaglio.quantita_prodotta === undefined ? '—' : fmtQ(dettaglio.quantita_prodotta)}</Text>
              <Text style={S.muted}>Lotto: {dettaglio.lotto_produzione || '—'}</Text>
              <Text style={S.muted}>Scadenza: {fmtData(dettaglio.data_scadenza)}</Text>
              <Text style={S.muted}>Operatore: {dettaglio.operatore || '—'}</Text>
              <Text style={S.muted}>Allergeni: {leggiAllergeni(dettaglio.allergeni).join(', ') || 'nessuno'}</Text>
              {!!dettaglio.note && <Text style={[S.muted, { fontStyle: 'italic', marginTop: 4 }]}>{dettaglio.note}</Text>}
              <TouchableOpacity onPress={() => setModifica(true)}>
                <Text style={{ color: COLORS.azione, fontWeight: '800', marginTop: 10, fontSize: 15 }}>✎ Modifica dati</Text>
              </TouchableOpacity>
              <Bottone testo="Stampa etichetta" icona="label-outline" ghost onPress={async () => {
                const d = dettaglio;
                // gli allergeni sono quelli fotografati al momento della produzione (per i dati vecchi: dalla ricetta)
                const salvati = leggiAllergeni(d.allergeni);
                const allergeni = salvati.length || !d.ricetta_id ? salvati : await allergeniRicetta(d.ricetta_id);
                setDettaglio(null);
                navigation.navigate('Etichette', {
                  precompila: {
                    tipo: 'Produzione', nome: d.nome, lotto: d.lotto_produzione || '',
                    scadenza: d.data_scadenza || '', allergeni,
                  },
                });
              }} />
              <Text style={[S.muted, { marginTop: 4 }]}>
                I lotti impiegati non si modificano: se sono sbagliati, annulla la produzione e registrala di nuovo.
              </Text>
              {!dettaglio.annullata && (
                <Bottone testo="Annulla produzione (registrata per errore)" ghost colore={COLORS.danger} onPress={annulla} />
              )}
            </View>

            <Text style={S.h2}>Lotti impiegati</Text>
            <View style={S.card}>
              {dettaglio.lotti.length === 0 ? (
                <Text style={S.muted}>Nessun lotto collegato.</Text>
              ) : dettaglio.lotti.map((l, i) => (
                <View key={i} style={[S.row, { paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600', color: COLORS.text }}>{l.prodotto}</Text>
                    <Text style={S.muted}>Lotto {l.numero_lotto || l.lotto_id} · {l.fornitore}</Text>
                  </View>
                  <Text style={S.muted}>{fmtQ(l.quantita_usata)}</Text>
                </View>
              ))}
            </View>

            <Bottone testo="Chiudi" ghost onPress={() => setDettaglio(null)} />
            <ModaleModifica visibile={modifica} titolo="Modifica produzione" sottotitolo={dettaglio.nome}
              campi={CAMPI_PRODUZIONE} record={dettaglio} onSalva={salvaCorrezione}
              onChiudi={() => setModifica(false)} />
          </VistaModale>
        )}
        {avviso}
      </Modal>
      {avviso}
    </View>
  );
}
