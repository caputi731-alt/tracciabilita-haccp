/**
 * Scheda di un'attrezzatura della cucina, aperta toccandola nella vista 3D: la temperatura e la pulizia collegate,
 * con le registrazioni fatte da qui, e il collegamento al frigorifero e all'area di pulizia dell'app.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Modal } from 'react-native';
import { S, COLORS, aNumero, fmtData } from './theme';
import { Campo, Bottone, Selettore, VistaModale, useAvviso } from './UI';
import { registraTemperatura, registraSanificazione, collegaPosto } from './database';
import { TIPI_FREDDO } from './cucine';
import { aggiornaPromemoria } from './notifiche';

const gradi = (n) => `${String(Math.round(Number(n) * 10) / 10).replace('.', ',')}°C`;
const ora = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

export default function SchedaPosto({ posto, stato, punti, aree, onChiudi, onCambiato, apri }) {
  const [valore, setValore] = useState('');
  const [errore, setErrore] = useState(null);
  const { avviso, mostra } = useAvviso();
  useEffect(() => { setValore(''); setErrore(null); }, [posto?.id]);
  if (!posto) return null;

  const { punto, area, ultima } = stato || {};
  const fuori = punto && ultima && (ultima.temperatura < punto.temp_min || ultima.temperatura > punto.temp_max);
  const freddo = TIPI_FREDDO.includes(posto.type);

  const collega = async (cambi) => {
    await collegaPosto(posto.id, { punto_controllo_id: punto ? punto.id : null, area_id: area ? area.id : null, ...cambi });
    await onCambiato();
    mostra('Salvato ✓');
  };

  const salvaTemperatura = async () => {
    const numero = aNumero(valore);
    if (numero === null) { setErrore({ testo: 'Scrivi la temperatura in numeri, per esempio 3,5' }); return; }
    const r = await registraTemperatura(punto.id, numero, null, null);
    setValore(''); setErrore(null);
    aggiornaPromemoria();
    await onCambiato();
    mostra(r.conforme ? `Salvato ✓ ${gradi(numero)}` : `${gradi(numero)} fuori limite: aperta una non conformità`);
  };

  const salvaPulizia = async () => {
    await registraSanificazione({ area_id: area.id, prodotto_utilizzato: area.prodotto_previsto || '', operatore: '', note: '', esito: 'conforme' });
    aggiornaPromemoria();
    await onCambiato();
    mostra(`Salvato ✓ Pulizia: ${area.nome}`);
  };

  const titolino = { fontSize: 13, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 };

  return (
    <Modal visible animationType="slide" onRequestClose={onChiudi}>
      <VistaModale>
        <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 1, color: COLORS.muted }}>
          {posto.nomeCucina.toUpperCase()} · N. {posto.n}
        </Text>
        <Text style={S.h1}>{posto.nome}</Text>

        {punto && (
          <View style={[S.card, { borderWidth: 1.5, borderColor: fuori ? COLORS.danger : ultima ? COLORS.ok : COLORS.warning }]}>
            <Text style={titolino}>Temperatura · {punto.nome}</Text>
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
              onChange={(v) => { setValore(v); setErrore(null); }} keyboardType="decimal-pad" placeholder="°C" />
            <Bottone testo="Registra temperatura" icona="thermometer" onPress={salvaTemperatura} />
            {fuori && <Bottone testo="Apri le non conformità" ghost colore={COLORS.danger} onPress={() => apri('NonConformita')} />}
          </View>
        )}

        {area && (
          <View style={[S.card, { borderWidth: 1.5, borderColor: area.daFare ? COLORS.warning : COLORS.ok }]}>
            <Text style={titolino}>Pulizia · {area.nome}</Text>
            <Text style={{ fontSize: 17, fontWeight: '700', color: area.daFare ? COLORS.warning : COLORS.ok }}>
              {area.daFare ? 'Da fare' : 'Fatta'}
            </Text>
            <Text style={S.muted}>
              {area.ultima ? `Ultima il ${fmtData(area.ultima)} alle ${ora(area.ultima)}` : 'Mai registrata'} · {area.frequenza || 'giornaliera'}
            </Text>
            <Bottone testo={area.daFare ? 'Segna come pulita' : 'Registra di nuovo'} icona="spray-bottle" onPress={salvaPulizia} />
          </View>
        )}

        <View style={S.card}>
          <Text style={titolino}>Collegamenti</Text>
          <Text style={[S.muted, { marginBottom: 4 }]}>
            {punto || area ? 'A cosa corrisponde questa attrezzatura nei controlli dell\'app.'
              : 'Questa attrezzatura non è ancora collegata: scegli il frigorifero o l\'area di pulizia a cui corrisponde.'}
          </Text>
          {(freddo || punto) && (punti.length > 0 ? (
            <>
              <Selettore label="Frigorifero" elementi={punti} valore={punto ? punto.id : null} etichetta={(p) => p.nome}
                onChange={(id) => collega({ punto_controllo_id: id })} placeholder="Nessuno" />
              {punto && <Bottone testo="Scollega il frigorifero" ghost onPress={() => collega({ punto_controllo_id: null })} />}
            </>
          ) : (
            <Bottone testo="Aggiungi i frigoriferi" ghost onPress={() => apri('Anagrafiche', { scheda: 'Frigoriferi' })} />
          ))}
          {aree.length > 0 ? (
            <>
              <Selettore label="Area di pulizia" elementi={aree} valore={area ? area.id : null} etichetta={(a) => a.nome}
                onChange={(id) => collega({ area_id: id })} placeholder="Nessuna" />
              {area && <Bottone testo="Scollega la pulizia" ghost onPress={() => collega({ area_id: null })} />}
            </>
          ) : (
            <Bottone testo="Aggiungi le aree di pulizia" ghost onPress={() => apri('Sanificazione')} />
          )}
          {!freddo && !punto && punti.length > 0 && (
            <Selettore label="Frigorifero (se ha una temperatura da registrare)" elementi={punti} valore={null} etichetta={(p) => p.nome}
              onChange={(id) => collega({ punto_controllo_id: id })} placeholder="Nessuno" />
          )}
        </View>

        <Bottone testo="Chiudi" ghost onPress={onChiudi} />
      </VistaModale>
      {avviso}
    </Modal>
  );
}
