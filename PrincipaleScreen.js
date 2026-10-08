/**
 * Schermata principale della suite: le sezioni "Oggi", "Magazzino", "Sale", "Menù" e "Altro" con la barra in basso.
 * Il Menù (MenuScreen.js, una pagina web) si carica la prima volta che lo si apre e poi resta pronto, nascosto,
 * quando si passa a un'altra sezione: tornandoci lo si ritrova com'era.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, BackHandler, Keyboard } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, S } from './theme';
import { Icona, Vuoto } from './UI';
import HomeScreen from './HomeScreen';
import MagazzinoScreen from './MagazzinoScreen';
import AltroScreen from './AltroScreen';
import SaleScreen from './SaleScreen';

const SEZIONI = [
  { id: 'oggi', titolo: 'Oggi', icona: 'home-variant-outline', iconaAttiva: 'home-variant' },
  { id: 'magazzino', titolo: 'Magazzino', icona: 'package-variant-closed', iconaAttiva: 'package-variant-closed' },
  { id: 'sale', titolo: 'Sale', icona: 'table-furniture', iconaAttiva: 'table-furniture' },
  { id: 'menu', titolo: 'Menù', icona: 'calendar-month-outline', iconaAttiva: 'calendar-month' },
  { id: 'altro', titolo: 'Altro', icona: 'dots-horizontal', iconaAttiva: 'dots-horizontal' },
];

/** Un problema del modulo Menù (file mancante, errore nel disegno) resta chiuso qui: il resto dell'app continua a funzionare. */
class Riparo extends React.Component {
  constructor(props) {
    super(props);
    this.state = { rotto: false };
  }

  static getDerivedStateFromError() {
    return { rotto: true };
  }

  render() {
    if (!this.state.rotto) return this.props.children;
    if (!this.props.visibile) return null;
    return (
      <View style={[S.screen, { justifyContent: 'center' }]}>
        <Vuoto icona="alert-circle-outline" titolo="Il menù non si è aperto"
          testo="Le altre sezioni funzionano normalmente." azione="Riprova" onAzione={() => this.setState({ rotto: false })} />
      </View>
    );
  }
}

/** Il modulo si legge solo quando serve; se manca qualcosa, null. */
function moduloMenu() {
  try {
    return require('./MenuScreen').default;
  } catch (e) {
    return null;
  }
}

export default function PrincipaleScreen({ navigation, route }) {
  const [sezione, setSezione] = useState('oggi');
  const [menuAperto, setMenuAperto] = useState(false); // il Menù è stato aperto almeno una volta
  const [menuProfondo, setMenuProfondo] = useState(false); // schermata interna del Menù (modifica, anteprima...)
  const [tastiera, setTastiera] = useState(false);
  const [ritorni, setRitorni] = useState(0); // quante volte si è tornati a questa schermata da un'altra
  const comandiMenu = useRef(null);
  const mostrata = useRef('oggi');
  const margini = useSafeAreaInsets();

  const vai = useCallback(async (id) => {
    if (id === 'menu') setMenuAperto(true);
    // uscendo dal Menù le ultime modifiche vengono scritte prima di mostrare il resto
    else if (mostrata.current === 'menu' && comandiMenu.current) await comandiMenu.current.salva();
    mostrata.current = id;
    setSezione(id);
  }, []);

  // tasto indietro di Android: nel Menù chiude prima quello che è aperto lì; dalle altre sezioni si torna a Oggi,
  // da Oggi si esce dall'app
  useFocusEffect(useCallback(() => { setRitorni((n) => n + 1); }, []));

  useFocusEffect(useCallback(() => {
    const ascolto = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sezione === 'oggi') return false;
      if (sezione === 'menu' && comandiMenu.current && comandiMenu.current.indietro()) return true;
      vai('oggi');
      return true;
    });
    return () => ascolto.remove();
  }, [sezione, vai]));

  // con la tastiera aperta la barra in basso lascia il posto a quello che si sta scrivendo
  useEffect(() => {
    const su = Keyboard.addListener('keyboardDidShow', () => setTastiera(true));
    const giu = Keyboard.addListener('keyboardDidHide', () => setTastiera(false));
    return () => { su.remove(); giu.remove(); };
  }, []);

  // per le sezioni la rotta "Menu" è la linguetta del Menù e "SezioneMagazzino" quella del Magazzino
  // ("Magazzino" resta la schermata a parte, con la freccia per tornare indietro)
  const naviga = useMemo(() => ({
    ...navigation,
    navigate: (rotta, parametri) => (rotta === 'Menu' ? vai('menu')
      : rotta === 'SezioneMagazzino' ? vai('magazzino') : navigation.navigate(rotta, parametri)),
  }), [navigation, vai]);

  const esciDalMenu = useCallback(() => vai('oggi'), [vai]);
  const Menu = menuAperto ? moduloMenu() : null;
  const barra = !tastiera && !(sezione === 'menu' && menuProfondo);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ flex: 1, paddingTop: margini.top, paddingBottom: barra || tastiera ? 0 : margini.bottom }}>
        {sezione === 'oggi' && <HomeScreen navigation={naviga} route={route} />}
        {sezione === 'magazzino' && (
          <>
            <Text accessibilityRole="header" style={{
              fontSize: 28, fontWeight: '700', color: COLORS.text, letterSpacing: -0.6,
              paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4,
            }}>Magazzino</Text>
            <MagazzinoScreen navigation={naviga} route={route} />
          </>
        )}
        {sezione === 'sale' && (
          <>
            <Text accessibilityRole="header" style={{
              fontSize: 28, fontWeight: '700', color: COLORS.text, letterSpacing: -0.6,
              paddingHorizontal: 20, paddingTop: 20,
            }}>Sale</Text>
            <SaleScreen navigation={naviga} route={route} />
          </>
        )}
        {menuAperto && (
          <Riparo visibile={sezione === 'menu'}>
            {Menu
              ? <Menu attiva={sezione === 'menu'} aggiorna={ritorni} comandi={comandiMenu} suEsci={esciDalMenu}
                suVista={setMenuProfondo} suApri={navigation.navigate} />
              : sezione === 'menu' && (
                <View style={[S.screen, { justifyContent: 'center' }]}>
                  <Vuoto icona="alert-circle-outline" titolo="Il menù non si è aperto" testo="Le altre sezioni funzionano normalmente." />
                </View>
              )}
          </Riparo>
        )}
        {sezione === 'altro' && <AltroScreen navigation={naviga} route={route} />}
      </View>

      {barra && (
        <View accessibilityRole="tablist" style={{
          flexDirection: 'row', backgroundColor: COLORS.contenitore, paddingTop: 12,
          paddingBottom: 12 + margini.bottom,
        }}>
          {SEZIONI.map((s) => {
            const attiva = s.id === sezione;
            return (
              <TouchableOpacity key={s.id} onPress={() => vai(s.id)} activeOpacity={0.7}
                accessibilityRole="tab" accessibilityState={{ selected: attiva }} accessibilityLabel={s.titolo}
                style={{ flex: 1, alignItems: 'center', minHeight: 56, justifyContent: 'center' }}>
                <View style={{
                  width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
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
      )}
    </View>
  );
}
