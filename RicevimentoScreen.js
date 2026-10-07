import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Alert, Switch, Image, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, UNITA, isoDaCampo, aNumero, oggiLocale, piuGiorni } from './theme';
import {
  Campo, Chips, Selettore, Scanner, Bottone, useFoto, AnteprimaFoto, useErrori, CampoData,
} from './UI';
import {
  listaFornitori, listaProdotti, prodottoDaBarcode, registraCarico, impostaFotoProdotto,
} from './database';

/** Modulo vuoto: la data del documento è quella di oggi nel momento in cui si apre il modulo. */
const vuoto = () => ({
  fornitore_id: null, ddt_numero: '', ddt_data: oggiLocale(), prodotto_id: null,
  numero_lotto: '', quantita: '', colli: '', unita_misura: 'kg', data_scadenza: '',
  temperatura_rilevata: '', integrita_imballo: true, conformita_etichettatura: true,
  prezzo_unitario: '', note: '', foto_ddt: null, foto_etichetta: null,
});

export default function RicevimentoScreen({ navigation }) {
  const [fornitori, setFornitori] = useState([]);
  const [prodotti, setProdotti] = useState([]);
  const [f, setF] = useState(vuoto);
  const [scanner, setScanner] = useState(false);
  const { chiediFoto, fotocamera } = useFoto();

  useFocusEffect(useCallback(() => {
    Promise.all([listaFornitori(), listaProdotti()])
      .then(([a, b]) => { setFornitori(a); setProdotti(b); })
      .catch((e) => Alert.alert('Lettura non riuscita', String(e?.message || e)));
  }, []));

  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  const foto = (campo) => chiediFoto(campo === 'foto_ddt' ? 'documento' : 'etichetta', set(campo));

  /** Scelta del prodotto: unità di misura e scadenza proposta (arrivo + durata in scheda). */
  const [scadenzaAuto, setScadenzaAuto] = useState(false);
  const scegliProdotto = (p) => {
    setF((s) => {
      const nuovo = { ...s, prodotto_id: p.id, unita_misura: p.unita_misura || s.unita_misura };
      if ((!s.data_scadenza || scadenzaAuto) && p.shelf_life_giorni) {
        nuovo.data_scadenza = piuGiorni(oggiLocale(), p.shelf_life_giorni);
        setScadenzaAuto(true);
      }
      return nuovo;
    });
  };

  const daBarcode = async (code) => {
    setScanner(false);
    const p = await prodottoDaBarcode(code);
    if (p) {
      scegliProdotto(p);
    } else {
      Alert.alert('Prodotto sconosciuto',
        `Il codice ${code} non è in catalogo. Puoi scegliere il prodotto dall'elenco qui sopra, oppure crearlo in anagrafica (lì puoi scansionare di nuovo il codice per abbinarlo).`,
        [{ text: 'Scelgo dall\'elenco', style: 'cancel' },
          { text: 'Vai ai prodotti', onPress: () => navigation.navigate('Anagrafiche', { scheda: 'Prodotti' }) }]);
    }
  };

  const { errori, segnala, azzera, riepilogo } = useErrori();

  const prodottoSel = prodotti.find((p) => p.id === f.prodotto_id);
  const tempLetta = aNumero(f.temperatura_rilevata);
  const fuoriTemperatura = !!prodottoSel && tempLetta !== null && (
    (prodottoSel.temp_max !== null && prodottoSel.temp_max !== undefined && tempLetta > prodottoSel.temp_max)
    || (prodottoSel.temp_min !== null && prodottoSel.temp_min !== undefined && tempLetta < prodottoSel.temp_min));

  const salva = async () => {
    azzera();
    let ok = true;
    const quantita = aNumero(f.quantita);
    const temperatura = String(f.temperatura_rilevata).trim() === '' ? null : aNumero(f.temperatura_rilevata);
    const prezzo = String(f.prezzo_unitario).trim() === '' ? null : aNumero(f.prezzo_unitario);
    const colli = String(f.colli).trim() === '' ? null : aNumero(f.colli);
    if (!f.fornitore_id) ok = segnala('fornitore_id', 'Seleziona il fornitore');
    if (!f.prodotto_id) ok = segnala('prodotto_id', 'Seleziona il prodotto');
    if (quantita === null || quantita <= 0) ok = segnala('quantita', 'Indica la quantità ricevuta, es. 2,5');
    if (String(f.temperatura_rilevata).trim() !== '' && temperatura === null) ok = segnala('temperatura', 'Inserisci un numero, es. 3,5');
    if (String(f.prezzo_unitario).trim() !== '' && (prezzo === null || prezzo < 0)) ok = segnala('prezzo', 'Inserisci un numero, es. 4,90');
    if (colli !== null && (!Number.isInteger(colli) || colli <= 0)) ok = segnala('colli', 'Numero intero');
    if (String(f.colli).trim() !== '' && colli === null) ok = segnala('colli', 'Numero intero');
    if (isoDaCampo(f.data_scadenza) === undefined) ok = segnala('data_scadenza', 'Scrivi la scadenza come gg/mm/aaaa');
    if (!ok) return;

    const nonConforme = !f.integrita_imballo || !f.conformita_etichettatura || fuoriTemperatura;
    try {
      if (f.foto_etichetta) await impostaFotoProdotto(f.prodotto_id, f.foto_etichetta, true);
      await registraCarico({
        ...f,
        quantita, colli,
        temperatura_rilevata: temperatura,
        prezzo_unitario: prezzo,
        data_scadenza: isoDaCampo(f.data_scadenza),
        data_ricevimento: new Date().toISOString(),
        esito_controllo: nonConforme ? 'non conforme' : 'conforme',
      });
    } catch (e) {
      return Alert.alert('Carico non registrato', `Nessun dato è stato salvato.\n\n${String(e?.message || e)}`);
    }

    // il documento resta compilato: per un DDT con più prodotti si reinserisce solo il prodotto
    const stessoDocumento = () => {
      setScadenzaAuto(false);
      setF((s0) => ({ ...vuoto(), fornitore_id: s0.fornitore_id, ddt_numero: s0.ddt_numero, ddt_data: s0.ddt_data, foto_ddt: s0.foto_ddt }));
    };
    Alert.alert(
      'Carico registrato ✓',
      nonConforme
        ? 'Attenzione: è stata aperta una non conformità per questo lotto.'
        : 'Il lotto è ora in magazzino.',
      [
        { text: 'Altro prodotto dello stesso documento', onPress: stessoDocumento },
        { text: 'Vai al magazzino', onPress: () => { setF(vuoto()); navigation.navigate('Magazzino'); } },
      ],
      { cancelable: false }
    );
  };

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <TouchableOpacity style={[S.card, { borderLeftWidth: 4, borderLeftColor: COLORS.azione }]}
        onPress={() => navigation.navigate('ImportaFattura')} activeOpacity={0.7}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.azione }}>Hai la fattura in PDF? →</Text>
        <Text style={S.muted}>Importala e carica tutte le righe insieme, senza compilare prodotto per prodotto.</Text>
      </TouchableOpacity>
      <Text style={S.h2}>1. Documento di trasporto</Text>
      <View style={S.card}>
        <Selettore label="Fornitore *" elementi={fornitori} valore={f.fornitore_id} errore={errori.fornitore_id}
          etichetta={(x) => x.ragione_sociale} onChange={set('fornitore_id')} />
        <Campo label="Numero DDT / fattura" value={f.ddt_numero} onChange={set('ddt_numero')} />
        <CampoData label="Data documento" value={f.ddt_data || null} onChange={(iso) => set('ddt_data')(iso || '')} />
        <Bottone testo={f.foto_ddt ? 'Rifai foto DDT' : 'Fotografa il DDT'} ghost
          onPress={() => foto('foto_ddt')} />
        <AnteprimaFoto uri={f.foto_ddt} altezza={140} />
      </View>

      <Text style={S.h2}>2. Prodotto e lotto</Text>
      <View style={S.card}>
        <Selettore label="Prodotto *" elementi={prodotti} valore={f.prodotto_id} errore={errori.prodotto_id}
          etichetta={(x) => x.denominazione}
          onChange={(id) => { const p = prodotti.find((x) => x.id === id); if (p) scegliProdotto(p); else set('prodotto_id')(id); }} />
        <Bottone testo="Scansiona codice prodotto" ghost onPress={() => setScanner(true)} />

        <Campo label="Numero di lotto" value={f.numero_lotto} onChange={set('numero_lotto')}
          placeholder="come riportato sull'etichetta" />
        <Campo label="Quantità *" value={f.quantita} onChange={set('quantita')} errore={errori.quantita}
          keyboardType="decimal-pad" />
        <Chips label="Unità" opzioni={UNITA} valore={f.unita_misura} onChange={set('unita_misura')} />
        <Campo label="Colli (facoltativo)" value={f.colli} onChange={set('colli')} errore={errori.colli}
          keyboardType="number-pad" placeholder="numero di confezioni/casse ricevute" />
        <CampoData label="Data di scadenza / TMC" value={f.data_scadenza || null} errore={errori.data_scadenza}
          nota={scadenzaAuto ? 'Proposta dalla durata indicata nella scheda prodotto: controlla l\'etichetta' : null}
          scorciatoie={[{ testo: '+3 gg', giorni: 3 }, { testo: '+7 gg', giorni: 7 }, { testo: '+30 gg', giorni: 30 }]}
          onChange={(iso) => { setScadenzaAuto(false); set('data_scadenza')(iso || ''); }} />
        <Campo label="Prezzo unitario (€)" value={f.prezzo_unitario} errore={errori.prezzo}
          onChange={set('prezzo_unitario')} keyboardType="decimal-pad" />

        <Bottone testo={f.foto_etichetta ? 'Rifai foto etichetta' : "Fotografa l'etichetta"} ghost
          onPress={() => foto('foto_etichetta')} />
        <AnteprimaFoto uri={f.foto_etichetta} altezza={140} />
      </View>

      <Text style={S.h2}>3. Controllo al ricevimento</Text>
      <View style={S.card}>
        <Campo label="Temperatura rilevata (°C)" value={f.temperatura_rilevata} errore={errori.temperatura}
          onChange={set('temperatura_rilevata')} keyboardType="numbers-and-punctuation" />
        {fuoriTemperatura && (
          <Text style={{ color: COLORS.danger, marginTop: 6, fontWeight: '700' }}>
            Fuori dai limiti del prodotto ({prodottoSel.temp_min ?? '—'}/{prodottoSel.temp_max ?? '—'}°C): salvando si apre una non conformità.
          </Text>
        )}

        <View style={[S.row, { marginTop: 16 }]}>
          <Text style={{ fontSize: 15, flex: 1 }}>Imballo integro</Text>
          <Switch value={f.integrita_imballo} onValueChange={set('integrita_imballo')}
            trackColor={{ true: COLORS.primary }} accessibilityLabel="Imballo integro" />
        </View>
        <View style={[S.row, { marginTop: 12 }]}>
          <Text style={{ fontSize: 15, flex: 1 }}>Etichettatura conforme</Text>
          <Switch value={f.conformita_etichettatura} onValueChange={set('conformita_etichettatura')}
            trackColor={{ true: COLORS.primary }} accessibilityLabel="Etichettatura conforme" />
        </View>

        <Campo label="Note / rilievi" value={f.note} onChange={set('note')} multiline />
      </View>

      {riepilogo}
      <Bottone testo="Registra carico" onPress={salva} />

      <TouchableOpacity onPress={() => setF(vuoto())} style={{ padding: 16 }} accessibilityRole="button">
        <Text style={[S.muted, { textAlign: 'center' }]}>Svuota il modulo</Text>
      </TouchableOpacity>

      <Scanner visibile={scanner} onChiudi={() => setScanner(false)} onLetto={daBarcode} />

      {fotocamera}
    </ScrollView>
  );
}
