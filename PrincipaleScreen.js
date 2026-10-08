/**
 * Schermata principale della suite: le sezioni "Oggi", "Magazzino" e "Altro" con la barra in basso.
 * "Menù" apre il modulo Menù a tutto schermo (ha già la sua barra in basso).
 */
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from './theme';
import { Icona } from './UI';
import HomeScreen from './HomeScreen';
import MagazzinoScreen from './MagazzinoScreen';
import AltroScreen from './AltroScreen';

const SEZIONI = [
  { id: 'oggi', titolo: 'Oggi', icona: 'home-variant-outline', iconaAttiva: 'home-variant' },
  { id: 'magazzino', titolo: 'Magazzino', icona: 'package-variant-closed', iconaAttiva: 'package-variant-closed' },
  { id: 'menu', titolo: 'Menù', icona: 'calendar-month-outline', iconaAttiva: 'calendar-month' },
  { id: 'altro', titolo: 'Altro', icona: 'dots-horizontal', iconaAttiva: 'dots-horizontal' },
];

export default function PrincipaleScreen({ navigation, route }) {
  const [sezione, setSezione] = useState('oggi');
  const margini = useSafeAreaInsets();

  // tasto indietro di Android: da Magazzino o Altro si torna a Oggi, da Oggi si esce dall'app
  useFocusEffect(useCallback(() => {
    const ascolto = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sezione === 'oggi') return false;
      setSezione('oggi');
      return true;
    });
    return () => ascolto.remove();
  }, [sezione]));

  const scegli = (id) => {
    if (id === 'menu') navigation.navigate('Menu');
    else setSezione(id);
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ flex: 1, paddingTop: margini.top }}>
        {sezione === 'oggi' && <HomeScreen navigation={navigation} route={route} />}
        {sezione === 'magazzino' && (
          <>
            <Text accessibilityRole="header" style={{
              fontSize: 28, fontWeight: '700', color: COLORS.text, letterSpacing: -0.6,
              paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4,
            }}>Magazzino</Text>
            <MagazzinoScreen navigation={navigation} route={route} />
          </>
        )}
        {sezione === 'altro' && <AltroScreen navigation={navigation} route={route} />}
      </View>

      <View accessibilityRole="tablist" style={{
        flexDirection: 'row', backgroundColor: COLORS.contenitore, paddingTop: 12,
        paddingBottom: 12 + margini.bottom,
      }}>
        {SEZIONI.map((s) => {
          const attiva = s.id === sezione;
          return (
            <TouchableOpacity key={s.id} onPress={() => scegli(s.id)} activeOpacity={0.7}
              accessibilityRole="tab" accessibilityState={{ selected: attiva }} accessibilityLabel={s.titolo}
              style={{ flex: 1, alignItems: 'center', minHeight: 56, justifyContent: 'center' }}>
              <View style={{
                width: 64, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                backgroundColor: attiva ? COLORS.primarySoft : 'transparent',
              }}>
                <Icona nome={attiva ? s.iconaAttiva : s.icona} size={24} colore={attiva ? COLORS.primaryDark : COLORS.muted} />
              </View>
              <Text style={{
                fontSize: 13, marginTop: 4, fontWeight: attiva ? '700' : '500',
                color: attiva ? COLORS.primaryDark : COLORS.muted,
              }}>{s.titolo}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
