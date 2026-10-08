/**
 * Una pagina 3D (three.js) dentro una WebView: la base comune di CucineVista.js e SaleVista.js.
 * Manda `dati` alla pagina chiamando la sua funzione globale (`funzione`), passa a `suMessaggio` quello che la pagina
 * manda indietro, e chiama suStato('ok') quando la pagina è pronta oppure suStato('no') se il telefono non riesce a
 * disegnare il 3D, se la pagina dà errore o se non parte entro qualche secondo: chi la usa mostra allora l'alternativa.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { COLORS } from './theme';

const ATTESA = 8000;

/** Dati → script da eseguire nella pagina (i separatori di riga Unicode romperebbero lo script). */
export const scriptDati = (funzione, dati) => `window.${funzione}&&window.${funzione}(${JSON.stringify(dati)
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029').replace(/<\/(script)/gi, '<\\/$1')});true;`;

export default function Vista3D({ pagina, funzione, dati, suMessaggio, suStato }) {
  const web = useRef(null);
  const pronta = useRef(false);
  const ultimi = useRef(dati);
  ultimi.current = dati;

  const manda = useCallback(() => {
    if (pronta.current && web.current) web.current.injectJavaScript(scriptDati(funzione, ultimi.current));
  }, [funzione]);
  useEffect(() => { manda(); }, [dati, manda]);

  // se la pagina non risponde, meglio l'alternativa che un riquadro vuoto
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
    else if (suMessaggio) suMessaggio(m);
  }, [manda, suMessaggio, suStato]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.contenitore }}>
      <WebView
        ref={web}
        source={{ uri: pagina }}
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
