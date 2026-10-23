/**
 * Sezione "Oggi" della suite: la mappa 3D delle due cucine a tutto schermo, con il tag di ogni frigorifero (CucineVista.js);
 * in basso la riga dei controlli di oggi e il pannello dei dettagli (temperature, pulizie, scadenze, cose da sistemare,
 * prossimo menù), più il pulsante "Registra".
 * Se il telefono non riesce a mostrare il 3D resta la schermata senza mappa, con il riquadro grande dei controlli.
 */
import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, TEMA_SCURO, giorniAllaScadenza, oggiLocale, piuGiorni } from './theme';
import { daIsoLocale, spiegaErroreBackup } from './utile';
import { Icona, PulsanteCerca } from './UI';
import {
  lottiInScadenza, temperatureDiOggi, listaPuntiControllo, nonConformitaAperte,
  areeConStato, prodottiDaCompletare, lottiBloccati, leggiPreferenza, salvaPreferenza, menuLeggi, collegamentiCucina, ultimeTemperature,
} from './database';
import { FREDDI, PULSANTI, statiCucine, datiScena } from './cucine';
import SchedaPosto from './SchedaPosto';
import { statoBackup } from './backupAutomatico';
import { prossimoMenu } from './menuPonte';
import { passiGiro, riquadroOggi } from './giro';

const REGISTRA = [
  { titolo: 'Carico merce', rotta: 'CaricoMerce', icona: 'truck-delivery-outline', tono: 'verde' },
  { titolo: 'Scarico merce', rotta: 'Magazzino', icona: 'package-variant-closed', tono: 'verde' },
  { titolo: 'Temperatura', rotta: 'Temperature', icona: 'thermometer' },
  { titolo: 'Pulizia', rotta: 'Sanificazione', icona: 'spray-bottle' },
  { titolo: 'Produzione', rotta: 'Produzioni', icona: 'pot-steam-outline' },
  { titolo: 'Non conformità', rotta: 'NonConformita', icona: 'alert-outline', tono: 'terra' },
];

const STATI_MENU = { bozza: 'bozza', inviata: 'proposta inviata', confermata: 'confermato', rifiutata: 'rifiutato' };
const MESI = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
const maiuscola = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

/** Un problema della vista 3D (modulo mancante, errore nel disegno) resta chiuso qui: la Home passa alla versione senza cucine. */
class RiparoCucine extends React.Component {
  constructor(props) {
    super(props);
    this.state = { rotto: false };
  }

  static getDerivedStateFromError() {
    return { rotto: true };
  }

  componentDidCatch() {
    this.props.suRotto();
  }

  render() {
    return this.state.rotto ? null : this.props.children;
  }
}

/** Il modulo si legge solo quando serve; se manca qualcosa, null. */
function moduloCucine() {
  try {
    return require('./CucineVista').default;
  } catch (e) {
    return null;
  }
}

function Riquadro({ icona, valore, etichetta, tono, onPress }) {
  const fondo = tono === 'ok' ? COLORS.primarySoft : tono === 'errore' ? COLORS.dangerSoft : tono === 'spento' ? COLORS.contenitore : COLORS.terraSoft;
  const tinta = tono === 'ok' ? COLORS.primaryDark : tono === 'errore' ? COLORS.danger : tono === 'spento' ? COLORS.muted : COLORS.terraScuro;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} accessibilityRole="button"
      accessibilityLabel={`${etichetta}: ${valore}`}
      style={{
        flex: 1, backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border,
        padding: 12, minHeight: 124, justifyContent: 'space-between', gap: 10,
      }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: fondo, alignItems: 'center', justifyContent: 'center' }}>
        <Icona nome={icona} size={24} colore={tinta} />
      </View>
      {/* niente rimpicciolimento automatico: su Android riduceva il numero fino a renderlo illeggibile */}
      <View>
        <Text numberOfLines={2} style={{ fontSize: 17, fontWeight: '700', color: COLORS.text, lineHeight: 21 }}>{valore}</Text>
        <Text numberOfLines={1} style={{ fontSize: 13, color: COLORS.muted }}>{etichetta}</Text>
      </View>
    </TouchableOpacity>
  );
}

