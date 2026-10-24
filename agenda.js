/**
 * Agenda dei prossimi giorni e collegamento prenotazione ↔ menù (Fase 5 del controllo UX, 24/10/2026). Puro, provato in
 * test/agenda.test.mjs.
 * - `menuPerPrenotazione`: il menù dello stesso giorno fatto per quel cliente (nome della prenotazione dentro il cliente del menù
 *   o viceversa, senza accenti e maiuscole). Se il nome non basta a sceglierne uno solo, nessuno: meglio "Crea" che il menù sbagliato.
 * - `agendaGiorni`: per i prossimi giorni, giorno e servizio con prenotazioni (a tavola e da confermare) e menù.
 */

const pulito = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** `menu`: elementi di eventiMenu() (menuPonte.js) con { id, data, cliente, titolo, … }. → il menù o null. */
export function menuPerPrenotazione(menu, { data, nome }) {
  const n = pulito(nome);
  if (n.length < 3) return null;
  const adatti = (menu || []).filter((m) => {
    if (!m || m.data !== data) return false;
    const c = pulito(m.cliente);
    return c.length >= 3 && (` ${c} `.includes(` ${n} `) || ` ${n} `.includes(` ${c} `));
  });
  return adatti.length === 1 ? adatti[0] : null;
}

/** Quanti giorni mostra l'agenda della Sala (oggi compreso). */
export const GIORNI_AGENDA = 14;

/**
 * Giorni con qualcosa da preparare, da `oggi` per `giorni` giorni.
 * - prenotazioni: elenco di prenotazioniCalendario (data, servizio, nome, persone, max, daConfermare, bambini, …)
 * - menu: elementi di eventiMenu (data, cliente, titolo, ora, stato)
 * → [{ data, servizi: [{ servizio, coperti, daConfermare (persone), prenotazioni: [{ …, menu }] }], menu: [menù del giorno] }]
 *   I giorni senza prenotazioni né menù non ci sono. Ogni prenotazione porta il suo menù, se c'è.
 */
export function agendaGiorni(prenotazioni, menu, oggi, giorni = GIORNI_AGENDA) {
  const [a, m, g] = String(oggi).split('-').map(Number);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fine = iso(new Date(a, m - 1, g + giorni - 1, 12));
  const dentro = (d) => typeof d === 'string' && d >= oggi && d <= fine;
  const per = new Map();
  const giorno = (d) => {
    if (!per.has(d)) per.set(d, { data: d, servizi: new Map(), menu: [] });
    return per.get(d);
  };
  for (const p of prenotazioni || []) {
    if (!p || !dentro(p.data)) continue;
    const s = giorno(p.data).servizi;
    const sv = p.servizio === 'Cena' ? 'Cena' : 'Pranzo';
    if (!s.has(sv)) s.set(sv, { servizio: sv, coperti: 0, daConfermare: 0, prenotazioni: [] });
    const x = s.get(sv);
    const n = Number(p.max || p.persone) || 0;
    x.coperti += n;
    if (p.daConfermare) x.daConfermare += n;
    x.prenotazioni.push({ ...p, menu: menuPerPrenotazione(menu, p) });
  }
  for (const e of menu || []) if (e && dentro(e.data)) giorno(e.data).menu.push(e);
  return [...per.values()].sort((x, y) => x.data.localeCompare(y.data)).map((d) => ({
    data: d.data,
    menu: d.menu,
    servizi: [...d.servizi.values()].sort((x, y) => (x.servizio === 'Cena') - (y.servizio === 'Cena')).map((s) => ({
      ...s,
      prenotazioni: s.prenotazioni.sort((x, y) => Number(x.daConfermare) - Number(y.daConfermare) || String(x.nome).localeCompare(String(y.nome), 'it')),
    })),
  }));
}

/** I dati per "Crea il menù per questa prenotazione": il Menù li scrive nel menù nuovo. */
export function nuovoMenuDa({ data, nome, persone, bambini, neonati, tel, ora }) {
  const tot = Number(persone) || 0, b = Number(bambini) || 0, n = Number(neonati) || 0;
  return {
    data, cliente: String(nome || '').trim(), adulti: Math.max(0, tot - b - n) || '', bambini: b || '',
    telefono: String(tel || '').trim(), ora: String(ora || '').trim(),
  };
}
