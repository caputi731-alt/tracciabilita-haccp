/**
 * Sezione "Oggi" della suite: quanti controlli mancano, lo stato di temperature, pulizie e scadenze,
 * le cose da sistemare, il prossimo menù in calendario e il pulsante "Registra".
 */
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, giorniAllaScadenza, oggiLocale } from './theme';
import { daIsoLocale } from './utile';
import { Icona } from './UI';
import {
  lottiInScadenza, temperatureDiOggi, listaPuntiControllo, nonConformitaAperte,
  areeConStato, prodottiDaCompletare, lottiBloccati, leggiPreferenza, menuLeggi,
} from './database';
import { statoBackup } from './backupAutomatico';
import { prossimoMenu } from './menuPonte';

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

/** Anello di avanzamento disegnato con due mezzi cerchi che ruotano (niente librerie grafiche). */
function Anello({ fatti, totali, lato = 88, spessore = 9, colore, traccia, children }) {
  const gradi = totali > 0 ? Math.min(1, fatti / totali) * 360 : 0;
  const cerchio = { width: lato, height: lato, borderRadius: lato / 2, borderWidth: spessore };
  // metà dell'anello colorato, che ruotando entra nella metà visibile
  const meta = (aDestra, rotazione) => (
    <View style={{
      position: 'absolute', top: 0, left: aDestra ? lato / 2 : 0, width: lato / 2, height: lato, overflow: 'hidden',
    }}>
      <View style={{
        position: 'absolute', top: 0, left: aDestra ? -lato / 2 : 0, width: lato, height: lato,
        transform: [{ rotate: `${rotazione}deg` }],
      }}>
        <View style={{ position: 'absolute', top: 0, left: aDestra ? 0 : lato / 2, width: lato / 2, height: lato, overflow: 'hidden' }}>
          <View style={[cerchio, { position: 'absolute', top: 0, left: aDestra ? 0 : -lato / 2, borderColor: colore }]} />
        </View>
      </View>
    </View>
  );
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${fatti} controlli fatti su ${totali}`}
      style={{ width: lato, height: lato, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[cerchio, { position: 'absolute', top: 0, left: 0, borderColor: traccia }]} />
      {gradi > 0 && meta(true, Math.min(gradi, 180))}
      {gradi > 180 && meta(false, gradi - 180)}
      {children}
    </View>
  );
}

function Riquadro({ icona, valore, etichetta, tono, onPress }) {
  const fondo = tono === 'ok' ? COLORS.primarySoft : tono === 'errore' ? COLORS.dangerSoft : tono === 'spento' ? COLORS.contenitore : COLORS.terraSoft;
  const tinta = tono === 'ok' ? COLORS.primaryDark : tono === 'errore' ? COLORS.danger : tono === 'spento' ? COLORS.muted : COLORS.terraScuro;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} accessibilityRole="button"
      accessibilityLabel={`${etichetta}: ${valore}`}
      style={{ flex: 1, backgroundColor: COLORS.card, borderRadius: 20, padding: 14, minHeight: 112, justifyContent: 'space-between' }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: fondo, alignItems: 'center', justifyContent: 'center' }}>
        <Icona nome={icona} size={20} colore={tinta} />
      </View>
      <View>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 20, fontWeight: '700', color: COLORS.text }}>{valore}</Text>
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

export default function HomeScreen({ navigation }) {
  const [scadenze, setScadenze] = useState([]);
  const [tempFatte, setTempFatte] = useState(0);
  const [puntiTot, setPuntiTot] = useState(0);
  const [ncAperte, setNcAperte] = useState(0);
  const [pulizie, setPulizie] = useState({ fatte: 0, totali: 0 });
  const [backup, setBackup] = useState(null);
  const [daCompletare, setDaCompletare] = useState(0);
  const [bloccati, setBloccati] = useState(0);
  const [esterno, setEsterno] = useState(undefined); // giorni dall'ultima copia fuori dal telefono (null = mai)
  const [menu, setMenu] = useState(null);
  const [registra, setRegistra] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
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
          setBackup(await statoBackup());
          const ultimaEsterna = await leggiPreferenza('backup_esterno_ultimo');
          setEsterno(ultimaEsterna ? Math.floor((Date.now() - new Date(ultimaEsterna).getTime()) / 86400000) : null);
          setDaCompletare((await prodottiDaCompletare()).length);
          setBloccati((await lottiBloccati()).length);
          setMenu(prossimoMenu(await menuLeggi('state'), oggiLocale()));
        } catch (e) { /* la Home resta utilizzabile anche se una lettura fallisce */ }
      })();
    }, [])
  );

  const tempMancanti = Math.max(0, puntiTot - tempFatte);
  const pulizieMancanti = Math.max(0, pulizie.totali - pulizie.fatte);
  const totali = puntiTot + pulizie.totali;
  const fatti = totali - tempMancanti - pulizieMancanti;
  const mancanti = tempMancanti + pulizieMancanti;
  const scaduti = scadenze.filter((l) => giorniAllaScadenza(l.data_scadenza) < 0).length;
  const backupOk = backup && backup.cartella && backup.giorni !== null && backup.giorni <= 2 && !backup.errore;
  const esternoOk = esterno !== undefined && esterno !== null && esterno <= 7;

  const apri = (rotta, parametri) => { setRegistra(false); navigation.navigate(rotta, parametri); };

  // il riquadro in alto: cosa manca oggi e il pulsante per farlo subito
  let titolo; let dettaglio; let pulsante = null;
  if (totali === 0) {
    titolo = 'Nessun controllo impostato';
    dettaglio = 'Aggiungi frigoriferi e aree di pulizia';
    pulsante = { testo: 'Imposta i controlli', vai: () => apri('Anagrafiche', { scheda: 'Frigoriferi' }) };
  } else if (mancanti === 0) {
    titolo = 'Tutto fatto';
    dettaglio = 'Temperature e pulizie di oggi registrate';
  } else {
    titolo = mancanti === 1 ? 'Ne manca 1' : `Ne mancano ${mancanti}`;
    dettaglio = [tempMancanti ? plurale(tempMancanti, 'temperatura', 'temperature') : '',
      pulizieMancanti ? plurale(pulizieMancanti, 'pulizia', 'pulizie') : ''].filter(Boolean).join(' · ');
    pulsante = tempMancanti
      ? { testo: 'Registra le temperature', vai: () => apri('Temperature', { daNotifica: Date.now() }) }
      : { testo: 'Registra le pulizie', vai: () => apri('Sanificazione') };
  }

  const avvisi = [];
  if (bloccati > 0) {
    avvisi.push({ grave: true, titolo: `${bloccati} lott${bloccati > 1 ? 'i bloccati' : 'o bloccato'} (richiamo)`,
      testo: 'Merce da tenere separata finché non è risolto', vai: () => apri('Magazzino') });
  }
  if (ncAperte > 0) {
    avvisi.push({ grave: true, titolo: `${ncAperte} non conformità apert${ncAperte > 1 ? 'e' : 'a'}`,
      testo: "Da chiudere con un'azione correttiva", vai: () => apri('NonConformita') });
  }
  if (backup && !backupOk) {
    avvisi.push({ grave: !backup.cartella || !!backup.errore,
      titolo: !backup.cartella ? 'Backup automatico non attivo' : backup.errore ? 'Backup non riuscito' : 'Backup vecchio',
      testo: !backup.cartella ? 'Attivalo: se il telefono si rompe perdi tutti i registri'
        : backup.errore ? 'Controlla la cartella dei backup'
        : backup.giorni === null ? 'Nessun backup ancora eseguito' : `Ultimo backup ${backup.giorni} giorni fa`,
      vai: () => apri('Documenti', { scheda: 'Backup e dati' }) });
  } else if (backup && esterno !== undefined && !esternoOk) {
    avvisi.push({ grave: false, titolo: 'Copia fuori dal telefono',
      testo: esterno === null ? 'Mai fatta: se il telefono si rompe o si perde, i registri vanno persi'
        : `L'ultima è di ${esterno} giorni fa: inviala a Drive o per email`,
      vai: () => apri('Documenti', { scheda: 'Backup e dati' }) });
  }
  if (daCompletare > 0) {
    avvisi.push({ grave: false, titolo: `${daCompletare} prodott${daCompletare > 1 ? 'i' : 'o'} da completare`,
      testo: "Allergeni e conservazione da verificare sull'etichetta", vai: () => apri('Anagrafiche', { scheda: 'Prodotti' }) });
  }

  const giornoMenu = menu ? daIsoLocale(menu.data) : null;

  return (
    <View style={S.screen}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 20, paddingBottom: 96 }}>
        <View style={{ marginLeft: 4, marginBottom: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 1.2, color: COLORS.muted }}>TENUTA COPPA</Text>
          <Text accessibilityRole="header" style={[S.h1, { marginBottom: 0 }]}>
            {maiuscola(new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }))}
          </Text>
        </View>

        {/* Controlli di oggi */}
        <View style={{ backgroundColor: COLORS.eroe, borderRadius: 28, padding: 24, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.suEroeTenue }}>Controlli di oggi</Text>
              <Text style={{ fontSize: 28, fontWeight: '700', color: COLORS.suEroe, letterSpacing: -0.6, marginTop: 2 }}>{titolo}</Text>
              <Text style={{ fontSize: 16, color: COLORS.suEroeTenue, marginTop: 2 }}>{dettaglio}</Text>
            </View>
            {totali > 0 && (
              <Anello fatti={fatti} totali={totali} colore={COLORS.suEroeTenue} traccia={COLORS.eroeTraccia}>
                {mancanti === 0
                  ? <Icona nome="check-bold" size={30} colore={COLORS.suEroe} />
                  : <Text style={{ fontSize: 20, fontWeight: '700', color: COLORS.suEroe }}>{fatti}/{totali}</Text>}
              </Anello>
            )}
          </View>
          {!!pulsante && (
            <TouchableOpacity onPress={pulsante.vai} activeOpacity={0.8} accessibilityRole="button"
              style={{
                marginTop: 20, minHeight: 52, borderRadius: 26, backgroundColor: COLORS.eroePulsante,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
              }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.suEroePulsante, marginRight: 8 }}>{pulsante.testo}</Text>
              <Icona nome="arrow-right" size={20} colore={COLORS.suEroePulsante} />
            </TouchableOpacity>
          )}
        </View>

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
      </ScrollView>

      {/* Pulsante "Registra" */}
      <TouchableOpacity onPress={() => setRegistra(true)} activeOpacity={0.85} accessibilityRole="button"
        accessibilityLabel="Registra"
        style={{
          position: 'absolute', right: 16, bottom: 16, height: 56, borderRadius: 18, paddingLeft: 18, paddingRight: 22,
          backgroundColor: COLORS.terra, flexDirection: 'row', alignItems: 'center', elevation: 4,
        }}>
        <Icona nome="plus" size={24} colore={COLORS.suTerra} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.suTerra, marginLeft: 8 }}>Registra</Text>
      </TouchableOpacity>

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
