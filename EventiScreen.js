/**
 * Eventi del Menù visti dalla cucina: per ogni evento il fabbisogno (ingredienti che servono, giacenza, lista d'ordine
 * per fornitore), le produzioni già compilate, la scheda degli allergeni e, dopo il PIN del titolare, il costo delle materie prime con il margine. I calcoli sono in evento.js.
 * Senza parametri mostra l'elenco; con { evento: id } il dettaglio di quell'evento.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Share } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtData, oggiLocale, piuGiorni, ALLERGENI } from './theme';
import { Bottone, Segmenti, Vuoto, Icona, Caricamento, useAvviso } from './UI';
import {
  menuLeggi, datiPerEventi, ricettePerMenu, getImpostazioni, lottiUtilizzabili, produzioniEvento, registraProduzione, annullaProduzione,
  leggiAllergeni,
} from './database';
import { eventiMenu } from './menuPonte';
import { fabbisogno, costi, testoOrdine, allergeniEvento, pianoProduzioni } from './evento';
import { stampa, htmlSchedaAllergeniEvento } from './report';
import { condividiPdf } from './condividi';
import { pinImpostato, costiSbloccati, sbloccaCosti, bloccaCosti } from './pin';
import { ModalePin } from './RiquadroPin';

const euro = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`;
const quantita = (n, unita) => `${String(Math.round(Number(n) * 1000) / 1000).replace('.', ',')} ${unita || ''}`.trim();
const persone = (e) => [e.ospiti ? `${e.ospiti} adulti` : '', e.bambini ? `${e.bambini} bambini` : ''].filter(Boolean).join(' e ') || 'ospiti non indicati';
const STATI = { bozza: 'Bozza', inviata: 'Inviata', confermata: 'Confermata', rifiutata: 'Rifiutata' };

function Riga({ titolo, sotto, destra, coloreDestra, prima }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', paddingVertical: 10, minHeight: 48,
      borderTopWidth: prima ? 0 : 1, borderTopColor: COLORS.border,
    }}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{titolo}</Text>
        {!!sotto && <Text style={{ fontSize: 14, color: COLORS.muted, marginTop: 1 }}>{sotto}</Text>}
      </View>
      {!!destra && <Text style={{ fontSize: 16, fontWeight: '700', color: coloreDestra || COLORS.text }}>{destra}</Text>}
    </View>
  );
}

/** Portate che non entrano nei conti, con il motivo e come rimediare. */
function Mancanti({ portate }) {
  const conProblemi = portate.filter((p) => p.problemi.length > 0);
  if (!conProblemi.length) return null;
  return (
    <View style={[S.card, { borderWidth: 1.5, borderColor: COLORS.warning }]}>
      <Text style={[S.h2, { color: COLORS.warning }]}>
        {conProblemi.length === 1 ? 'Una portata non è nel conto' : `${conProblemi.length} portate non sono nel conto`}
      </Text>
      {conProblemi.map((p, i) => (
        <Riga key={`${p.nome}-${i}`} prima={i === 0} titolo={p.nome} sotto={p.problemi.join(' · ')} />
      ))}
      <Text style={[S.muted, { marginTop: 8 }]}>
        Collega la portata a una ricetta dall'archivio portate del Menù, poi completa ingredienti, quantità e porzioni
        in Anagrafiche → Ricette.
      </Text>
    </View>
  );
}

