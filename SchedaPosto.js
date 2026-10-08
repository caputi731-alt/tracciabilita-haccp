/**
 * Scheda di un frigorifero o congelatore della cucina, aperta toccandolo nella mappa 3D.
 * Finché non ha un nome chiede come si chiama (il nome lo scrive Luca) e i limiti di temperatura: nasce così il
 * frigorifero nei controlli dell'app, collegato a questo punto della mappa. Poi mostra la temperatura di oggi e la registra.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Modal } from 'react-native';
import { S, COLORS, aNumero, numeroPerCampo } from './theme';
import { Campo, Bottone, Selettore, Sezione, VistaModale, useAvviso, useErrori } from './UI';
import { registraTemperatura, collegaPosto, salvaPuntoControllo } from './database';
import { limitiProposti } from './cucine';
import { aggiornaPromemoria } from './notifiche';

const gradi = (n) => `${String(Math.round(Number(n) * 10) / 10).replace('.', ',').replace('-', '−')}°C`;
const ora = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

export default function SchedaPosto({ posto, stato, punti, collegamenti, onChiudi, onCambiato, apri }) {
  const { punto, ultima } = stato || {};
  const [valore, setValore] = useState('');
  const [errore, setErrore] = useState(null);
  const [form, setForm] = useState({ nome: '', temp_min: '', temp_max: '' });
  const { errori, segnala, azzera, riepilogo } = useErrori();
  const { avviso, mostra } = useAvviso();

  // il modulo del nome parte dai dati del frigorifero, o dai limiti abituali se il nome manca ancora
  useEffect(() => {
    if (!posto) return;
    const base = punto || limitiProposti(posto.type);
    setForm({ nome: punto ? punto.nome : '', temp_min: numeroPerCampo(base.temp_min), temp_max: numeroPerCampo(base.temp_max) });
    setValore(''); setErrore(null); azzera();
  }, [posto?.id, punto?.id, punto?.nome, punto?.temp_min, punto?.temp_max]);
  if (!posto) return null;

  const fuori = punto && ultima && (ultima.temperatura < punto.temp_min || ultima.temperatura > punto.temp_max);
  // frigoriferi già inseriti nell'app e non ancora messi sulla mappa
  const occupati = new Set((collegamenti || []).filter((c) => c.posto !== posto.id).map((c) => c.punto_controllo_id));
  const liberi = punti.filter((p) => !occupati.has(p.id) && (!punto || p.id !== punto.id));

  const salvaNome = async () => {
    azzera();
    const nome = form.nome.trim();
    const min = aNumero(form.temp_min), max = aNumero(form.temp_max);
    let ok = true;
    if (!nome) ok = segnala('nome', 'Scrivi il nome del frigorifero');
    if (min === null) ok = segnala('temp_min', 'Scrivi la temperatura minima in numeri');
    if (max === null) ok = segnala('temp_max', 'Scrivi la temperatura massima in numeri');
    if (min !== null && max !== null && min >= max) ok = segnala('temp_max', 'La massima deve essere più alta della minima');
    if (!ok) return;
    if (punto) {
      await salvaPuntoControllo({ ...punto, nome, temp_min: min, temp_max: max });
    } else {
      const r = await salvaPuntoControllo({ nome, tipo: limitiProposti(posto.type).tipo, temp_min: min, temp_max: max, posizione: posto.nomeCucina });
      await collegaPosto(posto.id, { punto_controllo_id: r.lastInsertRowId });
    }
    aggiornaPromemoria();
    await onCambiato();
    mostra('Salvato ✓');
  };

  const scegli = async (id) => {
    await collegaPosto(posto.id, { punto_controllo_id: id });
    await onCambiato();
    mostra('Salvato ✓');
  };

  const salvaTemperatura = async () => {
    const numero = aNumero(valore);
    if (numero === null) { setErrore({ testo: 'Scrivi la temperatura in numeri, per esempio 3,5', id: Math.random() }); return; }
    const r = await registraTemperatura(punto.id, numero, null, null);
    setValore(''); setErrore(null);
    aggiornaPromemoria();
    await onCambiato();
    mostra(r.conforme ? `Salvato ✓ ${gradi(numero)}` : `${gradi(numero)} fuori limite: aperta una non conformità`);
  };

  const titolino = { fontSize: 13, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 };
  const campiNome = (
    <>
      <Campo label="Nome" value={form.nome} errore={errori.nome} placeholder="Per esempio: Frigo carni"
        onChange={(v) => setForm((f) => ({ ...f, nome: v }))} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Campo label="Minima (°C)" value={form.temp_min} errore={errori.temp_min} keyboardType="numbers-and-punctuation"
            onChange={(v) => setForm((f) => ({ ...f, temp_min: v }))} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo label="Massima (°C)" value={form.temp_max} errore={errori.temp_max} keyboardType="numbers-and-punctuation"
            onChange={(v) => setForm((f) => ({ ...f, temp_max: v }))} />
        </View>
      </View>
      {riepilogo}
    </>
  );

  return (
    <Modal visible animationType="slide" onRequestClose={onChiudi}>
      <VistaModale>
        <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 1, color: COLORS.muted }}>
          {posto.nomeCucina.toUpperCase()} · N. {posto.n} · {posto.nome.toUpperCase()}
        </Text>
        <Text style={S.h1}>{punto ? punto.nome : 'Che frigorifero è?'}</Text>

        {punto ? (
          <>
            <View style={[S.card, { borderWidth: 1.5, borderColor: fuori ? COLORS.danger : ultima ? COLORS.ok : COLORS.warning }]}>
              <Text style={titolino}>Temperatura di oggi</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={{ fontSize: 40, fontWeight: '800', color: fuori ? COLORS.danger : COLORS.text, letterSpacing: -1 }}>
                  {ultima ? gradi(ultima.temperatura) : '—'}
                </Text>
                <Text style={[S.muted, { marginLeft: 10 }]}>limiti {gradi(punto.temp_min)} / {gradi(punto.temp_max)}</Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: fuori ? COLORS.danger : ultima ? COLORS.ok : COLORS.warning }}>
                {fuori ? `Fuori limite alle ${ora(ultima.data_ora)}` : ultima ? `Nei limiti · rilevata alle ${ora(ultima.data_ora)}` : 'Oggi non ancora registrata'}
              </Text>
              <Campo label={ultima ? 'Nuova rilevazione' : 'Temperatura di adesso'} value={valore} errore={errore}
                onChange={(v) => { setValore(v); setErrore(null); }} keyboardType="numbers-and-punctuation" placeholder="°C" />
              <Bottone testo="Registra temperatura" icona="thermometer" onPress={salvaTemperatura} />
              {fuori && <Bottone testo="Apri le non conformità" ghost colore={COLORS.danger} onPress={() => apri('NonConformita')} />}
            </View>

            <Sezione titolo="Nome e limiti" icona="pencil-outline">
              {campiNome}
              <Bottone testo="Salva" onPress={salvaNome} />
              <Bottone testo="Togli dalla mappa" ghost onPress={() => collegaPosto(posto.id, {}).then(onCambiato)} />
              <Text style={S.muted}>Tolto dalla mappa, il frigorifero resta nei controlli con tutte le sue temperature.</Text>
            </Sezione>
          </>
        ) : (
          <View style={S.card}>
            <Text style={[S.muted, { marginBottom: 4 }]}>
              Dagli il nome con cui lo chiamate in cucina: comparirà sulla mappa insieme alla temperatura di oggi.
            </Text>
            {campiNome}
            <Bottone testo="Salva" onPress={salvaNome} />
            {liberi.length > 0 && (
              <Selettore label="Oppure è un frigorifero già inserito nell'app" elementi={liberi} valore={null}
                etichetta={(p) => p.nome} onChange={scegli} placeholder="Scegli dall'elenco" />
            )}
          </View>
        )}

        <Bottone testo="Chiudi" ghost onPress={onChiudi} />
      </VistaModale>
      {avviso}
    </Modal>
  );
}
