import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtData, fmtDataOra } from './theme';
import { Bottone } from './UI';
import {
  cercaLotti, movimentiDiLotto, getImpostazioni, produzioniDaLotto,
} from './database';
import { wrapDoc, stampa, esc } from './report';

export default function RintracciabilitaScreen() {
  const [cerca, setCerca] = useState('');
  const [lotti, setLotti] = useState([]);
  const [sel, setSel] = useState(null);
  const [movimenti, setMovimenti] = useState([]);
  const [produzioni, setProduzioni] = useState([]);

  const ricarica = useCallback(() => { cercaLotti(cerca).then(setLotti); }, [cerca]);
  useFocusEffect(ricarica);
  React.useEffect(() => { ricarica(); }, [cerca]);

  const apri = async (l) => {
    setSel(l);
    setMovimenti(await movimentiDiLotto(l.id));
    setProduzioni(await produzioniDaLotto(l.id));
  };

  const schedaPdf = async () => {
    const l = sel;
    const imp = await getImpostazioni();
    const allerg = JSON.parse(l.allergeni || '[]');
    const movRighe = movimenti.map((m) => `
      <tr><td>${fmtDataOra(m.data_ora)}</td><td>${esc(m.tipo)}</td>
      <td>${esc(m.quantita)} ${esc(l.unita_misura)}</td><td>${esc(m.causale)}</td></tr>`).join('');

    const prodRighe = produzioni.map((pr) => `
      <tr><td>${fmtDataOra(pr.data_ora)}</td><td>${esc(pr.nome)}</td>
      <td>${esc(pr.lotto_produzione) || '—'}</td><td>${esc(pr.quantita_usata)}</td></tr>`).join('');

    const corpo = `
      <div class="kv"><b>Prodotto:</b> ${esc(l.prodotto)}</div>
      <div class="kv"><b>Numero di lotto:</b> ${esc(l.numero_lotto) || '—'}</div>
      <div class="kv"><b>Fornitore:</b> ${esc(l.fornitore)}
        ${l.fornitore_piva ? '(P.IVA ' + esc(l.fornitore_piva) + ')' : ''}</div>
      <div class="kv"><b>Riconoscimento CE:</b> ${esc(l.numero_riconoscimento_ce) || '—'}</div>
      <div class="kv"><b>DDT / fattura:</b> ${esc(l.ddt_numero) || '—'} del ${fmtData(l.ddt_data)}</div>
      <div class="kv"><b>Ricevuto il:</b> ${fmtData(l.data_ricevimento)}</div>
      <div class="kv"><b>Quantità ricevuta:</b> ${esc(l.quantita_iniziale)} ${esc(l.unita_misura)}</div>
      <div class="kv"><b>Giacenza residua:</b> ${esc(l.quantita_residua)} ${esc(l.unita_misura)}</div>
      <div class="kv"><b>Scadenza / TMC:</b> ${fmtData(l.data_scadenza)}</div>
      <div class="kv"><b>Temperatura al ricevimento:</b> ${l.temperatura_rilevata ?? '—'} °C</div>
      <div class="kv"><b>Esito controllo:</b> ${esc(l.esito_controllo)}</div>
      <div class="kv"><b>Allergeni:</b> ${allerg.length ? esc(allerg.join(', ')) : 'nessuno dichiarato'}</div>
      <h1 style="margin-top:16px">Movimenti del lotto</h1>
      <table><thead><tr><th>Data</th><th>Tipo</th><th>Quantità</th><th>Causale</th></tr></thead>
      <tbody>${movRighe || '<tr><td colspan="4">Nessun movimento</td></tr>'}</tbody></table>
      <h1 style="margin-top:16px">Impiego nei piatti (tracciabilità a valle)</h1>
      <table><thead><tr><th>Data</th><th>Piatto</th><th>Lotto produzione</th><th>Q.tà usata</th></tr></thead>
      <tbody>${prodRighe || '<tr><td colspan="4">Nessun impiego registrato</td></tr>'}</tbody></table>`;

    try {
      await stampa(wrapDoc(`Scheda di rintracciabilità — lotto ${l.numero_lotto || l.id}`, corpo, imp));
    } catch (e) {
      Alert.alert('Stampa non riuscita', String(e?.message || e));
    }
  };

  const colore = (stato) =>
    stato === 'disponibile' ? COLORS.ok : stato === 'scartato' ? COLORS.danger : COLORS.muted;

  return (
    <View style={S.screen}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <TextInput style={S.input} placeholder="Cerca per prodotto, lotto o fornitore…"
          value={cerca} onChangeText={setCerca} placeholderTextColor="#9CA3AF" />
      </View>

      <ScrollView contentContainerStyle={S.content}>
        {lotti.length === 0 && (
          <Text style={S.empty}>Nessun lotto trovato.</Text>
        )}
        {lotti.map((l) => (
          <TouchableOpacity key={l.id} style={S.card} onPress={() => apri(l)}>
            <Text style={{ fontSize: 16, fontWeight: '700' }}>{l.prodotto}</Text>
            <Text style={S.muted}>Lotto {l.numero_lotto || '—'} · {l.fornitore}</Text>
            <Text style={S.muted}>Ricevuto {fmtData(l.data_ricevimento)} · DDT {l.ddt_numero || '—'}</Text>
            <Text style={{ color: colore(l.stato), fontWeight: '600', marginTop: 2 }}>{l.stato}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={!!sel} animationType="slide" onRequestClose={() => setSel(null)}>
        {sel && (
          <ScrollView style={S.screen} contentContainerStyle={[S.content, { paddingTop: 50 }]}>
            <Text style={S.h1}>{sel.prodotto}</Text>
            <View style={S.card}>
              <Text style={S.muted}>Lotto: {sel.numero_lotto || '—'}</Text>
              <Text style={S.muted}>Fornitore: {sel.fornitore}</Text>
              {!!sel.fornitore_piva && <Text style={S.muted}>P.IVA fornitore: {sel.fornitore_piva}</Text>}
              {!!sel.numero_riconoscimento_ce && (
                <Text style={S.muted}>Riconoscimento CE: {sel.numero_riconoscimento_ce}</Text>
              )}
              <Text style={S.muted}>DDT {sel.ddt_numero || '—'} del {fmtData(sel.ddt_data)}</Text>
              <Text style={S.muted}>Ricevuto il {fmtData(sel.data_ricevimento)}</Text>
              <Text style={S.muted}>Ricevuta: {sel.quantita_iniziale} {sel.unita_misura}</Text>
              <Text style={S.muted}>Residua: {sel.quantita_residua} {sel.unita_misura}</Text>
              <Text style={S.muted}>Scadenza: {fmtData(sel.data_scadenza)}</Text>
              <Text style={S.muted}>Temp. ricevimento: {sel.temperatura_rilevata ?? '—'} °C</Text>
              <Text style={S.muted}>Esito: {sel.esito_controllo}</Text>
            </View>

            <Text style={S.h2}>Movimenti</Text>
            <View style={S.card}>
              {movimenti.length === 0 && <Text style={S.muted}>Nessun movimento.</Text>}
              {movimenti.map((m) => (
                <View key={m.id} style={[S.row, { paddingVertical: 6 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600' }}>{m.tipo}</Text>
                    <Text style={S.muted}>{fmtDataOra(m.data_ora)}{m.causale ? ` · ${m.causale}` : ''}</Text>
                  </View>
                  <Text style={S.muted}>{m.quantita} {sel.unita_misura}</Text>
                </View>
              ))}
            </View>

            <Text style={S.h2}>Usato nei piatti</Text>
            <View style={S.card}>
              {produzioni.length === 0 ? (
                <Text style={S.muted}>Questo lotto non risulta ancora impiegato in produzioni.</Text>
              ) : produzioni.map((pr, i) => (
                <View key={pr.id} style={[S.row, { paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600', color: COLORS.text }}>{pr.nome}</Text>
                    <Text style={S.muted}>{fmtDataOra(pr.data_ora)} · lotto {pr.lotto_produzione || '—'}</Text>
                  </View>
                  <Text style={S.muted}>{pr.quantita_usata}</Text>
                </View>
              ))}
            </View>

            <Bottone testo="Scheda PDF per ASL" onPress={schedaPdf} />
            <Bottone testo="Chiudi" ghost onPress={() => setSel(null)} />
          </ScrollView>
        )}
      </Modal>
    </View>
  );
}
