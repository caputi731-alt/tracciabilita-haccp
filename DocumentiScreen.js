import React, { useState } from 'react';
import { View } from 'react-native';
import { S } from './theme';
import { Chips } from './UI';
import ReportScreen from './ReportScreen';
import BackupScreen from './BackupScreen';

const SCHEDE = { 'Registri PDF': ReportScreen, 'Backup e dati': BackupScreen };

export default function DocumentiScreen({ route }) {
  const [scheda, setScheda] = useState(route?.params?.scheda || 'Registri PDF');
  const Corrente = SCHEDE[scheda] || ReportScreen;
  return (
    <View style={S.screen}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Chips opzioni={Object.keys(SCHEDE)} valore={scheda} onChange={setScheda} />
      </View>
      <View style={{ flex: 1 }}>
        <Corrente />
      </View>
    </View>
  );
}
