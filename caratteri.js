/**
 * Carattere della suite: Manrope, per tutti i testi dell'app.
 * React Native non ha un carattere "di tutta l'app" e su Android un carattere caricato a mano ha un file per ogni
 * spessore: qui si aggancia il disegno di Text e TextInput e, dove lo stile non indica già un carattere (per esempio
 * le icone), si sceglie il file giusto in base a fontWeight. Se qualcosa non va, i testi restano col carattere di sistema.
 *
 * Nello stesso punto i testi senza un colore prendono quello del tema (COLORS.text): senza, Android li scriverebbe
 * in nero anche sul fondo scuro. Un testo dentro un altro testo non viene toccato, così eredita il colore di chi lo contiene.
 */
import React from 'react';
import { Text, TextInput, StyleSheet } from 'react-native';
import { COLORS } from './theme';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';

/** File da caricare all'avvio (vedi App.js). */
export const CARATTERI = { Manrope_500Medium, Manrope_700Bold, Manrope_800ExtraBold };

/** Nome del file di carattere per uno spessore: normale fino a 500, grassetto a 600–700, nero da 800. */
export function carattereDi(peso) {
  const n = peso === 'bold' ? 700 : peso === 'normal' || peso === undefined || peso === null ? 400 : Number(peso) || 400;
  return n >= 800 ? 'Manrope_800ExtraBold' : n >= 600 ? 'Manrope_700Bold' : 'Manrope_500Medium';
}

// React Native segnala con questo contesto se un testo sta dentro un altro testo
let Antenato = null;
try {
  const modulo = require('react-native/Libraries/Text/TextAncestor');
  Antenato = modulo && (modulo.default || modulo);
  if (!Antenato || !Antenato.Provider) Antenato = null;
} catch (e) { Antenato = null; }

let caratteriCaricati = false;

/** Da chiamare quando i file dei caratteri sono caricati: da quel momento i testi usano Manrope. */
export function usaCaratteri() {
  caratteriCaricati = true;
}

// L'aggancio avviene qui, una volta sola, prima che l'app disegni qualcosa: il modo in cui un testo viene disegnato
// non deve cambiare mentre è già sullo schermo.
for (const Componente of [Text, TextInput]) {
  const disegna = Componente && Componente.render;
  if (typeof disegna !== 'function') continue; // versione di React Native diversa dal previsto: si lascia com'è
  Componente.render = function conCarattere(props, ref) {
    // (Antenato non cambia mai dopo l'avvio: la chiamata avviene sempre o mai, come richiede React)
    const dentroUnTesto = Antenato ? React.useContext(Antenato) : false;
    try {
      const stile = StyleSheet.flatten(props.style) || {};
      const aggiunte = {};
      // lo spessore è già nel file scelto: lasciato nello stile, Android lo ingrosserebbe una seconda volta
      if (caratteriCaricati && !stile.fontFamily) { aggiunte.fontFamily = carattereDi(stile.fontWeight); aggiunte.fontWeight = 'normal'; }
      if (!stile.color && (Componente === TextInput || !dentroUnTesto)) aggiunte.color = COLORS.text;
      if (Object.keys(aggiunte).length) props = { ...props, style: [props.style, aggiunte] };
    } catch (e) { /* si disegna con le proprietà originali */ }
    return disegna.call(this, props, ref);
  };
}
