/**
 * Vista 3D delle cucine: la pagina cucine/index.html (three.js) dentro una WebView.
 * Riceve `dati` (datiScena in cucine.js) e avvisa quando si tocca un'attrezzatura o il pavimento.
 * Se il telefono non riesce a disegnare il 3D (o la pagina non parte entro qualche secondo) chiama suStato('no'):
 * chi la usa mostra allora la schermata di sempre.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { COLORS } from './theme';

export const PAGINA_CUCINE = 'file:///android_asset/cucine/index.html';
const ATTESA = 8000;

/** Dati → script da eseguire nella pagina (i separatori di riga Unicode romperebbero lo script). */
const scriptDati = (dati) => `window.__cucine&&window.__cucine(${JSON.stringify(dati)
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029').replace(/<\/(script)/gi, '<\\/$1')});true;`;

export default function CucineVista({ dati, suPosto, suPavimento, suStato }) {
  const web = useRef(null);
  const pronta = useRef(false);
  const ultimi = useRef(dati);
  ultimi.current = dati;

  const manda = useCallback(() => {
    if (pronta.current && web.current) web.current.injectJavaScript(scriptDati(ultimi.current));
  }, []);
  useEffect(() => { manda(); }, [dati, manda]);

  // se la pagina non risponde, meglio la schermata di sempre che un riquadro vuoto
  useEffect(() => {
    const t = setTimeout(() => { if (!pronta.current && suStato) suStato('no'); }, ATTESA);
    return () => clearTimeout(t);
  }, [suStato]);

  const messaggio = useCallback((evento) => {
    let m = null;
    try { m = JSON.parse(evento.nativeEvent.data); } catch (e) { return; }
    if (!m || typeof m.tipo !== 'string') return;
    if (m.tipo === 'pronta') { pronta.current = true; manda(); if (suStato) suStato('ok'); }
    else if (m.tipo === 'senza3d' || m.tipo === 'errore') { if (suStato) suStato('no'); }
    else if (m.tipo === 'posto' && suPosto) suPosto(String(m.id));
    else if (m.tipo === 'pavimento' && suPavimento) suPavimento(String(m.cucina));
  }, [manda, suPosto, suPavimento, suStato]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.contenitore }}>
      <WebView
        ref={web}
        source={{ uri: PAGINA_CUCINE }}
        originWhitelist={['*']}
        javaScriptEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        textZoom={100}
        setBuiltInZoomControls={false}
        setSupportMultipleWindows={false}
        overScrollMode="never"
        scrollEnabled={false}
        nestedScrollEnabled={false}
        onMessage={messaggio}
        onShouldStartLoadWithRequest={(r) => String(r.url).startsWith('file:///android_asset/')}
        onError={() => { if (suStato) suStato('no'); }}
        onRenderProcessGone={() => { pronta.current = false; if (suStato) suStato('no'); }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
      />
    </View>
  );
}
