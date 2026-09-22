import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Alert, Switch, Image, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, UNITA, isoDaCampo } from './theme';
import {
  Campo, Chips, Selettore, Scanner, Bottone, useFoto, AnteprimaFoto, useErrori, CampoData,
} from './UI';
import {
  listaFornitori, listaProdotti, prodottoDaBarcode, registraCarico, impostaFotoProdotto,
} from './database';

const oggi = () => new Date().toISOString().slice(0, 10);

const VUOTO = {
  fornitore_id: null, ddt_numero: '', ddt_data: oggi(), prodotto_id: null,
  numero_lotto: '', quantita: '', colli: '', unita_misura: 'kg', data_scadenza: '',
  temperatura_rilevata: '', integrita_imballo: true, conformita_etichettatura: true,
  prezzo_unitario: '', note: '', foto_ddt: null, foto_etichetta: null,
};

export default function RicevimentoScreen({ navigation }) {
  const [fornitori, setFornitori] = useState([]);
  const [prodotti, setProdotti] = useState([]);
  const [f, setF] = useState({ ...VUOTO });
  const [scanner, setScanner] = useState(false);
  const { chiediFoto, fotocamera } = useFoto();

  useFocusEffect(useCallback(() => {
    listaFornitori().then(setFornitori);
    listaProdotti().then(setProdotti);
  }, []));

  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  const foto = (campo) => chiediFoto(campo === 'foto_ddt' ? 'documento' : 'etichetta', set(campo));

  /** Scelta del prodotto: unità di misura e scadenza proposta (arrivo + durata in scheda). */
  const [scadenzaAuto, setScadenzaAuto] = useState(false);
  const scegliProdotto = (p) => {
    setF((s) => {
      const nuovo = { ...s, prodotto_id: p.id, unita_misura: p.unita_misura || s.unita_misura };
      if ((!s.data_scadenza || scadenzaAuto) && p.shelf_life_giorni) {
        const d = new Date(); d.setDate(d.getDate() + Number(p.shelf_life_giorni));
        nuovo.data_scadenza = d.toISOString().slice(0, 10);
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
        'Questo codice non è in catalogo. Crea prima il prodotto nella sezione Prodotti.');
    }
  };

  const { errori, segnala, azzera, riepilogo } = useErrori();

  const salva = async () => {
    azzera();
    let ok = true;
    if (!f.fornitore_id) ok = segnala('fornitore_id', 'Seleziona il fornitore');
    if (!f.prodotto_id) ok = segnala('prodotto_id', 'Seleziona il prodotto');
    if (!f.quantita || !(Number(String(f.quantita).replace(',', '.')) > 0)) ok = segnala('quantita', 'Indica la quantità ricevuta');
    if (isoDaCampo(f.data_scadenza) === undefined) ok = segnala('data_scadenza', 'Scrivi la scadenza come gg/mm/aaaa');
    if (!ok) return;

    const nonConforme = !f.integrita_imballo || !f.conformita_etichettatura;

    if (f.foto_etichetta) await impostaFotoProdotto(f.prodotto_id, f.foto_etichetta, true);
    await registraCarico({
      ...f,
      quantita: Number(String(f.quantita).replace(',', '.')),
      colli: f.colli ? parseInt(f.colli, 10) || null : null,
      temperatura_rilevata: f.temperatura_rilevata === '' ? null : Number(f.temperatura_rilevata),
      prezzo_unitario: f.prezzo_unitario === '' ? null : Number(f.prezzo_unitario),
      data_scadenza: isoDaCampo(f.data_scadenza),
      data_ricevimento: new Date().toISOString(),
      esito_controllo: nonConforme ? 'non conforme' : 'conforme',
    });

    Alert.alert(
      'Carico registrato',
      nonConforme
        ? 'Attenzione: è stata aperta una non conformità per questo lotto.'
        : 'Il lotto è ora in magazzino.',
      [{ text: 'OK', onPress: () => { setF({ ...VUOTO }); navigation.navigate('Magazzino'); } }]
    );
  };

  const prodottoSel = prodotti.find((p) => p.id === f.prodotto_id);

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
          keyboardType="numeric" />
        <Chips label="Unità" opzioni={UNITA} valore={f.unita_misura} onChange={set('unita_misura')} />
        <Campo label="Colli (facoltativo)" value={f.colli} onChange={set('colli')}
          keyboardType="number-pad" placeholder="numero di confezioni/casse ricevute" />
        <CampoData label="Data di scadenza / TMC" value={f.data_scadenza || null} errore={errori.data_scadenza}
          nota={scadenzaAuto ? 'Proposta dalla durata indicata nella scheda prodotto: controlla l\'etichetta' : null}
          scorciatoie={[{ testo: '+3 gg', giorni: 3 }, { testo: '+7 gg', giorni: 7 }, { testo: '+30 gg', giorni: 30 }]}
          onChange={(iso) => { setScadenzaAuto(false); set('data_scadenza')(iso || ''); }} />
        <Campo label="Prezzo unitario (€)" value={f.prezzo_unitario}
          onChange={set('prezzo_unitario')} keyboardType="numeric" />

        <Bottone testo={f.foto_etichetta ? 'Rifai foto etichetta' : "Fotografa l'etichetta"} ghost
          onPress={() => foto('foto_etichetta')} />
        <AnteprimaFoto uri={f.foto_etichetta} altezza={140} />
      </View>

      <Text style={S.h2}>3. Controllo al ricevimento</Text>
      <View style={S.card}>
        <Campo label="Temperatura rilevata (°C)" value={f.temperatura_rilevata}
          onChange={set('temperatura_rilevata')} keyboardType="numbers-and-punctuation" />
        {prodottoSel && prodottoSel.temp_max != null && f.temperatura_rilevata !== '' &&
          Number(f.temperatura_rilevata) > prodottoSel.temp_max && (
            <Text style={{ color: COLORS.danger, marginTop: 6, fontWeight: '600' }}>
              Sopra il limite previsto ({prodottoSel.temp_max}°C)
            </Text>
        )}

        <View style={[S.row, { marginTop: 16 }]}>
          <Text style={{ fontSize: 15, flex: 1 }}>Imballo integro</Text>
          <Switch value={f.integrita_imballo} onValueChange={set('integrita_imballo')}
            trackColor={{ true: COLORS.primary }} />
        </View>
        <View style={[S.row, { marginTop: 12 }]}>
          <Text style={{ fontSize: 15, flex: 1 }}>Etichettatura conforme</Text>
          <Switch value={f.conformita_etichettatura} onValueChange={set('conformita_etichettatura')}
            trackColor={{ true: COLORS.primary }} />
        </View>

        <Campo label="Note / rilievi" value={f.note} onChange={set('note')} multiline />
      </View>

      {riepilogo}
      <Bottone testo="Registra carico" onPress={salva} />

      <TouchableOpacity onPress={() => setF({ ...VUOTO })} style={{ padding: 16 }}>
        <Text style={[S.muted, { textAlign: 'center' }]}>Svuota il modulo</Text>
      </TouchableOpacity>

      <Scanner visibile={scanner} onChiudi={() => setScanner(false)} onLetto={daBarcode} />

      {fotocamera}
    </ScrollView>
  );
}
