import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtData, fmtDataOra } from './theme';
import { Bottone, AnteprimaFoto, Campo, Chips, useAvviso } from './UI';
import {
  cercaLotti, movimentiDiLotto, getImpostazioni, produzioniDaLotto,
  bloccaLotto, sbloccaLotto, impattoLotto,
} from './database';

const MOTIVI = ['Richiamo del fornitore', 'Allerta sanitaria', 'Sospetta non conformità'];
import { wrapDoc, stampa, esc } from './report';

export default function RintracciabilitaScreen({ route }) {
  const [cerca, setCerca] = useState('');
  const [lotti, setLotti] = useState([]);
  const [sel, setSel] = useState(null);
  const [movimenti, setMovimenti] = useState([]);
  const [produzioni, setProduzioni] = useState([]);
  const [impatto, setImpatto] = useState(null);
  const [azione, setAzione] = useState(null); // { tipo: 'blocca' | 'sblocca', lotti: [id], testo }
  const { avviso, mostra } = useAvviso();

  const ricarica = useCallback(() => { cercaLotti(cerca).then(setLotti); }, [cerca]);
  useFocusEffect(ricarica);
  React.useEffect(() => { ricarica(); }, [cerca]);

  const apri = async (l) => {
    setSel(l);
    setMovimenti(await movimentiDiLotto(l.id));
    setProduzioni(await produzioniDaLotto(l.id));
    setImpatto(await impattoLotto(l.id));
  };

  // apertura diretta di un lotto (es. "Blocca lotto" dal magazzino)
  React.useEffect(() => {
    const id = route?.params?.lottoId;
    if (!id) return;
    (async () => {
      const l = (await cercaLotti('')).find((x) => x.id === id);
      if (l) {
        await apri(l);
        if (route.params.blocca && l.stato !== 'bloccato') setAzione({ tipo: 'blocca', lotti: [l.id], testo: '' });
      }
    })();
  }, [route?.params?.lottoId]);

  const riapri = async (id) => {
    const tutti = await cercaLotti(cerca);
    setLotti(tutti);
    const l = (await cercaLotti('')).find((x) => x.id === id);
    if (l) await apri(l);
  };

  const confermaAzione = async () => {
    try {
      if (azione.tipo === 'blocca') {
        for (const id of azione.lotti) await bloccaLotto(id, azione.testo);
        mostra(azione.lotti.length > 1 ? `${azione.lotti.length} lotti bloccati ✓` : 'Lotto bloccato ✓ Non conformità aperta');
      } else {
        await sbloccaLotto(azione.lotti[0], azione.testo);
        mostra('Lotto sbloccato ✓');
      }
      setAzione(null);
      await riapri(sel.id);
    } catch (e) {
      Alert.alert('Operazione non riuscita', String(e?.message || e));
    }
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
      <div class="kv"><b>Stato del lotto:</b> ${l.stato === 'bloccato' ? '<span class="nc">BLOCCATO</span>' : esc(l.stato)}</div>
      ${l.note ? `<div class="kv"><b>Annotazioni:</b> ${esc(l.note)}</div>` : ''}
      <div class="kv"><b>Allergeni:</b> ${allerg.length ? esc(allerg.join(', ')) : 'nessuno dichiarato'}</div>
      <h1 style="margin-top:16px">Movimenti del lotto</h1>
      <table><thead><tr><th>Data</th><th>Tipo</th><th>Quantità</th><th>Causale</th></tr></thead>
      <tbody>${movRighe || '<tr><td colspan="4">Nessun movimento</td></tr>'}</tbody></table>
      <h1 style="margin-top:16px">Impiego nei piatti (tracciabilità a valle)</h1>
      <table><thead><tr><th>Data</th><th>Piatto</th><th>Lotto produzione</th><th>Q.tà usata</th></tr></thead>
      <tbody>${prodRighe || '<tr><td colspan="4">Nessun impiego registrato</td></tr>'}</tbody></table>
      ${impatto && impatto.stessaPartita.length ? `<h1 style="margin-top:16px">Altri carichi con lo stesso numero di lotto</h1>
      <table><thead><tr><th>Ricevuto</th><th>Fornitore</th><th>DDT</th><th>Residuo</th><th>Stato</th></tr></thead><tbody>
      ${impatto.stessaPartita.map((x) => `<tr><td>${fmtData(x.data_ricevimento)}</td><td>${esc(x.fornitore)}</td>
        <td>${esc(x.ddt_numero) || '—'}</td><td>${esc(x.quantita_residua)} ${esc(x.unita_misura)}</td><td>${esc(x.stato)}</td></tr>`).join('')}
      </tbody></table>` : ''}`;

    try {
      await stampa(wrapDoc(`${l.stato === 'bloccato' ? 'Rapporto di richiamo' : 'Scheda di rintracciabilità'} — lotto ${l.numero_lotto || l.id}`, corpo, imp));
    } catch (e) {
      Alert.alert('Stampa non riuscita', String(e?.message || e));
    }
  };

  const colore = (stato) =>
    stato === 'disponibile' ? COLORS.ok : stato === 'bloccato' || stato === 'scartato' ? COLORS.danger : COLORS.muted;

  return (
    <View style={S.screen}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <TextInput style={S.input} placeholder="Cerca per prodotto, lotto o fornitore…"
          value={cerca} onChangeText={setCerca} placeholderTextColor="#9CA3AF" />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={S.content}>
        {lotti.length === 0 && (
          <Text style={S.empty}>Nessun lotto trovato.</Text>
        )}
        {lotti.map((l) => (
          <TouchableOpacity key={l.id} style={S.card} onPress={() => apri(l)}>
            <Text style={{ fontSize: 16, fontWeight: '700' }}>{l.prodotto}</Text>
            <Text style={S.muted}>Lotto {l.numero_lotto || '—'} · {l.fornitore}</Text>
            <Text style={S.muted}>Ricevuto {fmtData(l.data_ricevimento)} · DDT {l.ddt_numero || '—'}</Text>
            <Text style={{ color: colore(l.stato), fontWeight: l.stato === 'bloccato' ? '800' : '600', marginTop: 2 }}>
              {l.stato === 'bloccato' ? '🚫 BLOCCATO' : l.stato}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={!!sel} animationType="slide" onRequestClose={() => setSel(null)}>
        {sel && (
          <ScrollView style={S.screen} contentContainerStyle={[S.content, { paddingTop: 50 }]}>
            <Text style={S.h1}>{sel.prodotto}</Text>
            {sel.stato === 'bloccato' && (
              <View style={[S.card, { backgroundColor: COLORS.dangerSoft, borderColor: COLORS.danger }]}>
                <Text style={{ color: COLORS.danger, fontWeight: '800', fontSize: 17 }}>🚫 Lotto bloccato</Text>
                <Text style={{ color: COLORS.text, marginTop: 4 }}>
                  Non compare più tra la merce utilizzabile né nelle produzioni. Tienilo separato e
                  identificato finché il fornitore o l'autorità non indicano cosa fare.
                </Text>
              </View>
            )}
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
              <AnteprimaFoto uri={sel.foto_etichetta} titolo="Foto etichetta" altezza={200} />
              <AnteprimaFoto uri={sel.foto_ddt} titolo="Foto documento" />
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

            {impatto && (
              <>
                <Text style={S.h2}>Richiamo</Text>
                <View style={S.card}>
                  <Text style={{ color: COLORS.text }}>
                    Usati {impatto.usato} {sel.unita_misura} su {sel.quantita_iniziale} · in magazzino {sel.quantita_residua} {sel.unita_misura}
                  </Text>
                  <Text style={S.muted}>
                    {impatto.piatti.length
                      ? `Impiegato in ${impatto.piatti.length} produzion${impatto.piatti.length > 1 ? 'i' : 'e'}: verifica se ci sono ancora porzioni da ritirare.`
                      : 'Non risulta impiegato in produzioni.'}
                  </Text>
                  {impatto.stessaPartita.length > 0 && (
                    <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8 }}>
                      <Text style={{ fontWeight: '700', color: COLORS.warning }}>
                        Stesso numero di lotto ricevuto altre {impatto.stessaPartita.length} volte:
                      </Text>
                      {impatto.stessaPartita.map((x) => (
                        <Text key={x.id} style={S.muted}>
                          • {fmtData(x.data_ricevimento)} · {x.fornitore} · residuo {x.quantita_residua} {x.unita_misura} · {x.stato}
                        </Text>
                      ))}
                    </View>
                  )}
                  {sel.stato === 'bloccato' ? (
                    <Bottone testo="Sblocca dopo la verifica" ghost
                      onPress={() => setAzione({ tipo: 'sblocca', lotti: [sel.id], testo: '' })} />
                  ) : sel.stato !== 'annullato' && (
                    <Bottone testo={impatto.stessaPartita.some((x) => x.stato !== 'bloccato')
                      ? '🚫 Blocca questo lotto e gli altri con lo stesso numero' : '🚫 Blocca lotto (richiamo)'}
                      colore={COLORS.danger}
                      onPress={() => setAzione({
                        tipo: 'blocca', testo: '',
                        lotti: [sel.id, ...impatto.stessaPartita.filter((x) => x.stato !== 'bloccato').map((x) => x.id)],
                      })} />
                  )}
                </View>
              </>
            )}

            <Bottone testo={sel.stato === 'bloccato' ? 'Rapporto di richiamo PDF' : 'Scheda PDF per ASL'} onPress={schedaPdf} />
            <Bottone testo="Chiudi" ghost onPress={() => setSel(null)} />
          </ScrollView>
        )}
        <Modal visible={!!azione} transparent animationType="fade" onRequestClose={() => setAzione(null)}>
          {azione && (
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 }}>
              <View style={S.card}>
                <Text style={S.h2}>
                  {azione.tipo === 'blocca'
                    ? (azione.lotti.length > 1 ? `Blocca ${azione.lotti.length} lotti` : 'Blocca lotto')
                    : 'Sblocca lotto'}
                </Text>
                {azione.tipo === 'blocca' && (
                  <Chips label="Motivo" opzioni={MOTIVI} valore={azione.testo}
                    onChange={(v) => setAzione((a) => ({ ...a, testo: v }))} />
                )}
                <Campo label={azione.tipo === 'blocca' ? 'Dettagli (n. avviso, comunicazione…)' : 'Esito della verifica *'}
                  value={azione.testo} multiline
                  onChange={(v) => setAzione((a) => ({ ...a, testo: v }))} />
                <Text style={[S.muted, { marginTop: 8 }]}>
                  {azione.tipo === 'blocca'
                    ? 'Il lotto esce dalla merce utilizzabile e si apre una non conformità da chiudere quando la vicenda è risolta.'
                    : 'Il lotto torna utilizzabile. La non conformità resta da chiudere con l\'azione correttiva.'}
                </Text>
                <Bottone testo={azione.tipo === 'blocca' ? 'Conferma blocco' : 'Conferma sblocco'}
                  colore={azione.tipo === 'blocca' ? COLORS.danger : undefined} onPress={confermaAzione} />
                <Bottone testo="Annulla" ghost onPress={() => setAzione(null)} />
              </View>
            </View>
          )}
        </Modal>
        {avviso}
      </Modal>
    </View>
  );
}
