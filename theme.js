import { StyleSheet, Appearance } from 'react-native';
import { oggiLocale, daIsoLocale } from './utile';

export {
  ALLERGENI, aNumero, numeroPerCampo, oggiLocale, isoLocale, piuGiorni, giornoDi, arrotonda, escHtml,
} from './utile';

// Tavolozza della suite (Material Design 3, dal mockup approvato l'8/10/2026): verdi oliva e un accento terracotta.
const CHIARO = {
  bg: '#F6F5EC',            // fondo delle schermate
  card: '#FFFFFF',
  campo: '#FFFFFF',         // fondo dei campi di testo
  contenitore: '#ECEBDD',   // superfici in secondo piano: barra in basso, tasti neutri, selettori
  primary: '#2F4F23',
  primaryDark: '#1A3310',   // testo sopra primarySoft
  primarySoft: '#D7E8C6',
  text: '#1B1D17',
  muted: '#5B5F52',
  border: '#E4E3D6',
  danger: '#B3261E',
  dangerSoft: '#FBE9E7',
  warning: '#8A4B00',
  warningSoft: '#FBEBD5',
  ok: '#2F6B2A',
  accent: '#6B8F54',
  // bordo dei campi (visibile: contrasto 3:1 sul bianco) e testo dei segnaposto
  bordoCampo: '#8A8E7E',
  segnaposto: '#6A6E60',
  campoErrore: '#FFF8F7',
  // colore delle azioni (pulsanti, collegamenti, scelte attive): il verde oliva principale
  azione: '#2F4F23',
  azioneDark: '#1A3310',
  azioneSoft: '#D7E8C6',
  suAzione: '#FFFFFF',      // testo e icone sopra un fondo "azione" (pulsanti pieni)
  // accento terracotta: il pulsante "Registra" e le cose che chiedono attenzione senza essere un errore
  terra: '#9C4524',
  terraSoft: '#FBDDCF',
  terraScuro: '#5C2410',    // testo sopra terraSoft
  suTerra: '#FFFFFF',
  // riquadro "Controlli di oggi" della Home
  eroe: '#2F4F23',
  suEroe: '#FFFFFF',
  suEroeTenue: '#D7E8C6',
  eroeTraccia: '#4A6E3B',
  eroePulsante: '#D7E8C6',
  suEroePulsante: '#1A3310',
};

// Tema scuro (stesso mockup, schermata "Home scura"): nel Material 3 scuro i colori d'azione diventano chiari
// e il testo che ci sta sopra scuro. Le chiavi sono le stesse del tema chiaro.
const SCURO = {
  bg: '#12140F',
  card: '#1D2017',
  campo: '#23261C',
  contenitore: '#23261C',
  primary: '#C9E0B5',
  primaryDark: '#D7E8C6',
  primarySoft: '#2C4721',
  text: '#E6E5D9',
  muted: '#B0B3A4',
  border: '#2E3226',
  danger: '#FFB4AB',
  dangerSoft: '#4A1512',
  warning: '#F2C078',
  warningSoft: '#3F2A08',
  ok: '#A6D69A',
  accent: '#8FB377',
  bordoCampo: '#8F9285',
  segnaposto: '#9A9D8E',
  campoErrore: '#3A1512',
  azione: '#C9E0B5',
  azioneDark: '#D7E8C6',
  azioneSoft: '#2C4721',
  suAzione: '#14290C',
  terra: '#F2B79C',
  terraSoft: '#5C2A14',
  terraScuro: '#FBDDCF',
  suTerra: '#4A1A06',
  eroe: '#2C4721',
  suEroe: '#E6E5D9',
  suEroeTenue: '#C9E0B5',
  eroeTraccia: '#456A36',
  eroePulsante: '#C9E0B5',
  suEroePulsante: '#14290C',
};

/** Il tema segue quello del telefono e si decide all'avvio: cambiando tema nelle impostazioni, l'app lo prende alla riapertura. */
export const TEMA_SCURO = Appearance.getColorScheme() === 'dark';
export const COLORS = TEMA_SCURO ? SCURO : CHIARO;

export const CATEGORIE_PRODOTTO = [
  'Carne', 'Pesce', 'Ortofrutta', 'Latticini', 'Salumi', 'Secco/Dispensa',
  'Surgelati', 'Bevande', 'Altro',
];