function Fabbisogno({ evento, dati }) {
  const fab = fabbisogno(evento, dati.ricette, dati.prodotti);
  const basta = fab.righe.filter((r) => r.manca === 0);
  const condividi = () => Share.share({ message: testoOrdine(evento, fab) });
  return (
    <>
      {evento.ospiti + evento.bambini === 0 && (
        <View style={[S.card, { borderWidth: 1.5, borderColor: COLORS.warning }]}>
          <Text style={{ fontSize: 15, color: COLORS.warning, fontWeight: '700' }}>
            Nel menù non è indicato il numero di ospiti: senza, il fabbisogno non si può calcolare.
          </Text>
        </View>
      )}
      <Mancanti portate={fab.portate} />
      {fab.daOrdinare.map((g) => (
        <View key={g.fornitore} style={[S.card, { borderWidth: 1.5, borderColor: COLORS.danger }]}>
          <Text style={S.h2}>Da ordinare · {g.fornitore}</Text>
          {g.righe.map((r, i) => (
            <Riga key={r.prodottoId} prima={i === 0} titolo={r.nome}
              sotto={`Servono ${quantita(r.serve, r.unita)} · in giacenza ${quantita(r.giacenza, r.unita)}`}
              destra={`manca ${quantita(r.manca, r.unita)}`} coloreDestra={COLORS.danger} />
          ))}
        </View>
      ))}
      {basta.length > 0 && (
        <View style={[S.card, { borderWidth: 1.5, borderColor: COLORS.ok }]}>
          <Text style={S.h2}>La giacenza basta</Text>
          {basta.map((r, i) => (
            <Riga key={r.prodottoId} prima={i === 0} titolo={r.nome}
              sotto={`Servono ${quantita(r.serve, r.unita)} · in giacenza ${quantita(r.giacenza, r.unita)}`}
              destra="basta" coloreDestra={COLORS.ok} />
          ))}
        </View>
      )}
      {fab.righe.length === 0 && !fab.incompleto && (
        <Vuoto icona="silverware-fork-knife" titolo="Nessuna portata nel menù" testo="Aggiungi le portate dal Menù: qui comparirà cosa serve." />
      )}
      {fab.righe.length > 0 && <Bottone testo="Condividi la lista d'ordine" icona="share-variant-outline" onPress={condividi} />}
      <Text style={[S.muted, { marginTop: 12 }]}>
        Ogni ospite è contato per tutte le portate{evento.bambini > 0 ? '; le portate del menù bambini valgono per i bambini, e se il menù bambini non c\'è i bambini contano come adulti' : ''}.
        La giacenza è quella di oggi, senza i lotti scaduti, e non tiene conto di altri eventi in calendario.
      </Text>
    </>
  );
}

/** Allergeni portata per portata, con la scheda da stampare o inviare. */
function Allergeni({ evento, dati }) {
  const righe = allergeniEvento(evento, dati.ricetteMenu);
  const dubbi = righe.filter((r) => r.stato !== 'ok');
  const html = async () => htmlSchedaAllergeniEvento(evento, righe, await getImpostazioni());
  return (
    <>
      {dubbi.length > 0 && (
        <View style={[S.card, { borderWidth: 1.5, borderColor: COLORS.warning }]}>
          <Text style={[S.h2, { color: COLORS.warning }]}>
            {dubbi.length === 1 ? 'Una portata da completare' : `${dubbi.length} portate da completare`}
          </Text>
          {dubbi.map((r, i) => <Riga key={`${r.nome}-${i}`} prima={i === 0} titolo={r.nome} sotto={r.nota} />)}
          <Text style={[S.muted, { marginTop: 8 }]}>
            Finché non sono a posto, sulla scheda queste portate risultano "da completare", non senza allergeni.
          </Text>
        </View>
      )}
      <View style={S.card}>
        <Text style={S.h2}>Allergeni delle portate</Text>
        {righe.length === 0 && <Text style={S.muted}>Nessuna portata nel menù.</Text>}
        {righe.map((r, i) => (
          <Riga key={`${r.nome}-${i}`} prima={i === 0} titolo={r.bambini ? `${r.nome} (bambini)` : r.nome}
            sotto={r.stato === 'manca' ? 'Non indicati'
              : `${r.numeri.length ? r.numeri.map((n) => ALLERGENI[n - 1]).join(', ') : 'Nessun allergene'} · ${r.fonte === 'ricetta' ? 'dalla ricetta' : 'indicati a mano'}`}
            destra={r.stato === 'ok' ? null : r.stato === 'manca' ? 'manca' : 'da verificare'} coloreDestra={COLORS.warning} />
        ))}
      </View>
      {righe.length > 0 && (
        <>
          <Bottone testo="Condividi la scheda allergeni (PDF)" icona="share-variant-outline"
            onPress={async () => condividiPdf(await html(), `Allergeni ${evento.titolo} ${evento.data}`)} />
          <Bottone testo="Stampa" ghost icona="printer-outline" onPress={async () => stampa(await html())} />
        </>
      )}
      <Text style={[S.muted, { marginTop: 12 }]}>
        Gli allergeni vengono dalla ricetta quando la portata è collegata, altrimenti sono quelli indicati a mano nel Menù.
      </Text>
    </>
  );
}

