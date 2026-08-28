import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtData, fmtDataOra } from './theme';
import { Campo, Bottone } from './UI';
import {
  temperatureTra, carichiTra, tutteNonConformita,
  getImpostazioni, salvaImpostazioni,
} from './database';
import { wrapDoc, stampa, esc } from './report';

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

  const reportTemperature = async () => {
    const righe = await temperatureTra(da, a);
    if (righe.length === 0) return Alert.alert('Vuoto', 'Nessuna rilevazione nel periodo.');
    const corpo = `<table><thead><tr>
      <th>Data e ora</th><th>Punto</th><th>Limiti</th><th>Rilevata</th><th>Esito</th></tr></thead><tbody>
      ${righe.map((r) => `<tr>
        <td>${fmtDataOra(r.data_ora)}</td><td>${esc(r.nome)}</td>
        <td>${esc(r.temp_min)}/${esc(r.temp_max)} °C</td>
        <td>${esc(r.temperatura)} °C</td>
        <td class="${r.esito === 'conforme' ? 'ok' : 'nc'}">${esc(r.esito)}</td></tr>`).join('')}
      </tbody></table>`;
    try { await stampa(wrapDoc('Registro temperature', corpo, imp, periodoTxt)); }
    catch (e) { Alert.alert('Stampa non riuscita', String(e?.message || e)); }
  };

  const reportCarichi = async () => {
    const righe = await carichiTra(da, a);
    if (righe.length === 0) return Alert.alert('Vuoto', 'Nessun carico nel periodo.');
    const corpo = `<table><thead><tr>
      <th>Data</th><th>Prodotto</th><th>Fornitore</th><th>Lotto</th><th>DDT</th>
      <th>Q.tà</th><th>Scad.</th><th>Esito</th></tr></thead><tbody>
      ${righe.map((r) => `<tr>
        <td>${fmtData(r.data_ricevimento)}</td><td>${esc(r.prodotto)}</td>
        <td>${esc(r.fornitore)}</td><td>${esc(r.numero_lotto)}</td><td>${esc(r.ddt_numero)}</td>
        <td>${esc(r.quantita_iniziale)} ${esc(r.unita_misura)}</td>
        <td>${fmtData(r.data_scadenza)}</td>
        <td class="${r.esito_controllo === 'conforme' ? 'ok' : 'nc'}">${esc(r.esito_controllo)}</td></tr>`).join('')}
      </tbody></table>`;
    try { await stampa(wrapDoc('Registro carichi merce', corpo, imp, periodoTxt)); }
    catch (e) { Alert.alert('Stampa non riuscita', String(e?.message || e)); }
  };

  const reportNC = async () => {
    const righe = await tutteNonConformita();
    if (righe.length === 0) return Alert.alert('Vuoto', 'Nessuna non conformità registrata.');
    const corpo = `<table><thead><tr>
      <th>Data</th><th>Origine</th><th>Descrizione</th><th>Azione correttiva</th><th>Stato</th></tr></thead><tbody>
      ${righe.map((r) => `<tr>
        <td>${fmtDataOra(r.data_ora)}</td><td>${esc(r.origine)}</td>
        <td>${esc(r.descrizione)}</td><td>${esc(r.azione_correttiva) || '—'}</td>
        <td class="${r.stato === 'aperta' ? 'nc' : 'ok'}">${esc(r.stato)}</td></tr>`).join('')}
      </tbody></table>`;
    try { await stampa(wrapDoc('Registro non conformità', corpo, imp)); }
    catch (e) { Alert.alert('Stampa non riuscita', String(e?.message || e)); }
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
        <Campo label="Dal" value={da} onChange={setDa} placeholder="AAAA-MM-GG" />
        <Campo label="Al" value={a} onChange={setA} placeholder="AAAA-MM-GG" />
        <Text style={[S.muted, { marginTop: 6 }]}>
          Vale per il registro temperature e il registro carichi. Le non conformità sono elencate tutte.
        </Text>
      </View>

      <Text style={S.h2}>Genera i registri</Text>
      <View style={S.card}>
        <Bottone testo="Registro temperature (PDF)" onPress={reportTemperature} />
        <Bottone testo="Registro carichi merce (PDF)" onPress={reportCarichi} />
        <Bottone testo="Registro non conformità (PDF)" onPress={reportNC} />
      </View>

      <Text style={S.muted}>
        Si apre la finestra di stampa di Android: puoi stampare su carta o salvare in PDF
        per archiviarlo o inviarlo.
      </Text>
    </ScrollView>
  );
}
