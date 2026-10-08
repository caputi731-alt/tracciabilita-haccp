// Solo per l'anteprima nel browser: un finto motore di cifratura, quanto basta per aprire con un PIN di prova le schermate
// protette (incassi, costi). NON è sicuro e non finisce nell'APK: sul telefono lavora react-native-aes-crypto.
const finta = (testo) => {
  let h = 2166136261;
  let out = '';
  for (let giro = 0; out.length < 64; giro++) {
    const t = `${giro}|${testo}`;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    out += h.toString(16).padStart(8, '0');
  }
  return out.slice(0, 64);
};
module.exports = {
  __esModule: true,
  default: {
    pbkdf2: async (pin, sale) => finta(`${pin}:${sale}`),
    randomKey: async (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(''),
  },
  finta,
};
