import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtDataOra } from './theme';
import { Bottone } from './UI';
import {
  listaPuntiControllo, registraTemperatura, temperatureDiOggi, query,
} from './database';

export default function TemperatureScreen() {
  const [punti, setPunti] = useState([]);
  const [valori, setValori] = useState({});
  const [oggi, setOggi] = useState([]);
  const [storico, setStorico] = useState([]);

  const ricarica = useCallback(() => {
    (async () => {
      setPunti(await listaPuntiControllo());
      setOggi(await temperatureDiOggi());
      setStorico(await query(
        `SELECT r.*, pc.nome FROM registro_temperature r
         JOIN punti_controllo pc ON pc.id = r.punto_controllo_id
         ORDER BY r.data_ora DESC LIMIT 30`));
    })();
  }, []);
  useFocusEffect(ricarica);

  const registra = async (punto) => {
    const v = valori[punto.id];
    if (v === undefined || v === '' || Number.isNaN(Number(v))) {
      return Alert.alert('Valore mancante', `Inserisci la temperatura di ${punto.nome}.`);
    }
    const conforme = await registraTemperatura(punto.id, Number(v), null);
    setValori((s) => ({ ...s, [punto.id]: '' }));
    ricarica();
    if (!conforme) {
      Alert.alert(
        'Temperatura fuori limite',
        `${punto.nome}: ${v}°C, fuori dall'intervallo ${punto.temp_min}/${punto.temp_max}°C.\n\n` +
        "È stata aperta una non conformità: interviene subito e annota l'azione correttiva."
      );
    }
  };

  const fattoOggi = (id) => oggi.find((o) => o.punto_controllo_id === id);

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <Text style={S.h1}>Registro temperature</Text>
      <Text style={[S.muted, { marginBottom: 16 }]}>Rilevazione giornaliera</Text>

      {punti.length === 0 && (
        <Text style={S.empty}>
          Configura prima i tuoi frigoriferi nella sezione "Frigoriferi".
        </Text>
      )}

      {punti.map((p) => {
        const fatto = fattoOggi(p.id);
        return (
          <View key={p.id} style={[S.card, fatto && {
            borderLeftWidth: 4,
            borderLeftColor: fatto.esito === 'conforme' ? COLORS.ok : COLORS.danger,
          }]}>
            <Text style={{ fontSize: 16, fontWeight: '700' }}>{p.nome}</Text>
            <Text style={S.muted}>Limiti {p.temp_min}°C / {p.temp_max}°C</Text>

            {fatto ? (
              <Text style={{
                marginTop: 8, fontSize: 16, fontWeight: '700',
                color: fatto.esito === 'conforme' ? COLORS.ok : COLORS.danger,
              }}>
                Rilevato oggi: {fatto.temperatura}°C ({fatto.esito})
              </Text>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 }}>
                <TextInput
                  style={[S.input, { flex: 1 }]}
                  placeholder="°C"
                  keyboardType="numbers-and-punctuation"
                  value={valori[p.id] ?? ''}
                  onChangeText={(v) => setValori((s) => ({ ...s, [p.id]: v }))}
                  placeholderTextColor="#9CA3AF"
                />
                <View style={{ width: 130 }}>
                  <Bottone testo="Registra" onPress={() => registra(p)} />
                </View>
              </View>
            )}
          </View>
        );
      })}

      {storico.length > 0 && (
        <>
          <Text style={[S.h2, { marginTop: 20 }]}>Ultime rilevazioni</Text>
          <View style={S.card}>
            {storico.map((r) => (
              <View key={r.id} style={[S.row, { paddingVertical: 7 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600' }}>{r.nome}</Text>
                  <Text style={S.muted}>{fmtDataOra(r.data_ora)}</Text>
                </View>
                <Text style={{
                  fontWeight: '700',
                  color: r.esito === 'conforme' ? COLORS.ok : COLORS.danger,
                }}>
                  {r.temperatura}°C
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}
