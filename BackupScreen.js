import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { S, COLORS } from './theme';
import { Bottone, conferma, useAvviso } from './UI';
import {
  statoBackup, scegliCartellaBackup, eseguiBackup, recuperaFotoMancanti, MAX_COPIE,
  salvaCopiaDiSicurezza, copiaDiSicurezza, leggiCopiaDiSicurezza,
} from './backupAutomatico';
import {
  esportaTutto, importaTutto, csvRegistroCarichi, csvRegistroTemperature, leggiPreferenza, salvaPreferenza,
} from './database';
import { condividiTesto } from './condividi';
import { aggiornaPromemoria } from './notifiche';

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

/** I file condivisi stanno nella memoria temporanea (non si accumulano). Il segno iniziale fa leggere gli accenti a Excel. */
const scriviECondividi = (nomeFile, contenuto, mime) =>
  condividiTesto(nomeFile, mime === 'text/csv' ? `\uFEFF${contenuto}` : contenuto, mime);

export default function BackupScreen() {
  const [occupato, setOccupato] = useState(false);
  const [stato, setStato] = useState(null);
  const { avviso, mostra } = useAvviso();

  const [esterno, setEsterno] = useState(null);     // istante dell'ultima copia inviata fuori dal telefono
  const [sicurezza, setSicurezza] = useState(null); // dati di prima dell'ultimo ripristino
  const aggiornaStato = useCallback(() => {
    statoBackup().then(setStato).catch(() => {});
    leggiPreferenza('backup_esterno_ultimo').then(setEsterno).catch(() => {});
    copiaDiSicurezza().then(setSicurezza);
  }, []);
  useFocusEffect(aggiornaStato);

  const attiva = async () => {
    try {
      const ok = await scegliCartellaBackup();
      if (!ok) return;
      setOccupato(true);
      const rec = await recuperaFotoMancanti();
      await eseguiBackup();
      mostra(rec.recuperate ? `Backup attivo ✓ · ${rec.recuperate} foto recuperate` : 'Backup automatico attivo ✓');
    } catch (e) {
      Alert.alert('Backup non riuscito', String(e?.message || e));
    } finally {
      setOccupato(false);
      aggiornaStato();
    }
  };

  const oraSubito = async () => {
    try {
      setOccupato(true);
      const r = await eseguiBackup();
      mostra(`Backup salvato ✓ (${Math.round(r.byte / 1024)} KB)`);
    } catch (e) {
      Alert.alert('Backup non riuscito', String(e?.message || e));
    } finally {
      setOccupato(false);
      aggiornaStato();
    }
  };

  const recuperaFoto = async () => {
    try {
      setOccupato(true);
      const r = await recuperaFotoMancanti();
      Alert.alert('Recupero foto',
        r.recuperate === 0 && r.mancanti === 0 ? 'Tutte le foto sono già presenti su questo telefono ✓'
          : `Recuperate ${r.recuperate} foto.${r.mancanti ? ` ${r.mancanti} non si trovano nella cartella dei backup.` : ''}`);
    } catch (e) {
      Alert.alert('Recupero non riuscito', String(e?.message || e));
    } finally {
      setOccupato(false);
    }
  };

  const quando = (s) => {
    if (!s || !s.ultimo) return 'mai';
    const ora = new Date(s.ultimo).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    if (s.giorni === 0) return `oggi alle ${ora}`;
    if (s.giorni === 1) return `ieri alle ${ora}`;
    return `${s.giorni} giorni fa`;
  };

  const backupJson = async () => {
    try {
      setOccupato(true);
      const dump = await esportaTutto();
      await scriviECondividi(
        `backup-haccp-${stamp()}.json`,
        JSON.stringify(dump),
        'application/json'
      );
      await salvaPreferenza('backup_esterno_ultimo', new Date().toISOString());
      aggiornaStato();
    } catch (e) {
      Alert.alert('Errore backup', String(e?.message || e));
    } finally {
      setOccupato(false);
    }
  };

  const exportCarichi = async () => {
    try {
      setOccupato(true);
      const csv = await csvRegistroCarichi();
      if (!csv) return Alert.alert('Vuoto', 'Non ci sono carichi da esportare.');
      await scriviECondividi(`registro-carichi-${stamp()}.csv`, csv, 'text/csv');
    } catch (e) {
      Alert.alert('Errore export', String(e?.message || e));
    } finally {
      setOccupato(false);
    }
  };

  const exportTemperature = async () => {
    try {
      setOccupato(true);
      const csv = await csvRegistroTemperature();
      if (!csv) return Alert.alert('Vuoto', 'Non ci sono rilevazioni da esportare.');
      await scriviECondividi(`registro-temperature-${stamp()}.csv`, csv, 'text/csv');
    } catch (e) {
      Alert.alert('Errore export', String(e?.message || e));
    } finally {
      setOccupato(false);
    }
  };

  /** Sostituisce i dati con quelli del backup, dopo aver messo da parte quelli attuali. */
  const sostituisci = async (dump, messaggio) => {
    try {
      setOccupato(true);
      await salvaCopiaDiSicurezza(); // se è il file sbagliato si può tornare indietro
      await importaTutto(dump);
      let foto = { recuperate: 0, mancanti: 0 };
      try { foto = await recuperaFotoMancanti(); } catch (e) { /* le foto si possono recuperare anche dopo */ }
      aggiornaPromemoria();
      Alert.alert('Ripristino completato ✓',
        `${messaggio}${foto.recuperate ? `\n${foto.recuperate} foto recuperate dalla cartella dei backup.` : ''}`
        + `${foto.mancanti ? `\n${foto.mancanti} foto non trovate: scegli la cartella dei backup e tocca "Recupera foto mancanti".` : ''}`
        + '\n\nI dati di prima sono stati messi da parte: se hai scelto il file sbagliato puoi tornare indietro da questa schermata.');
    } catch (e) {
      Alert.alert('Ripristino non riuscito', `I dati attuali non sono stati toccati.\n\n${String(e?.message || e)}`);
    } finally {
      setOccupato(false);
      aggiornaStato();
    }
  };

  const ripristina = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const testo = await FileSystem.readAsStringAsync(res.assets[0].uri);
      let dump;
      try { dump = JSON.parse(testo); } catch (e) { throw new Error('Il file scelto non è un backup valido.'); }
      const quando = dump.generato ? new Date(dump.generato).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : 'data sconosciuta';
      const nLotti = Array.isArray(dump.tabelle?.lotti) ? dump.tabelle.lotti.length : 0;
      const nTemp = Array.isArray(dump.tabelle?.registro_temperature) ? dump.tabelle.registro_temperature.length : 0;
      conferma(
        'Ripristinare questo backup?',
        `Backup del ${quando}: ${nLotti} lotti, ${nTemp} temperature.\n\nTutti i dati attuali verranno sostituiti con quelli del file scelto.`,
        () => sostituisci(dump, 'Tutti i dati del backup sono stati caricati.')
      );
    } catch (e) {
      Alert.alert('Errore lettura file', String(e?.message || e));
    }
  };

  const tornaIndietro = () => conferma('Tornare ai dati di prima del ripristino?',
    'I dati attuali verranno sostituiti con quelli che c\'erano prima dell\'ultimo ripristino.',
    async () => {
      try { await sostituisci(await leggiCopiaDiSicurezza(), 'Sono tornati i dati di prima del ripristino.'); }
      catch (e) { Alert.alert('Operazione non riuscita', String(e?.message || e)); }
    });

  const giorniEsterno = esterno ? Math.floor((Date.now() - new Date(esterno).getTime()) / 86400000) : null;

  return (
    <View style={S.screen}>
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <Text style={S.h1}>Backup e sicurezza dati</Text>
      <Text style={[S.muted, { marginBottom: 16 }]}>
        I dati vivono solo su questo dispositivo. Esporta un backup con regolarità e
        conservalo altrove (Drive, email, chiavetta): se il telefono si rompe o si
        perde, è l'unico modo per non perdere la tracciabilità.
      </Text>

      <View style={[S.card, {
        borderLeftWidth: 5,
        borderLeftColor: !stato?.cartella || stato?.errore ? COLORS.danger : stato.giorni <= 2 ? COLORS.ok : COLORS.warning,
      }]}>
        <Text style={S.h2}>Backup automatico</Text>
        {stato?.cartella ? (
          <>
            <Text style={{ fontSize: 15, color: COLORS.text }}>Attivo · ultimo backup {quando(stato)}</Text>
            <Text style={S.muted}>Cartella: {stato.nomeCartella}</Text>
            <Text style={S.muted}>Un backup al giorno all'apertura dell'app, conservando le ultime {MAX_COPIE} copie.</Text>
            {!!stato.errore && (
              <Text style={{ color: COLORS.danger, marginTop: 6 }}>Ultimo tentativo fallito: {stato.errore}</Text>
            )}
            <Bottone testo="Fai un backup adesso" onPress={oraSubito} disabilitato={occupato} />
            <Bottone testo="Recupera foto mancanti dalla cartella" ghost onPress={recuperaFoto} />
            <Bottone testo="Cambia cartella" ghost onPress={attiva} />
          </>
        ) : (
          <>
            <Text style={S.muted}>
              Scegli una cartella del telefono (per esempio crea "Backup HACCP" in Documenti): l'app ci salva
              un backup ogni giorno. La cartella resta anche se l'app viene disinstallata.
            </Text>
            <Bottone testo="Attiva backup automatico" onPress={attiva} />
          </>
        )}

      </View>

      <View style={[S.card, {
        borderLeftWidth: 5,
        borderLeftColor: giorniEsterno === null ? COLORS.danger : giorniEsterno <= 7 ? COLORS.ok : COLORS.warning,
      }]}>
        <Text style={S.h2}>Copia fuori dal telefono</Text>
        <Text style={{ fontSize: 15, color: COLORS.text, fontWeight: '700' }}>
          {giorniEsterno === null ? 'Mai fatta' : giorniEsterno === 0 ? 'Ultima: oggi' : giorniEsterno === 1 ? 'Ultima: ieri' : `Ultima: ${giorniEsterno} giorni fa`}
        </Text>
        <Text style={S.muted}>
          Il backup automatico resta sul telefono: se il telefono si rompe o si perde, va perso anche lui.
          Una volta a settimana invia questa copia a Google Drive o alla tua email: la Home te lo ricorda.
        </Text>
        <Bottone testo="Invia una copia a Drive / email" icona="cloud-upload-outline" onPress={backupJson} disabilitato={occupato} />
        <Bottone testo="Ripristina da un backup" ghost onPress={ripristina} disabilitato={occupato} />
        {!!sicurezza && (
          <Bottone testo={`Torna ai dati di prima dell'ultimo ripristino${sicurezza.quando ? ` (${sicurezza.quando.toLocaleDateString('it-IT')})` : ''}`}
            ghost colore={COLORS.danger} onPress={tornaIndietro} disabilitato={occupato} />
        )}
      </View>

      <View style={S.card}>
        <Text style={S.h2}>Export per ASL / commercialista</Text>
        <Text style={S.muted}>Fogli Excel/CSV apribili con qualsiasi programma.</Text>
        <Bottone testo="Registro carichi (CSV)" ghost onPress={exportCarichi} />
        <Bottone testo="Registro temperature (CSV)" ghost onPress={exportTemperature} />
      </View>

      {occupato && <Text style={[S.muted, { textAlign: 'center' }]}>Attendi…</Text>}

      <Text style={[S.muted, { marginTop: 12 }]}>
        Le foto di etichette e documenti vengono copiate dal backup automatico nella sottocartella
        "foto" della cartella scelta. La copia inviata a Drive o per email contiene solo i dati, non le foto.
      </Text>
    </ScrollView>
    {avviso}
    </View>
  );
}
