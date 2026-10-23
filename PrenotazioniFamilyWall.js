/**
 * Prenotazioni da Family Wall nella sezione Sala (Fase 1, piano approvato da Luca il 18/10/2026).
 * - `RiquadroFamilyWall`: per il giorno scelto le prenotazioni lette dal calendario e ancora da confermare, gli eventi che non
 *   sembrano prenotazioni, le segnalazioni (cambiate o sparite in Family Wall dopo la conferma). Gli altri giorni non si annunciano qui (scelta di Luca
 *   del 21/10/2026: occupava spazio): le loro prenotazioni compaiono quando si apre quel giorno.
 * - `SchedaConferma`: la scheda proposta dal testo, con i campi incerti evidenziati; "Conferma e metti a tavola" la mette nel
 *   posto migliore della sala scelta (o dell'altra, se lì non entra).
 * - `ModaleFamilyWall`: collegamento del calendario (link iCal) protetto dal PIN del titolare, aggiornamento a mano, stato.
 * Logica in familywall.js, salvataggi in database.js, scaricamento in familywallAggiorna.js.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { S, COLORS, aNumero, oggiLocale, fmtData } from './theme';
import { Icona, Bottone, Campo, Segmenti, VistaModale, conferma, useErrori } from './UI';
import {
  prenotazioniEsterne, confermaPrenotazioneEsterna, scartaPrenotazioneEsterna, rifaiPrenotazioneEsterna, togliPrenotazioneEsterna,
  lasciaPrenotazioneEsterna, salvaLinkFamilyWall, scollegaFamilyWall, leggiPreferenza, salvaPreferenza,
  disdiciPrenotazioneEsterna, annullaDisdetta,
} from './database';
import { leggiTesto, noteTavolata } from './familywall';
import { statoFamilyWall, aggiornaDaFamilyWall, aggiornaSeServe } from './familywallAggiorna';
import { SALE, ID_SALE, SERVIZI, nuovaTavolata } from './sale';
import { pinImpostato, costiSbloccati, sbloccaCosti } from './pin';
import { ModalePin } from './RiquadroPin';

const nomeSala = (id) => (SALE[id] ? SALE[id].nome.replace('Sala ', '').replace(/^./, (c) => c.toUpperCase()) : '');
const NOMI_SALE = ID_SALE.map(nomeSala);
const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;
const giornoBreve = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
const oraDi = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const DA_CONTROLLARE = 'Da controllare';

/** La riga salvata con la sua scheda letta dal testo (prima riga = titolo dell'evento, il resto = descrizione). */
function conScheda(r) {
  const [titolo, ...desc] = String(r.testo || '').split('\n');
  return { ...r, titolo, scheda: leggiTesto(titolo, desc.join('\n'), r.colore) };
}

function esitoAggiornamento(e) {
  if (!e) return 'Calendario aggiornato ✓';
  const parti = [];
  if (e.nuove) parti.push(plurale(e.nuove, 'nuova', 'nuove'));
  if (e.cambiate) parti.push(plurale(e.cambiate, 'cambiata', 'cambiate'));
  if (e.sparite) parti.push(plurale(e.sparite, 'sparita', 'sparite'));
  return parti.length ? `Family Wall: ${parti.join(', ')} ✓` : 'Nessuna novità da Family Wall ✓';
}

/* ---------- scheda da confermare ---------- */

