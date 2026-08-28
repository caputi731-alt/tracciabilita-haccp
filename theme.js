import { StyleSheet } from 'react-native';

export const COLORS = {
  bg: '#EEF2F0',
  card: '#FFFFFF',
  primary: '#12795A',
  primaryDark: '#0C5A43',
  primarySoft: '#E3F1EC',
  text: '#13211C',
  muted: '#6A7772',
  border: '#E1E7E4',
  danger: '#C63A2F',
  dangerSoft: '#FBE9E7',
  warning: '#C77A12',
  warningSoft: '#FBF0DC',
  ok: '#12795A',
  accent: '#1E9E76',
};

export const ALLERGENI = [
  'Glutine', 'Crostacei', 'Uova', 'Pesce', 'Arachidi', 'Soia', 'Latte',
  'Frutta a guscio', 'Sedano', 'Senape', 'Sesamo', 'Solfiti', 'Lupini', 'Molluschi',
];

export const CATEGORIE_PRODOTTO = [
  'Carne', 'Pesce', 'Ortofrutta', 'Latticini', 'Salumi', 'Secco/Dispensa',
  'Surgelati', 'Bevande', 'Altro',
];

export const CONSERVAZIONE = ['ambiente', 'refrigerato', 'congelato'];
export const TIPI_PUNTO = ['frigorifero', 'congelatore', 'cella', 'abbattitore', 'banco'];
export const UNITA = ['kg', 'g', 'l', 'ml', 'pz', 'cassa', 'conf'];

export const fmtData = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return d.toLocaleDateString('it-IT');
};

export const fmtDataOra = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
};

export const giorniAllaScadenza = (iso) => {
  if (!iso) return null;
  const scad = new Date(iso + 'T00:00:00');
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  return Math.round((scad - oggi) / 86400000);
};

export const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 44 },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#0B2A20',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },

  h1: { fontSize: 26, fontWeight: '800', color: COLORS.text, marginBottom: 4, letterSpacing: -0.4 },
  h2: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 10, letterSpacing: -0.2 },

  label: {
    fontSize: 12, fontWeight: '700', color: COLORS.muted, marginBottom: 6, marginTop: 12,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 13, fontSize: 16, backgroundColor: '#fff', color: COLORS.text,
  },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  btn: {
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 14,
    shadowColor: COLORS.primaryDark, shadowOpacity: 0.25, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  btnGhost: {
    borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginTop: 10, backgroundColor: '#fff',
  },
  btnGhostText: { color: COLORS.primary, fontSize: 15, fontWeight: '800' },

  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22, borderWidth: 1,
    borderColor: COLORS.border, marginRight: 8, marginBottom: 8, backgroundColor: '#fff',
  },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.text, fontSize: 14 },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },

  muted: { color: COLORS.muted, fontSize: 13, lineHeight: 18 },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 44, fontSize: 15 },

  // elementi per la nuova Home
  pill: {
    alignSelf: 'flex-start', backgroundColor: COLORS.primarySoft, color: COLORS.primaryDark,
    fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, overflow: 'hidden', marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '800', color: COLORS.muted, textTransform: 'uppercase',
    letterSpacing: 0.6, marginTop: 22, marginBottom: 8, marginLeft: 4,
  },
  tile: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: 15, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center',
    shadowColor: '#0B2A20', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  tileAccent: { width: 4, borderRadius: 4, alignSelf: 'stretch', marginRight: 12, backgroundColor: COLORS.primary },
  tileTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  tileDesc: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  chevron: { fontSize: 22, color: COLORS.muted, marginLeft: 8 },
});
