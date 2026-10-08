/**
 * Schermata principale della suite: le sezioni "Cucina", "Sala", "Gestione" e "Altro" con la barra in basso.
 * Cucina è la mappa delle cucine (HomeScreen.js); Gestione ha due parti, Menù e Incassi.
 * Il Menù (MenuScreen.js, una pagina web) si carica la prima volta che lo si apre e poi resta pronto, nascosto,
 * quando si passa a un'altra sezione o agli Incassi: tornandoci lo si ritrova com'era.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, BackHandler, Keyboard } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, S } from './theme';
import { Icona, Vuoto, Segmenti } from './UI';
import HomeScreen from './HomeScreen';
import AltroScreen from './AltroScreen';
import SaleScreen from './SaleScreen';
import IncassiScreen from './IncassiScreen';

const SEZIONI = [
  { id: 'oggi', titolo: 'Cucina', icona: 'silverware-fork-knife', iconaAttiva: 'silverware-fork-knife' },
  { id: 'sale', titolo: 'Sala', icona: 'table-furniture', iconaAttiva: 'table-furniture' },
  { id: 'gestione', titolo: 'Gestione', icona: 'calendar-month-outline', iconaAttiva: 'calendar-month' },
  { id: 'altro', titolo: 'Altro', icona: 'dots-horizontal', iconaAttiva: 'dots-horizontal' },
];
// le due parti di Gestione
const GESTIONE = ['Menù', 'Incassi'];

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
  const parteOra = useRef(GESTIONE[0]);
  const margini = useSafeAreaInsets();

  const [parte, setParte] = useState(GESTIONE[0]); // parte di Gestione mostrata

  /** Va a una sezione; `quale` sceglie la parte di Gestione. "menu" è quello che si vede quando il Menù è davanti. */
  const vai = useCallback(async (id, quale = null) => {
    const nuova = id === 'gestione' ? (quale || parteOra.current) : null;
    const arrivo = id === 'gestione' && nuova === GESTIONE[0] ? 'menu' : id === 'gestione' ? 'incassi' : id;
    if (arrivo === 'menu') setMenuAperto(true);
    // uscendo dal Menù le ultime modifiche vengono scritte prima di mostrare il resto
    else if (mostrata.current === 'menu' && comandiMenu.current) await comandiMenu.current.salva();
    mostrata.current = arrivo;
    if (nuova) { parteOra.current = nuova; setParte(nuova); }
    setSezione(id);
  }, []);

  // tasto indietro di Android: nel Menù chiude prima quello che è aperto lì; dalle altre sezioni si torna a Cucina,
  // da Cucina si esce dall'app
  useFocusEffect(useCallback(() => { setRitorni((n) => n + 1); }, []));

  useFocusEffect(useCallback(() => {
    const ascolto = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sezione === 'oggi') return false;
      if (sezione === 'gestione' && parte === GESTIONE[0] && comandiMenu.current && comandiMenu.current.indietro()) return true;
      vai('oggi');
      return true;
    });
    return () => ascolto.remove();
  }, [sezione, parte, vai]));

  // con la tastiera aperta la barra in basso lascia il posto a quello che si sta scrivendo
  useEffect(() => {
    const su = Keyboard.addListener('keyboardDidShow', () => setTastiera(true));
    const giu = Keyboard.addListener('keyboardDidHide', () => setTastiera(false));
    return () => { su.remove(); giu.remove(); };
  }, []);

  // per le sezioni la rotta "Menu" è Gestione → Menù; "SezioneMagazzino" (il pavimento della cucina) è il Magazzino
  const naviga = useMemo(() => ({
    ...navigation,
    navigate: (rotta, parametri) => (rotta === 'Menu' ? vai('gestione', GESTIONE[0])
      : navigation.navigate(rotta === 'SezioneMagazzino' ? 'Magazzino' : rotta, parametri)),
  }), [navigation, vai]);

  const esciDalMenu = useCallback(() => vai('oggi'), [vai]);
  const Menu = menuAperto ? moduloMenu() : null;
  const nelMenu = sezione === 'gestione' && parte === GESTIONE[0];
  const barra = !tastiera && !(nelMenu && menuProfondo);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ flex: 1, paddingTop: margini.top, paddingBottom: barra || tastiera ? 0 : margini.bottom }}>
        {sezione === 'oggi' && <HomeScreen navigation={naviga} route={route} />}
        {sezione === 'sale' && (
          <>
            <Text accessibilityRole="header" style={{
              fontSize: 28, fontWeight: '700', color: COLORS.text, letterSpacing: -0.6,
              paddingHorizontal: 20, paddingTop: 20,
            }}>Sala</Text>
            <SaleScreen navigation={naviga} route={route} />
          </>
        )}
        {/* Gestione: le due linguette spariscono nelle schermate interne del Menù, che usa tutto lo schermo */}
        {sezione === 'gestione' && !(nelMenu && menuProfondo) && (
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
            <Segmenti opzioni={GESTIONE} valore={parte} onChange={(v) => vai('gestione', v)} />
          </View>
        )}
        {menuAperto && (
          <Riparo visibile={nelMenu}>
            {Menu
              ? <Menu attiva={nelMenu} aggiorna={ritorni} comandi={comandiMenu} suEsci={esciDalMenu}
                suVista={setMenuProfondo} suApri={navigation.navigate} />
              : nelMenu && (
                <View style={[S.screen, { justifyContent: 'center' }]}>
                  <Vuoto icona="alert-circle-outline" titolo="Il menù non si è aperto" testo="Le altre sezioni funzionano normalmente." />
                </View>
              )}
          </Riparo>
        )}
        {sezione === 'gestione' && parte === GESTIONE[1] && <IncassiScreen navigation={naviga} route={route} />}
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
