import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Alert, Switch, Image, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { S, COLORS, UNITA } from './theme';
import { Campo, Chips, Selettore, Scanner, Bottone, CameraCapture } from './UI';
import {
  listaFornitori, listaProdotti, prodottoDaBarcode, registraCarico,
} from './database';

const oggi = () => new Date().toISOString().slice(0, 10);

const VUOTO = {
  fornitore_id: null, ddt_numero: '', ddt_data: oggi(), prodotto_id: null,
  numero_lotto: '', quantita: '', unita_misura: 'kg', data_scadenza: '',
  temperatura_rilevata: '', integrita_imballo: true, conformita_etichettatura: true,
  prezzo_unitario: '', note: '', foto_ddt: null, foto_etichetta: null,
};

export default function RicevimentoScreen({ navigation }) {
  const [fornitori, setFornitori] = useState([]);
  const [prodotti, setProdotti] = useState([]);
  const [f, setF] = useState({ ...VUOTO });
  const [scanner, setScanner] = useState(false);
  const [fotocamera, setFotocamera] = useState(null);
  const [ocrCorso, setOcrCorso] = useState(false);
  const [testoOcr, setTestoOcr] = useState(null);

  useFocusEffect(useCallback(() => {
    listaFornitori().then(setFornitori);
    listaProdotti().then(setProdotti);
  }, []));

  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  const scattaFoto = (campo) => setFotocamera(campo);

  const scegliDaGalleria = async (campo) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        return Alert.alert(
          'Permesso galleria',
          perm.canAskAgain
            ? 'Serve il permesso per accedere alle foto.'
            : 'Abilita il permesso da Impostazioni > App > Tracciabilità HACCP > Autorizzazioni.'
        );
      }
      const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.5 });
      if (!r.canceled && r.assets && r.assets[0]) set(campo)(r.assets[0].uri);
    } catch (e) {
      Alert.alert('Errore galleria', String(e?.message || e));
    }
  };

  const foto = (campo) => {
    Alert.alert('Aggiungi immagine', 'Come vuoi aggiungere la foto?', [
      { text: 'Scatta foto', onPress: () => scattaFoto(campo) },
      { text: 'Scegli dalla galleria', onPress: () => scegliDaGalleria(campo) },
      { text: 'Annulla', style: 'cancel' },
    ]);
  };

  // Estrae una data in formato ISO da un testo libero (gg/mm/aaaa, gg-mm-aa, ecc.)
  const estraiData = (testo) => {
    const m = testo.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (!m) return null;
    let [, g, me, a] = m;
    if (a.length === 2) a = '20' + a;
    const gg = g.padStart(2, '0');
    const mm = me.padStart(2, '0');
    return `${a}-${mm}-${gg}`;
  };

  // Cerca un numero di documento vicino a parole chiave come DDT / n.
  const estraiNumeroDoc = (testo) => {
    const righe = testo.split('\n');
    for (const r of righe) {
      if (/d\.?d\.?t\.?|documento|bolla|fattura|n[°.\s]/i.test(r)) {
        const num = r.match(/(\d{1,8}(?:[\/\-]\d{1,6})?)/);
        if (num) return num[1];
      }
    }
    return null;
  };

  const leggiDDT = async () => {
    if (!f.foto_ddt) {
      return Alert.alert('Nessuna foto', 'Prima fotografa o scegli l\'immagine del DDT.');
    }
    try {
      setOcrCorso(true);
      const res = await TextRecognition.recognize(f.foto_ddt);
      const testo = res?.text || '';
      if (!testo.trim()) {
        setOcrCorso(false);
        return Alert.alert('Nessun testo', 'Non sono riuscito a leggere testo dalla foto. Riprova con un\'immagine più nitida e ben illuminata.');
      }
      const data = estraiData(testo);
      const numero = estraiNumeroDoc(testo);
      setF((s) => ({
        ...s,
        ddt_data: data || s.ddt_data,
        ddt_numero: numero || s.ddt_numero,
      }));
      setTestoOcr(testo);
    } catch (e) {
      Alert.alert('OCR non riuscito', String(e?.message || e));
    } finally {
      setOcrCorso(false);
    }
  };

  const daBarcode = async (code) => {
    setScanner(false);
    const p = await prodottoDaBarcode(code);
    if (p) {
      setF((s) => ({ ...s, prodotto_id: p.id, unita_misura: p.unita_misura || s.unita_misura }));
    } else {
      Alert.alert('Prodotto sconosciuto',
        'Questo codice non è in catalogo. Crea prima il prodotto nella sezione Prodotti.');
    }
  };

  const salva = async () => {
    if (!f.fornitore_id) return Alert.alert('Dato mancante', 'Seleziona il fornitore.');
    if (!f.prodotto_id) return Alert.alert('Dato mancante', 'Seleziona il prodotto.');
    if (!f.quantita) return Alert.alert('Dato mancante', 'Indica la quantità ricevuta.');

    const nonConforme = !f.integrita_imballo || !f.conformita_etichettatura;

    await registraCarico({
      ...f,
      quantita: Number(f.quantita),
      temperatura_rilevata: f.temperatura_rilevata === '' ? null : Number(f.temperatura_rilevata),
      prezzo_unitario: f.prezzo_unitario === '' ? null : Number(f.prezzo_unitario),
      data_scadenza: f.data_scadenza || null,
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
      <Text style={S.h2}>1. Documento di trasporto</Text>
      <View style={S.card}>
        <Selettore label="Fornitore *" elementi={fornitori} valore={f.fornitore_id}
          etichetta={(x) => x.ragione_sociale} onChange={set('fornitore_id')} />
        <Campo label="Numero DDT / fattura" value={f.ddt_numero} onChange={set('ddt_numero')} />
        <Campo label="Data documento" value={f.ddt_data} onChange={set('ddt_data')}
          placeholder="AAAA-MM-GG" />
        <Bottone testo={f.foto_ddt ? 'Rifai foto DDT' : 'Fotografa il DDT'} ghost
          onPress={() => foto('foto_ddt')} />
        {f.foto_ddt && (
          <Image source={{ uri: f.foto_ddt }}
            style={{ height: 140, marginTop: 10, borderRadius: 8 }} resizeMode="cover" />
        )}
        {f.foto_ddt && (
          <Bottone testo={ocrCorso ? 'Lettura in corso…' : 'Leggi numero e data dal DDT (OCR)'}
            ghost onPress={leggiDDT} />
        )}
      </View>

      <Text style={S.h2}>2. Prodotto e lotto</Text>
      <View style={S.card}>
        <Selettore label="Prodotto *" elementi={prodotti} valore={f.prodotto_id}
          etichetta={(x) => x.denominazione} onChange={set('prodotto_id')} />
        <Bottone testo="Scansiona codice prodotto" ghost onPress={() => setScanner(true)} />

        <Campo label="Numero di lotto" value={f.numero_lotto} onChange={set('numero_lotto')}
          placeholder="come riportato sull'etichetta" />
        <Campo label="Quantità *" value={f.quantita} onChange={set('quantita')}
          keyboardType="numeric" />
        <Chips label="Unità" opzioni={UNITA} valore={f.unita_misura} onChange={set('unita_misura')} />
        <Campo label="Data di scadenza / TMC" value={f.data_scadenza}
          onChange={set('data_scadenza')} placeholder="AAAA-MM-GG" />
        <Campo label="Prezzo unitario (€)" value={f.prezzo_unitario}
          onChange={set('prezzo_unitario')} keyboardType="numeric" />

        <Bottone testo={f.foto_etichetta ? 'Rifai foto etichetta' : "Fotografa l'etichetta"} ghost
          onPress={() => foto('foto_etichetta')} />
        {f.foto_etichetta && (
          <Image source={{ uri: f.foto_etichetta }}
            style={{ height: 140, marginTop: 10, borderRadius: 8 }} resizeMode="cover" />
        )}
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

      <Bottone testo="Registra carico" onPress={salva} />

      {testoOcr && (
        <View style={[S.card, { marginTop: 8 }]}>
          <View style={S.row}>
            <Text style={S.h2}>Testo letto dal DDT</Text>
            <TouchableOpacity onPress={() => setTestoOcr(null)}>
              <Text style={{ color: COLORS.primary, fontWeight: '700' }}>Nascondi</Text>
            </TouchableOpacity>
          </View>
          <Text style={[S.muted, { marginBottom: 8 }]}>
            Ho precompilato numero e data quando li ho riconosciuti. Correggili se serve.
            Da qui puoi leggere il resto (fornitore, prodotti) e trascriverlo.
          </Text>
          <Text style={{ color: COLORS.text, fontSize: 13, lineHeight: 19 }}>{testoOcr}</Text>
        </View>
      )}

      <TouchableOpacity onPress={() => setF({ ...VUOTO })} style={{ padding: 16 }}>
        <Text style={[S.muted, { textAlign: 'center' }]}>Svuota il modulo</Text>
      </TouchableOpacity>

      <Scanner visibile={scanner} onChiudi={() => setScanner(false)} onLetto={daBarcode} />

      <CameraCapture
        visibile={!!fotocamera}
        onChiudi={() => setFotocamera(null)}
        onScattata={(uri) => { set(fotocamera)(uri); setFotocamera(null); }}
      />
    </ScrollView>
  );
}
