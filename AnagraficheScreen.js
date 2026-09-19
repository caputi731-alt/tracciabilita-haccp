import React, { useState } from 'react';
import { View } from 'react-native';
import { S } from './theme';
import { Chips } from './UI';
import ProdottiScreen from './ProdottiScreen';
import FornitoriScreen from './FornitoriScreen';
import RicetteScreen from './RicetteScreen';
import PuntiControlloScreen from './PuntiControlloScreen';

const SCHEDE = {
  Prodotti: ProdottiScreen,
  Fornitori: FornitoriScreen,
  Ricette: RicetteScreen,
  Frigoriferi: PuntiControlloScreen,
};

export default function AnagraficheScreen({ route }) {
  const [scheda, setScheda] = useState(route?.params?.scheda || 'Prodotti');
  const Corrente = SCHEDE[scheda] || ProdottiScreen;
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
