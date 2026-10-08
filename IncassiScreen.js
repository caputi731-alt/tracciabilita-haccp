/**
 * Incassi e costi (sezione Gestione): gli incassi scritti giorno per giorno divisi per metodo di pagamento, i costi del mese
 * (merce dalle fatture caricate, personale e altre spese scritti a mano) e il risultato. Calcoli in conti.js.
 * Si vede solo dopo il PIN del titolare (stesso blocco dei costi degli eventi: `costiSbloccati` in pin.js).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, aNumero, numeroPerCampo, oggiLocale, fmtData } from './theme';
import { Icona, Bottone, Campo, CampoData, Chips, VistaModale, Vuoto, conferma, useAvviso, useErrori } from './UI';
import { incassiTra, salvaIncasso, speseTra, salvaSpesa, eliminaSpesa, merceTra } from './database';
import { METODI, CATEGORIE_SPESA, limitiMese, altroMese, nomeMese, totaleIncasso, riepilogoConti, euro } from './conti';
import { pinImpostato, costiSbloccati, sbloccaCosti, bloccaCosti } from './pin';
import { ModalePin } from './RiquadroPin';

const maiuscola = (t) => t.charAt(0).toUpperCase() + t.slice(1);
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

export default function IncassiScreen({ navigation }) {
  const [mese, setMese] = useState(oggiLocale().slice(0, 7));
  const [dati, setDati] = useState(null);
  const [pin, setPin] = useState(null);           // su questo telefono c'è un PIN?
  const [sbloccato, setSbloccato] = useState(costiSbloccati());
  const [chiedi, setChiedi] = useState(false);
  const [incasso, setIncasso] = useState(null);   // { giorno, riga } aperto
  const [spesa, setSpesa] = useState(null);       // { spesa } aperta
  const { avviso, mostra } = useAvviso();

  const carica = useCallback(async () => {
    const [da, a] = limitiMese(mese);
    const [incassi, spese, merce, conPin] = [await incassiTra(da, a), await speseTra(da, a), await merceTra(da, a), await pinImpostato()];
    setDati({ incassi, spese, merce }); setPin(conPin); setSbloccato(costiSbloccati());
  }, [mese]);
  useFocusEffect(useCallback(() => { carica().catch(() => {}); }, [carica]));

  const r = useMemo(() => (dati ? riepilogoConti(dati) : null), [dati]);
  const oggi = oggiLocale();
  const meseDiOggi = mese === oggi.slice(0, 7);
  const giornoNuovo = meseDiOggi ? oggi : limitiMese(mese)[1];

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
          <TouchableOpacity onPress={() => setMese(altroMese(mese, 1))} disabled={meseDiOggi} accessibilityRole="button" accessibilityLabel="Mese successivo"
            style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.contenitore, alignItems: 'center', justifyContent: 'center', opacity: meseDiOggi ? 0.35 : 1 }}>
            <Icona nome="chevron-right" size={26} colore={COLORS.text} />
          </TouchableOpacity>
        </View>

        {/* incassato */}
        <View style={{ backgroundColor: COLORS.eroe, borderRadius: 28, padding: 22, marginBottom: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.suEroeTenue }}>Incassato nel mese, IVA inclusa</Text>
          <Text style={{ fontSize: 34, fontWeight: '800', color: COLORS.suEroe, letterSpacing: -0.8 }}>{euro(r.incassato)}</Text>
          <Text style={{ fontSize: 15, color: COLORS.suEroeTenue }}>
            {r.giorni ? `${r.giorni} ${r.giorni === 1 ? 'giorno' : 'giorni'} con incasso · in media ${euro(r.mediaGiorno)} al giorno` : 'Nessun incasso registrato in questo mese'}
          </Text>
        </View>

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
        <View style={S.card}>
          <Text style={S.h2}>Incassi giorno per giorno</Text>
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
        </View>

        {/* spese */}
        <View style={S.card}>
          <Text style={S.h2}>Personale e altre spese</Text>
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
        </View>

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
      {avviso}
    </View>
  );
}
