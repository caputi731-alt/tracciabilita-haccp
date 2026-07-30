import { StyleSheet } from 'react-native';

export const COLORS = {
  bg: '#F5F6F8',
  card: '#FFFFFF',
  primary: '#1F6F5C',
  primaryDark: '#154A3E',
  text: '#1A1A1A',
  muted: '#6B7280',
  border: '#E2E5EA',
  danger: '#C0392B',
  warning: '#D98207',
  ok: '#1F6F5C',
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
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  h1: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  h2: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.muted, marginBottom: 4, marginTop: 10 },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12,
    fontSize: 16, backgroundColor: '#fff', color: COLORS.text,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  btn: {
    backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 15,
    alignItems: 'center', marginTop: 16,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnGhost: {
    borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: 10,
    paddingVertical: 13, alignItems: 'center', marginTop: 10,
  },
  btnGhostText: { color: COLORS.primary, fontSize: 15, fontWeight: '700' },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
    borderColor: COLORS.border, marginRight: 8, marginBottom: 8, backgroundColor: '#fff',
  },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.text, fontSize: 14 },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  muted: { color: COLORS.muted, fontSize: 13 },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 40, fontSize: 15 },
});
