/**
 * Incassi e costi (sezione Gestione): gli incassi scritti giorno per giorno divisi per metodo di pagamento, i costi del mese
 * (merce dalle fatture caricate, personale e altre spese scritti a mano) e il risultato. Calcoli in conti.js.
 * Si vede solo dopo il PIN del titolare (stesso blocco dei costi degli eventi: `costiSbloccati` in pin.js).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, aNumero, numeroPerCampo, oggiLocale, fmtData, piuGiorni } from './theme';
import { Icona, Bottone, Campo, CampoData, Chips, VistaModale, Vuoto, conferma, useAvviso, useErrori, Sezione } from './UI';
import {
  incassiTra, salvaIncasso, speseTra, salvaSpesa, eliminaSpesa, merceTra, prenotazioniPerCalendario, prezziStima, salvaPrezziStima, togliPrezziGiorno,
} from './database';
import { METODI, CATEGORIE_SPESA, limitiMese, altroMese, nomeMese, totaleIncasso, riepilogoConti, euro } from './conti';
import { pinImpostato, costiSbloccati, sbloccaCosti, bloccaCosti } from './pin';
import { ModalePin } from './RiquadroPin';
import { PREZZI_BASE, MERCE_BASE, prezziPuliti, mercePulita, stimaMese, merceCalcolata, copertiScritti } from './stima';

const maiuscola = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const percento = (n) => `${String(n).replace('.', ',')}%`;
const MESI_AVANTI = 12; // fin dove si guarda avanti per la stima
const giornoScritto = (iso) => maiuscola(new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }));

function Riga({ titolo, sotto, destra, prima, forte, colore }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: prima ? 0 : 1, borderTopColor: COLORS.border }}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: forte ? '800' : '500', color: COLORS.text }}>{titolo}</Text>
        {!!sotto && <Text style={{ fontSize: 13, color: COLORS.muted }}>{sotto}</Text>}
      </View>
      <Text style={{ fontSize: forte ? 18 : 16, fontWeight: forte ? '800' : '700', color: colore || COLORS.text }}>{destra}</Text>
    </View>
  );
}

/** L'incasso di un giorno: un importo per metodo di pagamento. */
function SchedaIncasso({ giorno, riga, onSalva, onChiudi }) {
  const [data, setData] = useState(giorno);
  const [v, setV] = useState(() => Object.fromEntries(METODI.map((m) => [m.id, riga && riga[m.id] ? numeroPerCampo(riga[m.id]) : ''])));
  const [note, setNote] = useState((riga && riga.note) || '');
  const { errori, segnala, azzera, riepilogo } = useErrori();
  const numeri = Object.fromEntries(METODI.map((m) => [m.id, String(v[m.id]).trim() ? aNumero(v[m.id]) : 0]));
  const totale = METODI.reduce((s, m) => s + (numeri[m.id] || 0), 0);

  const salva = async () => {
    azzera();
    let ok = true;
    METODI.forEach((m) => { if (numeri[m.id] === null || numeri[m.id] < 0) ok = segnala(m.id, `${m.nome}: scrivi l'importo in numeri, per esempio 350,50`); });
    if (!data) ok = segnala('data', 'Scegli il giorno');
    if (!ok) return;
    await onSalva({ giorno: data, ...numeri, note });
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onChiudi}>
      <VistaModale>
        <Text style={S.h1}>{riga ? 'Incasso del giorno' : 'Registra un incasso'}</Text>
        <Text style={[S.muted, { marginBottom: 8 }]}>Scrivi quello che hai incassato, IVA inclusa. Se il giorno ha già un incasso, viene sostituito.</Text>
        <View style={S.card}>
          <CampoData label="Giorno" value={data} onChange={setData} errore={errori.data} facoltativo={false} massimo={oggiLocale()} />
          {METODI.map((m) => (
            <Campo key={m.id} label={`${m.nome} (€)`} value={v[m.id]} errore={errori[m.id]} keyboardType="decimal-pad" placeholder="0"
              onChange={(t) => setV((x) => ({ ...x, [m.id]: t }))} />
          ))}
          <Campo label="Note" value={note} onChange={setNote} placeholder="Per esempio: battesimo Rossi, sala chiusa a cena…" />
          <View style={{ backgroundColor: COLORS.primarySoft, borderRadius: 16, padding: 14, marginTop: 14 }}>
            <Text style={{ fontSize: 14, color: COLORS.primaryDark }}>Totale del giorno</Text>
            <Text style={{ fontSize: 26, fontWeight: '800', color: COLORS.primaryDark }}>{euro(totale)}</Text>
          </View>
          {riepilogo}
          <Bottone testo="Salva" onPress={salva} />
          {!!riga && (
            <Bottone testo="Elimina l'incasso di questo giorno" ghost colore={COLORS.danger}
              onPress={() => conferma('Eliminare l\'incasso?', `L'incasso di ${fmtData(giorno)} (${euro(totaleIncasso(riga))}) verrà tolto.`,
                () => onSalva({ giorno, contanti: 0, pos: 0, altro: 0, note: '' }))} />
          )}
          <Bottone testo="Annulla" ghost onPress={onChiudi} />
        </View>
      </VistaModale>
    </Modal>
  );
}

