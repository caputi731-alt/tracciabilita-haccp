import { StyleSheet, Appearance } from 'react-native';
import { oggiLocale, daIsoLocale } from './utile';

export {
  ALLERGENI, aNumero, numeroPerCampo, oggiLocale, isoLocale, piuGiorni, giornoDi, arrotonda, escHtml,
} from './utile';

// Tavolozza della suite (proposta A "pulito professionale", approvata da Luca il 20/10/2026): grigi chiari, un verde deciso
// per le azioni e un ambra per le cose da fare. Prima era verde oliva e terracotta (mockup dell'8/10/2026).
const CHIARO = {
  bg: '#F5F6F8',            // fondo delle schermate
  card: '#FFFFFF',
  campo: '#FFFFFF',         // fondo dei campi di testo
  contenitore: '#EEF0F3',   // superfici in secondo piano: tasti neutri, selettori
  primary: '#1E6B4A',
  primaryDark: '#14513A',   // testo sopra primarySoft
  primarySoft: '#E3F1EA',
  text: '#12161C',
  muted: '#5A6370',
  border: '#E2E5EA',
  danger: '#B3261E',
  dangerSoft: '#FBE9E7',
  warning: '#8A4B00',
  warningSoft: '#FDF1DF',
  ok: '#1E6B4A',
  accent: '#3D8A66',
  // bordo dei campi (visibile: contrasto 3:1 sul bianco) e testo dei segnaposto
  bordoCampo: '#8A929C',
  segnaposto: '#5F6873',
  campoErrore: '#FFF8F7',
  // colore delle azioni (pulsanti, collegamenti, scelte attive)
  azione: '#1E6B4A',
  azioneDark: '#14513A',
  azioneSoft: '#E3F1EA',
  suAzione: '#FFFFFF',      // testo e icone sopra un fondo "azione" (pulsanti pieni)
  // accento ambra (la chiave resta "terra" per non cambiare le schermate): le cose che chiedono attenzione senza essere un errore
  terra: '#A15C07',
  terraSoft: '#FDF1DF',
  terraScuro: '#6B3D04',    // testo sopra terraSoft
  suTerra: '#FFFFFF',
  // riquadro "Controlli di oggi" della Home
  eroe: '#1E6B4A',
  suEroe: '#FFFFFF',
  suEroeTenue: '#CDE7DA',
  eroeTraccia: '#3D8A66',
  eroePulsante: '#E3F1EA',
  suEroePulsante: '#14513A',
};

// Tema scuro: stesse chiavi del tema chiaro; i colori d'azione diventano chiari e il testo che ci sta sopra scuro.
const SCURO = {
  bg: '#0F1215',
  card: '#191D22',
  campo: '#20252B',
  contenitore: '#20252B',
  primary: '#7FD1A8',
  primaryDark: '#A6E3C4',
  primarySoft: '#1D3B2E',
  text: '#E8EAED',
  muted: '#A9B1BA',
  border: '#2A3038',
  danger: '#FFB4AB',
  dangerSoft: '#4A1512',
  warning: '#F2C078',
  warningSoft: '#3F2A08',
  ok: '#7FD1A8',
  accent: '#5DB58A',
  bordoCampo: '#8A929C',
  segnaposto: '#9AA3AD',
  campoErrore: '#3A1512',
  azione: '#7FD1A8',
  azioneDark: '#A6E3C4',
  azioneSoft: '#1D3B2E',
  suAzione: '#0B2A1C',
  terra: '#F2B866',
  terraSoft: '#4A3010',
  terraScuro: '#FCE3C0',
  suTerra: '#3A2200',
  eroe: '#1D3B2E',
  suEroe: '#E8EAED',
  suEroeTenue: '#A6E3C4',
  eroeTraccia: '#2E5A45',
  eroePulsante: '#7FD1A8',
  suEroePulsante: '#0B2A1C',
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
  },

  h1: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginBottom: 4, letterSpacing: -0.4 },
  h2: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 10, letterSpacing: -0.2 },

  label: {
    fontSize: 13, fontWeight: '600', color: COLORS.muted, marginBottom: 6, marginTop: 14,
  },
  input: {
    borderWidth: 1, borderColor: COLORS.bordoCampo, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 13, fontSize: 16, backgroundColor: COLORS.campo, color: COLORS.text,
  },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  btn: {
    backgroundColor: COLORS.azione, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, minHeight: 52,
    alignItems: 'center', justifyContent: 'center', marginTop: 14,
  },
  btnText: { color: COLORS.suAzione, fontSize: 16, fontWeight: '600' },
  btnGhost: {
    borderWidth: 1, borderColor: COLORS.bordoCampo, borderRadius: 14, minHeight: 50,
    paddingVertical: 13, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginTop: 10,
  },
  btnGhostText: { color: COLORS.azione, fontSize: 15, fontWeight: '600' },

  chip: {
    paddingHorizontal: 16, paddingVertical: 12, minHeight: 46, justifyContent: 'center',
    borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.bordoCampo, marginRight: 8, marginBottom: 8, backgroundColor: COLORS.card,
  },
  chipOn: { backgroundColor: COLORS.azioneSoft, borderColor: COLORS.azione },
  chipText: { color: COLORS.text, fontSize: 15 },
  chipTextOn: { color: COLORS.azioneDark, fontWeight: '600' },
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
    fontSize: 12, fontWeight: '600', color: COLORS.muted, textTransform: 'uppercase',
    letterSpacing: 0.6, marginTop: 22, marginBottom: 8, marginLeft: 4,
  },
  tile: {
    backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center',
  },
  tileAccent: { width: 4, borderRadius: 4, alignSelf: 'stretch', marginRight: 12, backgroundColor: COLORS.primary },
  tileTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  tileDesc: { fontSize: 14, color: COLORS.muted, marginTop: 2 },
  chevron: { fontSize: 22, color: COLORS.muted, marginLeft: 8 },
});
