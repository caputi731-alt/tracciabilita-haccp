/**
 * PIN del titolare (schermata Backup): riquadro per impostarlo o cambiarlo e finestra che lo chiede
 * quando si apre un backup protetto con un PIN che questo telefono non conosce.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Modal } from 'react-native';
import { S, COLORS } from './theme';
import { Campo, Bottone, VistaModale, useErrori, conferma } from './UI';
import { pinImpostato, impostaPin, verificaPin } from './pin';
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
  const { errori, segnala, azzera, riepilogo } = useErrori();

  const leggi = useCallback(() => { pinImpostato().then(setAttivo).catch(() => setAttivo(false)); }, []);
  useEffect(leggi, [leggi]);

  const apri = (modo) => { setAttuale(''); setNuovo(''); setRipeti(''); azzera(); setAperto(modo); };

  const salva = async () => {
    azzera();
    let ok = true;
    if (aperto === 'cambia' && !pinValido(attuale)) ok = segnala('attuale', `Il PIN ha ${CIFRE_PIN} cifre`);
    if (!pinValido(nuovo)) ok = segnala('nuovo', `Scrivi ${CIFRE_PIN} cifre`);
    else if (/^(\d)\1+$/.test(nuovo) || '0123456789876543210'.includes(nuovo)) ok = segnala('nuovo', 'Troppo facile da indovinare: scegline un altro');
    if (ripeti !== nuovo) ok = segnala('ripeti', 'I due PIN non coincidono');
    if (!ok) return;
    if (aperto === 'cambia' && !(await verificaPin(attuale))) { segnala('attuale', 'PIN attuale non corretto'); return; }
    await impostaPin(nuovo);
    setAperto(null);
    leggi();
    if (onCambiato) await onCambiato();
  };

  const dimenticato = () => conferma('PIN dimenticato?',
    'Puoi sceglierne uno nuovo: i dati su questo telefono non cambiano e da adesso i backup useranno il nuovo PIN.\n\n'
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
    </View>
  );
}