/** Una spesa scritta a mano: personale o altre spese. */
function SchedaSpesa({ spesa, giorno, onSalva, onElimina, onChiudi }) {
  const [f, setF] = useState({
    giorno: spesa ? spesa.giorno : giorno, categoria: spesa ? spesa.categoria : CATEGORIE_SPESA[0],
    descrizione: spesa ? spesa.descrizione || '' : '', importo: spesa ? numeroPerCampo(spesa.importo) : '',
  });
  const { errori, segnala, azzera, riepilogo } = useErrori();
  const salva = async () => {
    azzera();
    const n = aNumero(f.importo);
    let ok = true;
    if (n === null || n <= 0) ok = segnala('importo', 'Scrivi l\'importo in numeri, per esempio 1200');
    if (!f.giorno) ok = segnala('giorno', 'Scegli la data');
    if (!ok) return;
    await onSalva({ id: spesa ? spesa.id : null, ...f, importo: n });
  };
  return (
    <Modal visible animationType="slide" onRequestClose={onChiudi}>
      <VistaModale>
        <Text style={S.h1}>{spesa ? 'Modifica la spesa' : 'Nuova spesa'}</Text>
        <Text style={[S.muted, { marginBottom: 8 }]}>
          La merce non va scritta qui: arriva da sola dalle fatture caricate. La spesa conta nel mese della data che scegli.
        </Text>
        <View style={S.card}>
          <Chips label="Tipo" opzioni={CATEGORIE_SPESA} valore={f.categoria} onChange={(c) => setF((x) => ({ ...x, categoria: c }))} />
          <Campo label="Importo (€)" value={f.importo} errore={errori.importo} keyboardType="decimal-pad" onChange={(t) => setF((x) => ({ ...x, importo: t }))} />
          <Campo label="Descrizione" value={f.descrizione} onChange={(t) => setF((x) => ({ ...x, descrizione: t }))}
            placeholder={f.categoria === 'Personale' ? 'Per esempio: stipendi di ottobre' : 'Per esempio: bolletta della luce'} />
          <CampoData label="Data" value={f.giorno} errore={errori.giorno} facoltativo={false} onChange={(d) => setF((x) => ({ ...x, giorno: d }))} />
          {riepilogo}
          <Bottone testo="Salva" onPress={salva} />
          {!!spesa && <Bottone testo="Elimina la spesa" ghost colore={COLORS.danger} onPress={onElimina} />}
          <Bottone testo="Annulla" ghost onPress={onChiudi} />
        </View>
      </VistaModale>
    </Modal>
  );
}

/** Tre prezzi a persona (IVA inclusa) in un modulo; restano testo fino al salvataggio. */
function usaPrezzi(iniziali) {
  const [v, setV] = useState(() => Object.fromEntries(Object.keys(PREZZI_BASE).map((k) => [k, numeroPerCampo(iniziali[k])])));
  const numeri = Object.fromEntries(Object.keys(PREZZI_BASE).map((k) => [k, aNumero(v[k])]));
  const campi = (errori) => [['adulto', 'Adulto'], ['bambino', 'Bambino'], ['neonato', 'Neonato']].map(([k, nome]) => (
    <Campo key={k} label={`${nome} (€ a persona)`} value={v[k]} errore={errori[k]} keyboardType="decimal-pad"
      onChange={(t) => setV((x) => ({ ...x, [k]: t }))} />
  ));
  const controlla = (segnala) => {
    let ok = true;
    Object.keys(PREZZI_BASE).forEach((k) => { if (numeri[k] === null || numeri[k] < 0) ok = segnala(k, 'Scrivi il prezzo in numeri, per esempio 50'); });
    return ok;
  };
  return { numeri, campi, controlla };
}