function RigaAvviso({ grave, titolo, testo, onPress, prima }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button"
      accessibilityLabel={`${titolo}. ${testo}`}
      style={{
        flexDirection: 'row', alignItems: 'center', paddingVertical: 12, minHeight: 60,
        borderTopWidth: prima ? 0 : 1, borderTopColor: COLORS.border,
      }}>
      <Icona nome={grave ? 'alert-circle' : 'alert-circle-outline'} size={24}
        colore={grave ? COLORS.danger : COLORS.terra} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{titolo}</Text>
        <Text style={{ fontSize: 14, color: COLORS.muted, lineHeight: 20 }}>{testo}</Text>
      </View>
      <Icona nome="chevron-right" colore={COLORS.muted} />
    </TouchableOpacity>
  );
}

/**
 * Riquadro "Oggi" (proposta A, fase 3): quante cose mancano, barra di avanzamento, promemoria toccabili (calcolati da
 * riquadroOggi in giro.js, più le cose da sistemare), "Fai il giro" e "+" per registrare altro.
 */
function RiquadroOggi({ dati, avvisi, passi, onPromemoria, onGiro, onRegistra, onImposta, onDettagli, ridotto, onRiduci }) {
  const { titolo, fatti, totali, promemoria, mancanti } = dati;
  const quota = totali > 0 ? Math.min(1, fatti / totali) : 0;
  const tutti = [...promemoria, ...avvisi.map((a) => ({ tipo: 'avviso', testo: a.breve, tono: a.grave ? 'grave' : 'info', vai: a.vai }))];
  const COLORI = {
    fare: [COLORS.terraSoft, COLORS.terraScuro, COLORS.terra],
    grave: [COLORS.dangerSoft, COLORS.danger, COLORS.danger],
    info: [COLORS.card, COLORS.text, COLORS.border],
  };
  const ICONE = { temperature: 'thermometer', pulizie: 'spray-bottle', scadenze: 'clock-outline', avviso: 'alert-circle-outline' };
  return (
    <View accessibilityLabel="Controlli di oggi" style={{
      backgroundColor: COLORS.card, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, padding: 16, gap: 12,
    }}>
      {/* la riga del titolo riduce il riquadro a una riga (titolo e barra) e lo riapre: più spazio alla mappa */}
      <TouchableOpacity onPress={onRiduci} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ expanded: !ridotto }}
        accessibilityLabel={`${titolo}${totali > 0 ? `, ${fatti} di ${totali} fatte` : ''}. ${ridotto ? 'Apri' : 'Riduci'}`}
        style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, marginVertical: -6 }}>
        <Text accessibilityRole="header" style={{ flex: 1, fontSize: 17, fontWeight: '700' }}>{titolo}</Text>
        {totali > 0 && <Text style={{ fontSize: 13, color: COLORS.muted }}>{fatti} di {totali} fatte</Text>}
        <Icona nome={ridotto ? 'chevron-up' : 'chevron-down'} size={22} colore={COLORS.muted} style={{ marginLeft: 4 }} />
      </TouchableOpacity>
      {totali > 0 && (
        <View accessible accessibilityRole="progressbar" accessibilityLabel={`${fatti} controlli fatti su ${totali}`}
          style={{ height: 6, borderRadius: 3, backgroundColor: COLORS.contenitore, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(quota * 100)}%`, height: 6, backgroundColor: COLORS.azione }} />
        </View>
      )}
      {!ridotto && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {tutti.map((p) => {
            const [fondo, testo, bordo] = COLORI[p.tono] || COLORI.info;
            return (
              <TouchableOpacity key={`${p.tipo}-${p.testo}`} onPress={() => (p.vai ? p.vai() : onPromemoria(p))} activeOpacity={0.8}
                accessibilityRole="button" accessibilityLabel={p.testo}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 12,
                  borderWidth: 1, borderColor: bordo, backgroundColor: fondo, maxWidth: '100%',
                }}>
                <Icona nome={ICONE[p.tipo]} size={18} colore={testo} />
                <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: p.tono === 'info' ? '500' : '600', color: testo, flexShrink: 1 }}>
                  {p.testo}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity onPress={onDettagli} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Tutto quello di oggi"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.azione }}>Tutto di oggi</Text>
            <Icona nome="chevron-right" size={18} colore={COLORS.azione} />
          </TouchableOpacity>
        </View>
      )}
      {!ridotto && <View style={{ flexDirection: 'row', gap: 8 }}>
        {totali === 0 ? (
          <TouchableOpacity onPress={onImposta} activeOpacity={0.85} accessibilityRole="button"
            style={{ flex: 1, minHeight: 52, borderRadius: 14, backgroundColor: COLORS.azione, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.suAzione }}>Imposta i controlli</Text>
          </TouchableOpacity>
        ) : passi > 0 ? (
          <TouchableOpacity onPress={onGiro} activeOpacity={0.85} accessibilityRole="button"
            accessibilityLabel={`Fai il giro di controllo, ${passi} ${passi === 1 ? 'passo' : 'passi'}`}
            style={{
              flex: 1, minHeight: 52, borderRadius: 14, backgroundColor: COLORS.azione,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.suAzione }}>
              {mancanti > 0 ? `Fai il giro (${passi} ${passi === 1 ? 'passo' : 'passi'})` : 'Controlla le scadenze'}
            </Text>
            <Icona nome="chevron-right" size={22} colore={COLORS.suAzione} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={onRegistra} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Registra altro"
          style={{
            ...(totali > 0 && passi === 0 ? { flex: 1 } : { width: 52, flexShrink: 0 }), minHeight: 52, borderRadius: 14,
            borderWidth: 1, borderColor: COLORS.bordoCampo, backgroundColor: COLORS.card,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
          <Icona nome="plus" size={24} />
          {totali > 0 && passi === 0 && <Text style={{ fontSize: 16, fontWeight: '600' }}>Registra</Text>}
        </TouchableOpacity>
      </View>}
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  const [scadenze, setScadenze] = useState([]);
  const [tempFatte, setTempFatte] = useState(0);
  const [puntiTot, setPuntiTot] = useState(0);
  const [ncAperte, setNcAperte] = useState(0);
  const [pulizie, setPulizie] = useState({ fatte: 0, totali: 0 });
  const [aree, setAree] = useState([]);
  const [ridotto, setRidotto] = useState(false); // riquadro di oggi ridotto a una riga (resta così su questo telefono)
  React.useEffect(() => { leggiPreferenza('oggi_ridotto').then((v) => setRidotto(v === '1')).catch(() => {}); }, []);
  const riduci = () => setRidotto((v) => { salvaPreferenza('oggi_ridotto', v ? '0' : '1').catch(() => {}); return !v; });
  const [ultimePrima, setUltimePrima] = useState({}); // ultima temperatura di ogni frigorifero prima di oggi
  const [backup, setBackup] = useState(null);
  const [daCompletare, setDaCompletare] = useState(0);
  const [bloccati, setBloccati] = useState(0);
  const [esterno, setEsterno] = useState(undefined); // giorni dall'ultima copia fuori dal telefono (null = mai)
  const [menu, setMenu] = useState(null);
  const [registra, setRegistra] = useState(false);
  const [scena, setScena] = useState('attesa'); // 'attesa' | 'ok' | 'no' (il 3D non parte: Home senza cucine)
  const [cucina, setCucina] = useState({ collegamenti: [], punti: [], temperature: [] });
  const [scelto, setScelto] = useState(null); // frigorifero toccato nella mappa
  const [pannello, setPannello] = useState(false); // dettagli di oggi aperti sopra la mappa

  const carica = useCallback(async () => {
        try {
          setScadenze(await lottiInScadenza(3));
          const t = await temperatureDiOggi();
          const punti = await listaPuntiControllo();
          const attivi = new Set(punti.map((p) => p.id));
          setTempFatte(new Set(t.map((x) => x.punto_controllo_id).filter((id) => attivi.has(id))).size);
          setPuntiTot(punti.length);
          setNcAperte((await nonConformitaAperte()).length);
          // pulizie di ogni frequenza: giornaliere, settimanali e mensili scadute
          const aree = await areeConStato();
          setPulizie({ fatte: aree.filter((a) => !a.daFare).length, totali: aree.length });
          setAree(aree);
          setUltimePrima(await ultimeTemperature(oggiLocale()));
          setCucina({ collegamenti: (await collegamentiCucina()).filter((c) => c.punto_controllo_id), punti, temperature: t });
          setBackup(await statoBackup());
          const ultimaEsterna = await leggiPreferenza('backup_esterno_ultimo');
          setEsterno(ultimaEsterna ? Math.floor((Date.now() - new Date(ultimaEsterna).getTime()) / 86400000) : null);
          setDaCompletare((await prodottiDaCompletare()).length);
          setBloccati((await lottiBloccati()).length);
          setMenu(prossimoMenu(await menuLeggi('state'), oggiLocale()));
        } catch (e) { /* la Home resta utilizzabile anche se una lettura fallisce */ }
  }, []);
  useFocusEffect(useCallback(() => { carica(); }, [carica]));

  // stato di ogni attrezzatura delle cucine e quello che serve alla scena 3D
  const stati = useMemo(() => statiCucine({
    collegamenti: cucina.collegamenti, punti: cucina.punti, temperatureOggi: cucina.temperature,
  }), [cucina]);
  const dati = useMemo(() => datiScena(stati, { scuro: TEMA_SCURO, scelto }), [stati, scelto]);
  const suPosto = useCallback((id) => { if (FREDDI.some((p) => p.id === id)) setScelto(id); }, []);
  // i pulsanti della mappa (Magazzino, Produzione, Pulizie) fanno scegliere fra le loro schermate
  const [gruppo, setGruppo] = useState(null);
  const suPulsante = useCallback((id) => { if (PULSANTI[id]) setGruppo(id); }, []);
  const senzaCucine = useCallback(() => setScena('no'), []);
  const Cucine = scena === 'no' ? null : moduloCucine();
  const conCucine = !!Cucine;
  const oggiScritto = maiuscola(new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }));

  const tempMancanti = Math.max(0, puntiTot - tempFatte);
  const pulizieMancanti = Math.max(0, pulizie.totali - pulizie.fatte);
  const totali = puntiTot + pulizie.totali;
  const scaduti = scadenze.filter((l) => giorniAllaScadenza(l.data_scadenza) < 0).length;
  const backupOk = backup && backup.cartella && backup.giorni !== null && backup.giorni <= 2 && !backup.errore;
  const esternoOk = esterno !== undefined && esterno !== null && esterno <= 7;

  const apri = (rotta, parametri) => { setRegistra(false); setPannello(false); navigation.navigate(rotta, parametri); };

  const cartellaPersa = !!(backup && backup.errore && (spiegaErroreBackup(backup.errore) || {}).cartella);
  const avvisi = [];
  if (bloccati > 0) {
    avvisi.push({ grave: true, breve: `${bloccati} lott${bloccati > 1 ? 'i bloccati' : 'o bloccato'}`,
      titolo: `${bloccati} lott${bloccati > 1 ? 'i bloccati' : 'o bloccato'} (richiamo)`,
      testo: 'Merce da tenere separata finché non è risolto', vai: () => apri('Magazzino') });
  }
  if (ncAperte > 0) {
    avvisi.push({ grave: true, breve: `${ncAperte} non conformità apert${ncAperte > 1 ? 'e' : 'a'}`,
      titolo: `${ncAperte} non conformità apert${ncAperte > 1 ? 'e' : 'a'}`,
      testo: "Da chiudere con un'azione correttiva", vai: () => apri('NonConformita') });
  }
  if (backup && !backupOk) {
    avvisi.push({ grave: !backup.cartella || !!backup.errore,
      breve: !backup.cartella ? 'Backup non attivo' : cartellaPersa ? 'Riscegli la cartella del backup' : backup.errore ? 'Backup non riuscito' : 'Backup vecchio',
      titolo: !backup.cartella ? 'Backup automatico non attivo' : backup.errore ? 'Backup non riuscito' : 'Backup vecchio',
      testo: !backup.cartella ? 'Attivalo: se il telefono si rompe perdi tutti i registri'
        : cartellaPersa ? 'La cartella dei backup non è più accessibile: sceglila di nuovo'
        : backup.errore ? 'Controlla la cartella dei backup'
        : backup.giorni === null ? 'Nessun backup ancora eseguito' : `Ultimo backup ${backup.giorni} giorni fa`,
      vai: () => apri('Documenti', { scheda: 'Backup e dati' }) });
  } else if (backup && esterno !== undefined && !esternoOk) {
    avvisi.push({ grave: false, breve: 'Copia fuori dal telefono', titolo: 'Copia fuori dal telefono',
      testo: esterno === null ? 'Mai fatta: se il telefono si rompe o si perde, i registri vanno persi'
        : `L'ultima è di ${esterno} giorni fa: inviala a Drive o per email`,
      vai: () => apri('Documenti', { scheda: 'Backup e dati' }) });
  }
  if (daCompletare > 0) {
    avvisi.push({ grave: false, breve: `${daCompletare} prodott${daCompletare > 1 ? 'i' : 'o'} da completare`,
      titolo: `${daCompletare} prodott${daCompletare > 1 ? 'i' : 'o'} da completare`,
      testo: "Allergeni e conservazione da verificare sull'etichetta", vai: () => apri('Anagrafiche', { scheda: 'Prodotti' }) });
  }

  const giornoMenu = menu ? daIsoLocale(menu.data) : null;

  const oggi = oggiLocale();
  const datiOggi = riquadroOggi({ tempMancanti, pulizieMancanti, totali, scadenze, oggi });
  const passi = passiGiro({ punti: cucina.punti, temperatureOggi: cucina.temperature, aree, lotti: scadenze, oggi, domani: piuGiorni(oggi, 1) }).length;
  const suPromemoria = (p) => {
    if (p.tipo === 'temperature') apri('Temperature', { daNotifica: Date.now() });
    else if (p.tipo === 'pulizie') apri('Sanificazione');
    else apri('Magazzino', p.lottoId ? { lottoId: p.lottoId } : undefined);
  };
  const riquadro = (
    <RiquadroOggi dati={datiOggi} avvisi={avvisi} passi={passi} onPromemoria={suPromemoria}
      onGiro={() => apri('Giro')} onRegistra={() => setRegistra(true)} onDettagli={() => (conCucine ? setPannello(true) : null)}
      onImposta={() => apri('Anagrafiche', { scheda: 'Frigoriferi' })} ridotto={ridotto && conCucine} onRiduci={riduci} />
  );

  // barra in alto (proposta A): la data, il titolo della sezione e il pulsante per cercare in tutta l'app
  const barraAlta = (stile) => (
    <View style={[{ flexDirection: 'row', alignItems: 'center' }, stile]}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '500', color: COLORS.muted }}>{oggiScritto}</Text>
        <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700', color: COLORS.text, letterSpacing: -0.4 }}>Cucina</Text>
      </View>
      <PulsanteCerca onPress={() => apri('Cerca')} />
    </View>
  );
  const intestazione = barraAlta({ marginLeft: 4, marginBottom: 16 });

  // temperature, pulizie, scadenze, cose da sistemare, prossimo menù: sotto il riquadro (senza mappa) o nel pannello (con la mappa)
  const dettagli = (
    <>
        {/* Stato di temperature, pulizie e scadenze */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
          <Riquadro icona="thermometer" etichetta="Temperature"
            valore={puntiTot === 0 ? 'Nessuna' : `${tempFatte} di ${puntiTot}`}
            tono={puntiTot === 0 ? 'spento' : tempMancanti ? 'attesa' : 'ok'}
            onPress={() => (puntiTot === 0 ? apri('Anagrafiche', { scheda: 'Frigoriferi' }) : apri('Temperature'))} />
          <Riquadro icona="spray-bottle" etichetta="Pulizie"
            valore={pulizie.totali === 0 ? 'Nessuna' : `${pulizie.fatte} di ${pulizie.totali}`}
            tono={pulizie.totali === 0 ? 'spento' : pulizieMancanti ? 'attesa' : 'ok'}
            onPress={() => apri('Sanificazione')} />
          <Riquadro icona={scaduti ? 'alert' : scadenze.length ? 'clock-outline' : 'check-bold'} etichetta="Scadenze"
            valore={scaduti ? plurale(scaduti, 'scaduto', 'scaduti') : scadenze.length ? `${scadenze.length} vicine` : 'In regola'}
            tono={scaduti ? 'errore' : scadenze.length ? 'attesa' : 'ok'}
            onPress={() => apri('Magazzino')} />
        </View>

        {/* Da sistemare: compare solo se c'è qualcosa */}
        {avvisi.length > 0 && (
          <View style={[S.card, { paddingVertical: 6 }]}>
            {avvisi.map((a, i) => (
              <RigaAvviso key={a.titolo} prima={i === 0} grave={a.grave} titolo={a.titolo} testo={a.testo} onPress={a.vai} />
            ))}
          </View>
        )}

        {/* Prossimo menù in calendario */}
        <TouchableOpacity onPress={() => apri('Menu')} activeOpacity={0.8} accessibilityRole="button"
          accessibilityLabel={menu ? `Prossimo menù: ${menu.titolo}, ${menu.data}` : 'Menù ed eventi'}
          style={[S.card, { flexDirection: 'row', alignItems: 'center', minHeight: 92 }]}>
          <View style={{
            width: 56, height: 60, borderRadius: 16, backgroundColor: COLORS.primarySoft,
            alignItems: 'center', justifyContent: 'center', marginRight: 14,
          }}>
            {menu ? (
              <>
                <Text style={{ fontSize: 20, fontWeight: '700', color: COLORS.primaryDark, lineHeight: 24 }}>{giornoMenu.getDate()}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.primaryDark }}>{MESI[giornoMenu.getMonth()]}</Text>
              </>
            ) : <Icona nome="calendar-month-outline" size={26} colore={COLORS.primaryDark} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, color: COLORS.muted }}>{menu ? 'Prossimo menù' : 'Menù ed eventi'}</Text>
            <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>
              {menu ? [menu.titolo, menu.cliente].filter(Boolean).join(' · ') : 'Apri il calendario'}
            </Text>
            {!!menu && (
              <Text numberOfLines={1} style={{ fontSize: 13, color: COLORS.muted }}>
                {[menu.ospiti ? plurale(menu.ospiti, 'ospite', 'ospiti') : '', STATI_MENU[menu.stato] || menu.stato].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>
          <Icona nome="chevron-right" colore={COLORS.muted} />
        </TouchableOpacity>

        {/* Lotti in scadenza */}
        {scadenze.length > 0 && (
          <TouchableOpacity style={S.card} activeOpacity={0.8} onPress={() => apri('Magazzino')}>
            <Text style={S.h2}>In scadenza (3 giorni)</Text>
            {scadenze.map((l) => {
              const g = giorniAllaScadenza(l.data_scadenza);
              return (
                <View key={l.id} style={[S.row, { paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}>{l.prodotto}</Text>
                    <Text style={S.muted}>Lotto {l.numero_lotto || '—'} · {l.quantita_residua} {l.unita_misura}</Text>
                  </View>
                  <Text style={{
                    color: g < 0 ? COLORS.danger : g <= 1 ? COLORS.warning : COLORS.muted, fontWeight: '700', fontSize: 14,
                  }}>
                    {g < 0 ? 'SCADUTO' : g === 0 ? 'oggi' : `${g}g`}
                  </Text>
                </View>
              );
            })}
          </TouchableOpacity>
        )}
    </>
  );
  return (
    <View style={S.screen}>
      {conCucine ? (
        <>
          {/* La mappa delle cucine riempie la schermata: sopra solo la data, sotto la riga dei controlli e il pannello dei dettagli */}
          {barraAlta({ paddingLeft: 20, paddingRight: 16, paddingTop: 12, paddingBottom: 10 })}
          <View style={{ flex: 1, backgroundColor: COLORS.contenitore }}>
            <RiparoCucine suRotto={senzaCucine}>
              <Cucine dati={dati} suPosto={suPosto} suPulsante={suPulsante} suStato={setScena} />
            </RiparoCucine>
            {scena === 'ok' && cucina.collegamenti.length === 0 && (
              <View pointerEvents="none" style={{ position: 'absolute', left: 12, right: 150, bottom: 44 }}>
                <Text style={{
                  fontSize: 13, fontWeight: '700', color: COLORS.text, backgroundColor: COLORS.card, borderRadius: 14,
                  paddingHorizontal: 14, paddingVertical: 8, overflow: 'hidden',
                }}>Tocca un frigorifero per dargli il nome</Text>
              </View>
            )}
          </View>
          <View style={{ backgroundColor: COLORS.bg, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10 }}>
            {riquadro}
          </View>
        </>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 20, paddingBottom: 32 }}>
            {intestazione}
            <View style={{ marginBottom: 12 }}>{riquadro}</View>
{dettagli}
          </ScrollView>
        </>
      )}

      {/* Pannello dei dettagli di oggi, sopra la mappa */}
      <Modal visible={pannello && conCucine} transparent animationType="slide" onRequestClose={() => setPannello(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(27,29,23,0.55)' }}>
          <Pressable style={{ flex: 1, minHeight: 90 }} onPress={() => setPannello(false)} accessibilityLabel="Chiudi" />
          <View style={{ backgroundColor: COLORS.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '82%' }}>
            <TouchableOpacity onPress={() => setPannello(false)} accessibilityRole="button" accessibilityLabel="Chiudi i dettagli"
              style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.bordoCampo }} />
            </TouchableOpacity>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }}>
              <Text accessibilityRole="header" style={[S.h1, { marginLeft: 4, marginBottom: 12 }]}>Oggi</Text>
              {dettagli}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Scheda dell'attrezzatura toccata nella scena */}
      {!!scelto && (
        <SchedaPosto key={scelto} posto={FREDDI.find((p) => p.id === scelto)} stato={stati[scelto]} punti={cucina.punti} collegamenti={cucina.collegamenti}
          ultimaPrima={stati[scelto] && stati[scelto].punto ? ultimePrima[stati[scelto].punto.id] : null}
          prossimo={(() => { const f = FREDDI.find((p) => p.id !== scelto && stati[p.id] && stati[p.id].c === 'fare'); return f ? { id: f.id, nome: stati[f.id].nome } : null; })()}
          onProssimo={setScelto}
          onChiudi={() => setScelto(null)} onCambiato={carica}
          apri={(rotta, parametri) => { setScelto(null); apri(rotta, parametri); }} />
      )}

      {/* Scelta dopo un pulsante della mappa */}
      <Modal visible={!!gruppo} transparent animationType="slide" onRequestClose={() => setGruppo(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(27,29,23,0.55)' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setGruppo(null)} accessibilityLabel="Chiudi" />
          <View style={{
            backgroundColor: COLORS.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28,
            paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28,
          }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.bordoCampo, marginBottom: 20 }} />
            <Text accessibilityRole="header" style={[S.h1, { marginBottom: 16 }]}>{gruppo ? PULSANTI[gruppo].titolo : ''}</Text>
            {(gruppo ? PULSANTI[gruppo].scelte : []).map((r) => (
              <TouchableOpacity key={r.titolo} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={r.titolo}
                onPress={() => { setGruppo(null); apri(r.rotta, r.parametri); }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 72, borderRadius: 24,
                  paddingHorizontal: 18, paddingVertical: 12, marginBottom: 10, backgroundColor: COLORS.contenitore,
                }}>
                <Icona nome={r.icona} size={28} colore={COLORS.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700' }}>{r.titolo}</Text>
                  <Text style={S.muted}>{r.nota}</Text>
                </View>
                <Icona nome="chevron-right" size={24} colore={COLORS.muted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Pannello dal basso con le registrazioni */}
      <Modal visible={registra} transparent animationType="slide" onRequestClose={() => setRegistra(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(27,29,23,0.55)' }}>
        <Pressable style={{ flex: 1 }} onPress={() => setRegistra(false)} accessibilityLabel="Chiudi" />
        <View style={{
          backgroundColor: COLORS.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28,
          paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28,
        }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.bordoCampo, marginBottom: 20 }} />
          <Text accessibilityRole="header" style={[S.h1, { marginBottom: 16 }]}>Cosa registri?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {REGISTRA.map((r) => {
              const fondo = r.tono === 'verde' ? COLORS.primarySoft : r.tono === 'terra' ? COLORS.terraSoft : COLORS.contenitore;
              const tinta = r.tono === 'verde' ? COLORS.primaryDark : r.tono === 'terra' ? COLORS.terraScuro : COLORS.text;
              return (
                <TouchableOpacity key={r.rotta} onPress={() => apri(r.rotta)} activeOpacity={0.8}
                  accessibilityRole="button" accessibilityLabel={r.titolo}
                  style={{
                    width: '47.5%', flexGrow: 1, minHeight: 104, borderRadius: 24, padding: 16,
                    backgroundColor: fondo, justifyContent: 'space-between',
                  }}>
                  <Icona nome={r.icona} size={28} colore={r.tono ? tinta : COLORS.primary} />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: tinta }}>{r.titolo}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        </View>
      </Modal>
    </View>
  );
}
