/**
 * PIN del titolare (schermata Backup): riquadro per impostarlo o cambiarlo e finestra che lo chiede
 * quando si apre un backup protetto con un PIN che questo telefono non conosce.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Modal } from 'react-native';
import { S, COLORS } from './theme';
import { Campo, Bottone, VistaModale, useErrori, conferma } from './UI';
import { pinImpostato, impostaPin, verificaPin, pukImpostato, creaPuk, pukValido, pukScritto, pinDimenticato, CIFRE_PUK } from './pin';
import { pinValido, CIFRE_PIN } from './protezione';

const campoPin = { keyboardType: 'number-pad', secureTextEntry: true, maxLength: CIFRE_PIN, autoComplete: 'off', importantForAutofill: 'no' };

/**
 * Finestra che chiede un PIN. `onConferma(pin)` può essere asincrona: se lancia un errore con `pinErrato`
 * il messaggio compare sul campo e si può riprovare.
 */
export function ModalePin({ visibile, titolo, testo, pulsante = 'Conferma', onConferma, onChiudi }) {
  const [pin, setPin] = useState('');
  const { errori, segnala, azzera } = useErrori();
  useEffect(() => { if (visibile) { setPin(''); azzera(); } }, [visibile, azzera]);

  const prosegui = async () => {
    azzera();
    if (!pinValido(pin)) { segnala('pin', `Il PIN ha ${CIFRE_PIN} cifre`); return; }
    try {
      await onConferma(pin);
    } catch (e) {
      if (!e?.pinErrato) throw e;
      segnala('pin', 'PIN non corretto');
    }
  };

  return (
    <Modal visible={!!visibile} animationType="slide" onRequestClose={onChiudi}>
      <VistaModale>
        <Text style={S.h1}>{titolo}</Text>
        {!!testo && <Text style={[S.muted, { marginBottom: 8 }]}>{testo}</Text>}
        <View style={S.card}>
          <Campo label="PIN" value={pin} onChange={setPin} errore={errori.pin} autoFocus {...campoPin} />
          <Bottone testo={pulsante} onPress={prosegui} />
          <Bottone testo="Annulla" ghost onPress={onChiudi} />
        </View>
      </VistaModale>
    </Modal>
  );
}

