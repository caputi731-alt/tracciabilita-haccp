import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StatusBar, AppState } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { initDatabase } from './database';
import { backupAutomaticoSeServe, mettiAlSicuroFoto, pulisciFotoInutili } from './backupAutomatico';
import { COLORS, S, TEMA_SCURO } from './theme';
import { aggiornaPromemoria, ascoltaToccoNotifica } from './notifiche';
import { useFonts } from 'expo-font';
import { CARATTERI, usaCaratteri } from './caratteri';
import EventiScreen from './EventiScreen';
import GiroScreen from './GiroScreen';

import PrincipaleScreen from './PrincipaleScreen';
import FornitoriScreen from './FornitoriScreen';
import ProdottiScreen from './ProdottiScreen';
import RicevimentoScreen from './RicevimentoScreen';
import ImportaFatturaScreen from './ImportaFatturaScreen';
import CaricoMerceScreen from './CaricoMerceScreen';
import AnagraficheScreen from './AnagraficheScreen';
import DocumentiScreen from './DocumentiScreen';
import MagazzinoScreen from './MagazzinoScreen';
import PuntiControlloScreen from './PuntiControlloScreen';
import TemperatureScreen from './TemperatureScreen';
import EtichetteScreen from './EtichetteScreen';
import BackupScreen from './BackupScreen';
import ReportScreen from './ReportScreen';
import SanificazioneScreen from './SanificazioneScreen';
import NonConformitaScreen from './NonConformitaScreen';
import RicetteScreen from './RicetteScreen';
import ProduzioniScreen from './ProduzioniScreen';

const Stack = createNativeStackNavigator();
const navigazione = createNavigationContainerRef();

/** Apre una schermata da fuori (tocco su una notifica), anche se la navigazione non è ancora pronta. */
let rottaInAttesa = null;
function apriDaNotifica(rotta) {
  if (!navigazione.isReady()) { rottaInAttesa = rotta; return; }
  navigazione.navigate(rotta, { daNotifica: Date.now() });
}

export default function App() {
  const [pronto, setPronto] = useState(false);
  const [errore, setErrore] = useState(null);
  // carattere della suite: se i file non si caricano si prosegue con quello di sistema
  const [caratteriPronti, erroreCaratteri] = useFonts(CARATTERI);
  if (caratteriPronti) usaCaratteri();

  useEffect(() => {
    let scollega = () => {};
    initDatabase()
      .then(async () => {
        setPronto(true);
        scollega = ascoltaToccoNotifica(apriDaNotifica); // dopo l'avvio del database: usa le preferenze
        aggiornaPromemoria();
        await mettiAlSicuroFoto();
        await backupAutomaticoSeServe();
        pulisciFotoInutili(); // dopo il backup: le foto sono già copiate nella cartella esterna
      })
      .catch((e) => setErrore(String(e?.message || e)));
    const sub = AppState.addEventListener('change', (stato) => {
      if (stato === 'active') { backupAutomaticoSeServe(); aggiornaPromemoria(); }
    });
    return () => { sub.remove(); scollega(); };
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

  if (!pronto || (!caratteriPronti && !erroreCaratteri)) {
    return (
      <View style={[S.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigazione}
      onReady={() => { if (rottaInAttesa) { const r = rottaInAttesa; rottaInAttesa = null; apriDaNotifica(r); } }}>
      <StatusBar barStyle={TEMA_SCURO ? 'light-content' : 'dark-content'} backgroundColor={COLORS.bg} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.bg },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: 'Manrope_700Bold', fontSize: 20 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: COLORS.bg },
        }}
      >
        <Stack.Screen name="Home" component={PrincipaleScreen} options={{ headerShown: false }} />
        <Stack.Screen name="CaricoMerce" component={CaricoMerceScreen} options={{ title: 'Carico merce' }} />
        <Stack.Screen name="Ricevimento" component={RicevimentoScreen} options={{ title: 'Carico a mano' }} />
        <Stack.Screen name="ImportaFattura" component={ImportaFatturaScreen} options={{ title: 'Importa fattura PDF' }} />
        <Stack.Screen name="Magazzino" component={MagazzinoScreen} options={{ title: 'Magazzino e lotti' }} />
        <Stack.Screen name="Anagrafiche" component={AnagraficheScreen} options={{ title: 'Anagrafiche' }} />
        <Stack.Screen name="Documenti" component={DocumentiScreen} options={{ title: 'Documenti e dati' }} />
        <Stack.Screen name="Prodotti" component={ProdottiScreen} options={{ title: 'Prodotti' }} />
        <Stack.Screen name="Fornitori" component={FornitoriScreen} options={{ title: 'Fornitori' }} />
        <Stack.Screen name="PuntiControlloScreen" component={PuntiControlloScreen} options={{ title: 'Frigoriferi' }} />
        <Stack.Screen name="PuntiControllo" component={PuntiControlloScreen} options={{ title: 'Frigoriferi' }} />
        <Stack.Screen name="Temperature" component={TemperatureScreen} options={{ title: 'Temperature' }} />
        <Stack.Screen name="Etichette" component={EtichetteScreen} options={{ title: 'Etichette' }} />
        <Stack.Screen name="Backup" component={BackupScreen} options={{ title: 'Backup e dati' }} />
        {/* la rintracciabilità vive dentro il magazzino: la rotta resta per i collegamenti esistenti */}
        <Stack.Screen name="Rintracciabilita" component={MagazzinoScreen} options={{ title: 'Magazzino e lotti' }} />
        <Stack.Screen name="Report" component={ReportScreen} options={{ title: 'Report ASL' }} />
        <Stack.Screen name="Sanificazione" component={SanificazioneScreen} options={{ title: 'Sanificazione' }} />
        <Stack.Screen name="NonConformita" component={NonConformitaScreen} options={{ title: 'Non conformità' }} />
        <Stack.Screen name="Ricette" component={RicetteScreen} options={{ title: 'Ricette' }} />
        <Stack.Screen name="Produzioni" component={ProduzioniScreen} options={{ title: 'Produzioni' }} />
        <Stack.Screen name="Eventi" component={EventiScreen} options={{ title: 'Eventi' }} />
        <Stack.Screen name="Giro" component={GiroScreen} options={{ title: 'Giro di controllo' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
