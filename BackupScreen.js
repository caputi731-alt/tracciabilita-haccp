import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { S, COLORS } from './theme';
import { Bottone, conferma, useAvviso } from './UI';
import { statoBackup, scegliCartellaBackup, eseguiBackup, MAX_COPIE } from './backupAutomatico';
import { esportaTutto, importaTutto, csvRegistroCarichi, csvTabella } from './database';

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

async function scriviECondividi(nomeFile, contenuto, mime) {
  const uri = FileSystem.documentDirectory + nomeFile;
  await FileSystem.writeAsStringAsync(uri, contenuto, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: nomeFile });
  } else {
    Alert.alert('Salvato', `File creato: ${nomeFile}`);
  }
  return uri;
}

export default function BackupScreen() {
  const [occupato, setOccupato] = useState(false);
  const [stato, setStato] = useState(null);
  const { avviso, mostra } = useAvviso();

  const aggiornaStato = useCallback(() => { statoBackup().then(setStato); }, []);
  useFocusEffect(aggiornaStato);

  const attiva = async () => {
    try {
      const ok = await scegliCartellaBackup();
      if (!ok) return;
      setOccupato(true);
      await eseguiBackup();
      mostra('Backup automatico attivo ✓');
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
      const csv = await csvTabella('registro_temperature');
      if (!csv) return Alert.alert('Vuoto', 'Non ci sono rilevazioni da esportare.');
      await scriviECondividi(`registro-temperature-${stamp()}.csv`, csv, 'text/csv');
    } catch (e) {
      Alert.alert('Errore export', String(e?.message || e));
    } finally {
      setOccupato(false);
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
      const dump = JSON.parse(testo);
      conferma(
        'Ripristinare questo backup?',
        'Tutti i dati attuali verranno sostituiti con quelli del file scelto. Operazione non annullabile.',
        async () => {
          try {
            setOccupato(true);
            await importaTutto(dump);
            Alert.alert(
              'Ripristino completato ✓',
              'Tutti i dati del backup sono stati caricati. Torna alla Home per vederli.'
            );
          } catch (e) {
            Alert.alert('Errore ripristino', String(e?.message || e));
          } finally {
            setOccupato(false);
          }
        }
      );
    } catch (e) {
      Alert.alert('Errore lettura file', String(e?.message || e));
    }
  };

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
            <Bottone testo="Fai un backup adesso" onPress={oraSubito} />
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
        <Text style={[S.muted, { marginTop: 10 }]}>
          Per avere una copia anche fuori dal telefono, ogni tanto usa "Esporta backup completo" e
          invialo a Drive o via email.
        </Text>
      </View>

      <View style={S.card}>
        <Text style={S.h2}>Backup completo</Text>
        <Text style={S.muted}>
          Salva tutti i dati in un unico file. Serve anche per spostare tutto su un
          altro dispositivo.
        </Text>
        <Bottone testo="Esporta backup completo" onPress={backupJson} />
        <Bottone testo="Ripristina da un backup" ghost onPress={ripristina} />
      </View>

      <View style={S.card}>
        <Text style={S.h2}>Export per ASL / commercialista</Text>
        <Text style={S.muted}>Fogli Excel/CSV apribili con qualsiasi programma.</Text>
        <Bottone testo="Registro carichi (CSV)" ghost onPress={exportCarichi} />
        <Bottone testo="Registro temperature (CSV)" ghost onPress={exportTemperature} />
      </View>

      {occupato && <Text style={[S.muted, { textAlign: 'center' }]}>Attendi…</Text>}

      <Text style={[S.muted, { marginTop: 12 }]}>
        Nota: per ora il backup contiene tutti i dati inseriti, ma non ancora le foto
        dei documenti. La copia delle foto arriverà in un aggiornamento successivo.
      </Text>
    </ScrollView>
    {avviso}
    </View>
  );
}