export function SchedaConferma({ riga, salaVista, onConfermata, onDisdici, onChiudi }) {
  const s = riga.scheda;
  const iniziale = useMemo(() => ({
    nome: s.nome,
    adulti: s.adulti === null ? '' : String(s.adulti),
    bambini: s.bambini ? String(s.bambini) : '',
    neonati: s.neonati ? String(s.neonati) : '',
    telefono: s.telefono,
    sala: s.sala || salaVista,
    servizio: s.servizio,
    acconto: !!s.acconto,
    note: s.note,
  }), [s, salaVista]);
  const [v, setV] = useState(iniziale);
  const { errori, segnala, azzera, riepilogo } = useErrori();
  useEffect(() => { setV(iniziale); azzera(); }, [iniziale, azzera]);
  const cambia = (campo) => (x) => setV((o) => ({ ...o, [campo]: x }));
  const intervallo = s.min && s.max && s.max > s.min;

  // i campi incerti si vedono subito: il segnale sparisce appena il campo viene toccato
  const avvisi = {
    nome: s.incerti.includes('nome') ? (s.nome ? DA_CONTROLLARE : 'Scrivi il nome') : null,
    adulti: s.incerti.includes('persone') ? (s.adulti === null ? 'Scrivi quante persone' : DA_CONTROLLARE) : null,
  };

  const salva = async () => {
    azzera();
    const n = (t) => (String(t).trim() ? aNumero(t) : 0);
    const [adulti, bambini, neonati] = [n(v.adulti), n(v.bambini), n(v.neonati)];
    let ok = true;
    for (const [campo, x] of [['adulti', adulti], ['bambini', bambini], ['neonati', neonati]]) {
      if (x === null || x < 0 || !Number.isInteger(x)) ok = segnala(campo, 'Scrivi un numero intero');
    }
    if (ok && adulti + bambini + neonati <= 0) ok = segnala('adulti', 'Scrivi quante persone');
    if (!v.nome.trim()) ok = segnala('nome', 'Scrivi il nome');
    if (!ok) return;
    // l'intervallo "da 13 a 16" resta nelle note finché il numero è quello letto
    const restaIntervallo = intervallo && adulti === s.max && !bambini && !neonati;
    // bambini, neonati e telefono vanno nei campi della tavolata (Fase 4); nelle note restano intervallo, età, acconto e il resto
    const eta = bambini && s.eta && s.eta.length ? `bambini di ${s.eta.join(', ')}` : '';
    const tavolata = nuovaTavolata({
      nome: v.nome.trim(),
      persone: String(adulti + bambini + neonati),
      bambini: bambini ? String(bambini) : '',
      neonati: neonati ? String(neonati) : '',
      tel: v.telefono.trim(),
      note: noteTavolata({
        adulti, min: restaIntervallo ? s.min : null, max: restaIntervallo ? s.max : null,
        acconto: v.acconto, note: [eta, v.note.trim()].filter(Boolean).join(' · '),
      }),
    });
    const esito = await confermaPrenotazioneEsterna(riga.uid, { data: riga.data, servizio: v.servizio, sala: v.sala, tavolata });
    onConfermata({ ...esito, data: riga.data, servizio: v.servizio, nome: tavolata.nome, salaChiesta: v.sala });
  };

  const scarta = () => conferma('Non è una prenotazione?', 'L\'evento non verrà più proposto. Torna solo se in Family Wall viene cambiato.', async () => {
    await scartaPrenotazioneEsterna(riga.uid);
    onConfermata(null);
  });

  return (
    <Modal visible animationType="slide" onRequestClose={onChiudi}>
      <VistaModale>
        <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 1, color: COLORS.muted }}>
          DA FAMILY WALL · {fmtData(riga.data).toUpperCase()}
        </Text>
        <Text style={S.h1}>Conferma la prenotazione</Text>

        <View style={{ backgroundColor: COLORS.contenitore, borderRadius: 16, padding: 14, marginBottom: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.muted }}>Scritto in Family Wall</Text>
          <Text selectable style={{ fontSize: 16, color: COLORS.text, marginTop: 4 }}>{riga.testo}</Text>
        </View>

        <View style={S.card}>
          <Campo label="Nome" value={v.nome} onChange={cambia('nome')} errore={errori.nome || avvisi.nome} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Campo label="Adulti" value={v.adulti} onChange={cambia('adulti')} keyboardType="number-pad" errore={errori.adulti || avvisi.adulti} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo label="Bambini" value={v.bambini} onChange={cambia('bambini')} keyboardType="number-pad" errore={errori.bambini} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo label="Neonati" value={v.neonati} onChange={cambia('neonati')} keyboardType="number-pad" errore={errori.neonati} />
            </View>
          </View>
          {intervallo && (
            <Text style={[S.muted, { marginTop: 6 }]}>
              Nel testo: da {s.min} a {s.max} persone. La tavolata si prepara per {s.max}.
            </Text>
          )}
          {s.eta.length > 0 && <Text style={[S.muted, { marginTop: 6 }]}>Età dei bambini: {s.eta.join(', ')}</Text>}
          <Campo label="Telefono" value={v.telefono} onChange={cambia('telefono')} keyboardType="phone-pad" />
          <Campo label="Note" value={v.note} onChange={cambia('note')} placeholder="Seggiolone, intolleranze, torta…" />
        </View>

        <View style={S.card}>
          <Text style={S.label}>Sala{s.sala ? '' : ' (non indicata nel testo: scegli tu)'}</Text>
          <Segmenti opzioni={NOMI_SALE} valore={nomeSala(v.sala)} onChange={(x) => cambia('sala')(ID_SALE[NOMI_SALE.indexOf(x)])} />
          <Text style={[S.label, { marginTop: 14 }, s.incerti.includes('servizio') && { color: COLORS.warning }]}>
            Servizio{s.incerti.includes('servizio') ? ' (nel testo c\'è "cena" o "sera": controlla)' : ''}
          </Text>
          <Segmenti opzioni={SERVIZI} valore={v.servizio} onChange={cambia('servizio')} />
          <Text style={[S.label, { marginTop: 14 }]}>Acconto</Text>
          <Segmenti opzioni={['Non ancora', 'Ricevuto']} valore={v.acconto ? 'Ricevuto' : 'Non ancora'} onChange={(x) => cambia('acconto')(x === 'Ricevuto')} />
          {riepilogo}
        </View>

        <Bottone testo="Conferma e metti a tavola" icona="check" onPress={salva} />
        {!!onDisdici && <Bottone testo="Disdetta dal cliente" icona="account-cancel-outline" ghost colore={COLORS.danger} onPress={onDisdici} />}
        <Bottone testo="Non è una prenotazione" ghost colore={COLORS.danger} onPress={scarta} />
        <Bottone testo="Chiudi" ghost onPress={onChiudi} />
      </VistaModale>
    </Modal>
  );
}

