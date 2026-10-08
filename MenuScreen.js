/**
 * Modulo Menù (prototipo, tappa 1 della suite): l'app web del Menù, cartella menu/, dentro una WebView.
 * I dati stanno nel database della suite (tabella menu_dati); PDF, condivisione e WhatsApp passano da menuInvio.js.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, BackHandler, Linking, PixelRatio, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, S } from './theme';
import { Vuoto } from './UI';
import { BUILD } from './build';
import { menuLeggi, menuChiavi, menuScrivi } from './database';
import {
  PAGINA_MENU, leggiMessaggio, rispondiArchivio, destinazione, scriptAvviso, scriptSalvato,
} from './menuPonte';

const ARCHIVIO = { leggi: menuLeggi, chiavi: menuChiavi, scrivi: menuScrivi };
// le librerie di condivisione si caricano solo quando servono: un loro problema non blocca il resto dell'app
const invio = () => require('./menuInvio');

export default function MenuScreen({ navigation }) {
  const web = useRef(null);
  const caricata = useRef(false);
  const uscita = useRef(null); // { azione, timer } mentre la pagina scrive le ultime modifiche
  const [giro, setGiro] = useState(0);
  const [errore, setErrore] = useState(null);

  const esegui = useCallback((script) => { if (web.current) web.current.injectJavaScript(script); }, []);
  const avvisa = useCallback((testo) => esegui(scriptAvviso(testo)), [esegui]);

  useEffect(() => { invio().pulisciCondivisi(); }, []);

  // prima di lasciare la schermata la pagina salva le ultime modifiche (di norma lo fa dopo un quarto di secondo)
  useEffect(() => navigation.addListener('beforeRemove', (e) => {
    if (!caricata.current || uscita.current === 'fatto') return;
    e.preventDefault();
    if (uscita.current) return;
    const azione = e.data.action;
    const esci = () => {
      if (uscita.current && uscita.current !== 'fatto') clearTimeout(uscita.current.timer);
      uscita.current = 'fatto';
      navigation.dispatch(azione);
    };
    uscita.current = { esci, timer: setTimeout(esci, 1500) };
    esegui('window.__suiteSalva?window.__suiteSalva():window.ReactNativeWebView.postMessage(\'{"tipo":"salvato"}\');true;');
  }), [navigation, esegui]);

  // tasto indietro di Android: prima lo gestisce l'app web (chiude i fogli, torna alla vista precedente)
  useFocusEffect(useCallback(() => {
    const ascolto = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!caricata.current) return false;
      esegui('window.__suiteIndietro?window.__suiteIndietro():window.ReactNativeWebView.postMessage(\'{"tipo":"indietro","gestito":false}\');true;');
      return true;
    });
    return () => ascolto.remove();
  }, [esegui]));

  const messaggio = useCallback(async (evento) => {
    const m = leggiMessaggio(evento.nativeEvent.data);
    if (!m) return;
    const risposta = await rispondiArchivio(m, ARCHIVIO);
    if (risposta) { esegui(risposta); return; }
    try {
      if (m.tipo === 'indietro') {
        if (!m.gestito) navigation.goBack();
      } else if (m.tipo === 'salvato') {
        if (uscita.current && uscita.current !== 'fatto') uscita.current.esci();
      } else if (m.tipo === 'saveFile') {
        await invio().apriOCondividi(m);
      } else if (m.tipo === 'saveAs') {
        let scritto = false;
        try { scritto = await invio().salvaConNome(m); } catch (e) { scritto = false; }
        esegui(scriptSalvato(m.token, scritto));
      } else if (m.tipo === 'shareFiles') {
        const copiato = await invio().inviaFile(m.json);
        if (copiato) avvisa('Messaggio copiato: se non compare, tieni premuto e scegli Incolla');
      } else if (m.tipo === 'errore') {
        console.warn('Menù:', m.testo);
      }
    } catch (e) {
      avvisa(m.tipo === 'shareFiles' ? 'Non è stato possibile inviare i file' : 'Non è stato possibile preparare il file');
    }
  }, [esegui, avvisa, navigation]);

  const richiesta = useCallback((r) => {
    const dove = destinazione(r.url);
    if (dove === 'pagina') return true;
    if (dove === 'fuori') Linking.openURL(r.url).catch(() => avvisa('Nessuna app può aprire questo collegamento'));
    return false;
  }, [avvisa]);

  const ricarica = useCallback(() => { caricata.current = false; setErrore(null); setGiro((g) => g + 1); }, []);

  if (errore) {
    return (
      <View style={[S.screen, { justifyContent: 'center' }]}>
        <Vuoto icona="alert-circle-outline" titolo="Il menù non si è aperto" testo={errore} azione="Riprova" onAzione={ricarica} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FAFAF6' }}>
      <WebView
        key={giro}
        ref={web}
        source={{ uri: PAGINA_MENU }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        // il menù è una pagina a misura fissa: il testo di sistema ingrandito lo sformerebbe
        textZoom={100}
        setBuiltInZoomControls={false}
        setSupportMultipleWindows={false}
        overScrollMode="never"
        injectedJavaScriptObject={{ build: BUILD, fontScale: PixelRatio.getFontScale() }}
        onMessage={messaggio}
        onShouldStartLoadWithRequest={richiesta}
        onLoadEnd={() => { caricata.current = true; }}
        onError={(e) => setErrore(e.nativeEvent.description || 'Errore di caricamento')}
        // Android può chiudere il motore della pagina se la memoria scarseggia (PDF grandi): si ricarica, i dati sono già salvati
        onRenderProcessGone={ricarica}
        startInLoadingState
        renderLoading={() => (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAF6' }}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        )}
        style={{ flex: 1, backgroundColor: '#FAFAF6' }}
      />
    </View>
  );
}
