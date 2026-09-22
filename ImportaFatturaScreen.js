import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Alert, Switch, TouchableOpacity, ActivityIndicator, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { S, COLORS, UNITA } from './theme';
import {
  Campo, Selettore, Bottone, Chips, useFoto, AnteprimaFoto, useErrori,
} from './UI';
import { base64ToBytes, estraiTestoPdf } from './letturaPdf';
import { analizzaFattura, chiaveArticolo, nomeProdottoProposto } from './fattura';
import {
  listaFornitori, listaProdotti, getImpostazioni, fornitoreDaPartiteIva,
  abbinamentiFornitore, fatturaGiaImportata, importaFattura,
} from './database';

const euro = (n) => (n === null || n === undefined ? '—'
  : n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const numTesto = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
const aNumero = (t) => {
  const n = Number(String(t).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const isoDaTesto = (t) => {
  if (!t) return null;
  const s = t.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) return undefined;
  const a = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
};
const testoDaIso = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

export default function ImportaFatturaScreen({ navigation }) {
  const [fornitori, setFornitori] = useState([]);
  const [prodotti, setProdotti] = useState([]);
  const [lettura, setLettura] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);
  const [doc, setDoc] = useState(null);      // intestazione fattura
  const [righe, setRighe] = useState([]);    // righe modificabili
  const [aperta, setAperta] = useState(null);
  const { chiediFoto, fotocamera } = useFoto();
  const { errori, segnala, azzera, riepilogo } = useErrori();
  const [controlli, setControlli] = useState({
    temperatura: '', integrita_imballo: true, conformita_etichettatura: true, nota_nc: '',
  });

  useFocusEffect(useCallback(() => {
    listaFornitori().then(setFornitori);
    listaProdotti().then(setProdotti);
  }, []));

  const scegliPdf = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf', copyToCacheDirectory: true, multiple: false,
      });
      if (res.canceled || !res.assets || !res.assets[0]) return;
      setLettura(true);
      const file = res.assets[0];
      // lascia comparire l'indicatore prima del lavoro di lettura
      await new Promise((r) => setTimeout(r, 50));
      const b64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
      const pagine = estraiTestoPdf(base64ToBytes(b64));
      const imp = await getImpostazioni();
      const f = analizzaFattura(pagine, imp.partita_iva);

      if (f.articoli.length === 0) {
        setLettura(false);
        const vuoto = pagine.every((p) => p.length === 0);
        return Alert.alert('Nessuna riga riconosciuta',
          vuoto
            ? 'Il PDF non contiene testo: probabilmente è una scansione. Registra la merce da "Ricevi merce".'
            : 'Il testo è stato letto ma il formato di questa fattura non è ancora supportato. Mandami il PDF e aggiungo il riconoscimento per questo fornitore.');
      }

      const esistente = await fornitoreDaPartiteIva(f.partiteIva);
      const abbinati = esistente ? await abbinamentiFornitore(esistente.id) : {};
      setDoc({
        nomeFile: file.name, numero: f.numero || '', dataTesto: testoDaIso(f.data),
        fornitore_id: esistente ? esistente.id : null,
        nuovo_nome: f.intestazione, nuova_piva: f.partiteIva[0] || '',
        totaleImponibile: f.totaleImponibile, totaleDocumento: f.totaleDocumento,
      });
      setRighe(f.articoli.map((a, i) => {
        const chiave = chiaveArticolo(a);
        const note = [
          f.numero ? `Da fattura n. ${f.numero}` : 'Da fattura PDF',
          a.codice ? `cod. art. ${a.codice}` : null,
          a.confezione ? `conf. fornitore ${a.confezione}` : null,
          a.origine ? `origine ${a.origine}` : null,
        ].filter(Boolean).join(' · ');
        return {
          key: String(i), chiave, includi: true, descrizione: a.descrizione,
          prodotto_id: abbinati[chiave] || null, nuovo_prodotto: nomeProdottoProposto(a.descrizione),
          quantitaTesto: numTesto(a.quantita), unita_misura: a.unita_misura,
          rigaFattura: `${numTesto(a.quantita)} ${a.um_fattura || ''}${a.colli ? ` · colli ${a.colli}` : ''}${a.confezione ? ` · conf. ${a.confezione}` : ''}`, colliTesto: a.colli ? String(a.colli) : '',
          prezzo_unitario: a.prezzo_unitario, importo: a.importo, origine: a.origine,
          numero_lotto: a.lotto || '', scadenzaTesto: testoDaIso(a.scadenza),
          lottoDaFattura: !!a.lotto, note, foto_etichetta: null,
        };
      }));
      setAperta(null);
      setLettura(false);
    } catch (e) {
      setLettura(false);
      Alert.alert('Lettura non riuscita', String(e?.message || e));
    }
  };

  const cambiaFornitore = async (id) => {
    setDoc((d) => ({ ...d, fornitore_id: id }));
    const abbinati = await abbinamentiFornitore(id);
    setRighe((rr) => rr.map((r) => ({ ...r, prodotto_id: r.prodotto_id || abbinati[r.chiave] || null })));
  };

  const aggiorna = (key, campo) => (v) =>
    setRighe((rr) => rr.map((r) => (r.key === key ? { ...r, [campo]: v } : r)));

  const incluse = righe.filter((r) => r.includi);
  const daAbbinare = incluse.filter((r) => !r.prodotto_id).length;
  const sommaRighe = Math.round(righe.reduce((s, r) => s + (r.importo || 0), 0) * 100) / 100;
  const quadra = doc && doc.totaleImponibile !== null
    ? Math.abs(sommaRighe - doc.totaleImponibile) < 0.05 : null;

  const carica = async () => {
    azzera();
    const data = isoDaTesto(doc.dataTesto);
    let ok = true;
    if (!doc.fornitore_id && !doc.nuovo_nome.trim()) ok = segnala('nuovo_nome', 'Scegli il fornitore oppure indica il nome del nuovo fornitore');
    if (data === undefined) ok = segnala('data', 'Scrivi la data come gg/mm/aaaa');
    if (incluse.length === 0) ok = segnala('righe', 'Seleziona almeno una riga da caricare');

    // errori delle righe: segnati sulla riga stessa, la prima viene aperta
    const erroriRighe = {};
    for (const r of incluse) {
      const e = {};
      const q = aNumero(r.quantitaTesto);
      if (!q || q <= 0) e.quantita = 'Quantità non valida';
      if (isoDaTesto(r.scadenzaTesto) === undefined) e.scadenza = 'Scrivi la data come gg/mm/aaaa';
      const c = r.colliTesto === '' ? null : aNumero(r.colliTesto);
      if (c !== null && (!Number.isInteger(c) || c <= 0)) e.colli = 'Numero intero';
      if (!r.prodotto_id && !r.nuovo_prodotto.trim()) e.prodotto = 'Abbina o dai un nome al prodotto';
      if (Object.keys(e).length) erroriRighe[r.key] = e;
    }
    const nErr = Object.keys(erroriRighe).length;
    setRighe((rr) => rr.map((r) => ({ ...r, errori: erroriRighe[r.key] || null })));
    if (nErr) {
      setAperta(Object.keys(erroriRighe)[0]);
      ok = segnala('righe', nErr === 1 ? '1 riga da correggere (aperta qui sotto)' : `${nErr} righe da correggere (segnate in rosso)`);
    }
    if (!ok) return;

    const righeFinali = [];
    for (const r of incluse) {
      const q = aNumero(r.quantitaTesto);
      const sc = isoDaTesto(r.scadenzaTesto);
      const colli = r.colliTesto === '' ? null : aNumero(r.colliTesto);
      righeFinali.push({
        chiave: r.chiave, descrizione: r.descrizione, prodotto_id: r.prodotto_id,
        nuovo_prodotto: r.nuovo_prodotto.trim(), quantita: q, unita_misura: r.unita_misura, colli,
        prezzo_unitario: r.prezzo_unitario, origine: r.origine,
        numero_lotto: r.numero_lotto.trim() || `FT ${doc.numero || ''} ${doc.dataTesto}`.trim(),
        data_scadenza: sc, note: r.note, foto_etichetta: r.foto_etichetta,
      });
    }

    const nonConforme = !controlli.integrita_imballo || !controlli.conformita_etichettatura;
    const temperatura = controlli.temperatura === '' ? null : aNumero(controlli.temperatura);

    const esegui = async () => {
      try {
        setSalvataggio(true);
        const n = await importaFattura({
          fornitore_id: doc.fornitore_id,
          nuovo_fornitore: { ragione_sociale: doc.nuovo_nome.trim(), partita_iva: doc.nuova_piva },
          numero: doc.numero, data, totale: doc.totaleDocumento, righe: righeFinali,
          temperatura, integrita_imballo: controlli.integrita_imballo,
          conformita_etichettatura: controlli.conformita_etichettatura,
          non_conforme: nonConforme, nota_nc: controlli.nota_nc,
        });
        setSalvataggio(false);
        const nuovi = righeFinali.filter((r) => !r.prodotto_id).length;
        Alert.alert('Salvato ✓',
          `${n} lotti caricati in magazzino dalla fattura n. ${doc.numero || '—'}.` +
          (nuovi ? `\n${nuovi} nuovi prodotti creati in anagrafica: completa allergeni e conservazione.` : '') +
          '\n\nLa prossima fattura di questo fornitore userà gli stessi abbinamenti.',
          [{ text: 'Vai al magazzino', onPress: () => navigation.replace('Magazzino') }]);
      } catch (e) {
        setSalvataggio(false);
        Alert.alert('Importazione non riuscita', `Nessun dato è stato salvato.\n\n${String(e?.message || e)}`);
      }
    };

    if (doc.fornitore_id && doc.numero) {
      const gia = await fatturaGiaImportata(doc.fornitore_id, doc.numero, data);
      if (gia) {
        return Alert.alert('Fattura già importata',
          `La fattura n. ${doc.numero} è stata caricata il ${testoDaIso(gia.data_import.slice(0, 10))}. Caricarla di nuovo duplicherebbe la merce.`,
          [{ text: 'Annulla', style: 'cancel' }, { text: 'Importa comunque', style: 'destructive', onPress: esegui }]);
      }
    }
    esegui();
  };

  /* ---------- schermata iniziale ---------- */
  if (!doc) {
    return (
      <ScrollView style={S.screen} contentContainerStyle={S.content}>
        <Text style={S.h1}>Importa fattura</Text>
        <Text style={[S.muted, { marginBottom: 16 }]}>
          Scegli il PDF della fattura: l'app legge le righe, tu le controlli e carichi tutto in magazzino.
          Funziona senza internet.
        </Text>
        {lettura ? (
          <View style={[S.card, { alignItems: 'center', paddingVertical: 28 }]}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={[S.muted, { marginTop: 10 }]}>Lettura della fattura…</Text>
          </View>
        ) : (
          <Bottone testo="Scegli fattura PDF" onPress={scegliPdf} />
        )}
        <View style={[S.card, { marginTop: 16 }]}>
          <Text style={S.h2}>Come funziona</Text>
          <Text style={S.muted}>1. Scegli il PDF (da Download, email o WhatsApp salvato sul telefono).</Text>
          <Text style={S.muted}>2. Controlla fornitore e totale: se i conti tornano vedi la spunta verde.</Text>
          <Text style={S.muted}>3. Abbina ogni articolo a un tuo prodotto (solo la prima volta) e aggiungi le scadenze.</Text>
          <Text style={S.muted}>4. Tocca "Carica in magazzino".</Text>
        </View>
      </ScrollView>
    );
  }

  /* ---------- verifica ---------- */
  return (
    <ScrollView style={S.screen} contentContainerStyle={[S.content, { paddingBottom: 40 }]}>
      <View style={S.card}>
        <Text style={S.h2}>Documento</Text>
        <Text style={[S.muted, { marginBottom: 6 }]}>{doc.nomeFile}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Campo label="Numero" value={doc.numero} onChange={(v) => setDoc((d) => ({ ...d, numero: v }))} />
          </View>
          <View style={{ flex: 1 }}>
            <Campo label="Data" value={doc.dataTesto} placeholder="gg/mm/aaaa" errore={errori.data}
              onChange={(v) => setDoc((d) => ({ ...d, dataTesto: v }))} />
          </View>
        </View>

        <Selettore label="Fornitore" elementi={fornitori} valore={doc.fornitore_id}
          etichetta={(f) => f.ragione_sociale} onChange={cambiaFornitore}
          placeholder="Nuovo fornitore (tocca per sceglierne uno esistente)" />
        {!doc.fornitore_id && (
          <View style={{ backgroundColor: COLORS.warningSoft, borderRadius: 10, padding: 10, marginTop: 8 }}>
            <Text style={{ color: COLORS.warning, fontWeight: '700', marginBottom: 4 }}>
              Fornitore non in anagrafica: verrà creato
            </Text>
            <Campo label="Ragione sociale" value={doc.nuovo_nome} errore={errori.nuovo_nome}
              onChange={(v) => setDoc((d) => ({ ...d, nuovo_nome: v }))} />
            <Campo label="Partita IVA" value={doc.nuova_piva} keyboardType="number-pad"
              onChange={(v) => setDoc((d) => ({ ...d, nuova_piva: v }))} />
          </View>
        )}

        <View style={{
          marginTop: 12, borderRadius: 10, padding: 10,
          backgroundColor: quadra === true ? COLORS.primarySoft : quadra === false ? COLORS.dangerSoft : COLORS.bg,
        }}>
          <Text style={{
            fontWeight: '700',
            color: quadra === true ? COLORS.ok : quadra === false ? COLORS.danger : COLORS.muted,
          }}>
            {quadra === true ? '✓ Il totale delle righe corrisponde alla fattura'
              : quadra === false ? '⚠ Il totale delle righe non corrisponde: controlla'
              : 'Totale fattura non trovato nel PDF'}
          </Text>
          <Text style={S.muted}>
            {righe.length} righe lette · somma {euro(sommaRighe)}
            {doc.totaleImponibile !== null ? ` · imponibile in fattura ${euro(doc.totaleImponibile)}` : ''}
          </Text>
        </View>
      </View>

      <View style={S.card}>
        <Text style={S.h2}>Controlli al ricevimento</Text>
        <Text style={[S.muted, { marginBottom: 6 }]}>Valgono per tutta la merce di questa fattura.</Text>
        <Campo label="Temperatura rilevata (°C, facoltativa)" value={controlli.temperatura}
          keyboardType="numbers-and-punctuation"
          onChange={(v) => setControlli((c) => ({ ...c, temperatura: v }))} />
        <View style={[S.row, { marginTop: 10 }]}>
          <Text style={{ fontSize: 15, color: COLORS.text }}>Imballi integri</Text>
          <Switch value={controlli.integrita_imballo}
            onValueChange={(v) => setControlli((c) => ({ ...c, integrita_imballo: v }))} />
        </View>
        <View style={[S.row, { marginTop: 6 }]}>
          <Text style={{ fontSize: 15, color: COLORS.text }}>Etichettatura conforme</Text>
          <Switch value={controlli.conformita_etichettatura}
            onValueChange={(v) => setControlli((c) => ({ ...c, conformita_etichettatura: v }))} />
        </View>
        {(!controlli.integrita_imballo || !controlli.conformita_etichettatura) && (
          <Campo label="Cosa non va?" value={controlli.nota_nc} multiline
            onChange={(v) => setControlli((c) => ({ ...c, nota_nc: v }))} />
        )}
      </View>

      <View style={[S.row, { marginTop: 6, marginBottom: 8 }]}>
        <Text style={S.h2}>Righe</Text>
        <Text style={{ color: daAbbinare ? COLORS.warning : COLORS.ok, fontWeight: '700' }}>
          {daAbbinare ? `${daAbbinare} nuovi prodotti` : 'Tutte abbinate ✓'}
        </Text>
      </View>

      {righe.map((r) => {
        const espansa = aperta === r.key;
        const prodotto = prodotti.find((p) => p.id === r.prodotto_id);
        return (
          <View key={r.key} style={[S.card, {
            opacity: r.includi ? 1 : 0.5, borderLeftWidth: 4,
            borderLeftColor: r.errori && r.includi ? COLORS.danger : !r.includi ? COLORS.border : r.prodotto_id ? COLORS.ok : COLORS.warning,
            borderLeftWidth: r.errori && r.includi ? 6 : 4,
          }]}>
            <TouchableOpacity onPress={() => setAperta(espansa ? null : r.key)} activeOpacity={0.7}>
              <View style={S.row}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}>
                    {prodotto ? prodotto.denominazione : r.nuovo_prodotto}
                  </Text>
                  <Text style={S.muted}>
                    {r.quantitaTesto} {r.unita_misura}{r.colliTesto ? ` in ${r.colliTesto} ${r.colliTesto === '1' ? 'collo' : 'colli'}` : ''} · {euro(r.importo)}
                    {r.numero_lotto ? ` · lotto ${r.numero_lotto}` : ''}
                    {r.scadenzaTesto ? ` · scad. ${r.scadenzaTesto}` : ''}
                    {r.foto_etichetta ? ' · 📷' : ''}
                  </Text>
                  {!r.prodotto_id && r.includi && (
                    <Text style={{ color: COLORS.warning, fontSize: 12, fontWeight: '700' }}>Nuovo prodotto</Text>
                  )}
                </View>
                <Switch value={r.includi} onValueChange={aggiorna(r.key, 'includi')} />
              </View>
              <Text style={{ color: COLORS.azione, fontWeight: '700', marginTop: 4 }}>
                {espansa ? '▲ Chiudi' : '✎ Dettagli'}
              </Text>
            </TouchableOpacity>

            {espansa && (
              <View style={{ marginTop: 8 }}>
                <Text style={[S.muted, { fontStyle: 'italic' }]}>In fattura: {r.descrizione}</Text>
                <Text style={[S.muted, { fontStyle: 'italic' }]}>Qtà {r.rigaFattura}</Text>
                <Selettore label="Prodotto in anagrafica" elementi={prodotti} valore={r.prodotto_id}
                  etichetta={(p) => p.denominazione} onChange={aggiorna(r.key, 'prodotto_id')}
                  placeholder="Crea nuovo prodotto (tocca per abbinarne uno)" />
                {r.prodotto_id ? (
                  <TouchableOpacity onPress={() => aggiorna(r.key, 'prodotto_id')(null)}>
                    <Text style={{ color: COLORS.azione, fontWeight: '700', marginTop: 6 }}>
                      Crea invece un nuovo prodotto
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Campo label="Nome del nuovo prodotto" value={r.nuovo_prodotto} errore={r.errori?.prodotto}
                    onChange={aggiorna(r.key, 'nuovo_prodotto')} />
                )}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1.4 }}>
                    <Text style={S.label}>Quantità</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                      <TextInput style={[S.input, { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 },
                        r.errori?.quantita && S.inputErrore]}
                        value={r.quantitaTesto} keyboardType="decimal-pad"
                        onChangeText={aggiorna(r.key, 'quantitaTesto')} />
                      <View style={{
                        justifyContent: 'center', paddingHorizontal: 12, backgroundColor: COLORS.primarySoft,
                        borderWidth: 1, borderLeftWidth: 0, borderColor: COLORS.border,
                        borderTopRightRadius: 12, borderBottomRightRadius: 12,
                      }}>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.primaryDark }}>{r.unita_misura}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Campo label="Colli" value={r.colliTesto} errore={r.errori?.colli}
                      keyboardType="number-pad" onChange={aggiorna(r.key, 'colliTesto')} />
                  </View>
                </View>
                <Chips label="Unità di misura" opzioni={UNITA} valore={r.unita_misura}
                  onChange={aggiorna(r.key, 'unita_misura')} />
                <Campo label="Scadenza / TMC" value={r.scadenzaTesto} placeholder="gg/mm/aaaa" errore={r.errori?.scadenza}
                  onChange={aggiorna(r.key, 'scadenzaTesto')} />
                <AnteprimaFoto uri={r.foto_etichetta} titolo="Foto etichetta" altezza={150} />
                <Bottone testo={r.foto_etichetta ? '📷 Rifai foto etichetta' : "📷 Fotografa l'etichetta"} ghost
                  onPress={() => chiediFoto('etichetta', aggiorna(r.key, 'foto_etichetta'))} />
                <Campo label={r.lottoDaFattura ? 'Lotto (letto dalla fattura)' : 'Lotto'}
                  value={r.numero_lotto} onChange={aggiorna(r.key, 'numero_lotto')}
                  placeholder={`Se vuoto: FT ${doc.numero} ${doc.dataTesto}`} />
              </View>
            )}
          </View>
        );
      })}

      <View style={{ marginTop: 8 }}>
        {salvataggio ? (
          <ActivityIndicator size="large" color={COLORS.primary} />
        ) : (
          <>
            {riepilogo}
            <Bottone testo={`Carica ${incluse.length} righe in magazzino`} onPress={carica} />
            <Bottone testo="Scegli un altro PDF" ghost onPress={() => { setDoc(null); setRighe([]); }} />
          </>
        )}
      </View>
      {fotocamera}
    </ScrollView>
  );
}
