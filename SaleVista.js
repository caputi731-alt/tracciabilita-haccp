/**
 * Vista 3D di una sala con i tavoli: la pagina sale/index.html dentro Vista3D.
 * Riceve `dati` (datiScenaSala per una sala, datiScenaSale per più sale insieme) e avvisa quando si tocca una tavolata
 * o quando la si trascina in un altro punto.
 */
import React, { useCallback } from 'react';
import Vista3D from './Vista3D';

export const PAGINA_SALE = 'file:///android_asset/sale/index.html';

export default function SaleVista({ dati, suTavolata, suSposta, suStato }) {
  const messaggio = useCallback((m) => {
    if (m.tipo === 'tavolata' && suTavolata) suTavolata(String(m.id));
    // una prenotazione tenuta premuta e trascinata: dove è stata lasciata (sala e punto, in metri)
    else if (m.tipo === 'sposta' && suSposta && Number.isFinite(m.x) && Number.isFinite(m.y)) suSposta({ id: String(m.id), sala: String(m.sala), x: m.x, y: m.y });
  }, [suTavolata, suSposta]);
  return <Vista3D pagina={PAGINA_SALE} funzione="__sala" dati={dati} suMessaggio={messaggio} suStato={suStato} />;
}
