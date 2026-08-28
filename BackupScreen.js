import React, { useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { S, COLORS } from './theme';
import { Bottone, conferma } from './UI';
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
              'Ripristino completato',
              'Chiudi e riapri l\'app per vedere i dati ripristinati.'
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
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <Text style={S.h1}>Backup e sicurezza dati</Text>
      <Text style={[S.muted, { marginBottom: 16 }]}>
        I dati vivono solo su questo dispositivo. Esporta un backup con regolarità e
        conservalo altrove (Drive, email, chiavetta): se il telefono si rompe o si
        perde, è l'unico modo per non perdere la tracciabilità.
      </Text>

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
  );
}