/** Riquadro "Protezione con PIN". `onCambiato()` viene chiamata dopo che il PIN è stato impostato o cambiato. */
export default function RiquadroPin({ onCambiato }) {
  const [attivo, setAttivo] = useState(null);
  const [aperto, setAperto] = useState(null); // 'nuovo' | 'cambia' | 'dimenticato'
  const [attuale, setAttuale] = useState('');
  const [nuovo, setNuovo] = useState('');
  const [ripeti, setRipeti] = useState('');
  const [puk, setPuk] = useState('');           // PUK digitato quando il PIN è stato dimenticato
  const [conPuk, setConPuk] = useState(false);  // su questo telefono esiste un PUK
  const [mostra, setMostra] = useState(null);   // PUK appena creato, da far scrivere su carta
  const [chiediPin, setChiediPin] = useState(false);
  const { errori, segnala, azzera, riepilogo } = useErrori();

  const leggi = useCallback(() => {
    pinImpostato().then(setAttivo).catch(() => setAttivo(false));
    pukImpostato().then(setConPuk).catch(() => setConPuk(false));
  }, []);
  useEffect(leggi, [leggi]);

  const apri = (modo) => { setAttuale(''); setNuovo(''); setRipeti(''); setPuk(''); azzera(); setAperto(modo); };

  const salva = async () => {
    azzera();
    let ok = true;
    if (aperto === 'cambia' && !pinValido(attuale)) ok = segnala('attuale', `Il PIN ha ${CIFRE_PIN} cifre`);
    if (!pinValido(nuovo)) ok = segnala('nuovo', `Scrivi ${CIFRE_PIN} cifre`);
    else if (/^(\d)\1+$/.test(nuovo) || '0123456789876543210'.includes(nuovo)) ok = segnala('nuovo', 'Troppo facile da indovinare: scegline un altro');
    if (ripeti !== nuovo) ok = segnala('ripeti', 'I due PIN non coincidono');
    if (aperto === 'dimenticato' && conPuk && !pukValido(puk)) ok = segnala('puk', `Il PUK ha ${CIFRE_PUK} cifre`);
    if (!ok) return;
    if (aperto === 'cambia' && !(await verificaPin(attuale))) { segnala('attuale', 'PIN attuale non corretto'); return; }
    if (aperto === 'dimenticato') {
      try { await pinDimenticato(nuovo, puk); } catch (e) {
        if (!e?.pukErrato) throw e;
        segnala('puk', 'PUK non corretto');
        return;
      }
    } else await impostaPin(nuovo);
    // con il primo PIN nasce anche il PUK; dopo un PIN dimenticato se ne fa uno nuovo, perché quello vecchio è stato usato
    const nuovoPuk = (aperto === 'nuovo' || aperto === 'dimenticato' || !conPuk) ? await creaPuk() : null;
    setAperto(null);
    leggi();
    if (nuovoPuk) setMostra(nuovoPuk);
    if (onCambiato) await onCambiato();
  };

  const rifaiPuk = async (pin) => {
    if (!(await verificaPin(pin))) { const e = new Error('PIN non corretto'); e.pinErrato = true; throw e; }
    const nuovoPuk = await creaPuk();
    setChiediPin(false);
    leggi();
    setMostra(nuovoPuk);
  };

  const dimenticato = () => conferma('PIN dimenticato?',
    (conPuk ? 'Con il codice PUK puoi sceglierne uno nuovo' : 'Puoi sceglierne uno nuovo')
    + ': i dati su questo telefono non cambiano e da adesso i backup useranno il nuovo PIN.\n\n'
    + 'I backup già fatti restano però chiusi con il PIN vecchio: senza ricordarlo non si possono più aprire.',
    () => apri('dimenticato'));

  if (attivo === null) return null;

  return (
    <View style={[S.card, { borderWidth: 1.5, borderColor: attivo ? COLORS.ok : COLORS.warning }]}>
      <Text style={S.h2}>Protezione con PIN</Text>
      <Text style={{ fontSize: 15, color: COLORS.text, fontWeight: '700' }}>
        {attivo ? 'Attiva: i backup sono protetti' : 'Non attiva: chi trova un backup può leggerlo'}
      </Text>
      <Text style={S.muted}>
        {attivo
          ? 'Il backup automatico e la copia inviata a Drive o per email si aprono solo con il PIN. '
            + 'Su un telefono nuovo, al ripristino, l\'app te lo chiederà: senza PIN il backup non si può recuperare.'
          : `Scegli un PIN di ${CIFRE_PIN} cifre: da quel momento i backup escono dal telefono cifrati. `
            + 'I backup contengono fornitori, prezzi, clienti e proposte di menù.'}
      </Text>
      {attivo ? (
        <>
          {!conPuk && (
            <Text style={{ fontSize: 15, color: COLORS.warning, fontWeight: '700', marginTop: 8 }}>
              Manca il codice PUK: finché non lo crei, chi ha il telefono in mano può scegliere un nuovo PIN e vedere incassi e costi.
            </Text>
          )}
          <Bottone testo={conPuk ? 'Crea un nuovo PUK' : 'Crea il codice PUK'} ghost={conPuk} icona="key-outline" onPress={() => setChiediPin(true)} />
          <Bottone testo="Cambia PIN" ghost onPress={() => apri('cambia')} />
          <Bottone testo="Ho dimenticato il PIN" ghost onPress={dimenticato} />
        </>
      ) : (
        <Bottone testo="Imposta il PIN" icona="lock-outline" onPress={() => apri('nuovo')} />
      )}

      <Modal visible={!!aperto} animationType="slide" onRequestClose={() => setAperto(null)}>
        <VistaModale>
          <Text style={S.h1}>{aperto === 'nuovo' ? 'Imposta il PIN' : 'Nuovo PIN'}</Text>
          <Text style={[S.muted, { marginBottom: 8 }]}>
            Scrivilo anche su carta e tienilo in un posto sicuro: se lo dimentichi, i backup protetti non si possono più aprire
            e nessuno può recuperarlo, nemmeno chi ha fatto l'app.
          </Text>
          <View style={S.card}>
            {aperto === 'cambia' && (
              <Campo label="PIN attuale" value={attuale} onChange={setAttuale} errore={errori.attuale} {...campoPin} />
            )}
            {aperto === 'dimenticato' && conPuk && (
              <Campo label={`Codice PUK (${CIFRE_PUK} cifre, quello scritto su carta)`} value={puk} onChange={setPuk} errore={errori.puk}
                keyboardType="number-pad" maxLength={CIFRE_PUK + 1} autoComplete="off" importantForAutofill="no" />
            )}
            <Campo label={`Nuovo PIN (${CIFRE_PIN} cifre)`} value={nuovo} onChange={setNuovo} errore={errori.nuovo} {...campoPin} />
            <Campo label="Ripeti il nuovo PIN" value={ripeti} onChange={setRipeti} errore={errori.ripeti} {...campoPin} />
            {aperto !== 'nuovo' && (
              <Text style={[S.muted, { marginTop: 12 }]}>
                I backup fatti finora restano chiusi con il PIN di prima.
              </Text>
            )}
            {riepilogo}
            <Bottone testo="Salva il PIN" onPress={salva} />
            <Bottone testo="Annulla" ghost onPress={() => setAperto(null)} />
          </View>
        </VistaModale>
      </Modal>

      <ModalePin visibile={chiediPin} titolo="PIN del titolare" testo="Serve il PIN per creare il codice PUK. Un PUK nuovo sostituisce quello di prima."
        pulsante="Crea il PUK" onConferma={rifaiPuk} onChiudi={() => setChiediPin(false)} />

      <Modal visible={!!mostra} animationType="slide" onRequestClose={() => {}}>
        <VistaModale>
          <Text style={S.h1}>Il tuo codice PUK</Text>
          <Text style={[S.muted, { marginBottom: 8 }]}>
            Serve solo se dimentichi il PIN: con questo codice ne scegli uno nuovo. Scrivilo su carta adesso e tienilo lontano dal
            telefono: non verrà più mostrato e nessuno può recuperarlo.
          </Text>
          <View style={[S.card, { alignItems: 'center', paddingVertical: 28 }]}>
            <Text selectable accessibilityLabel={`Codice PUK ${String(mostra || '').split('').join(' ')}`}
              style={{ fontSize: 34, fontWeight: '800', color: COLORS.text, letterSpacing: 2 }}>{mostra ? pukScritto(mostra) : ''}</Text>
          </View>
          <Text style={S.muted}>
            Il PUK non apre i backup: quelli già fatti restano chiusi con il PIN con cui sono stati creati.
          </Text>
          <Bottone testo="L'ho scritto su carta" onPress={() => setMostra(null)} />
        </VistaModale>
      </Modal>
    </View>
  );
}