/* ---------- collegamento del calendario ---------- */

export function ModaleFamilyWall({ visibile, onChiudi, onAggiornato }) {
  const [stato, setStato] = useState(null);
  const [conPin, setConPin] = useState(null);
  const [chiediPin, setChiediPin] = useState(null); // 'collega' | 'scollega'
  const [scrivi, setScrivi] = useState(false);
  const [link, setLink] = useState('');
  const [messaggio, setMessaggio] = useState('');
  const { errori, segnala, azzera } = useErrori();

  const carica = useCallback(async () => {
    setStato(await statoFamilyWall());
    setConPin(await pinImpostato());
  }, []);
  useEffect(() => {
    if (!visibile) return;
    setScrivi(false); setLink(''); setMessaggio(''); azzera();
    carica().catch(() => {});
  }, [visibile, carica, azzera]);

  const aggiorna = async () => {
    setMessaggio('');
    try {
      const e = await aggiornaDaFamilyWall();
      setMessaggio(esitoAggiornamento(e));
      onAggiornato();
    } catch (e) {
      setMessaggio(String((e && e.message) || e));
    }
    await carica();
  };
  const salva = async () => {
    azzera();
    try {
      await salvaLinkFamilyWall(link);
    } catch (e) {
      segnala('link', String((e && e.message) || e));
      return;
    }
    setScrivi(false); setLink('');
    await aggiorna();
  };
  // cambiare o togliere il link chiede il PIN del titolare (lo stesso blocco di incassi e costi)
  const apriScrivi = () => setScrivi(true);
  const conSblocco = (cosa) => {
    if (!costiSbloccati()) setChiediPin(cosa);
    else if (cosa === 'collega') apriScrivi();
    else scollega();
  };
  const scollega = () => conferma('Scollegare Family Wall?', 'Il link viene tolto da questo telefono. Le prenotazioni già messe a tavola restano.', async () => {
    await scollegaFamilyWall(); await carica(); onAggiornato();
  });

  return (
    <Modal visible={!!visibile} animationType="slide" onRequestClose={onChiudi}>
      <VistaModale>
        <Text style={S.h1}>Family Wall</Text>
        <Text style={[S.muted, { marginBottom: 8 }]}>
          La suite legge le prenotazioni dal calendario di Family Wall (solo lettura: lì non cambia niente) e le propone qui da confermare.
          Si aggiorna aprendo la Sala quando c'è rete; senza rete restano quelle scaricate l'ultima volta.
        </Text>

        {!!stato && (
          <View style={[S.card, { borderWidth: 1.5, borderColor: stato.collegato ? (stato.errore ? COLORS.warning : COLORS.ok) : COLORS.bordoCampo }]}>
            <Text style={S.h2}>{stato.collegato ? 'Calendario collegato' : 'Calendario non collegato'}</Text>
            {stato.collegato && (
              <Text style={S.muted}>
                {stato.ultimo ? `Ultimo aggiornamento: ${fmtData(stato.ultimo)} alle ${oraDi(stato.ultimo)}` : 'Non ancora aggiornato'}
              </Text>
            )}
            {!!stato.errore && <Text style={{ color: COLORS.warning, fontSize: 15, marginTop: 6 }}>{stato.errore}</Text>}
            {!!messaggio && <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '700', marginTop: 6 }}>{messaggio}</Text>}
            {stato.collegato && <Bottone testo="Aggiorna adesso" icona="refresh" onPress={aggiorna} />}
          </View>
        )}

        {conPin === false && (
          <View style={S.card}>
            <Text style={S.h2}>Serve il PIN del titolare</Text>
            <Text style={S.muted}>
              Il link dà accesso a tutte le prenotazioni, telefoni compresi: si collega solo con il PIN.
              Impostalo in Altro → Documenti e dati → Backup (è lo stesso PIN dei backup e degli incassi).
            </Text>
          </View>
        )}

        {conPin && !scrivi && (
          <Bottone testo={stato && stato.collegato ? 'Cambia il link' : 'Collega il calendario'} icona="link-variant" ghost={!!(stato && stato.collegato)}
            onPress={() => conSblocco('collega')} />
        )}
        {conPin && scrivi && (
          <View style={S.card}>
            <Text style={S.h2}>Link iCal del calendario</Text>
            <Text style={[S.muted, { marginBottom: 6 }]}>
              In Family Wall: Calendario → impostazioni → freccia › accanto al calendario delle prenotazioni → "Genera URL iCal" → Copia.
              Poi incollalo qui. Non mandarlo a nessuno: chi lo ha legge tutto il calendario.
            </Text>
            <Campo label="Link" value={link} onChange={setLink} errore={errori.link} autoCapitalize="none" autoCorrect={false}
              keyboardType="url" placeholder="webcal://…" />
            <Bottone testo="Salva e scarica" onPress={salva} />
            <Bottone testo="Annulla" ghost onPress={() => setScrivi(false)} />
          </View>
        )}
        {conPin && stato && stato.collegato && !scrivi && (
          <Bottone testo="Scollega" ghost colore={COLORS.danger} onPress={() => conSblocco('scollega')} />
        )}
        <Bottone testo="Chiudi" ghost onPress={onChiudi} />
      </VistaModale>
      <ModalePin visibile={!!chiediPin} titolo="PIN del titolare" testo="Il collegamento con Family Wall si cambia solo con il PIN."
        pulsante="Continua" onChiudi={() => setChiediPin(null)}
        onConferma={async (codice) => {
          await sbloccaCosti(codice);
          const cosa = chiediPin;
          setChiediPin(null);
          if (cosa === 'collega') apriScrivi(); else scollega();
        }} />
    </Modal>
  );
}

