/**
 * Tastierino grande per registrare una temperatura (proposta A del 20/10/2026, fase 4): si usa nella scheda del frigorifero
 * sulla mappa, nel registro delle temperature e nel giro di controllo.
 * Parte dal valore dell'ultima rilevazione prima di oggi ("ieri"), già scritto: se va bene basta salvare. Tasti ±0,5, segno per i
 * congelatori, "Ieri" per tornare al valore proposto. Dice subito se il valore è nei limiti. La logica dei tasti è in tastierino.js.
 * Il chiamante dà `key={punto.id}` così, passando al frigorifero successivo, il tastierino riparte dal suo valore.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { COLORS, fmtData } from './theme';
import { Icona, Bottone } from './UI';
import { premi, aggiungi, statoValore, numeroDi, testoDi } from './tastierino';

const ora = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

function Tasto({ testo, icona, etichetta, onPress, disabilitato, tenue }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabilitato} activeOpacity={0.6}
      accessibilityRole="button" accessibilityLabel={etichetta || testo} accessibilityState={{ disabled: !!disabilitato }}
      style={{
        flex: 1, height: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
        backgroundColor: tenue ? COLORS.card : COLORS.contenitore, borderWidth: tenue ? 1 : 0, borderColor: COLORS.bordoCampo,
        opacity: disabilitato ? 0.4 : 1,
      }}>
      {icona
        ? <Icona nome={icona} size={24} />
        : <Text style={{ fontSize: tenue ? 16 : 22, fontWeight: tenue ? '600' : '500' }}>{testo}</Text>}
    </TouchableOpacity>
  );
}

/**
 * @param punto        frigorifero: nome, temp_min, temp_max
 * @param ultima       { temperatura, data_ora } dell'ultima rilevazione prima di oggi, o null
 * @param testoSalva   testo del pulsante principale ("Salva", "Salva e vai a …")
 * @param onSalva      (numero) => Promise: registra; se lancia un errore il valore resta scritto
 * @param onSalta      facoltativo: mostra il pulsante "Salta"
 * @param sopra        facoltativo: riga piccola sopra il nome (es. "2 di 4")
 */
export default function TastierinoTemperatura({ punto, ultima, testoSalva = 'Salva', onSalva, onSalta, sopra, nascondiNome }) {
  const proposto = ultima ? testoDi(ultima.temperatura) : '';
  const [valore, setValore] = useState(proposto);
  const [nuovo, setNuovo] = useState(!!proposto); // il valore mostrato è ancora quello proposto
  const [errore, setErrore] = useState(null);
  const toccato = useRef(false);
  // se il valore di ieri arriva dopo l'apertura e non si è ancora scritto niente, lo si propone
  useEffect(() => {
    if (!toccato.current && proposto) { setValore(proposto); setNuovo(true); }
  }, [proposto]);

  const tasto = (k) => { toccato.current = true; setValore((v) => premi(v, k, nuovo)); setNuovo(false); setErrore(null); };
  const passo = (d) => { toccato.current = true; setValore((v) => aggiungi(v, d)); setNuovo(false); setErrore(null); };
  const stato = statoValore(valore, punto);

  const salva = async () => {
    const n = numeroDi(valore);
    if (n === null) { setErrore('Scrivi la temperatura con i tasti, per esempio 3,5'); return; }
    await onSalva(n);
  };

  const limiti = `limiti ${testoDi(punto.temp_min)} / ${testoDi(punto.temp_max)} °C`;
  const infoIeri = ultima ? ` · ultima ${testoDi(ultima.temperatura)} °C il ${fmtData(ultima.data_ora)} alle ${ora(ultima.data_ora)}` : '';
  const coloreStato = stato === 'fuori' ? COLORS.danger : stato === 'ok' ? COLORS.ok : COLORS.muted;

  return (
    <View style={{ gap: 12 }}>
      <View>
        {!!sopra && <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.muted }}>{sopra}</Text>}
        {!nascondiNome && <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: '700' }}>{punto.nome}</Text>}
        <Text style={{ fontSize: 14, color: COLORS.muted }}>{limiti}{infoIeri}</Text>
      </View>

      <View accessible accessibilityLiveRegion="polite"
        accessibilityLabel={valore ? `${valore.replace('−', 'meno ')} gradi. ${stato === 'fuori' ? 'Fuori limite' : 'Nei limiti'}` : 'Nessun valore'}
        style={{
          minHeight: 92, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 8,
          borderColor: stato === 'fuori' ? COLORS.danger : COLORS.azione, backgroundColor: stato === 'fuori' ? COLORS.dangerSoft : COLORS.campo,
        }}>
        <Text style={{ fontSize: 52, fontWeight: '700', letterSpacing: -1, color: valore ? (nuovo ? COLORS.muted : COLORS.text) : COLORS.segnaposto }}>
          {valore || '—'}<Text style={{ fontSize: 24, fontWeight: '500', color: COLORS.muted }}> °C</Text>
        </Text>
        <Text style={{ fontSize: 14, fontWeight: '600', color: errore ? COLORS.danger : coloreStato }}>
          {errore || (stato === 'fuori' ? 'Fuori limite: si aprirà una non conformità'
            : stato === 'ok' ? (nuovo ? 'Come l\'ultima volta · nei limiti' : 'Nei limiti') : 'Scrivi la temperatura')}
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Tasto testo="1" onPress={() => tasto('1')} /><Tasto testo="2" onPress={() => tasto('2')} />
          <Tasto testo="3" onPress={() => tasto('3')} />
          <Tasto testo="−0,5" etichetta="Mezzo grado in meno" tenue onPress={() => passo(-0.5)} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Tasto testo="4" onPress={() => tasto('4')} /><Tasto testo="5" onPress={() => tasto('5')} />
          <Tasto testo="6" onPress={() => tasto('6')} />
          <Tasto testo="+0,5" etichetta="Mezzo grado in più" tenue onPress={() => passo(0.5)} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Tasto testo="7" onPress={() => tasto('7')} /><Tasto testo="8" onPress={() => tasto('8')} />
          <Tasto testo="9" onPress={() => tasto('9')} />
          <Tasto testo="Ieri" etichetta="Rimetti il valore dell'ultima volta" tenue disabilitato={!proposto}
            onPress={() => { setValore(proposto); setNuovo(true); setErrore(null); }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Tasto testo="±" etichetta="Cambia segno, per i congelatori" onPress={() => tasto('segno')} />
          <Tasto testo="0" onPress={() => tasto('0')} />
          <Tasto testo="," etichetta="Virgola" onPress={() => tasto(',')} />
          <Tasto icona="backspace-outline" etichetta="Cancella" onPress={() => tasto('cancella')} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        {!!onSalta && <View style={{ width: 110 }}><Bottone testo="Salta" ghost onPress={onSalta} /></View>}
        <View style={{ flex: 1 }}><Bottone testo={testoSalva} icona="check" onPress={salva} /></View>
      </View>
    </View>
  );
}