/** Codice del lotto di produzione: P + giorno + ora, come nelle produzioni fatte a mano. */
const lottoProduzione = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `P${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/**
 * Produzioni dell'evento: una per portata con ricetta completa, già compilata con i lotti da usare.
 * Si registra quando si prepara davvero la portata (anche nei giorni prima): la data è quella della registrazione.
 */
function Produzioni({ evento, dati, lotti, fatte, onCambio, mostra, navigation }) {
  const piano = pianoProduzioni(evento, dati.ricette, dati.prodotti, lotti, fatte);
  const pronte = piano.filter((p) => p.stato === 'pronta');
  const descrizione = `${evento.titolo}${evento.cliente ? ` ${evento.cliente}` : ''} del ${fmtData(evento.data)}`;
  const registra = async (voci) => {
    const ids = [];
    try {
      for (const p of voci) {
        ids.push(await registraProduzione({
          ricetta_id: p.ricettaId, nome: p.nome, quantita_prodotta: p.porzioni,
          lotto_produzione: `${lottoProduzione()}${voci.length > 1 ? `-${ids.length + 1}` : ''}`,
          evento_id: evento.id, evento: descrizione,
        }, p.usi.map((u) => ({ lotto_id: u.lotto_id, quantita: u.quantita }))));
      }
    } finally {
      await onCambio();
    }
    mostra(ids.length > 1 ? `Registrate ${ids.length} produzioni ✓` : `Produzione registrata ✓ ${voci[0].nome}`, {
      testo: 'Annulla',
      onPress: async () => {
        for (const id of ids) await annullaProduzione(id, 'annullata subito dopo la registrazione');
        await onCambio();
        mostra(ids.length > 1 ? 'Produzioni annullate' : 'Produzione annullata');
      },
    });
  };
  const STATO = {
    fatta: ['Prodotta', COLORS.ok], pronta: ['Da produrre', COLORS.text], manca: ['Manca merce', COLORS.danger], fuori: ['Non calcolabile', COLORS.warning],
  };
  return (
    <>
      {piano.length === 0 && <Vuoto icona="pot-steam-outline" titolo="Nessuna portata nel menù" testo="Aggiungi le portate dal Menù: qui compariranno le produzioni da fare." />}
      {pronte.length > 1 && (
        <Bottone testo={`Registra le ${pronte.length} produzioni pronte`} icona="check-all" onPress={() => registra(pronte)} />
      )}
      {pronte.length > 1 && <View style={{ height: 12 }} />}
      {piano.map((p, i) => (
        <View key={`${p.nome}-${i}`} style={[S.card, {
          borderWidth: 1.5, borderColor: p.stato === 'fatta' ? COLORS.ok : p.stato === 'manca' ? COLORS.danger : p.stato === 'fuori' ? COLORS.warning : COLORS.border,
        }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: COLORS.text }}>{p.bambini ? `${p.nome} (bambini)` : p.nome}</Text>
              <Text style={{ fontSize: 14, color: COLORS.muted }}>{p.porzioni} porzioni</Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: STATO[p.stato][1] }}>{STATO[p.stato][0]}</Text>
          </View>
          {p.stato === 'fatta' && (
            <>
              <Text style={[S.muted, { marginTop: 6 }]}>
                Registrata il {fmtData(p.produzione.data_ora)}{p.produzione.lotto_produzione ? ` · lotto ${p.produzione.lotto_produzione}` : ''}. Per annullarla: Altro → Produzioni.
              </Text>
              <Bottone testo="Stampa etichetta" ghost icona="tag-outline" onPress={() => navigation.navigate('Etichette', {
                precompila: { tipo: 'Produzione', nome: p.nome, lotto: p.produzione.lotto_produzione || '', allergeni: leggiAllergeni(p.produzione.allergeni) },
              })} />
            </>
          )}
          {p.stato === 'pronta' && (
            <>
              {p.usi.map((u, n) => (
                <Riga key={`${u.lotto_id}-${n}`} prima={n === 0} titolo={u.prodotto} sotto={u.numero_lotto ? `Lotto ${u.numero_lotto}` : 'Lotto senza numero'}
                  destra={quantita(u.quantita, u.unita)} />
              ))}
              <Bottone testo="Registra produzione" ghost={pronte.length > 1} onPress={() => registra([p])} />
            </>
          )}
          {p.stato === 'manca' && p.mancanti.map((m, n) => (
            <Riga key={`${m.prodotto}-${n}`} prima={n === 0} titolo={m.prodotto} sotto="Giacenza utilizzabile insufficiente"
              destra={`manca ${quantita(m.manca, m.unita)}`} coloreDestra={COLORS.danger} />
          ))}
          {p.stato === 'fuori' && <Text style={[S.muted, { marginTop: 6 }]}>{p.problemi.join(' · ')}</Text>}
        </View>
      ))}
      <Text style={[S.muted, { marginTop: 4 }]}>
        Registra ogni produzione quando prepari davvero la portata, anche nei giorni prima dell'evento: l'app scarica i lotti indicati
        (prima quelli più vicini alla scadenza) e li collega all'evento, così in un richiamo sai dove sono finiti.
        Per usare lotti o quantità diversi, registra la produzione a mano da Altro → Produzioni.
      </Text>
    </>
  );
}

function Costo({ evento, dati, onBlocca }) {
  const c = costi(evento, dati.ricette, dati.prodotti);
  const coperti = c.adulti + c.bambini;
  const netto = (prezzo) => prezzo / (1 + c.iva / 100);
  const coloreIncidenza = c.incidenza === null ? COLORS.text : c.incidenza <= 0.3 ? COLORS.ok : c.incidenza <= 0.4 ? COLORS.warning : COLORS.danger;
  return (
    <>
      <View style={S.card}>
        <Text style={S.h2}>Costo delle materie prime</Text>
        <Riga prima titolo="A persona" sotto={c.bambini > 0 && c.costoBambino !== c.costoAdulto ? `Bambini: ${euro(c.costoBambino)}` : null}
          destra={euro(c.costoAdulto)} />
        <Riga titolo="Per tutto l'evento" sotto={coperti ? persone(evento) : 'Indica gli ospiti nel menù'} destra={euro(c.costoTotale)} />
        {c.incompleto && (
          <Text style={{ fontSize: 14, color: COLORS.warning, fontWeight: '700', marginTop: 6 }}>
            Costo parziale: mancano alcuni dati (vedi sotto). Il costo vero è più alto.
          </Text>
        )}
      </View>

      <View style={S.card}>
        <Text style={S.h2}>Prezzo e margine</Text>
        {c.prezzoAdulto === null ? (
          <Text style={S.muted}>Nel menù non c'è il prezzo a persona: scrivilo nella proposta per vedere il margine.</Text>
        ) : (
          <>
            <Riga prima titolo="Prezzo a persona" sotto={`${euro(netto(c.prezzoAdulto))} senza IVA al ${c.iva}%`} destra={euro(c.prezzoAdulto)} />
            {c.bambini > 0 && (
              <Riga titolo="Prezzo bambini"
                sotto={c.prezzoBambino === null ? 'Non indicato: i bambini non sono contati nel ricavo' : `${euro(netto(c.prezzoBambino))} senza IVA`}
                destra={c.prezzoBambino === null ? '—' : euro(c.prezzoBambino)} />
            )}
            {c.incidenza !== null && (
              <Riga titolo="Incidenza delle materie prime" sotto="Costo diviso ricavo senza IVA"
                destra={`${(c.incidenza * 100).toFixed(1).replace('.', ',')}%`} coloreDestra={coloreIncidenza} />
            )}
            {c.margine !== null && (
              <Riga titolo="Margine sull'evento" sotto={coperti ? `${euro(c.margine / coperti)} a persona · ricavo senza IVA ${euro(c.ricavoNetto)}` : null}
                destra={euro(c.margine)} coloreDestra={c.margine < 0 ? COLORS.danger : COLORS.text} />
            )}
          </>
        )}
      </View>

      <View style={S.card}>
        <Text style={S.h2}>Costo per portata</Text>
        {c.portate.length === 0 && <Text style={S.muted}>Nessuna portata nel menù.</Text>}
        {c.portate.map((p, i) => (
          <Riga key={`${p.nome}-${i}`} prima={i === 0} titolo={p.bambini ? `${p.nome} (bambini)` : p.nome}
            sotto={p.problemi.length ? p.problemi.join(' · ') : 'a porzione'}
            destra={p.problemi.length && p.costo === 0 ? '—' : euro(p.costo)}
            coloreDestra={p.problemi.length ? COLORS.warning : COLORS.text} />
        ))}
      </View>

      <Bottone testo="Blocca i costi" ghost icona="lock-outline" onPress={onBlocca} />
      <Text style={[S.muted, { marginTop: 12 }]}>
        Il costo usa l'ultimo prezzo d'acquisto di ogni prodotto (IVA esclusa) e conta solo le materie prime: personale,
        energia e bevande non scritte nelle ricette non ci sono. Il margine è quindi quello sul cibo, non l'utile dell'evento.
      </Text>
    </>
  );
}

export default function EventiScreen({ navigation, route }) {
  const idEvento = route?.params?.evento || null;
  const [eventi, setEventi] = useState(null);
  const [dati, setDati] = useState(null);
  const [vista, setVista] = useState('Fabbisogno');
  const [periodo, setPeriodo] = useState('Prossimi');
  const [pin, setPin] = useState(null);            // il PIN del titolare è impostato su questo telefono?
  const [sbloccato, setSbloccato] = useState(costiSbloccati());
  const [chiedi, setChiedi] = useState(false);
  const [lotti, setLotti] = useState([]);
  const [fatte, setFatte] = useState([]);
  const { avviso, mostra } = useAvviso();

  const carica = useCallback(async (ancora = () => true) => {
    try {
      const e = eventiMenu(await menuLeggi('state'));
      const d = await datiPerEventi();
      d.ricetteMenu = new Map((await ricettePerMenu()).map((r) => [r.id, r]));
      const p = await pinImpostato();
      const l = idEvento ? await lottiUtilizzabili() : [];
      const f = idEvento ? await produzioniEvento(idEvento) : [];
      if (ancora()) { setEventi(e); setDati(d); setPin(p); setLotti(l); setFatte(f); setSbloccato(costiSbloccati()); }
    } catch (err) { if (ancora()) { setEventi([]); setDati({ ricette: new Map(), prodotti: new Map(), ricetteMenu: new Map() }); } }
  }, [idEvento]);

  useFocusEffect(useCallback(() => {
    let vivo = true;
    carica(() => vivo);
    return () => { vivo = false; };
  }, [carica]));

  React.useEffect(() => {
    if (idEvento) navigation.setOptions({ title: 'Evento' });
  }, [idEvento, navigation]);

  if (!eventi || !dati) return <View style={S.screen}><View style={S.content}><Caricamento /></View></View>;

  // ---------- elenco ----------
  if (!idEvento) {
    const oggi = oggiLocale();
    const elenco = periodo === 'Prossimi'
      ? eventi.filter((e) => e.data >= oggi && e.stato !== 'rifiutata')
      : eventi.filter((e) => e.data < oggi && e.data >= piuGiorni(oggi, -60)).reverse();
    return (
      <ScrollView style={S.screen} contentContainerStyle={S.content}>
        <Text style={S.h1}>Eventi</Text>
        <Text style={[S.muted, { marginBottom: 4 }]}>Cosa serve in cucina per i menù in calendario, e quanto costano.</Text>
        <Segmenti opzioni={['Prossimi', 'Passati']} valore={periodo} onChange={setPeriodo} />
        <View style={{ height: 12 }} />
        {elenco.length === 0 && (
          <Vuoto icona="calendar-blank-outline"
            titolo={periodo === 'Prossimi' ? 'Nessun evento in calendario' : 'Nessun evento negli ultimi 60 giorni'}
            testo="Gli eventi sono i menù con una data, creati nella sezione Menù." />
        )}
        {elenco.map((e) => {
          const collegate = e.portate.filter((p) => p.ricettaId).length;
          return (
            <TouchableOpacity key={e.id} style={[S.card, { flexDirection: 'row', alignItems: 'center' }]} activeOpacity={0.8}
              accessibilityRole="button" accessibilityLabel={`${e.titolo}, ${fmtData(e.data)}`}
              onPress={() => navigation.push('Eventi', { evento: e.id })}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: COLORS.muted }}>{fmtData(e.data)}{e.ora ? ` · ${e.ora}` : ''} · {STATI[e.stato] || e.stato}</Text>
                <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '700', color: COLORS.text }}>
                  {e.titolo}{e.cliente ? ` · ${e.cliente}` : ''}
                </Text>
                <Text style={{ fontSize: 14, color: COLORS.muted }}>
                  {persone(e)} · {e.portate.length === 0 ? 'nessuna portata' : `${collegate} di ${e.portate.length} portate con ricetta`}
                </Text>
              </View>
              <Icona nome="chevron-right" colore={COLORS.muted} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  }

  // ---------- un evento ----------
  const evento = eventi.find((e) => e.id === idEvento);
  if (!evento) {
    return (
      <View style={[S.screen, { justifyContent: 'center' }]}>
        <Vuoto icona="calendar-remove-outline" titolo="Evento non trovato" testo="Il menù è stato eliminato oppure non ha più una data." />
      </View>
    );
  }
  const sblocca = async (codice) => { await sbloccaCosti(codice); setChiedi(false); setSbloccato(true); };

  return (
    <View style={S.screen}>
      <ScrollView style={S.screen} contentContainerStyle={S.content}>
        <Text style={{ fontSize: 13, color: COLORS.muted }}>{fmtData(evento.data)}{evento.ora ? ` · ${evento.ora}` : ''} · {STATI[evento.stato] || evento.stato}</Text>
        <Text style={S.h1}>{evento.titolo}</Text>
        <Text style={[S.muted, { marginBottom: 4 }]}>{[evento.cliente, persone(evento)].filter(Boolean).join(' · ')}</Text>
        <Segmenti opzioni={['Fabbisogno', 'Produci', 'Allergeni', 'Costo']} valore={vista} onChange={setVista} />
        <View style={{ height: 12 }} />

        {vista === 'Fabbisogno' && <Fabbisogno evento={evento} dati={dati} />}

        {vista === 'Allergeni' && <Allergeni evento={evento} dati={dati} />}
        {vista === 'Produci' && <Produzioni evento={evento} dati={dati} lotti={lotti} fatte={fatte} onCambio={() => carica()} mostra={mostra} navigation={navigation} />}

        {vista === 'Costo' && sbloccato && (
          <Costo evento={evento} dati={dati} onBlocca={() => { bloccaCosti(); setSbloccato(false); }} />
        )}
        {vista === 'Costo' && !sbloccato && (
          <View style={[S.card, { alignItems: 'center', paddingVertical: 28 }]}>
            <Icona nome="lock-outline" size={40} colore={COLORS.muted} />
            <Text style={[S.h2, { marginTop: 10, textAlign: 'center' }]}>Costi riservati al titolare</Text>
            {pin ? (
              <>
                <Text style={[S.muted, { textAlign: 'center' }]}>Per vedere costi e margini serve il PIN.</Text>
                <View style={{ alignSelf: 'stretch' }}><Bottone testo="Inserisci il PIN" icona="lock-open-variant-outline" onPress={() => setChiedi(true)} /></View>
              </>
            ) : (
              <>
                <Text style={[S.muted, { textAlign: 'center' }]}>
                  Imposta prima il PIN del titolare (lo stesso che protegge i backup): da quel momento costi e margini si vedono solo con il PIN.
                </Text>
                <View style={{ alignSelf: 'stretch' }}>
                  <Bottone testo="Imposta il PIN" onPress={() => navigation.navigate('Documenti', { scheda: 'Backup e dati' })} />
                </View>
              </>
            )}
          </View>
        )}
      </ScrollView>
      {avviso}
      <ModalePin visibile={chiedi} titolo="PIN del titolare" testo="Costi e margini restano visibili per 10 minuti, poi il PIN va rimesso."
        pulsante="Mostra i costi" onConferma={sblocca} onChiudi={() => setChiedi(false)} />
    </View>
  );
}
