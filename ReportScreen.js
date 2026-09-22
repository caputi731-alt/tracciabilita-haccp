import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtData, fmtDataOra } from './theme';
import { Campo, Bottone, CampoData } from './UI';
import {
  temperatureTra, carichiTra, tutteNonConformita, sanificazioniTra,
  getImpostazioni, salvaImpostazioni, tabellaAllergeni,
} from './database';
import {
  wrapDoc, stampa, htmlTabellaAllergeni, htmlPacchettoASL,
  corpoTemperature, corpoCarichi, corpoSanificazione, corpoNonConformita,
} from './report';

const oggiISO = () => new Date().toISOString().slice(0, 10);
const meseFaISO = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};

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

  const salvaDati = async () => {
    await salvaImpostazioni(imp);
    Alert.alert('Salvato', 'Dati intestazione aggiornati.');
  };

  const periodoTxt = `Periodo: ${fmtData(da)} — ${fmtData(a)}`;

  const stampaSicura = async (html) => {
    try { await stampa(html); } catch (e) { Alert.alert('Stampa non riuscita', String(e?.message || e)); }
  };
  const nelPeriodo = (r) => (r.data_ora || '').slice(0, 10) >= da && (r.data_ora || '').slice(0, 10) <= a;

  const reportTemperature = async () =>
    stampaSicura(wrapDoc('Registro temperature', corpoTemperature(await temperatureTra(da, a)), imp, periodoTxt));
  const reportCarichi = async () =>
    stampaSicura(wrapDoc('Registro carichi merce', corpoCarichi(await carichiTra(da, a)), imp, periodoTxt));
  const reportSanificazione = async () =>
    stampaSicura(wrapDoc('Registro sanificazione', corpoSanificazione(await sanificazioniTra(da, a)), imp, periodoTxt));
  const reportNC = async () =>
    stampaSicura(wrapDoc('Registro non conformità', corpoNonConformita(await tutteNonConformita()), imp));
  const reportAllergeni = async () => {
    const piatti = await tabellaAllergeni();
    if (piatti.length === 0) return Alert.alert('Nessuna ricetta', 'Inserisci prima le ricette con i loro ingredienti.');
    return stampaSicura(htmlTabellaAllergeni(piatti, imp));
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
    }, imp, periodoTxt));
  };

  return (
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
        <CampoData label="Dal" value={da} onChange={(iso) => setDa(iso || meseFaISO())} facoltativo={false} />
        <CampoData label="Al" value={a} onChange={(iso) => setA(iso || oggiISO())} facoltativo={false} />
        <Text style={[S.muted, { marginTop: 6 }]}>
          Vale per temperature, carichi e sanificazioni. Il registro delle non conformità le elenca tutte.
        </Text>
      </View>

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
        <Bottone testo="Registro sanificazione (PDF)" onPress={reportSanificazione} />
        <Bottone testo="Registro non conformità (PDF)" onPress={reportNC} />
        <Bottone testo="Tabella allergeni dei piatti (PDF)" onPress={reportAllergeni} />
      </View>

      <Text style={S.muted}>
        Si apre la finestra di stampa di Android: puoi stampare su carta o salvare in PDF
        per archiviarlo o inviarlo.
      </Text>
    </ScrollView>
  );
}
