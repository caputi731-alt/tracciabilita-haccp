/**
 * Carattere della suite: Manrope, per tutti i testi dell'app.
 * React Native non ha un carattere "di tutta l'app" e su Android un carattere caricato a mano ha un file per ogni
 * spessore: qui si aggancia il disegno di Text e TextInput e, dove lo stile non indica già un carattere (per esempio
 * le icone), si sceglie il file giusto in base a fontWeight. Se qualcosa non va, i testi restano col carattere di sistema.
 */
import { Text, TextInput, StyleSheet } from 'react-native';
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

let attivo = false;

/** Da chiamare una volta, quando i file sono caricati. */
export function usaCaratteri() {
  if (attivo) return;
  attivo = true;
  for (const Componente of [Text, TextInput]) {
    const disegna = Componente && Componente.render;
    if (typeof disegna !== 'function') continue; // versione di React Native diversa dal previsto: si lascia com'è
    Componente.render = function conCarattere(props, ref) {
      try {
        const stile = StyleSheet.flatten(props.style) || {};
        if (!stile.fontFamily) {
          // lo spessore è già nel file scelto: lasciato nello stile, Android lo ingrosserebbe una seconda volta
          props = { ...props, style: [props.style, { fontFamily: carattereDi(stile.fontWeight), fontWeight: 'normal' }] };
        }
      } catch (e) { /* si disegna con le proprietà originali */ }
      return disegna.call(this, props, ref);
    };
  }
}
