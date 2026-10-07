import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtData, oggiLocale, piuGiorni, giornoDi } from './theme';
import { Campo, Bottone, CampoData, Segmenti, useAvviso } from './UI';
import { condividiPdf } from './condividi';
import {
  temperatureTra, carichiTra, tutteNonConformita, sanificazioniTra,
  getImpostazioni, salvaImpostazioni, tabellaAllergeni, produzioniTra, giorniSenzaTemperature,
} from './database';
import {
  wrapDoc, stampa, htmlTabellaAllergeni, htmlPacchettoASL,
  corpoTemperature, corpoCarichi, corpoSanificazione, corpoNonConformita, corpoProduzioni,
} from './report';

const oggiISO = oggiLocale;
const meseFaISO = () => piuGiorni(oggiLocale(), -30);
const MODI = ['Stampa / salva PDF', 'Condividi il file'];

export default function ReportScreen() {
  const [imp, setImp] = useState({ nome_attivita: '', indirizzo: '', responsabile: '', partita_iva: '' });
  const [da, setDa] = useState(meseFaISO());
  const [a, setA] = useState(oggiISO());

  useFocusEffect(useCallback(() => {
    getImpostazioni().then((x) => setImp({
      nome_attivita: x.nome_attivita || '', indirizzo: x.indirizzo || '',
      responsabile: x.responsabile || '', partita_iva: x.partita_iva || '',
    }));
  }, []));

  const setI = (k) => (v) => setImp((s) => ({ ...s, [k]: v }));

  const [modo, setModo] = useState(MODI[0]);
  const { avviso, mostra } = useAvviso();

  const salvaDati = async () => {
    await salvaImpostazioni(imp);
    mostra('Dati intestazione salvati ✓');
  };

  const periodoTxt = `Periodo: ${fmtData(da)} — ${fmtData(a)}`;

  /** Stampa (finestra di Android) oppure crea il file PDF e apre "Condividi", secondo la scelta in alto. */
  const stampaSicura = async (html, nome) => {
    if (da > a) return Alert.alert('Periodo non valido', 'La data "Dal" deve venire prima della data "Al".');
    try {
      if (modo === MODI[1]) await condividiPdf(html, `${nome}-${da}_${a}`);
      else await stampa(html);
    } catch (e) { Alert.alert(modo === MODI[1] ? 'Condivisione non riuscita' : 'Stampa non riuscita', String(e?.message || e)); }
    return null;
  };
  const nelPeriodo = (r) => { const g = giornoDi(r.data_ora) || ''; return g >= da && g <= a; };

  const reportTemperature = async () =>
    stampaSicura(wrapDoc('Registro temperature',
      corpoTemperature(await temperatureTra(da, a), await giorniSenzaTemperature(da, a)), imp, periodoTxt), 'registro-temperature');
  const reportCarichi = async () =>
    stampaSicura(wrapDoc('Registro carichi merce', corpoCarichi(await carichiTra(da, a)), imp, periodoTxt), 'registro-carichi');
  const reportProduzioni = async () =>
    stampaSicura(wrapDoc('Registro produzioni e lotti impiegati', corpoProduzioni(await produzioniTra(da, a)), imp, periodoTxt), 'registro-produzioni');
  const reportSanificazione = async () =>
    stampaSicura(wrapDoc('Registro sanificazione', corpoSanificazione(await sanificazioniTra(da, a)), imp, periodoTxt), 'registro-sanificazione');
  const reportNC = async () =>
    stampaSicura(wrapDoc('Registro non conformità', corpoNonConformita(await tutteNonConformita()), imp), 'registro-non-conformita');
  const reportAllergeni = async () => {
    const piatti = await tabellaAllergeni();
    if (piatti.length === 0) return Alert.alert('Nessuna ricetta', 'Inserisci prima le ricette con i loro ingredienti.');
    return stampaSicura(htmlTabellaAllergeni(piatti, imp), 'tabella-allergeni');
  };

  /** Tutti i registri del periodo in un solo PDF: le non conformità del periodo più quelle ancora aperte. */
  const pacchetto = async () => {
    const nc = (await tutteNonConformita()).filter((r) => nelPeriodo(r) || r.stato === 'aperta');
    return stampaSicura(htmlPacchettoASL({
      temperature: await temperatureTra(da, a),
      carichi: await carichiTra(da, a),
      sanificazioni: await sanificazioniTra(da, a),
      nonConformita: nc,
      piatti: await tabellaAllergeni(),
      produzioni: await produzioniTra(da, a),
      giorniMancanti: await giorniSenzaTemperature(da, a),
    }, imp, periodoTxt), 'pacchetto-haccp');
  };

  return (
    <View style={S.screen}>
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <Text style={S.h1}>Report per l'ASL</Text>

      <Text style={S.h2}>Dati intestazione</Text>
      <View style={S.card}>
        <Campo label="Nome attività" value={imp.nome_attivita} onChange={setI('nome_attivita')} />
        <Campo label="Indirizzo" value={imp.indirizzo} onChange={setI('indirizzo')} />
        <Campo label="Partita IVA" value={imp.partita_iva} onChange={setI('partita_iva')} keyboardType="numeric" />
        <Campo label="Responsabile HACCP" value={imp.responsabile} onChange={setI('responsabile')} />
        <Bottone testo="Salva dati intestazione" ghost onPress={salvaDati} />
      </View>

      <Text style={S.h2}>Periodo</Text>
      <View style={S.card}>
        <CampoData label="Dal" value={da} onChange={(iso) => setDa(iso || meseFaISO())} facoltativo={false} massimo={oggiISO()} />
        <CampoData label="Al" value={a} onChange={(iso) => setA(iso || oggiISO())} facoltativo={false} massimo={oggiISO()} />
        <Text style={[S.muted, { marginTop: 6 }]}>
          Vale per temperature, carichi e sanificazioni. Il registro delle non conformità le elenca tutte.
        </Text>
      </View>

      <Text style={S.h2}>Cosa fare del PDF</Text>
      <Segmenti opzioni={MODI} valore={modo} onChange={setModo} />
      <Text style={[S.muted, { marginTop: 6, marginBottom: 14 }]}>
        {modo === MODI[0]
          ? 'Si apre la finestra di stampa di Android: puoi stampare su carta o salvare in PDF.'
          : 'Crea il file PDF e lo invia subito con WhatsApp, email, Drive…'}
      </Text>

      <Text style={S.h2}>Per un controllo</Text>
      <View style={S.card}>
        <Text style={S.muted}>
          Un unico PDF con tutti i registri del periodo, le non conformità e la tabella allergeni:
          quello da mostrare quando arriva l'ispettore.
        </Text>
        <Bottone testo="Pacchetto completo per l'ASL (PDF)" icona="folder-zip-outline" onPress={pacchetto} />
      </View>

      <Text style={S.h2}>Singoli registri</Text>
      <View style={S.card}>
        <Bottone testo="Registro temperature (PDF)" onPress={reportTemperature} />
        <Bottone testo="Registro carichi merce (PDF)" onPress={reportCarichi} />
        <Bottone testo="Registro produzioni e lotti (PDF)" onPress={reportProduzioni} />
        <Bottone testo="Registro sanificazione (PDF)" onPress={reportSanificazione} />
        <Bottone testo="Registro non conformità (PDF)" onPress={reportNC} />
        <Bottone testo="Tabella allergeni dei piatti (PDF)" onPress={reportAllergeni} />
      </View>

    </ScrollView>
    {avviso}
    </View>
  );
}