/** Prezzi di sempre e percentuale della merce. */
function SchedaPrezzi({ prezzi, merce, calcolata, onSalva, onChiudi }) {
  const p = usaPrezzi(prezzi);
  const [m, setM] = useState(numeroPerCampo(merce));
  const { errori, segnala, azzera, riepilogo } = useErrori();
  const salva = async () => {
    azzera();
    let ok = p.controlla(segnala);
    const n = aNumero(m);
    if (n === null || n < 0 || n > 100) ok = segnala('merce', 'Scrivi una percentuale da 0 a 100');
    if (!ok) return;
    await onSalva({ giorno: 'base', ...p.numeri, merce: n });
  };
  return (
    <Modal visible animationType="slide" onRequestClose={onChiudi}>
      <VistaModale>
        <Text style={S.h1}>Prezzi della stima</Text>
        <Text style={[S.muted, { marginBottom: 8 }]}>
          Quanto incassi in media a persona, IVA inclusa. Valgono per tutti i giorni, anche per gli eventi; un giorno diverso si cambia toccandolo nell'elenco.
        </Text>
        <View style={S.card}>
          {p.campi(errori)}
          <Campo label="Merce (% dell'incasso senza IVA)" value={m} errore={errori.merce} keyboardType="decimal-pad" onChange={setM} />
          {!!calcolata && (
            <TouchableOpacity onPress={() => setM(numeroPerCampo(calcolata.percentuale))} accessibilityRole="button"
              style={{ minHeight: 48, justifyContent: 'center', marginTop: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.azione }}>
                Usa {percento(calcolata.percentuale)}, calcolata {calcolata.mesi === 1 ? 'sul mese prima' : `sui ${calcolata.mesi} mesi prima`}
              </Text>
            </TouchableOpacity>
          )}
          {riepilogo}
          <Bottone testo="Salva" onPress={salva} />
          <Bottone testo="Annulla" ghost onPress={onChiudi} />
        </View>
      </VistaModale>
    </Modal>
  );
}

/** Un giorno della stima: le prenotazioni contate e i prezzi solo per quel giorno. */
function SchedaGiornoStima({ g, onSalva, onTogli, onChiudi }) {
  const p = usaPrezzi(g.prezzi);
  const { errori, segnala, azzera, riepilogo } = useErrori();
  const salva = async () => { azzera(); if (p.controlla(segnala)) await onSalva({ giorno: g.giorno, ...p.numeri }); };
  return (
    <Modal visible animationType="slide" onRequestClose={onChiudi}>
      <VistaModale>
        <Text style={S.h1}>{giornoScritto(g.giorno)}</Text>
        <Text style={[S.muted, { marginBottom: 8 }]}>
          {g.reale !== null ? `Incassato ${euro(g.reale)}: per questo giorno conta l'incasso vero, non la stima.` : 'Stima dalle prenotazioni del giorno.'}
        </Text>
        <View style={S.card}>
          <Text style={S.h2}>Prenotazioni</Text>
          {g.prenotazioni.length === 0 && <Text style={S.muted}>Nessuna prenotazione con persone.</Text>}
          {g.prenotazioni.map((r, i) => (
            <Riga key={i} prima={i === 0} titolo={`${r.nome || 'Senza nome'}${r.daConfermare ? ' · da confermare' : ''}`}
              sotto={`${r.servizio || ''}${r.sala ? ` · ${r.sala}` : ''} · ${copertiScritti(r)}`} destra={euro(r.valore)}
              colore={r.daConfermare ? COLORS.warning : null} />
          ))}
          <Riga forte titolo="Stima del giorno" destra={euro(g.stima)} sotto="IVA inclusa" />
        </View>
        <View style={S.card}>
          <Text style={S.h2}>Prezzi solo per questo giorno</Text>
          <Text style={[S.muted, { marginBottom: 4 }]}>Per esempio per un evento con un menù diverso.</Text>
          {p.campi(errori)}
          {riepilogo}
          <Bottone testo="Salva per questo giorno" onPress={salva} />
          {g.prezziDelGiorno && <Bottone testo="Torna ai prezzi di sempre" ghost onPress={onTogli} />}
          <Bottone testo="Chiudi" ghost onPress={onChiudi} />
        </View>
      </VistaModale>
    </Modal>
  );
}