export const CONSERVAZIONE = ['ambiente', 'refrigerato', 'congelato'];
export const TIPI_PUNTO = ['frigorifero', 'congelatore', 'cella', 'abbattitore', 'banco'];
export const UNITA = ['kg', 'g', 'l', 'ml', 'pz', 'cassa', 'conf'];

export const fmtData = (iso) => {
  if (!iso) return '—';
  const d = iso.length === 10 ? daIsoLocale(iso) : new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('it-IT');
};

export const fmtDataOra = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
};

/** Data ISO (AAAA-MM-GG) → testo per i campi (gg/mm/aaaa). */
export const dataPerCampo = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');

/** Testo di un campo data → ISO. Vuoto: null. Non valida: undefined. Accetta gg/mm/aaaa, gg/mm/aa e AAAA-MM-GG. */
export const isoDaCampo = (testo) => {
  const s = String(testo || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return undefined;
  const g = Number(m[1]); const me = Number(m[2]);
  if (g < 1 || g > 31 || me < 1 || me > 12) return undefined;
  const a = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${a}-${String(me).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
};

export const giorniAllaScadenza = (iso) => {
  if (!iso) return null;
  const scad = daIsoLocale(iso);
  if (Number.isNaN(scad.getTime())) return null;
  return Math.round((scad - daIsoLocale(oggiLocale())) / 86400000);
};

export const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 44 },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
  },

  h1: { fontSize: 28, fontWeight: '700', color: COLORS.text, marginBottom: 4, letterSpacing: -0.6 },
  h2: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 10, letterSpacing: -0.2 },

  label: {
    fontSize: 13, fontWeight: '700', color: COLORS.muted, marginBottom: 6, marginTop: 14,
  },
  input: {
    borderWidth: 1, borderColor: COLORS.bordoCampo, borderRadius: 14, paddingHorizontal: 14,
    paddingVertical: 13, fontSize: 16, backgroundColor: COLORS.campo, color: COLORS.text,
  },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  btn: {
    backgroundColor: COLORS.azione, borderRadius: 26, paddingVertical: 14, paddingHorizontal: 20, minHeight: 52,
    alignItems: 'center', justifyContent: 'center', marginTop: 14,
  },
  btnText: { color: COLORS.suAzione, fontSize: 16, fontWeight: '700' },
  btnGhost: {
    borderWidth: 1, borderColor: COLORS.bordoCampo, borderRadius: 26, minHeight: 50,
    paddingVertical: 13, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginTop: 10,
  },
  btnGhostText: { color: COLORS.azione, fontSize: 15, fontWeight: '700' },

  chip: {
    paddingHorizontal: 16, paddingVertical: 12, minHeight: 46, justifyContent: 'center',
    borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.bordoCampo, marginRight: 8, marginBottom: 8, backgroundColor: COLORS.card,
  },
  chipOn: { backgroundColor: COLORS.azioneSoft, borderColor: COLORS.azione },
  chipText: { color: COLORS.text, fontSize: 15 },
  chipTextOn: { color: COLORS.azioneDark, fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },

  muted: { color: COLORS.muted, fontSize: 15, lineHeight: 21 },
  link: { color: COLORS.azione, fontWeight: '700', fontSize: 15 },
  inputErrore: { borderColor: COLORS.danger, borderWidth: 2, backgroundColor: COLORS.campoErrore },
  testoErrore: { color: COLORS.danger, fontSize: 14, fontWeight: '700', marginTop: 5 },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 44, fontSize: 15 },

  // elementi per la nuova Home
  pill: {
    alignSelf: 'flex-start', backgroundColor: COLORS.primarySoft, color: COLORS.primaryDark,
    fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, overflow: 'hidden', marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase',
    letterSpacing: 1, marginTop: 22, marginBottom: 8, marginLeft: 4,
  },
  tile: {
    backgroundColor: COLORS.card, borderRadius: 20, padding: 16, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center',
  },
  tileAccent: { width: 4, borderRadius: 4, alignSelf: 'stretch', marginRight: 12, backgroundColor: COLORS.primary },
  tileTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  tileDesc: { fontSize: 14, color: COLORS.muted, marginTop: 2 },
  chevron: { fontSize: 22, color: COLORS.muted, marginLeft: 8 },
});
