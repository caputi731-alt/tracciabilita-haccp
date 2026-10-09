import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import { S, COLORS, ALLERGENI, fmtData, oggiLocale, piuGiorni, giornoDi, escHtml as h } from './theme';
import { Campo, Chips, Segmenti, Selettore, Bottone, CampoData, Icona, useAvviso } from './UI';
import {
  listaProdotti, leggiAllergeni, produzioniPerEtichette, allergeniRicetta, foglioEtichette, salvaFoglioEtichette,
} from './database';

const oggiISO = oggiLocale;
const oraNow = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};
const addGiorni = (iso, giorni) => {
  if (!iso || giorni == null || giorni === '' || !Number.isFinite(Number(giorni))) return '';
  return piuGiorni(iso, giorni);
};
const lottoAuto = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `P${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

const ORIGINI = ['Prodotto', 'Produzione'];
const oraDi = (istante) => {
  const d = new Date(istante);
  if (Number.isNaN(d.getTime())) return oraNow();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};
const TIPI = ['Produzione', 'Apertura', 'Congelamento', 'Allergeni'];
const FORMATI = ['Foglio A4', 'Termica'];
const STATI = ['Cotto', 'Scongelato', 'Abbattuto +3°C', 'Abbattuto -18°C'];

const cb = (on) => `<span class="cb ${on ? 'on' : ''}"></span>`;

/* Costruisce l'HTML interno di UNA etichetta a partire da uno snapshot dati */
function costruisciEtichetta(d) {
  const all = h((d.allergeni || []).join(', '));
  const allNote = [all, h(d.note)].filter(Boolean).join(' — ') || '&nbsp;';

  if (d.tipo === 'Produzione') {
    const st = d.stato || [];
    return `
      <div class="lab">
        <div class="hd">CONTROLLO INTERNO ALIMENTI
          <div class="sub">SCHEDA DI TRACCIABILITÀ E CONSERVAZIONE</div>
        </div>
        <div class="bd">
          <div class="prod">PRODOTTO: <b>${h(d.nome)}</b></div>
          <div class="chk">
            <div>${cb(st.includes('Cotto'))}Cotto &nbsp;&nbsp; ${cb(st.includes('Abbattuto +3°C'))}Abbattuto (+3°C)</div>
            <div>${cb(st.includes('Scongelato'))}Scongelato &nbsp; ${cb(st.includes('Abbattuto -18°C'))}Abbattuto (-18°C)</div>
          </div>
          <div class="r"><b>PREPARATO:</b> ${fmtData(d.dataRif)} &nbsp;&nbsp; <b>ORA:</b> ${h(d.ora)}</div>
          <div class="r"><b>SCADENZA INTERNA:</b> ${d.scadenza ? fmtData(d.scadenza) : ''}</div>
          ${d.lotto ? `<div class="r"><b>LOTTO:</b> ${h(d.lotto)}</div>` : ''}
          <div class="r"><b>OPERATORE:</b> ${h(d.operatore)}</div>
          <div class="note"><b>ALLERGENI / NOTE:</b> ${allNote}</div>
        </div>
      </div>`;
  }
  if (d.tipo === 'Apertura' || d.tipo === 'Congelamento') {
    const tag = d.tipo === 'Apertura' ? 'APERTO IL' : 'CONGELATO IL';
    return `
      <div class="lab">
        <div class="hd">CONTROLLO INTERNO ALIMENTI
          <div class="sub">SCHEDA DI TRACCIABILITÀ E CONSERVAZIONE</div>
        </div>
        <div class="bd">
          <div class="prod">PRODOTTO: <b>${h(d.nome)}</b></div>
          <div class="big">${tag}: ${fmtData(d.dataRif)}</div>
          <div class="r"><b>${d.tipo === 'Apertura' ? 'CONSUMARE ENTRO' : 'SCADENZA'}:</b> ${d.scadenza ? fmtData(d.scadenza) : ''}</div>
          <div class="r"><b>OPERATORE:</b> ${h(d.operatore)}</div>
          <div class="note"><b>ALLERGENI / NOTE:</b> ${allNote}</div>
        </div>
      </div>`;
  }
  return `
    <div class="lab">
      <div class="hd">ALLERGENI
        <div class="sub">Reg. UE 1169/2011</div>
      </div>
      <div class="bd">
        <div class="prod">PIATTO: <b>${h(d.nome)}</b></div>
        <div class="allg">${(d.allergeni || []).length ? h(d.allergeni.join(' · ')) : 'Nessuno dichiarato'}</div>
      </div>
    </div>`;
}

const CSS_LAB = `
  * { box-sizing: border-box; }
  .lab { border: 1px solid #333; border-radius: 4px; overflow: hidden; page-break-inside: avoid; }
  .hd { background: #3f6ea5; color: #fff; text-align: center; font-weight: 800; font-size: 12px; padding: 6px 4px; letter-spacing: .5px; }
  .hd .sub { font-size: 9px; font-weight: 600; opacity: .95; letter-spacing: 0; }
  .bd { padding: 8px 10px; }
  .prod { font-size: 13px; margin-bottom: 6px; border-bottom: 1px dashed #999; padding-bottom: 5px; }
  .chk { font-size: 12px; line-height: 1.7; margin-bottom: 6px; border-bottom: 1px dashed #999; padding-bottom: 5px; }
  .cb { display: inline-block; width: 11px; height: 11px; border: 1.4px solid #000; vertical-align: middle; margin-right: 4px; }
  .cb.on { background: #000; }
  .r { font-size: 12px; margin: 3px 0; }
  .big { font-size: 18px; font-weight: 800; margin: 6px 0; }
  .allg { font-size: 16px; font-weight: 800; line-height: 1.5; margin-top: 6px; }
  .note { font-size: 12px; margin-top: 6px; border-top: 1px dashed #999; padding-top: 5px; min-height: 26px; }
`;

/* Documento A4: griglia a 2 colonne, ogni cella = dimensione "8 per foglio" */
function docA4(etichette) {
  const celle = etichette.map((e) => costruisciEtichetta(e)).join('');
  const css = `
    @page { size: A4; margin: 8mm; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
    ${CSS_LAB}
  `;
  return `<html><head><meta charset="utf-8"><style>${css}</style></head>
    <body><div class="grid">${celle}</div></body></html>`;
}

/* Documento termica: una etichetta a larghezza fissa in mm */
function docTermica(etichetta, larghezzaMm) {
  const w = Number(larghezzaMm) || 50;
  const css = `
    @page { size: ${w}mm auto; margin: 2mm; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; }
    .wrap { width: ${w - 4}mm; }
    ${CSS_LAB}
    .hd { font-size: 11px; }
    .prod, .chk, .r, .note { font-size: 11px; }
  `;
  return `<html><head><meta charset="utf-8"><style>${css}</style></head>
    <body><div class="wrap">${costruisciEtichetta(etichetta)}</div></body></html>`;
}

export default function EtichetteScreen({ route }) {
  const [prodotti, setProdotti] = useState([]);
  const [tipo, setTipo] = useState('Produzione');
  const [formato, setFormato] = useState('Foglio A4');
  const [larghezzaMm, setLarghezzaMm] = useState('50');

  const [prodottoId, setProdottoId] = useState(null);
  const [nome, setNome] = useState('');
  const [dataRif, setDataRif] = useState(oggiISO());
  const [ora, setOra] = useState(oraNow());
  const [scadenza, setScadenza] = useState('');
  const [lotto, setLotto] = useState('');
  const [operatore, setOperatore] = useState('');
  const [note, setNote] = useState('');
  const [stato, setStato] = useState([]);
  const [allergeni, setAllergeni] = useState([]);

  // il foglio preparato resta sul telefono finché non viene stampato o svuotato: le etichette si aggiungono durante la giornata
  const [elenco, setElencoStato] = useState([]);
  const setElenco = useCallback((lista) => { setElencoStato(lista); salvaFoglioEtichette(lista).catch(() => {}); }, []);
  const { mostra, avviso } = useAvviso();
  // l'etichetta parte da un prodotto del catalogo oppure da una produzione registrata (non scaduta)
  const [origine, setOrigine] = useState('Prodotto');
  const [produzioni, setProduzioni] = useState([]);
  const [produzioneId, setProduzioneId] = useState(null);

  useFocusEffect(useCallback(() => {
    listaProdotti().then(setProdotti);
    produzioniPerEtichette().then(setProduzioni).catch(() => {});
    foglioEtichette().then(setElencoStato).catch(() => {});
  }, []));

  const scegliProduzione = async (id) => {
    setProduzioneId(id);
    const pr = produzioni.find((x) => x.id === id);
    if (!pr) return;
    setTipo('Produzione'); setProdottoId(null);
    setNome(pr.nome || ''); setLotto(pr.lotto_produzione || '');
    setDataRif(giornoDi(pr.data_ora) || oggiISO()); setOra(oraDi(pr.data_ora));
    setScadenza(pr.data_scadenza || ''); setOperatore(pr.operatore || '');
    // allergeni fotografati al momento della produzione (per i dati vecchi: dalla ricetta)
    const salvati = leggiAllergeni(pr.allergeni);
    setAllergeni(salvati.length || !pr.ricetta_id ? salvati : await allergeniRicetta(pr.ricetta_id).catch(() => []));
  };
  const cambiaOrigine = (o) => { setOrigine(o); setProdottoId(null); setProduzioneId(null); };

  const scegliProdotto = (id) => {
    setProdottoId(id);
    const p = prodotti.find((x) => x.id === id);
    if (!p) return;
    setNome(p.denominazione);
    setAllergeni(leggiAllergeni(p.allergeni));
    if (tipo === 'Apertura' && p.giorni_dopo_apertura != null) {
      setScadenza(addGiorni(oggiISO(), p.giorni_dopo_apertura));
    }
  };

  // precompilazione da lotto o produzione ("Stampa etichetta")
  const precompila = route?.params?.precompila;
  React.useEffect(() => {
    if (!precompila) return;
    const pr = precompila;
    setTipo(pr.tipo || 'Produzione');
    setProdottoId(pr.prodotto_id || null);
    setNome(pr.nome || '');
    setLotto(pr.lotto || '');
    setDataRif(oggiISO());
    setOra(oraNow());
    const p = prodotti.find((x) => x.id === pr.prodotto_id);
    let allerg = pr.allergeni;
    if (!allerg && p) allerg = leggiAllergeni(p.allergeni);
    setAllergeni(allerg || []);
    let sc = pr.scadenza || '';
    if (pr.tipo === 'Apertura' && p && p.giorni_dopo_apertura != null) {
      const dopoApertura = addGiorni(oggiISO(), p.giorni_dopo_apertura);
      sc = sc && sc < dopoApertura ? sc : dopoApertura; // vale la data più vicina
    }
    setScadenza(sc);
  }, [precompila, prodotti.length]);

  const snapshot = () => ({
    tipo, nome, dataRif, ora, scadenza, lotto, operatore, note,
    stato: [...stato], allergeni: [...allergeni],
  });

  const svuotaCampi = () => {
    setProdottoId(null); setProduzioneId(null); setNome(''); setDataRif(oggiISO()); setOra(oraNow());
    setScadenza(''); setLotto(''); setOperatore(''); setNote('');
    setStato([]); setAllergeni([]);
  };

  const aggiungi = () => {
    if (!nome && tipo !== 'Allergeni') {
      return Alert.alert('Manca il nome', 'Indica il prodotto o scrivi un nome.');
    }
    const lista = [...elenco, snapshot()];
    setElenco(lista);
    svuotaCampi();
    mostra(`Aggiunta al foglio ✓ (${lista.length} in attesa)`);
  };

  const stampaFoglio = async () => {
    let lista = elenco;
    if (lista.length === 0) {
      if (!nome && tipo !== 'Allergeni') {
        return Alert.alert('Elenco vuoto', 'Aggiungi almeno un\'etichetta o compila il modulo.');
      }
      lista = [snapshot()];
    }
    try { await Print.printAsync({ html: docA4(lista) }); }
    catch (e) { return Alert.alert('Stampa non riuscita', String(e?.message || e)); }
    // dopo la stampa il foglio si svuota da solo (scelta di Luca); "Annulla" lo riporta se la stampa non è andata
    if (elenco.length > 0) {
      const prima = elenco;
      setElenco([]);
      mostra('Foglio stampato e svuotato', { testo: 'Annulla', onPress: () => setElenco(prima) });
    }
  };

  const stampaTermica = async () => {
    if (!nome && tipo !== 'Allergeni') {
      return Alert.alert('Manca il nome', 'Compila il modulo dell\'etichetta.');
    }
    try { await Print.printAsync({ html: docTermica(snapshot(), larghezzaMm) }); }
    catch (e) { Alert.alert('Stampa non riuscita', String(e?.message || e)); }
  };

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <Text style={S.h1}>Etichette</Text>
      {elenco.length > 0 && (
        <Text style={[S.muted, { marginBottom: 4 }]}>
          Foglio in preparazione: {elenco.length} etichett{elenco.length === 1 ? 'a' : 'e'} da stampare.
        </Text>
      )}
      <Chips label="Tipo di etichetta" opzioni={TIPI} valore={tipo} onChange={setTipo} />
      <Chips label="Formato di stampa" opzioni={FORMATI} valore={formato} onChange={setFormato} />
      {formato === 'Termica' && (
        <Campo label="Larghezza rotolo (mm)" value={larghezzaMm} onChange={setLarghezzaMm}
          keyboardType="number-pad" />
      )}

      <View style={[S.card, { marginTop: 12 }]}>
        <Text style={S.label}>Etichetta per</Text>
        <Segmenti opzioni={ORIGINI} valore={origine} onChange={cambiaOrigine} />
        {origine === 'Prodotto' ? (
          <Selettore label="Prodotto (dal catalogo)" elementi={prodotti} valore={prodottoId}
            etichetta={(x) => x.denominazione} onChange={scegliProdotto}
            placeholder="Scegli, oppure scrivi il nome sotto" />
        ) : (
          <>
            <Selettore label="Produzione (non scaduta)" elementi={produzioni} valore={produzioneId}
              etichetta={(x) => `${x.nome} · ${fmtData(giornoDi(x.data_ora))}${x.lotto_produzione ? ` · ${x.lotto_produzione}` : ''}`}
              onChange={scegliProduzione}
              placeholder={produzioni.length ? 'Scegli la produzione' : 'Nessuna produzione non scaduta'} />
            <Text style={S.muted}>Nome, lotto, date e allergeni vengono dalla produzione; puoi correggerli qui sotto.</Text>
          </>
        )}
        <Campo label={tipo === 'Allergeni' ? 'Nome del piatto' : 'Nome prodotto'}
          value={nome} onChange={setNome} />

        {tipo === 'Produzione' && (
          <Chips label="Stato" opzioni={STATI} valore={stato} onChange={setStato} multiplo />
        )}
        {tipo !== 'Allergeni' && (
          <CampoData facoltativo={false} massimo={oggiLocale()}
            label={tipo === 'Congelamento' ? 'Data di congelamento' : tipo === 'Apertura' ? 'Data di apertura' : 'Data di preparazione'}
            value={dataRif} onChange={(iso) => setDataRif(iso || oggiLocale())} />
        )}
        {tipo === 'Produzione' && (
          <Campo label="Ora" value={ora} onChange={setOra} placeholder="HH:MM" />
        )}
        {tipo === 'Produzione' && (
          <>
            <Campo label="Lotto (facoltativo)" value={lotto} onChange={setLotto}
              placeholder="lascia vuoto o generalo" />
            <Bottone testo="Genera lotto automatico" ghost onPress={() => setLotto(lottoAuto())} />
          </>
        )}
        {tipo !== 'Allergeni' && (
          <CampoData label={tipo === 'Apertura' ? 'Consumare entro' : tipo === 'Congelamento' ? 'Scadenza' : 'Scadenza interna'}
            value={scadenza || null} onChange={(iso) => setScadenza(iso || '')}
            scorciatoie={[{ testo: '+1 gg', giorni: 1 }, { testo: '+3 gg', giorni: 3 }, { testo: '+5 gg', giorni: 5 }]} />
        )}
        {tipo !== 'Allergeni' && (
          <Campo label="Operatore" value={operatore} onChange={setOperatore} />
        )}
        <Chips label="Allergeni" opzioni={ALLERGENI} valore={allergeni} onChange={setAllergeni} multiplo />
        {tipo !== 'Allergeni' && (
          <Campo label="Note aggiuntive" value={note} onChange={setNote} multiline />
        )}
      </View>

      {formato === 'Foglio A4' ? (
        <>
          <Bottone testo="Aggiungi al foglio" ghost onPress={aggiungi} />
          <View style={[S.card, { marginTop: 4 }]}>
            <Text style={{ fontWeight: '700' }}>Nel foglio: {elenco.length} etichett{elenco.length === 1 ? 'a' : 'e'}</Text>
            {elenco.map((e, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[S.muted, { flex: 1 }]}>{i + 1}. {e.nome || '(senza nome)'} — {e.tipo}</Text>
                <TouchableOpacity onPress={() => setElenco(elenco.filter((_, j) => j !== i))}
                  accessibilityRole="button" accessibilityLabel={`Togli dal foglio ${e.nome || 'etichetta'}`}
                  style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                  <Icona nome="close" size={22} colore={COLORS.muted} />
                </TouchableOpacity>
              </View>
            ))}
            <Text style={[S.muted, { marginTop: 4 }]}>
              Il foglio resta salvato anche se esci: aggiungi le etichette durante la giornata e stampa quando vuoi.
            </Text>
            {elenco.length > 0 && (
              <Bottone testo="Svuota il foglio" ghost onPress={() => setElenco([])} />
            )}
          </View>
          <Bottone testo="Stampa foglio A4" onPress={stampaFoglio} />
          <Text style={[S.muted, { marginTop: 8 }]}>
            Ogni etichetta ha la dimensione di 1/8 di foglio A4. Oltre le 8, continua su
            pagine successive. Se il foglio è vuoto, stampa l'etichetta compilata qui sopra.
            Dopo la stampa il foglio si svuota da solo.
          </Text>
        </>
      ) : (
        <>
          <Bottone testo="Stampa etichetta termica" onPress={stampaTermica} />
          <Text style={[S.muted, { marginTop: 8 }]}>
            L'etichetta esce larga quanto il rotolo impostato. Regola i millimetri finché
            combacia con le tue etichette.
          </Text>
        </>
      )}

      <Bottone testo="Svuota campi" ghost onPress={svuotaCampi} />
    </ScrollView>
    {avviso}
    </View>
  );
}