/* ---------- riquadro nella Sala ---------- */

/**
 * `versione` cambia ogni volta che la Sala torna visibile: il riquadro rilegge le prenotazioni e, se è passato abbastanza tempo,
 * riscarica il calendario. `suMessa({ data, servizio, sala, nome })` dopo una conferma;
 * `suCambiato()` quando una tavolata è stata tolta (la Sala rilegge la disposizione).
 */
export default function RiquadroFamilyWall({ data, servizio, salaVista, versione, suMessa, suCambiato, mostra, suConteggio, apriUid, suApertoUid }) {
  const [righe, setRighe] = useState([]);
  const [stato, setStato] = useState(null);
  const [aperta, setAperta] = useState(null); // uid della scheda aperta
  const [impostazioni, setImpostazioni] = useState(false);
  const [chiuso, setChiuso] = useState(false);
  useEffect(() => { leggiPreferenza('aperto_sala_familywall').then((v) => setChiuso(v === '0')).catch(() => {}); }, []);
  const cambiaChiuso = () => setChiuso((v) => { salvaPreferenza('aperto_sala_familywall', v ? '1' : '0').catch(() => {}); return !v; });

  const carica = useCallback(async () => {
    const [r, st] = [await prenotazioniEsterne(oggiLocale()), await statoFamilyWall()];
    setRighe(r.map(conScheda)); setStato(st);
  }, []);
  useEffect(() => {
    let vivo = true;
    carica().catch(() => {});
    aggiornaSeServe().then((e) => {
      if (!vivo || !e) return;
      carica().catch(() => {});
      if (e.nuove || e.cambiate || e.sparite) mostra(esitoAggiornamento(e));
    }).catch(() => {});
    return () => { vivo = false; };
  }, [versione, carica, mostra]);

  const daConfermare = righe.filter((r) => r.stato === 'nuova');
  const delGiorno = daConfermare.filter((r) => r.data === data);
  const prenotazioni = delGiorno.filter((r) => r.scheda.prenotazione);
  const altriEventi = delGiorno.filter((r) => !r.scheda.prenotazione);
  const segnalate = righe.filter((r) => r.stato === 'confermata' && (r.cambiata || r.sparita));
  const rigaAperta = aperta && righe.find((r) => r.uid === aperta);
  // dal calendario del Menù: la prenotazione toccata si apre già pronta per la conferma
  useEffect(() => {
    if (!apriUid || !righe.some((r) => r.uid === apriUid && r.stato === 'nuova')) return;
    setAperta(apriUid);
    if (suApertoUid) suApertoUid();
  }, [apriUid, righe, suApertoUid]);
  // quante prenotazioni da confermare e quante persone per questo servizio: la Sala le somma al totale del giorno (vista Elenco)
  const delServizio = prenotazioni.filter((r) => r.scheda.servizio === servizio);
  const personeDaConfermare = delServizio.reduce((n, r) => n + (aNumero(r.scheda.persone) || 0), 0);
  useEffect(() => {
    if (suConteggio) suConteggio({ prenotazioni: delServizio.length, persone: personeDaConfermare });
  }, [suConteggio, delServizio.length, personeDaConfermare]);

  if (!stato) return null;

  // non collegato e niente in sospeso: solo un invito discreto
  if (!stato.collegato && righe.length === 0) {
    return (
      <>
        <TouchableOpacity onPress={() => setImpostazioni(true)} activeOpacity={0.8} accessibilityRole="button"
          accessibilityLabel="Collega il calendario di Family Wall"
          style={[S.card, { flexDirection: 'row', alignItems: 'center', minHeight: 56 }]}>
          <Icona nome="calendar-import" colore={COLORS.azione} style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>Prenotazioni da Family Wall</Text>
            <Text style={S.muted}>Collega il calendario per vederle qui da confermare</Text>
          </View>
          <Icona nome="chevron-right" colore={COLORS.muted} />
        </TouchableOpacity>
        <ModaleFamilyWall visibile={impostazioni} onChiudi={() => setImpostazioni(false)} onAggiornato={() => carica().catch(() => {})} />
      </>
    );
  }

  const azioneSegnalata = (r, cosa) => async () => {
    if (cosa === 'rifai') await rifaiPrenotazioneEsterna(r.uid);
    else if (cosa === 'togli') await togliPrenotazioneEsterna(r.uid);
    else await lasciaPrenotazioneEsterna(r.uid);
    await carica();
    suCambiato();
  };

  /** Disdetta dal cliente: non si propone più, resta fra le disdette della Sala, con "Annulla" per 10 minuti. */
  const disdici = async (r) => {
    try {
      const e = await disdiciPrenotazioneEsterna(r.uid);
      setAperta(null);
      await carica();
      suCambiato();
      mostra(`${e.nome || 'Prenotazione'} disdetta`, { testo: 'Annulla', onPress: async () => {
        try { await annullaDisdetta(e.id); await carica(); suCambiato(); mostra('Di nuovo da confermare ✓'); } catch (x) { mostra(String((x && x.message) || x)); }
      } });
    } catch (x) {
      mostra(String((x && x.message) || x));
    }
  };

  const daFare = prenotazioni.length + segnalate.length;
  return (
    <View style={[S.card, daFare > 0 && { borderWidth: 1.5, borderColor: COLORS.terra }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: chiuso ? 0 : 6 }}>
        {/* toccando il titolo il riquadro si riduce a una riga (resta così su questo telefono) */}
        <TouchableOpacity onPress={cambiaChiuso} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ expanded: !chiuso }}
          accessibilityLabel={`Da Family Wall${daFare ? `, ${daFare} da guardare` : ''}. ${chiuso ? 'Apri' : 'Riduci'}`}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 48 }}>
        <Icona nome="calendar-import" colore={COLORS.azione} style={{ marginRight: 8 }} />
        <View style={{ flex: 1 }}>
          <Text style={[S.h2, { marginBottom: 0 }]}>Da Family Wall{chiuso && daFare ? ` · ${[prenotazioni.length ? `${prenotazioni.length} da confermare` : null,
            segnalate.length ? plurale(segnalate.length, 'cambiata', 'cambiate') : null].filter(Boolean).join(', ')}` : ''}</Text>
          <Text style={{ fontSize: 13, color: stato.errore ? COLORS.warning : COLORS.muted }} numberOfLines={2}>
            {stato.errore ? stato.errore
              : stato.ultimo ? `Aggiornato ${stato.ultimo.slice(0, 10) === oggiLocale() ? 'oggi' : fmtData(stato.ultimo)} alle ${oraDi(stato.ultimo)}`
                : stato.collegato ? 'Non ancora aggiornato' : 'Calendario scollegato'}
          </Text>
        </View>
        <Icona nome={chiuso ? 'chevron-down' : 'chevron-up'} colore={COLORS.muted} style={{ marginHorizontal: 6 }} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setImpostazioni(true)} accessibilityRole="button" accessibilityLabel="Collegamento con Family Wall"
          style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.contenitore }}>
          <Icona nome="cog-outline" colore={COLORS.text} />
        </TouchableOpacity>
      </View>

      {!chiuso && (<>
      {segnalate.map((r) => (
        <View key={r.uid} style={{ backgroundColor: COLORS.warningSoft, borderRadius: 14, padding: 12, marginTop: 8 }}>
          <Text style={{ color: COLORS.warning, fontWeight: '700', fontSize: 15 }}>
            {r.sparita ? 'Sparita da Family Wall' : 'Cambiata in Family Wall'} · a tavola {fmtData(r.posto_data)}, {String(r.posto_servizio).toLowerCase()}
          </Text>
          <Text style={{ color: COLORS.text, fontSize: 15, marginTop: 2 }}>{r.sparita ? r.titolo : `Ora: ${r.testo.replace(/\n/g, ' · ')}`}</Text>
          {!r.sparita && r.data !== r.posto_data && <Text style={{ color: COLORS.warning, fontSize: 14 }}>Il giorno è cambiato: ora è {fmtData(r.data)}.</Text>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {(r.sparita
              ? [['Togli la tavolata', 'togli', COLORS.danger], ['Lasciala', 'lascia', COLORS.azione]]
              : [['Rifai la scheda', 'rifai', COLORS.azione], ['Lascia com\'è', 'lascia', COLORS.azione]]
            ).map(([testo, cosa, colore]) => (
              <TouchableOpacity key={cosa} onPress={() => azioneSegnalata(r, cosa)().catch((e) => mostra(String((e && e.message) || e)))}
                accessibilityRole="button" accessibilityLabel={`${r.titolo}: ${testo}`}
                style={{ minHeight: 48, borderRadius: 24, borderWidth: 1.5, borderColor: colore, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: COLORS.card }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colore }}>{testo}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      {prenotazioni.length === 0 && segnalate.length === 0 && (
        <Text style={[S.muted, { marginTop: 4 }]}>Nessuna prenotazione da confermare per {giornoBreve(data)}.</Text>
      )}
      {prenotazioni.map((r) => {
        const s = r.scheda;
        const dubbi = s.incerti.length > 0 || !s.sala;
        return (
          <View key={r.uid} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 64, borderRadius: 16, borderWidth: 1.5,
            borderColor: dubbi ? COLORS.warning : COLORS.terra, marginTop: 8 }}>
            <TouchableOpacity onPress={() => setAperta(r.uid)} activeOpacity={0.75} accessibilityRole="button"
              accessibilityLabel={`Da confermare: ${s.nome || 'senza nome'}, ${s.persone || '?'} persone. Apri per confermare`}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingLeft: 12, paddingVertical: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.text }} numberOfLines={1}>
                  {s.nome || 'Senza nome'} · {s.min && s.max > s.min ? `${s.min}–${s.max}` : (s.persone || '?')} pers.
                </Text>
                <Text style={{ fontSize: 13, color: COLORS.muted }} numberOfLines={1}>
                  {[s.sala ? nomeSala(s.sala) : 'sala da scegliere', s.servizio !== servizio ? s.servizio.toLowerCase() : null,
                    s.acconto ? 'acconto' : null, s.incerti.length ? 'da controllare' : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.azione }}>Conferma</Text>
              <Icona nome="chevron-right" colore={COLORS.azione} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => disdici(r)} accessibilityRole="button" accessibilityLabel={`Disdici ${s.nome || 'questa prenotazione'}`}
              style={{ minHeight: 48, minWidth: 48, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: COLORS.border }}>
              <Icona nome="account-cancel-outline" size={20} colore={COLORS.danger} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.danger }}>Disdici</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      {altriEventi.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.muted }}>
            Altri eventi del giorno (senza numero di persone)
          </Text>
          {altriEventi.map((r) => (
            <View key={r.uid} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, marginTop: 4 }}>
              <Text style={{ flex: 1, fontSize: 15, color: COLORS.text }} numberOfLines={2}>{r.titolo}</Text>
              <TouchableOpacity onPress={() => setAperta(r.uid)} accessibilityRole="button" accessibilityLabel={`${r.titolo}: è una prenotazione`}
                style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.azione }}>È una prenotazione</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async () => { await scartaPrenotazioneEsterna(r.uid); await carica(); }}
                accessibilityRole="button" accessibilityLabel={`${r.titolo}: nascondi`}
                style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.muted }}>Nascondi</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      </>)}

      {!!rigaAperta && (
        <SchedaConferma riga={rigaAperta} salaVista={salaVista} onChiudi={() => setAperta(null)}
          onDisdici={rigaAperta.scheda.prenotazione ? () => disdici(rigaAperta) : null}
          onConfermata={async (esito) => {
            setAperta(null);
            await carica();
            if (esito) suMessa(esito);
          }} />
      )}
      <ModaleFamilyWall visibile={impostazioni} onChiudi={() => setImpostazioni(false)} onAggiornato={() => carica().catch(() => {})} />
    </View>
  );
}
