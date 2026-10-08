/**
 * Sezione Menù della suite: l'app web del Menù (cartella menu/) dentro una WebView, mostrata da PrincipaleScreen
 * sopra la barra in basso come le altre sezioni. Una volta aperta resta caricata (nascosta) quando si cambia sezione.
 * I dati stanno nel database della suite (tabella menu_dati); PDF, condivisione e WhatsApp passano da menuInvio.js.
 *
 * Proprietà: attiva (la sezione è quella mostrata), comandi (ref che riceve { indietro, salva }),
 * suEsci (il tasto indietro non ha più niente da chiudere), suVista(profonda) (schermata interna: via la barra in basso).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Linking, PixelRatio, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { COLORS, S, TEMA_SCURO } from './theme';
import { Vuoto } from './UI';
import { BUILD } from './build';
import { menuLeggi, menuChiavi, menuScrivi } from './database';
import {
  PAGINA_MENU, leggiMessaggio, rispondiArchivio, destinazione, scriptAvviso, scriptSalvato,
} from './menuPonte';

const ARCHIVIO = { leggi: menuLeggi, chiavi: menuChiavi, scrivi: menuScrivi };
// le librerie di condivisione si caricano solo quando servono: un loro problema non blocca il resto dell'app
const invio = () => require('./menuInvio');

export default function MenuScreen({ attiva = true, comandi, suEsci, suVista }) {
  const web = useRef(null);
  const caricata = useRef(false);
  const attese = useRef([]); // chi aspetta che la pagina abbia scritto le ultime modifiche
  const [giro, setGiro] = useState(0);
  const [errore, setErrore] = useState(null);

  const esegui = useCallback((script) => { if (web.current) web.current.injectJavaScript(script); }, []);
  const avvisa = useCallback((testo) => esegui(scriptAvviso(testo)), [esegui]);

  useEffect(() => { invio().pulisciCondivisi(); }, []);

  // Comandi per PrincipaleScreen.
  // indietro: il tasto indietro di Android lo gestisce prima l'app web (chiude i fogli, torna alla vista precedente).
  // salva: prima di cambiare sezione la pagina scrive le ultime modifiche (di norma lo fa dopo un quarto di secondo),
  //        così la Home legge subito il menù aggiornato; non si aspetta comunque più di un secondo e mezzo.
  useEffect(() => {
    if (!comandi) return undefined;
    comandi.current = {
      indietro: () => {
        if (!caricata.current) return false;
        esegui('window.__suiteIndietro?window.__suiteIndietro():window.ReactNativeWebView.postMessage(\'{"tipo":"indietro","gestito":false}\');true;');
        return true;
      },
      salva: () => new Promise((fatto) => {
        if (!caricata.current) { fatto(); return; }
        const fine = () => { clearTimeout(timer); attese.current = attese.current.filter((f) => f !== fine); fatto(); };
        const timer = setTimeout(fine, 1500);
        attese.current.push(fine);
        esegui('window.__suiteSalva?window.__suiteSalva():window.ReactNativeWebView.postMessage(\'{"tipo":"salvato"}\');true;');
      }),
    };
    return () => { comandi.current = null; };
  }, [comandi, esegui]);

  const messaggio = useCallback(async (evento) => {
    const m = leggiMessaggio(evento.nativeEvent.data);
    if (!m) return;
    const risposta = await rispondiArchivio(m, ARCHIVIO);
    if (risposta) { esegui(risposta); return; }
    try {
      if (m.tipo === 'indietro') {
        if (!m.gestito && suEsci) suEsci();
      } else if (m.tipo === 'salvato') {
        attese.current.slice().forEach((f) => f());
      } else if (m.tipo === 'vista') {
        if (suVista) suVista(!!m.profonda);
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
  }, [esegui, avvisa, suEsci, suVista]);

  const richiesta = useCallback((r) => {
    const dove = destinazione(r.url);
    if (dove === 'pagina') return true;
    if (dove === 'fuori') Linking.openURL(r.url).catch(() => avvisa('Nessuna app può aprire questo collegamento'));
    return false;
  }, [avvisa]);

  const ricarica = useCallback(() => {
    caricata.current = false; setErrore(null); setGiro((g) => g + 1);
    if (suVista) suVista(false);
  }, [suVista]);

  if (errore) {
    return (
      <View style={[S.screen, { justifyContent: 'center', display: attiva ? 'flex' : 'none' }]}>
        <Vuoto icona="alert-circle-outline" titolo="Il menù non si è aperto" testo={errore} azione="Riprova" onAzione={ricarica} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg, display: attiva ? 'flex' : 'none' }}>
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
        injectedJavaScriptObject={{ build: BUILD, fontScale: PixelRatio.getFontScale(), scuro: TEMA_SCURO }}
        onMessage={messaggio}
        onShouldStartLoadWithRequest={richiesta}
        onLoadEnd={() => { caricata.current = true; }}
        onError={(e) => setErrore(e.nativeEvent.description || 'Errore di caricamento')}
        // Android può chiudere il motore della pagina se la memoria scarseggia (PDF grandi): si ricarica, i dati sono già salvati
        onRenderProcessGone={ricarica}
        startInLoadingState
        renderLoading={() => (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg }}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        )}
        style={{ flex: 1, backgroundColor: COLORS.bg }}
      />
    </View>
  );
}
