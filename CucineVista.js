/**
 * Vista 3D delle cucine: la pagina cucine/index.html dentro Vista3D.
 * Riceve `dati` (datiScena in cucine.js) e avvisa quando si tocca un frigorifero (suPosto) o un pulsante
 * (suPulsante: 'magazzino', 'produzione', 'pulizie').
 */
import React, { useCallback } from 'react';
import Vista3D from './Vista3D';

export const PAGINA_CUCINE = 'file:///android_asset/cucine/index.html';

export default function CucineVista({ dati, suPosto, suPulsante, suStato }) {
  const messaggio = useCallback((m) => {
    if (m.tipo === 'posto' && suPosto) suPosto(String(m.id));
    else if (m.tipo === 'pulsante' && suPulsante) suPulsante(String(m.id));
  }, [suPosto, suPulsante]);
  return <Vista3D pagina={PAGINA_CUCINE} funzione="__cucine" dati={dati} suMessaggio={messaggio} suStato={suStato} />;
}
