/**
 * Vista 3D di una sala con i tavoli: la pagina sale/index.html dentro Vista3D.
 * Riceve `dati` (datiScenaSala in sale.js) e avvisa quando si tocca una tavolata.
 */
import React, { useCallback } from 'react';
import Vista3D from './Vista3D';

export const PAGINA_SALE = 'file:///android_asset/sale/index.html';

export default function SaleVista({ dati, suTavolata, suStato }) {
  const messaggio = useCallback((m) => { if (m.tipo === 'tavolata' && suTavolata) suTavolata(String(m.id)); }, [suTavolata]);
  return <Vista3D pagina={PAGINA_SALE} funzione="__sala" dati={dati} suMessaggio={messaggio} suStato={suStato} />;
}