export default function IncassiScreen({ navigation }) {
  const [mese, setMese] = useState(oggiLocale().slice(0, 7));
  const [dati, setDati] = useState(null);
  const [pin, setPin] = useState(null);           // su questo telefono c'è un PIN?
  const [sbloccato, setSbloccato] = useState(costiSbloccati());
  const [chiedi, setChiedi] = useState(false);
  const [incasso, setIncasso] = useState(null);   // { giorno, riga } aperto
  const [spesa, setSpesa] = useState(null);       // { spesa } aperta
  const [schedaPrezzi, setSchedaPrezzi] = useState(false);
  const [giornoStima, setGiornoStima] = useState(null); // giorno ISO aperto nella stima
  const { avviso, mostra } = useAvviso();

  const carica = useCallback(async () => {
    const [da, a] = limitiMese(mese);
    const [incassi, spese, merce, conPin] = [await incassiTra(da, a), await speseTra(da, a), await merceTra(da, a), await pinImpostato()];
    const prenotazioni = await prenotazioniPerCalendario(da, a);
    const prezzi = await prezziStima();
    // la merce dei tre mesi prima, per proporre una percentuale calcolata
    const mesiPrima = [];
    for (let n = 1; n <= 3; n++) {
      const [d1, d2] = limitiMese(altroMese(mese, -n));
      const [inc, mer] = [await incassiTra(d1, d2), await merceTra(d1, d2)];
      mesiPrima.push({ incassato: inc.reduce((s2, r) => s2 + totaleIncasso(r), 0), merce: mer.valore });
    }
    setDati({ incassi, spese, merce, prenotazioni, prezzi, calcolata: merceCalcolata(mesiPrima) }); setPin(conPin); setSbloccato(costiSbloccati());
  }, [mese]);
  useFocusEffect(useCallback(() => { carica().catch(() => {}); }, [carica]));

  const r = useMemo(() => (dati ? riepilogoConti(dati) : null), [dati]);
  const st = useMemo(() => {
    if (!dati) return null;
    const [da, a] = limitiMese(mese);
    const giorni = [];
    for (let g = da; g <= a; g = piuGiorni(g, 1)) giorni.push(g);
    return stimaMese({
      giorni, prenotazioni: dati.prenotazioni, incassi: dati.incassi,
      prezzi: { base: dati.prezzi.base, giorni: dati.prezzi.giorni }, merce: dati.prezzi.merce ?? MERCE_BASE,
    });
  }, [dati, mese]);
  const oggi = oggiLocale();
  const meseDiOggi = mese === oggi.slice(0, 7);
  const futuro = mese > oggi.slice(0, 7);
  const ultimoMese = mese >= altroMese(oggi.slice(0, 7), MESI_AVANTI);
  const giornoNuovo = meseDiOggi || futuro ? oggi : limitiMese(mese)[1];

  if (pin === null || !dati) return <View style={S.screen} />;

  // senza PIN chiunque prenda il telefono vedrebbe gli incassi: prima si imposta il PIN
  if (!pin) {
    return (
      <View style={[S.screen, { justifyContent: 'center', padding: 16 }]}>
        <Vuoto icona="lock-outline" titolo="Serve il PIN del titolare"
          testo="Incassi e costi si vedono solo con il PIN. Impostalo in Documenti e dati → Backup: lo stesso PIN protegge anche i backup."
          azione="Imposta il PIN" onAzione={() => navigation.navigate('Documenti', { scheda: 'Backup e dati' })} />
      </View>
    );
  }
  if (!sbloccato) {
    return (
      <View style={[S.screen, { justifyContent: 'center', padding: 16 }]}>
        <Vuoto icona="lock-outline" titolo="Incassi e costi" testo="Si aprono con il PIN del titolare e restano visibili per 10 minuti."
          azione="Scrivi il PIN" onAzione={() => setChiedi(true)} />
        <ModalePin visibile={chiedi} titolo="PIN del titolare" testo="Incassi e costi restano visibili per 10 minuti, poi il PIN va rimesso."
          pulsante="Apri" onConferma={async (codice) => { await sbloccaCosti(codice); setChiedi(false); setSbloccato(true); }} onChiudi={() => setChiedi(false)} />
      </View>
    );
  }

  const positivo = r.risultato >= 0;
  return (
    <View style={S.screen}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 96 }}>
        {/* mese */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <TouchableOpacity onPress={() => setMese(altroMese(mese, -1))} accessibilityRole="button" accessibilityLabel="Mese precedente"
            style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.contenitore, alignItems: 'center', justifyContent: 'center' }}>
            <Icona nome="chevron-left" size={26} colore={COLORS.text} />
          </TouchableOpacity>
          <Text accessibilityRole="header" style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '700', color: COLORS.text }}>{maiuscola(nomeMese(mese))}</Text>
          <TouchableOpacity onPress={() => setMese(altroMese(mese, 1))} disabled={ultimoMese} accessibilityRole="button" accessibilityLabel="Mese successivo"
            style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.contenitore, alignItems: 'center', justifyContent: 'center', opacity: ultimoMese ? 0.35 : 1 }}>
            <Icona nome="chevron-right" size={26} colore={COLORS.text} />
          </TouchableOpacity>
        </View>

        {/* incassato */}
        <View style={{ backgroundColor: COLORS.eroe, borderRadius: 28, padding: 22, marginBottom: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.suEroeTenue }}>Incassato nel mese, IVA inclusa</Text>
          <Text style={{ fontSize: 34, fontWeight: '800', color: COLORS.suEroe, letterSpacing: -0.8 }}>{euro(r.incassato)}</Text>
          <Text style={{ fontSize: 15, color: COLORS.suEroeTenue }}>
            {r.giorni ? `${r.giorni} ${r.giorni === 1 ? 'giorno' : 'giorni'} con incasso · in media ${euro(r.mediaGiorno)} al giorno`
              : futuro ? 'Mese che deve ancora venire: qui sotto la stima dalle prenotazioni' : 'Nessun incasso registrato in questo mese'}
          </Text>
        </View>

        {/* stima dalle prenotazioni */}
        <View style={[S.card, { borderWidth: 1.5, borderColor: COLORS.terra, borderStyle: 'dashed' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[S.h2, { flex: 1 }]}>Stima del mese</Text>
            <View style={{ backgroundColor: COLORS.terraSoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.terraScuro }}>STIMA</Text>
            </View>
          </View>
          <Text style={[S.muted, { marginBottom: 4 }]}>
            {st.coperti.persone
              ? `${st.coperti.persone} coperti prenotati${st.daConfermare.persone ? `, di cui ${st.daConfermare.persone} da confermare` : ''} · ${copertiScritti(st.coperti)}`
              : 'Nessuna prenotazione con persone in questo mese.'}
          </Text>
          <Riga prima titolo="Incasso previsto" destra={euro(st.lordo)}
            sotto={[st.giorniReali ? `${euro(st.reale)} già incassati` : null, st.stimato ? `${euro(st.stimato)} stimati dalle prenotazioni` : null,
              st.lordoDaConfermare ? `di cui ${euro(st.lordoDaConfermare)} da confermare` : null].filter(Boolean).join(' · ') || 'IVA inclusa'} />
          <Riga titolo="Senza IVA" destra={euro(st.netto)} sotto={`Tolta l'IVA al ${st.iva}%`} />
          <Riga titolo={`Merce al ${percento(st.merce)}`} destra={`− ${euro(st.costoMerce)}`}
            sotto={dati.calcolata ? `Nei mesi prima è stata il ${percento(dati.calcolata.percentuale)}` : 'Percentuale scelta da te'} />
          <Riga forte titolo="Margine stimato" destra={euro(st.margine)} colore={st.margine >= 0 ? COLORS.ok : COLORS.danger}
            sotto="Prima di personale e altre spese" />
          <Text style={[S.muted, { marginTop: 8 }]}>
            Prezzi a persona: adulto {euro(st.prezzi.adulto)}, bambino {euro(st.prezzi.bambino)}, neonato {euro(st.prezzi.neonato)}. Nei giorni con un incasso registrato conta l'incasso vero.
          </Text>
          <Bottone testo="Cambia prezzi e merce" icona="pencil-outline" ghost onPress={() => setSchedaPrezzi(true)} />
        </View>

        <Sezione titolo="Stima giorno per giorno" icona="calendar-clock-outline" memoria="incassi_stima"
          riassunto={st.giorni.length ? `${st.giorni.length} ${st.giorni.length === 1 ? 'giorno' : 'giorni'} con prenotazioni o incassi` : 'Niente in questo mese'}>
          {st.giorni.length === 0 && <Text style={S.muted}>Nessuna prenotazione o incasso in questo mese.</Text>}
          {st.giorni.map((g, i) => (
            <TouchableOpacity key={g.giorno} onPress={() => setGiornoStima(g.giorno)} activeOpacity={0.7} accessibilityRole="button"
              accessibilityLabel={`${giornoScritto(g.giorno)}, ${euro(g.conta)}. Apri`}
              style={{ flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{giornoScritto(g.giorno)}</Text>
                <Text numberOfLines={2} style={{ fontSize: 13, color: COLORS.muted }}>
                  {[g.coperti.persone ? `${g.coperti.persone} coperti` : null,
                    g.daConfermare.persone ? `${g.daConfermare.persone} da confermare` : null,
                    g.reale !== null ? 'incasso vero' : 'stima',
                    g.prezziDelGiorno ? 'prezzi del giorno' : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: g.reale !== null ? COLORS.text : COLORS.terra }}>{euro(g.conta)}</Text>
              <Icona nome="chevron-right" colore={COLORS.muted} />
            </TouchableOpacity>
          ))}
        </Sezione>

        <View style={S.card}>
          <Text style={S.h2}>Come è stato pagato</Text>
          {METODI.map((m, i) => (
            <Riga key={m.id} prima={i === 0} titolo={m.nome} destra={euro(r.perMetodo[m.id])}
              sotto={r.incassato > 0 ? `${Math.round(r.perMetodo[m.id] / r.incassato * 100)}% dell'incassato` : null} />
          ))}
        </View>

        {/* conto del mese */}
        <View style={[S.card, { borderWidth: 1.5, borderColor: positivo ? COLORS.ok : COLORS.danger }]}>
          <Text style={S.h2}>Conto del mese</Text>
          <Riga prima titolo="Incassi senza IVA" sotto={`Tolta l'IVA al ${r.iva}%: ${euro(r.ivaCompresa)}`} destra={euro(r.netto)} />
          <Riga titolo="Merce" destra={`− ${euro(r.merce)}`}
            sotto={`${r.carichi} ${r.carichi === 1 ? 'carico' : 'carichi'} nel mese, IVA esclusa${r.incidenzaMerce !== null ? ` · ${String(r.incidenzaMerce).replace('.', ',')}% degli incassi` : ''}`} />
          <Riga titolo="Personale" destra={`− ${euro(r.personale)}`} />
          <Riga titolo="Altre spese" destra={`− ${euro(r.altreSpese)}`} />
          <Riga forte titolo={positivo ? 'Resta' : 'Mancano'} destra={euro(r.risultato)} colore={positivo ? COLORS.ok : COLORS.danger}
            sotto="Incassi senza IVA meno i costi qui sopra" />
          {r.senzaPrezzo > 0 && (
            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.warning, marginTop: 8 }}>
              {r.senzaPrezzo} {r.senzaPrezzo === 1 ? 'carico del mese è senza prezzo e non è contato' : 'carichi del mese sono senza prezzo e non sono contati'} nella merce.
            </Text>
          )}
          <Text style={[S.muted, { marginTop: 8 }]}>
            La merce è quella caricata nel mese, non quella consumata. Personale e altre spese contano come li hai scritti.
          </Text>
        </View>

        {/* giorni */}
        <Sezione titolo="Incassi giorno per giorno" icona="calendar-text-outline" memoria="incassi_giorni" apertaDiPartenza
          riassunto={dati.incassi.length ? `${dati.incassi.length} giorni registrati` : 'Ancora niente in questo mese'}>
          {dati.incassi.length === 0 && <Text style={S.muted}>Ancora niente in questo mese.</Text>}
          {dati.incassi.map((g, i) => (
            <TouchableOpacity key={g.giorno} onPress={() => setIncasso({ giorno: g.giorno, riga: g })} activeOpacity={0.7} accessibilityRole="button"
              accessibilityLabel={`${giornoScritto(g.giorno)}, ${euro(totaleIncasso(g))}. Modifica`}
              style={{ flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{giornoScritto(g.giorno)}</Text>
                <Text numberOfLines={1} style={{ fontSize: 13, color: COLORS.muted }}>
                  {METODI.filter((m) => g[m.id] > 0).map((m) => `${m.nome.split(' ')[0]} ${euro(g[m.id])}`).join(' · ')}{g.note ? ` · ${g.note}` : ''}
                </Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{euro(totaleIncasso(g))}</Text>
              <Icona nome="chevron-right" colore={COLORS.muted} />
            </TouchableOpacity>
          ))}
        </Sezione>

        {/* spese */}
        <Sezione titolo="Personale e altre spese" icona="account-cash-outline" memoria="incassi_spese" apertaDiPartenza
          riassunto={dati.spese.length ? `${dati.spese.length} spese scritte` : 'Nessuna spesa in questo mese'}>
          {dati.spese.length === 0 && <Text style={S.muted}>Nessuna spesa scritta per questo mese.</Text>}
          {dati.spese.map((s, i) => (
            <TouchableOpacity key={s.id} onPress={() => setSpesa({ spesa: s })} activeOpacity={0.7} accessibilityRole="button"
              accessibilityLabel={`${s.categoria}, ${s.descrizione || ''}, ${euro(s.importo)}. Modifica`}
              style={{ flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.border }}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{s.descrizione || s.categoria}</Text>
                <Text style={{ fontSize: 13, color: COLORS.muted }}>{s.categoria} · {fmtData(s.giorno)}</Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{euro(s.importo)}</Text>
              <Icona nome="chevron-right" colore={COLORS.muted} />
            </TouchableOpacity>
          ))}
          <Bottone testo="Aggiungi una spesa" icona="plus" ghost onPress={() => setSpesa({ spesa: null })} />
        </Sezione>

        <Bottone testo="Chiudi con il PIN" icona="lock-outline" ghost onPress={() => { bloccaCosti(); setSbloccato(false); }} />
      </ScrollView>

      <TouchableOpacity onPress={() => setIncasso({ giorno: giornoNuovo, riga: dati.incassi.find((g) => g.giorno === giornoNuovo) || null })}
        activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Registra un incasso"
        style={{
          position: 'absolute', right: 16, bottom: 16, height: 56, borderRadius: 18, paddingLeft: 18, paddingRight: 22,
          backgroundColor: COLORS.terra, flexDirection: 'row', alignItems: 'center', elevation: 4,
        }}>
        <Icona nome="plus" size={24} colore={COLORS.suTerra} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.suTerra, marginLeft: 8 }}>Incasso</Text>
      </TouchableOpacity>

      {!!incasso && (
        <SchedaIncasso giorno={incasso.giorno} riga={incasso.riga} onChiudi={() => setIncasso(null)}
          onSalva={async (x) => { await salvaIncasso(x); setIncasso(null); await carica(); mostra('Salvato ✓'); }} />
      )}
      {!!spesa && (
        <SchedaSpesa spesa={spesa.spesa} giorno={giornoNuovo} onChiudi={() => setSpesa(null)}
          onSalva={async (x) => { await salvaSpesa(x); setSpesa(null); await carica(); mostra('Salvato ✓'); }}
          onElimina={() => conferma('Eliminare la spesa?', `${spesa.spesa.descrizione || spesa.spesa.categoria}: ${euro(spesa.spesa.importo)}`,
            async () => { await eliminaSpesa(spesa.spesa.id); setSpesa(null); await carica(); })} />
      )}
      {schedaPrezzi && (
        <SchedaPrezzi prezzi={prezziPuliti(dati.prezzi.base)} merce={mercePulita(dati.prezzi.merce ?? MERCE_BASE)} calcolata={dati.calcolata}
          onChiudi={() => setSchedaPrezzi(false)}
          onSalva={async (x) => { await salvaPrezziStima(x); setSchedaPrezzi(false); await carica(); mostra('Salvato ✓'); }} />
      )}
      {!!giornoStima && st.giorni.find((g) => g.giorno === giornoStima) && (
        <SchedaGiornoStima g={st.giorni.find((g) => g.giorno === giornoStima)} onChiudi={() => setGiornoStima(null)}
          onSalva={async (x) => { await salvaPrezziStima(x); setGiornoStima(null); await carica(); mostra('Salvato ✓'); }}
          onTogli={async () => { await togliPrezziGiorno(giornoStima); setGiornoStima(null); await carica(); mostra('Prezzi di sempre ✓'); }} />
      )}
      {avviso}
    </View>
  );
}
