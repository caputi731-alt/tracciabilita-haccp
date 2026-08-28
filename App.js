import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { initDatabase } from './database';
import { COLORS, S } from './theme';

import HomeScreen from './HomeScreen';
import FornitoriScreen from './FornitoriScreen';
import ProdottiScreen from './ProdottiScreen';
import RicevimentoScreen from './RicevimentoScreen';
import MagazzinoScreen from './MagazzinoScreen';
import PuntiControlloScreen from './PuntiControlloScreen';
import TemperatureScreen from './TemperatureScreen';
import EtichetteScreen from './EtichetteScreen';
import BackupScreen from './BackupScreen';
import RintracciabilitaScreen from './RintracciabilitaScreen';
import ReportScreen from './ReportScreen';
import SanificazioneScreen from './SanificazioneScreen';
import NonConformitaScreen from './NonConformitaScreen';
import RicetteScreen from './RicetteScreen';
import ProduzioniScreen from './ProduzioniScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [pronto, setPronto] = useState(false);
  const [errore, setErrore] = useState(null);

  useEffect(() => {
    initDatabase().then(() => setPronto(true)).catch((e) => setErrore(e.message));
  }, []);

  if (errore) {
    return (
      <View style={[S.screen, { justifyContent: 'center', padding: 24 }]}>
        <Text style={{ color: COLORS.danger, textAlign: 'center' }}>
          Errore di avvio del database:{'\n'}{errore}
        </Text>
      </View>
    );
  }

  if (!pronto) {
    return (
      <View style={[S.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: COLORS.bg },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Tracciabilità HACCP' }} />
        <Stack.Screen name="Ricevimento" component={RicevimentoScreen} options={{ title: 'Ricevimento merce' }} />
        <Stack.Screen name="Magazzino" component={MagazzinoScreen} options={{ title: 'Magazzino' }} />
        <Stack.Screen name="Prodotti" component={ProdottiScreen} options={{ title: 'Prodotti' }} />
        <Stack.Screen name="Fornitori" component={FornitoriScreen} options={{ title: 'Fornitori' }} />
        <Stack.Screen name="PuntiControlloScreen" component={PuntiControlloScreen} options={{ title: 'Frigoriferi' }} />
        <Stack.Screen name="PuntiControllo" component={PuntiControlloScreen} options={{ title: 'Frigoriferi' }} />
        <Stack.Screen name="Temperature" component={TemperatureScreen} options={{ title: 'Temperature' }} />
        <Stack.Screen name="Etichette" component={EtichetteScreen} options={{ title: 'Etichette' }} />
        <Stack.Screen name="Backup" component={BackupScreen} options={{ title: 'Backup e dati' }} />
        <Stack.Screen name="Rintracciabilita" component={RintracciabilitaScreen} options={{ title: 'Rintracciabilità' }} />
        <Stack.Screen name="Report" component={ReportScreen} options={{ title: 'Report ASL' }} />
        <Stack.Screen name="Sanificazione" component={SanificazioneScreen} options={{ title: 'Sanificazione' }} />
        <Stack.Screen name="NonConformita" component={NonConformitaScreen} options={{ title: 'Non conformità' }} />
        <Stack.Screen name="Ricette" component={RicetteScreen} options={{ title: 'Ricette' }} />
        <Stack.Screen name="Produzioni" component={ProduzioniScreen} options={{ title: 'Produzioni' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
